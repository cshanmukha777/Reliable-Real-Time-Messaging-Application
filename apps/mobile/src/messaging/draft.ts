import type { MessageInput } from '@chatapp/contracts';

export class SendAttempt {
  private current?: MessageInput;

  private readonly uuid: () => string;

  constructor(uuid: () => string) {
    this.uuid = uuid;
  }

  payload(body: string, attachments: string[]): MessageInput {
    const normalized = body.trim();
    const previous = this.current;
    if (
      previous?.body === normalized &&
      previous.attachmentIds.join(':') === attachments.join(':')
    )
      return previous;
    const input = {
      clientMessageId: this.uuid(),
      body: normalized,
      attachmentIds: attachments,
    };
    this.current = input;
    return input;
  }

  confirmed() {
    delete this.current;
  }
}

export function mergeMessages<T extends { id: string }>(
  current: T[],
  incoming: T[],
) {
  return [
    ...new Map(
      [...current, ...incoming].map((message) => [message.id, message]),
    ).values(),
  ];
}
