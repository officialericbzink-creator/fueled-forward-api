import { Module } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { MediaService } from 'src/media/media.service';

@Module({
  controllers: [ProfileController],
  providers: [ProfileService, MediaService],
})
export class ProfileModule {}
