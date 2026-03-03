import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { WsException } from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { AIChatService } from './chat.service';

interface SendMessageDto {
  userId: string;
  message: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.WS_CORS_ORIGIN
      ? process.env.WS_CORS_ORIGIN.split(',').map((s) => s.trim())
      : '*',
  },
})
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private userMessageCounts = new Map<
    string,
    { count: number; resetAt: number }
  >();
  private rateLimitClient?: ReturnType<typeof createClient>;

  constructor(private readonly aiChatService: AIChatService) {}

  async afterInit() {
    const redisUrl = process.env.REDIS_URL;

    if (redisUrl) {
      try {
        const baseClient = createClient({ url: redisUrl });
        const pubClient = baseClient.duplicate();
        const subClient = baseClient.duplicate();

        await Promise.all([
          baseClient.connect(),
          pubClient.connect(),
          subClient.connect(),
        ]);

        this.rateLimitClient = baseClient;
        this.server.adapter(createAdapter(pubClient, subClient));
        this.logger.log('Redis adapter connected successfully');
      } catch (error) {
        this.logger.error(`Failed to connect Redis adapter: ${error.message}`);
      }
    } else {
      this.logger.warn('No REDIS_URL found - running in single instance mode');
    }
  }

  async handleConnection(client: Socket) {
    try {
      const userId = client.handshake.auth?.userId;

      if (!userId) {
        this.logger.warn(`Connection rejected - no userId provided`);
        client.disconnect();
        return;
      }

      client.data.userId = userId;

      const roomName = `user:${userId}`;
      await client.join(roomName);

      this.logger.log(
        `Client connected: ${client.id} (User: ${userId}, Room: ${roomName})`,
      );

      client.emit('connected', {
        message: 'Connected to chat',
        userId,
      });
    } catch (error) {
      this.logger.error(`Connection error: ${error.message}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    this.logger.log(
      `Client disconnected: ${client.id} (User: ${userId || 'unknown'})`,
    );
  }

  private async checkRateLimit(userId: string): Promise<boolean> {
    const windowMs = Number(process.env.CHAT_RATE_LIMIT_WINDOW_MS ?? 60_000);
    const max = Number(process.env.CHAT_RATE_LIMIT_MAX ?? 10);

    if (this.rateLimitClient?.isOpen) {
      try {
        const bucket = Math.floor(Date.now() / windowMs);
        const key = `rl:ws:chat:${userId}:${bucket}`;

        const count = await this.rateLimitClient.incr(key);
        if (count === 1) {
          const expireSeconds = Math.ceil(windowMs / 1000) + 5;
          await this.rateLimitClient.expire(key, expireSeconds);
        }

        return count <= max;
      } catch (error) {
        this.logger.warn(
          `Redis rate limit failed, falling back to in-memory: ${error.message}`,
        );
      }
    }

    const now = Date.now();
    const userLimit = this.userMessageCounts.get(userId);

    if (!userLimit || now > userLimit.resetAt) {
      // Reset counter every minute
      this.userMessageCounts.set(userId, {
        count: 1,
        resetAt: now + windowMs,
      });
      return true;
    }

    if (userLimit.count >= max) {
      return false;
    }

    userLimit.count++;
    return true;
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @MessageBody() data: SendMessageDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const clientUserId = client.data.userId as string | undefined;
      const payloadUserId = data?.userId;
      const message = data?.message;

      if (!clientUserId) {
        throw new WsException('Unauthorized: missing userId');
      }

      if (payloadUserId && payloadUserId !== clientUserId) {
        throw new WsException('Unauthorized: userId mismatch');
      }

      if (!(await this.checkRateLimit(clientUserId))) {
        throw new WsException('Too many messages. Please wait a moment.');
      }

      if (!message || message.trim().length === 0) {
        throw new WsException('Message cannot be empty');
      }

      this.logger.log(
        `Message from user ${clientUserId}: ${message.substring(0, 50)}...`,
      );

      // Emit typing indicator
      this.server.to(`user:${clientUserId}`).emit('typing', { typing: true });

      try {
        // Call AI service
        const result = await this.aiChatService.handleUserMessage({
          userId: clientUserId,
          message,
        });

        // Send AI response
        this.server.to(`user:${clientUserId}`).emit('messageResponse', {
          role: 'assistant',
          content: result.assistantMessage,
          messageId: result.messageId,
          timestamp: new Date().toISOString(),
          tokens: result.tokens,
          contextRefreshed: result.contextRefreshed,
        });

        this.logger.log(
          `Response sent to user ${clientUserId} - Tokens: ${result.tokens.inputTokens}/${result.tokens.outputTokens}`,
        );
      } finally {
        // Always stop typing indicator
        this.server.to(`user:${clientUserId}`).emit('typing', { typing: false });
      }

      return {
        success: true,
        message: 'Message received',
      };
    } catch (error) {
      this.logger.error(`Error handling message: ${error.message}`);

      // Stop typing on error
      this.server
        .to(`user:${client.data.userId}`)
        .emit('typing', { typing: false });

      throw new WsException(error.message || 'Failed to process message');
    }
  }

  async isUserConnected(userId: string): Promise<boolean> {
    const sockets = await this.server.in(`user:${userId}`).fetchSockets();
    return sockets.length > 0;
  }
}
