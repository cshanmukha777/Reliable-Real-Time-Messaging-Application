import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { Attachments } from './attachments.service';
import { Conversations } from './conversations.service';
import { ConversationController, DiscoveryController } from './messaging.controller';
import { Messages } from './messages.service';
import { MessagingRepository } from './repository';
import { AttachmentStorage } from './storage';
import { MessagingUsers } from './users.service';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [ConversationController, DiscoveryController],
  providers: [Conversations, Messages, MessagingRepository, MessagingUsers, Attachments, AttachmentStorage],
})
export class MessagingModule {}
