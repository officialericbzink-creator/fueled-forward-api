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
    origin: '*', // TODO: Update with your app's URL in production
  },
})
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(private readonly aiChatService: AIChatService) {}

  async afterInit() {
    const redisUrl = process.env.REDIS_URL;

    if (redisUrl) {
      try {
        const pubClient = createClient({ url: redisUrl });
        const subClient = pubClient.duplicate();

        await Promise.all([pubClient.connect(), subClient.connect()]);

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

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @MessageBody() data: SendMessageDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { userId, message } = data;

      if (userId !== client.data.userId) {
        throw new WsException('Unauthorized: userId mismatch');
      }

      if (!message || message.trim().length === 0) {
        throw new WsException('Message cannot be empty');
      }

      this.logger.log(
        `Message from user ${userId}: ${message.substring(0, 50)}...`,
      );

      // Emit typing indicator
      this.server.to(`user:${userId}`).emit('typing', { typing: true });

      try {
        // Call AI service
        const result = await this.aiChatService.handleUserMessage({
          userId,
          message,
        });

        // Send AI response
        this.server.to(`user:${userId}`).emit('messageResponse', {
          role: 'assistant',
          content: result.assistantMessage,
          messageId: result.messageId,
          timestamp: new Date().toISOString(),
          tokens: result.tokens,
          contextRefreshed: result.contextRefreshed,
        });

        this.logger.log(
          `Response sent to user ${userId} - Tokens: ${result.tokens.inputTokens}/${result.tokens.outputTokens}`,
        );
      } finally {
        // Always stop typing indicator
        this.server.to(`user:${userId}`).emit('typing', { typing: false });
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
