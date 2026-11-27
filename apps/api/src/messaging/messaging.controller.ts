import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  API_VERSION,
  clientOperationIdSchema,
  directInputSchema,
  discoverySchema,
  groupInputSchema,
  memberChangeSchema,
  messageInputSchema,
  mongoIdSchema,
  pageQuerySchema,
  searchQuerySchema,
  reconciliationQuerySchema,
  uploadInputSchema,
  type Account,
} from '@chatapp/contracts';
import type { ZodType } from 'zod';
import { AccessTokenGuard, CurrentAccount } from '../auth/auth.guard';
import { Attachments } from './attachments.service';
import { Conversations } from './conversations.service';
import { Messages } from './messages.service';
import { MessagingUsers } from './users.service';

function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException();
  return result.data;
}

const version = API_VERSION.slice(1);
const objectId = (id: string) => parse(mongoIdSchema, id);

@Controller({ path: 'users/discover', version })
@UseGuards(AccessTokenGuard)
export class DiscoveryController {
  constructor(private readonly users: MessagingUsers) {}

  @Get()
  list(@CurrentAccount() { id }: Account, @Query() query: unknown) {
    return this.users.discover(id, parse(discoverySchema, query).q);
  }
}

@Controller({ path: 'conversations', version })
@UseGuards(AccessTokenGuard)
export class ConversationController {
  constructor(
    private readonly conversations: Conversations,
    private readonly messages: Messages,
    private readonly attachments: Attachments,
  ) {}

  @Post('direct')
  @HttpCode(200)
  direct(@CurrentAccount() { id }: Account, @Body() body: unknown) {
    return this.conversations.direct(id, parse(directInputSchema, body).userId);
  }

  @Post('group')
  @HttpCode(200)
  group(@CurrentAccount() { id }: Account, @Body() body: unknown) {
    return this.conversations.group(id, parse(groupInputSchema, body));
  }

  @Get()
  list(@CurrentAccount() { id }: Account, @Query() query: unknown) {
    const { limit, cursor } = parse(pageQuerySchema, query);
    return this.conversations.list(
      id,
      limit,
      cursor ? objectId(cursor) : undefined,
    );
  }

  @Get(':conversation')
  details(
    @CurrentAccount() { id }: Account,
    @Param('conversation') conversation: string,
  ) {
    return this.conversations.details(id, objectId(conversation));
  }

  @Get(':conversation/members')
  async members(
    @CurrentAccount() { id }: Account,
    @Param('conversation') conversation: string,
  ) {
    return (await this.conversations.details(id, objectId(conversation)))
      .members;
  }

  @Patch(':conversation/members/:target')
  putMember(
    @CurrentAccount() { id }: Account,
    @Param('conversation') conversation: string,
    @Param('target') target: string,
    @Body() body: unknown,
  ) {
    return this.conversations.change(
      id,
      objectId(conversation),
      objectId(target),
      parse(memberChangeSchema, body).role,
    );
  }

  @Delete(':conversation/members/:target')
  removeMember(
    @CurrentAccount() { id }: Account,
    @Param('conversation') conversation: string,
    @Param('target') target: string,
  ) {
    return this.conversations.change(
      id,
      objectId(conversation),
      objectId(target),
      null,
    );
  }

  @Get(':conversation/messages')
  history(
    @CurrentAccount() { id }: Account,
    @Param('conversation') conversation: string,
    @Query() query: unknown,
  ) {
    const { reconcile, ...page } = parse(reconciliationQuerySchema, query);
    return this.messages.page(id, objectId(conversation), page, undefined, reconcile === '1');
  }

  @Post(':conversation/messages')
  @HttpCode(200)
  send(
    @CurrentAccount() { id }: Account,
    @Param('conversation') conversation: string,
    @Body() body: unknown,
  ) {
    return this.messages.send(
      id,
      objectId(conversation),
      parse(messageInputSchema, body),
    );
  }

  @Delete(':conversation/messages/:message')
  @HttpCode(204)
  deleteMessage(
    @CurrentAccount() { id }: Account,
    @Param('conversation') conversation: string,
    @Param('message') message: string,
  ) {
    return this.messages.remove(id, objectId(conversation), objectId(message));
  }

  @Get(':conversation/search')
  async search(
    @CurrentAccount() { id }: Account,
    @Param('conversation') conversation: string,
    @Query() query: unknown,
  ) {
    const { q, ...page } = parse(searchQuerySchema, query);
    const result = await this.messages.page(
      id,
      objectId(conversation),
      page,
      q,
    );
    return {
      nextCursor: result.nextCursor,
      items: result.items.map(({ id, sender, createdAt, body }) => ({
        id,
        sender,
        createdAt,
        preview: body.slice(0, 240),
      })),
    };
  }

  @Post(':conversation/attachments')
  grant(
    @CurrentAccount() { id }: Account,
    @Param('conversation') conversation: string,
    @Body() body: unknown,
  ) {
    return this.attachments.grant(
      id,
      objectId(conversation),
      parse(uploadInputSchema, body),
    );
  }

  @Post(':conversation/attachments/recover/:operation')
  @HttpCode(200)
  recoverAttachment(
    @CurrentAccount() { id }: Account,
    @Param('conversation') conversation: string,
    @Param('operation') operation: string,
    @Body() body: unknown,
  ) {
    return this.attachments.recover(id, objectId(conversation), parse(clientOperationIdSchema, operation), parse(uploadInputSchema, body));
  }

  @Post(':conversation/attachments/:attachment/complete')
  @HttpCode(200)
  complete(
    @CurrentAccount() { id }: Account,
    @Param('conversation') conversation: string,
    @Param('attachment') attachment: string,
  ) {
    return this.attachments.complete(
      id,
      objectId(conversation),
      objectId(attachment),
    );
  }

  @Post(':conversation/attachments/:attachment/download')
  @HttpCode(200)
  download(
    @CurrentAccount() { id }: Account,
    @Param('conversation') conversation: string,
    @Param('attachment') attachment: string,
  ) {
    return this.attachments.download(
      id,
      objectId(conversation),
      objectId(attachment),
    );
  }
}
