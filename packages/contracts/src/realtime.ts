import { z } from 'zod';
import { clientOperationIdSchema, conversationSchema, messageSchema, mongoIdSchema, pageQuerySchema } from './messaging';

export const sequenceSchema = z.number().int().min(0).max(2147483647);
const sequenceInput = z.string().regex(/^(0|[1-9]\d{0,9})$/).transform(Number).pipe(sequenceSchema);
export const streamSchema = z.enum(['ACCOUNT', 'CONVERSATION']);
export const availabilitySchema = z.strictObject({
  stream: streamSchema, streamId: mongoIdSchema, highWater: sequenceSchema,
});
export const replayQuerySchema = pageQuerySchema.omit({cursor:true}).extend({ after: sequenceInput.default(0) });
export const accountSnapshotQuerySchema = pageQuerySchema.extend({ watermark: sequenceInput.optional() });
export const receiptStageSchema = z.enum(['DELIVERED','READ']);
export const receiptInputSchema = z.strictObject({stage: receiptStageSchema});
export const receiptCountsSchema = z.strictObject({
  eligible: z.number().int().nonnegative(), delivered: z.number().int().nonnegative(), read: z.number().int().nonnegative(),
}).refine(({eligible,delivered,read}) => read <= delivered && delivered <= eligible);
export const realtimeMessageSchema = messageSchema.extend({
  clientMessageId: clientOperationIdSchema.optional(),
  receipt: receiptCountsSchema.optional(),
  canAcknowledge: z.boolean().optional(),
  messageSequence: sequenceSchema,
});
export const membershipViewSchema = z.strictObject({
  id: mongoIdSchema, visibleFrom: sequenceSchema, eventVisibleFrom: sequenceSchema, highWater: sequenceSchema,
});
export const replayEntrySchema = z.strictObject({
  sequence: sequenceSchema,
  type: z.enum(['filtered','conversation.created','membership.granted','membership.revoked','membership.role','message.created','message.deleted','receipt.delivered','receipt.read']),
  membership: membershipViewSchema.nullable().optional(),
  conversationId: mongoIdSchema.optional(),
  conversation: conversationSchema.optional(),
  message: realtimeMessageSchema.optional(),
  receiptsInvalidated: z.boolean().optional(),
});
export const replayPageSchema = availabilitySchema.extend({
  events: z.array(replayEntrySchema), next: sequenceSchema, more: z.boolean(), snapshotRequired: z.boolean(),
});
export const accountSnapshotSchema = z.strictObject({
  highWater: sequenceSchema, changed: z.boolean(), nextCursor: mongoIdSchema.nullable(), memberships: z.array(membershipViewSchema),
});
export const conversationSnapshotSchema = z.strictObject({
  membership: membershipViewSchema, conversation: conversationSchema,
  messages: z.array(realtimeMessageSchema), older: z.string().nullable(),
});
export const subscriptionSchema = z.strictObject({id: mongoIdSchema, after: sequenceSchema});
export const typingSchema = z.strictObject({id: mongoIdSchema, active: z.boolean()});
export const presenceSchema = z.strictObject({id: mongoIdSchema, online: z.array(mongoIdSchema).max(32)});
export const typingNoticeSchema = typingSchema.extend({userId: mongoIdSchema});
export type Availability = z.infer<typeof availabilitySchema>;
export type ReplayPage = z.infer<typeof replayPageSchema>;
export type ReplayEntry = z.infer<typeof replayEntrySchema>;
export type MembershipView = z.infer<typeof membershipViewSchema>;
export type RealtimeMessage = z.infer<typeof realtimeMessageSchema>;
export type ConversationSnapshot = z.infer<typeof conversationSnapshotSchema>;
export type AccountSnapshot = z.infer<typeof accountSnapshotSchema>;
export type ReceiptStage = z.infer<typeof receiptStageSchema>;
export type ReceiptCounts = z.infer<typeof receiptCountsSchema>;
