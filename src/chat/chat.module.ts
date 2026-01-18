import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { AIChatService } from './chat.service';
import { ChatController } from './chat.controller';

@Module({
  providers: [ChatGateway, AIChatService],
  controllers: [ChatController],
})
export class ChatModule {}
