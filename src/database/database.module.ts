import { Global, Module } from '@nestjs/common';
import { PrismaService } from './database.service'; // Adjust path

@Global() // Makes it available everywhere
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
