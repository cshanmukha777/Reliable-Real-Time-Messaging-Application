import { uploadInputSchema, type UploadInput } from '@chatapp/contracts';

export type PickedFile = { uri: string; input: UploadInput };

export function pickerInput(
  asset: {
    uri: string;
    name?: string | null;
    size?: number;
    mimeType?: string | null;
  } | null,
): PickedFile | null {
  if (!asset) return null;
  const parsed = uploadInputSchema.safeParse({
    fileName: asset.name,
    mimeType: asset.mimeType,
    size: asset.size,
  });
  if (!parsed.success || !asset.uri.startsWith('file:')) {
    throw new Error(
      'Choose a JPEG, PNG, WebP, PDF or plain-text file up to 10 MB.',
    );
  }
  return { uri: asset.uri, input: parsed.data };
}
