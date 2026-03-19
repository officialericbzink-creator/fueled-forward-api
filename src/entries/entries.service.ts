import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/database/database.service';
import { summarizeContent } from './journal-summary.service';
import { CreateEntryDto } from './dto/create-entry.dto';

@Injectable()
export class EntriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateEntryDto) {
    const { summary, insights } = await summarizeContent(dto.content);
    return this.prisma.journalEntry.create({
      data: {
        userId,
        type: dto.type,
        content: dto.content,
        summary,
        insights: insights ?? undefined,
      },
    });
  }

  async findAllForUser(userId: string) {
    return this.prisma.journalEntry.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findRecentForUser(userId: string, limit: number) {
    return this.prisma.journalEntry.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async delete(userId: string, entryId: string) {
    const entry = await this.prisma.journalEntry.findFirst({
      where: { id: entryId, userId },
    });
    if (!entry) {
      throw new NotFoundException('Entry not found');
    }
    await this.prisma.journalEntry.delete({ where: { id: entryId } });
    return { message: 'Entry deleted successfully' };
  }
}
