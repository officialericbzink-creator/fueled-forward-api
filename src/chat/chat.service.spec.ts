jest.mock('@anthropic-ai/sdk', () => ({
  Anthropic: class Anthropic {
    constructor() {}
  },
}));

import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/database/database.service';
import { AIChatService } from './chat.service';

describe('AIChatService', () => {
  let service: AIChatService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      conversation: {
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      message: {
        findMany: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      checkIn: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AIChatService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<AIChatService>(AIChatService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('handleUserMessage rejects overly long messages', async () => {
    const msg = 'x'.repeat(2001);
    await expect(
      service.handleUserMessage({ userId: 'u1', message: msg }),
    ).rejects.toThrow(/Message too long/i);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('getConversationHistory returns empty when conversation missing', async () => {
    prisma.conversation.findUnique.mockResolvedValue(null);

    await expect(service.getConversationHistory('u1')).resolves.toEqual({
      conversationId: null,
      messages: [],
    });
  });

  it('getConversationHistory maps role to lowercase and respects clearedAt', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'c1',
      userId: 'u1',
      clearedAt: new Date('2026-03-01T00:00:00.000Z'),
    });
    prisma.message.findMany.mockResolvedValue([
      {
        id: 'm1',
        role: 'USER',
        content: 'hi',
        createdAt: new Date('2026-03-02T00:00:00.000Z'),
      },
      {
        id: 'm2',
        role: 'ASSISTANT',
        content: 'yo',
        createdAt: new Date('2026-03-02T00:01:00.000Z'),
      },
    ]);

    const result = await service.getConversationHistory('u1');

    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          conversationId: 'c1',
          createdAt: { gt: new Date('2026-03-01T00:00:00.000Z') },
        }),
        take: 500,
      }),
    );

    expect(result.conversationId).toBe('c1');
    expect(result.messages.map((m: any) => m.role)).toEqual(['user', 'assistant']);
  });

  it('clearConversationHistory throws when conversation missing', async () => {
    prisma.conversation.findUnique.mockResolvedValue(null);

    await expect(service.clearConversationHistory('u1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
