import { z } from 'zod';

export const mongoIdSchema = z.string().regex(/^[0-9a-f]{24}$/);
export const clientOperationIdSchema = z.uuidv4();
export const memberRoleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER']);
export const memberChangeSchema = z.strictObject({
  role: z.enum(['ADMIN', 'MEMBER']),
});
export const personSchema = z.strictObject({
  id: mongoIdSchema,
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
});
export const memberSchema = personSchema.extend({ role: memberRoleSchema });
export const peopleSchema = z.array(personSchema);
export const membersSchema = z.array(memberSchema);
export const discoverySchema = z.strictObject({
  q: z.string().trim().min(2).max(50),
});
export const directInputSchema = z.strictObject({ userId: mongoIdSchema });
export const groupInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(80),
  userIds: z.array(mongoIdSchema).min(1).max(31),
  clientGroupId: clientOperationIdSchema,
});
export const attachmentTypeSchema = z.enum([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
]);
export const uploadInputSchema = z.strictObject({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[^/\\\x00-\x1f\x7f]+$/),
  mimeType: attachmentTypeSchema,
  size: z
    .number()
    .int()
    .min(1)
    .max(10 * 1024 * 1024),
});
export const attachmentSchema = uploadInputSchema.extend({ id: mongoIdSchema });
export const uploadGrantSchema = z.strictObject({
  attachment: attachmentSchema,
  url: z.url(),
  method: z.literal('PUT'),
  headers: z.record(z.string(), z.string()),
});
export const downloadGrantSchema = z.strictObject({ url: z.url() });
export const messageInputSchema = z
  .strictObject({
    clientMessageId: clientOperationIdSchema,
    body: z.string().trim().max(4000).default(''),
    attachmentIds: z.array(mongoIdSchema).max(4).default([]),
  })
  .refine(
    ({ body, attachmentIds }) =>
      (body.length > 0 || attachmentIds.length > 0) &&
      new Set(attachmentIds).size === attachmentIds.length,
  );
export const messageSchema = z.strictObject({
  id: mongoIdSchema,
  conversationId: mongoIdSchema,
  sender: personSchema,
  body: z.string(),
  attachments: z.array(attachmentSchema),
  createdAt: z.iso.datetime(),
  deleted: z.boolean(),
});
export const conversationSchema = z.strictObject({
  id: mongoIdSchema,
  kind: z.enum(['DIRECT', 'GROUP']),
  title: z.string(),
  members: membersSchema,
  role: memberRoleSchema,
  updatedAt: z.iso.datetime(),
  latest: messageSchema.nullable(),
});
export const pageQuerySchema = z.strictObject({
  limit: z
    .string()
    .regex(/^[1-9]\d?$/)
    .transform(Number)
    .pipe(z.number().max(50))
    .default(25),
  cursor: z.string().min(1).max(280).optional(),
});
export const searchQuerySchema = pageQuerySchema.extend({
  q: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[\p{L}\p{N}]+(?:[ '-][\p{L}\p{N}]+)*$/u),
});
export const messagePageSchema = z.strictObject({
  items: z.array(messageSchema),
  nextCursor: z.string().nullable(),
});
export const searchPageSchema = z.strictObject({
  items: z.array(
    messageSchema
      .pick({ id: true, sender: true, createdAt: true })
      .extend({ preview: z.string().max(240) }),
  ),
  nextCursor: z.string().nullable(),
});
export const conversationPageSchema = z.strictObject({
  items: z.array(conversationSchema),
  nextCursor: mongoIdSchema.nullable(),
});
export type Person = z.infer<typeof personSchema>;
export type Member = z.infer<typeof memberSchema>;
export type Conversation = z.infer<typeof conversationSchema>;
export type Message = z.infer<typeof messageSchema>;
export type MessageInput = z.infer<typeof messageInputSchema>;
export type GroupInput = z.infer<typeof groupInputSchema>;
export type UploadInput = z.infer<typeof uploadInputSchema>;
export type Attachment = z.infer<typeof attachmentSchema>;
export type MessagePage = z.infer<typeof messagePageSchema>;
export type PageQuery = z.infer<typeof pageQuerySchema>;
export type SearchResult = z.infer<typeof searchPageSchema>['items'][number];

export const recoverableUploadSchema = z.union([
  uploadGrantSchema,
  z.strictObject({ attachment: attachmentSchema, ready: z.literal(true) }),
]);
export const reconciliationQuerySchema = pageQuerySchema.extend({ reconcile: z.literal('1').optional() });
export const reconciliationPageSchema = messagePageSchema.extend({
  items: z.array(messageSchema.extend({ clientMessageId: clientOperationIdSchema.optional() })),
  visibleFrom: z.number().int().min(1),
});
export type ReconciliationPage = z.infer<typeof reconciliationPageSchema>;
