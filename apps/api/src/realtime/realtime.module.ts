import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { MessagingModule } from '../messaging/messaging.module';
import { RealtimeGateway } from './gateway';
import { EventRelay } from './relay';
import { SyncController, SyncThrottle } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports:[AuthModule,DatabaseModule,MessagingModule],
  controllers:[SyncController],
  providers:[SyncService,SyncThrottle,RealtimeGateway,EventRelay],
})
export class RealtimeModule {}
