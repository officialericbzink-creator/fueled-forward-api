import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  AuthGuard,
  Session,
  type UserSession,
} from '@thallesp/nestjs-better-auth';
import { AIChatService } from './chat.service';

@Controller('chat')
@UseGuards(AuthGuard)
export class ChatController {
  constructor(private readonly aiChatService: AIChatService) {}

  @Get('conversation')
  async getConversation(@Session() session: UserSession) {
    return this.aiChatService.getConversationHistory(session.user.id);
  }
}
