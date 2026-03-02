import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './database/database.service';
import { CheckInModule } from './check-in/check-in.module';
import { GoalsModule } from './goals/goals.module';
import { PrismaModule } from './database/database.module';
import { ProfileModule } from './profile/profile.module';
import { EmailModule } from './email/email.module';
import { ChatModule } from './chat/chat.module';
import { MediaModule } from './media/media.module';
import { AuthGuard } from 'src/auth/auth.guard';

@Module({
  imports: [
    PrismaModule,
    CheckInModule,
    GoalsModule,
    ProfileModule,
    EmailModule,
    ChatModule,
    MediaModule,
  ],
  controllers: [AppController],
  providers: [AppService, PrismaService, AuthGuard],
})
export class AppModule {}
