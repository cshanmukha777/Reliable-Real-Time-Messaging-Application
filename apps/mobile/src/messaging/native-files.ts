import { randomUUID } from 'expo-crypto';
import { getDocumentAsync } from 'expo-document-picker';
import { launchImageLibraryAsync } from 'expo-image-picker';
import {
  cacheDirectory,
  createUploadTask,
  deleteAsync,
  downloadAsync,
  FileSystemUploadType,
  getInfoAsync,
} from 'expo-file-system/legacy';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import { backendOriginSchema, type Attachment } from '@chatapp/contracts';
import type { MessagingApi } from './api';
import { pickerInput, type PickedFile } from './picker-input';

export async function pickFile(photo: boolean) {
  if (photo) {
    const result = await launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return null;
    const info =
      asset.fileSize === undefined ? await getInfoAsync(asset.uri) : null;
    const size = asset.fileSize ?? (info?.exists ? info.size : undefined);
    return pickerInput({
      uri: asset.uri,
      name: asset.fileName ?? 'Photo',
      ...(size !== undefined && { size }),
      ...('mimeType' in asset && { mimeType: asset.mimeType }),
    });
  }

  const result = await getDocumentAsync({
    copyToCacheDirectory: true,
    type: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'text/plain',
    ],
  });
  return pickerInput(result.assets?.[0] ?? null);
}

function secureUrl(url: string) {
  const parsed = new URL(url);
  const allowLocalHttp =
    __DEV__ && process.env.EXPO_PUBLIC_ALLOW_LOCAL_HTTP === 'true';
  if (
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    !backendOriginSchema(allowLocalHttp).safeParse(parsed.origin).success
  ) {
    throw new Error('The storage endpoint is not allowed.');
  }
  return url;
}

export async function putStagedFile(
  grant: { url: string; headers: Record<string,string> },
  file: PickedFile,
  signal: AbortSignal,
  progress: (value: number) => void,
) {
  if (signal.aborted) throw new Error('SCOPE_PAUSED');
  const task = createUploadTask(secureUrl(grant.url), file.uri, {
    httpMethod: 'PUT', uploadType: FileSystemUploadType.BINARY_CONTENT, headers: grant.headers,
  }, ({ totalBytesSent }) => progress((100 * totalBytesSent) / file.input.size));
  const abort = () => { void task.cancelAsync().catch(() => undefined); };
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 90_000);
  try {
    const result = await task.uploadAsync();
    if (!result || result.status < 200 || result.status >= 300) throw new Error('UPLOAD_INCOMPLETE');
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}

const extensions = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
} satisfies Record<Attachment['mimeType'], string>;

export async function downloadFile(
  api: MessagingApi,
  conversationId: string,
  file: Attachment,
) {
  if (!cacheDirectory) throw new Error('File access is unavailable.');
  const grant = await api.download(conversationId, file.id);
  const destination = `${cacheDirectory}chatapp-${randomUUID()}.${extensions[file.mimeType]}`;
  try {
    const result = await downloadAsync(secureUrl(grant.url), destination);
    if (result.status !== 200) throw new Error('Download failed.');
    const info = await getInfoAsync(result.uri);
    if (!info.exists || info.size !== file.size)
      throw new Error('Download did not match the expected size.');
    return result.uri;
  } catch (error) {
    await discardFile(destination);
    throw error;
  }
}

export async function shareFile(uri: string, file: Attachment) {
  if (!(await isAvailableAsync()))
    throw new Error('File sharing is unavailable.');
  await shareAsync(uri, {
    mimeType: file.mimeType,
    dialogTitle: file.fileName,
  });
}

export function discardFile(uri: string) {
  return deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}
