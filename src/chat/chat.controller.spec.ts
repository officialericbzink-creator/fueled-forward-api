jest.mock('src/auth/auth.guard', () => ({
  AuthGuard: class AuthGuard {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ChatController } from './chat.controller';
import { AIChatService } from './chat.service';

describe('ChatController', () => {
  let controller: ChatController;
  let aiChatService: { getConversationHistory: jest.Mock; clearConversationHistory: jest.Mock };

  beforeEach(async () => {
    aiChatService = {
      getConversationHistory: jest.fn(),
      clearConversationHistory: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [{ provide: AIChatService, useValue: aiChatService }],
    }).compile();

    controller = module.get<ChatController>(ChatController);
  });

  it('getConversation delegates to service', async () => {
    aiChatService.getConversationHistory.mockResolvedValue({ conversationId: 'c1', messages: [] });

    const res = await controller.getConversation({ user: { id: 'u1' } } as any);

    expect(aiChatService.getConversationHistory).toHaveBeenCalledWith('u1');
    expect(res).toEqual({ conversationId: 'c1', messages: [] });
  });

  it('clearConversation delegates to service', async () => {
    aiChatService.clearConversationHistory.mockResolvedValue({ id: 'c1' });

    const res = await controller.clearConversation({ user: { id: 'u1' } } as any);

    expect(aiChatService.clearConversationHistory).toHaveBeenCalledWith('u1');
    expect(res).toEqual({ id: 'c1' });
  });
});
