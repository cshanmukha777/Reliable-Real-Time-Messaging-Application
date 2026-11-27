import {
  API_VERSION,
  attachmentSchema,
  conversationPageSchema,
  conversationSchema,
  downloadGrantSchema,
  errorResponseSchema,
  messagePageSchema,
  messageSchema,
  peopleSchema,
  searchPageSchema,
  uploadGrantSchema,
  type GroupInput,
  type MessageInput,
  type UploadInput,
} from '@chatapp/contracts';
import { z, type ZodType } from 'zod';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
interface Session {
  origin: string;
  authorized<T>(request: (token: string) => Promise<T>): Promise<T>;
}
type Transport = (
  url: string,
  options: RequestInit,
) => Promise<Pick<Response, 'ok' | 'status' | 'url' | 'redirected' | 'json'>>;

export class MessagingError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super('Messaging request failed.');
    this.status = status;
    this.code = code;
  }
}

export class MessagingApi {
  private readonly session: Session;
  private readonly transport: Transport;

  constructor(session: Session, transport: Transport) {
    this.session = session;
    this.transport = transport;
  }

  private run<T>(
    method: Method,
    path: string,
    schema: ZodType<T>,
    body?: object,
  ): Promise<T> {
    const url = `${this.session.origin}/${API_VERSION}/${path}`;
    return this.session.authorized(async (token) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 22000);
      try {
        const response = await this.transport(url, {
          method,
          credentials: 'omit',
          redirect: 'error',
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
            ...(body && { 'Content-Type': 'application/json' }),
          },
          ...(body && { body: JSON.stringify(body) }),
        });
        if (response.redirected || response.url !== url)
          throw new MessagingError(0, 'UNEXPECTED_ORIGIN');
        const value: unknown =
          response.status === 204
            ? null
            : await response.json().catch(() => null);
        if (!response.ok) {
          const error = errorResponseSchema.safeParse(value);
          throw new MessagingError(
            response.status,
            error.success ? error.data.code : 'REQUEST_FAILED',
          );
        }
        return schema.parse(value);
      } finally {
        clearTimeout(timer);
      }
    });
  }

  discover(term: string) {
    return this.run(
      'GET',
      `users/discover?${new URLSearchParams({ q: term })}`,
      peopleSchema,
    );
  }
  list(cursor?: string) {
    return this.run(
      'GET',
      `conversations${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      conversationPageSchema,
    );
  }
  direct(userId: string) {
    return this.run('POST', 'conversations/direct', conversationSchema, {
      userId,
    });
  }
  group(input: GroupInput) {
    return this.run('POST', 'conversations/group', conversationSchema, input);
  }
  details(id: string) {
    return this.run('GET', thread(id), conversationSchema);
  }
  history(id: string, cursor?: string) {
    return this.run(
      'GET',
      `${thread(id)}/messages${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      messagePageSchema,
    );
  }
  search(id: string, term: string, cursor?: string) {
    const query = new URLSearchParams({ q: term, ...(cursor && { cursor }) });
    return this.run('GET', `${thread(id)}/search?${query}`, searchPageSchema);
  }
  send(id: string, input: MessageInput) {
    return this.run('POST', `${thread(id)}/messages`, messageSchema, input);
  }
  remove(id: string, messageId: string) {
    return this.run(
      'DELETE',
      `${thread(id)}/messages/${encodeURIComponent(messageId)}`,
      z.null(),
    );
  }
  member(id: string, userId: string, role: 'ADMIN' | 'MEMBER' | null) {
    return this.run(
      role ? 'PATCH' : 'DELETE',
      `${thread(id)}/members/${encodeURIComponent(userId)}`,
      conversationSchema,
      role ? { role } : undefined,
    );
  }
  upload(id: string, input: UploadInput) {
    return this.run(
      'POST',
      `${thread(id)}/attachments`,
      uploadGrantSchema,
      input,
    );
  }
  complete(id: string, attachmentId: string) {
    return this.run(
      'POST',
      `${thread(id)}/attachments/${encodeURIComponent(attachmentId)}/complete`,
      attachmentSchema,
    );
  }
  download(id: string, attachmentId: string) {
    return this.run(
      'POST',
      `${thread(id)}/attachments/${encodeURIComponent(attachmentId)}/download`,
      downloadGrantSchema,
    );
  }
}

function thread(id: string) {
  return `conversations/${encodeURIComponent(id)}`;
}
