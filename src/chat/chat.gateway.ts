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

  async afterInit() {
    // Only set up Redis adapter if REDIS_URL is available (production/staging)
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
        // Continue without Redis - single instance mode
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

      // TODO: Validate userId exists in database
      // const user = await this.prisma.user.findUnique({ where: { id: userId } });
      // if (!user) {
      //   client.disconnect();
      //   return;
      // }

      client.data.userId = userId;

      // Join user-specific room
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

      // TODO: Store user message in database
      // TODO: Fetch user context (profile, check-ins)
      // TODO: Call Claude API
      // TODO: Store AI response in database

      // Mock AI response for testing
      const aiResponse = `Echo from instance ${process.pid}: ${message}`;

      // Send response to ALL user's connections across ALL instances
      this.server.to(`user:${userId}`).emit('messageResponse', {
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date().toISOString(),
        instanceId: process.pid, // For debugging multi-instance
      });

      return {
        success: true,
        message: 'Message received',
      };
    } catch (error) {
      this.logger.error(`Error handling message: ${error.message}`);
      throw new WsException(error.message || 'Failed to process message');
    }
  }

  /**
   * Check if a user has any active connections (across all instances)
   * Useful for push notification logic
   */
  async isUserConnected(userId: string): Promise<boolean> {
    const sockets = await this.server.in(`user:${userId}`).fetchSockets();
    return sockets.length > 0;
  }
}
