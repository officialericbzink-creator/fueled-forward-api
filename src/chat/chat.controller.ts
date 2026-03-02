import { Controller, Delete, Get, Session, UseGuards } from '@nestjs/common';
import { AuthGuard } from 'src/auth/auth.guard';
import type { UserSession } from 'src/auth/auth.types';
import { AIChatService } from './chat.service';

@Controller('chat')
@UseGuards(AuthGuard)
export class ChatController {
  constructor(private readonly aiChatService: AIChatService) {}

  @Get('conversation')
  async getConversation(@Session() session: UserSession) {
    return this.aiChatService.getConversationHistory(session.user.id);
  }

  @Delete('clear-conversation')
  async clearConversation(@Session() session: UserSession) {
    return this.aiChatService.clearConversationHistory(session.user.id);
  }
}
