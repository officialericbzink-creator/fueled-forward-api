import { Test, TestingModule } from '@nestjs/testing';
import { ChatGateway } from './chat.gateway';
import { AIChatService } from './chat.service';
import { WsException } from '@nestjs/websockets';
import { Logger } from '@nestjs/common';

describe('ChatGateway', () => {
  let gateway: ChatGateway;
  let aiChatService: { handleUserMessage: jest.Mock };

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    aiChatService = {
      handleUserMessage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ChatGateway, { provide: AIChatService, useValue: aiChatService }],
    }).compile();

    gateway = module.get<ChatGateway>(ChatGateway);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('handleConnection rejects when no userId provided', async () => {
    const client: any = {
      id: 's1',
      handshake: { auth: {} },
      disconnect: jest.fn(),
      join: jest.fn(),
      emit: jest.fn(),
      data: {},
    };

    await gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
  });

  it('handleConnection joins user room and emits connected', async () => {
    const client: any = {
      id: 's1',
      handshake: { auth: { userId: 'u1' } },
      disconnect: jest.fn(),
      join: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn(),
      data: {},
    };

    await gateway.handleConnection(client);

    expect(client.data.userId).toBe('u1');
    expect(client.join).toHaveBeenCalledWith('user:u1');
    expect(client.emit).toHaveBeenCalledWith('connected', {
      message: 'Connected to chat',
      userId: 'u1',
    });
  });

  it('handleSendMessage throws when client missing userId', async () => {
    (gateway as any).server = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    };
    const client: any = { data: {}, id: 's1' };

    await expect(
      gateway.handleSendMessage({ userId: 'u1', message: 'hi' } as any, client),
    ).rejects.toBeInstanceOf(WsException);
  });

  it('handleSendMessage throws on userId mismatch', async () => {
    (gateway as any).server = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
    jest.spyOn(gateway as any, 'checkRateLimit').mockResolvedValue(true);
    const client: any = { data: { userId: 'u1' }, id: 's1' };

    await expect(
      gateway.handleSendMessage({ userId: 'u2', message: 'hi' } as any, client),
    ).rejects.toBeInstanceOf(WsException);
  });

  it('handleSendMessage throws when rate limited (429 equivalent)', async () => {
    const emit = jest.fn();
    (gateway as any).server = {
      to: jest.fn().mockReturnValue({ emit }),
    };
    jest.spyOn(gateway as any, 'checkRateLimit').mockResolvedValue(false);
    const client: any = { data: { userId: 'u1' }, id: 's1' };

    await expect(
      gateway.handleSendMessage({ userId: 'u1', message: 'hi' } as any, client),
    ).rejects.toBeInstanceOf(WsException);

    // It should stop typing on error
    expect(emit).toHaveBeenCalledWith('typing', { typing: false });
  });

  it('handleSendMessage emits typing + response + typing false', async () => {
    const emit = jest.fn();
    (gateway as any).server = {
      to: jest.fn().mockReturnValue({ emit }),
    };
    jest.spyOn(gateway as any, 'checkRateLimit').mockResolvedValue(true);
    aiChatService.handleUserMessage.mockResolvedValue({
      assistantMessage: 'hello',
      messageId: 'm2',
      tokens: {
        inputTokens: 1,
        outputTokens: 2,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      },
      contextRefreshed: false,
    });

    const client: any = { data: { userId: 'u1' }, id: 's1' };

    const result = await gateway.handleSendMessage(
      { userId: 'u1', message: 'hi' } as any,
      client,
    );

    expect(aiChatService.handleUserMessage).toHaveBeenCalledWith({
      userId: 'u1',
      message: 'hi',
    });

    expect(emit).toHaveBeenNthCalledWith(1, 'typing', { typing: true });
    expect(emit).toHaveBeenNthCalledWith(
      2,
      'messageResponse',
      expect.objectContaining({
        role: 'assistant',
        content: 'hello',
        messageId: 'm2',
      }),
    );
    expect(emit).toHaveBeenNthCalledWith(3, 'typing', { typing: false });

    expect(result).toEqual({ success: true, message: 'Message received' });
  });
});
