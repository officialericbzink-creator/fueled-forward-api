import { Controller, Delete, Get, Session, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from 'src/auth/auth.guard';
import type { UserSession } from 'src/auth/auth.types';
import { AIChatService } from './chat.service';

@ApiTags('chat')
@ApiCookieAuth('better-auth.session_token')
@Controller('chat')
@UseGuards(AuthGuard)
export class ChatController {
  constructor(private readonly aiChatService: AIChatService) {}

  @Get('conversation')
  @ApiOkResponse({
    schema: {
      example: {
        data: [{ role: 'assistant', content: 'Hello' }],
      },
    },
  })
  async getConversation(@Session() session: UserSession) {
    return this.aiChatService.getConversationHistory(session.user.id);
  }

  @Delete('clear-conversation')
  @ApiOkResponse({ schema: { example: { success: true } } })
  async clearConversation(@Session() session: UserSession) {
    return this.aiChatService.clearConversationHistory(session.user.id);
  }
}
