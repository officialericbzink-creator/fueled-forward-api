import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './database/database.service';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { auth } from './lib/auth';
import { CheckInModule } from './check-in/check-in.module';
import { GoalsModule } from './goals/goals.module';
import { PrismaModule } from './database/database.module';
import { ProfileModule } from './profile/profile.module';
import { EmailModule } from './email/email.module';

@Module({
  imports: [
    AuthModule.forRoot({ auth }),
    PrismaModule,
    CheckInModule,
    GoalsModule,
    ProfileModule,
    EmailModule,
  ],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
