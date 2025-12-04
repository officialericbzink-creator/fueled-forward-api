import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
// import { CheckIn } from 'generated/prisma';
import { PrismaService } from 'src/database/database.service';
import {
  CheckInHistoryResponse,
  CheckInResponse,
  CheckInStepResponse,
} from './dto/check-in-response.dto';
import { CheckInStepDto, CreateCheckInDto } from './dto/create-check-in.dto';
import { Prisma } from 'generated/prisma';
type Data = {
  userId: string;
  date: string;
  completed: true;
  steps: { step: number; mood: number; notes?: string }[];
};
@Injectable()
export class CheckInService {
  constructor(private readonly db: PrismaService) {}

  async getCheckInHistory(
    userId: string,
    limit = 30,
  ): Promise<CheckInHistoryResponse[]> {
    const checkIns = await this.db.checkIn.findMany({
      where: { userId },
      take: limit,
      orderBy: { date: 'asc' },
      select: {
        id: true,
        date: true,
        overallMood: true,
        completed: true,
        steps: true,
        createdAt: true,
      },
    });

    return checkIns.map((checkIn) => ({
      ...checkIn,
      steps: checkIn.steps as unknown as CheckInStepResponse[],
    }));
  }

  async getTodaysCheckIn(userId: string): Promise<CheckInResponse | null> {
    const today = this.getStartOfDay(new Date());

    const checkIn = await this.db.checkIn.findUnique({
      where: {
        userId_date: {
          userId,
          date: today,
        },
      },
    });

    if (!checkIn) {
      return null;
    }

    return {
      ...checkIn,
      steps: checkIn.steps as unknown as CheckInStepResponse[],
    };
  }

  async hasCheckedInToday(userId: string): Promise<boolean> {
    const today = this.getStartOfDay(new Date());

    const checkIn = await this.db.checkIn.findUnique({
      where: {
        userId_date: {
          userId,
          date: today,
        },
      },
      select: { id: true },
    });

    return !!checkIn;
  }

  async getCheckInById(id: string, userId: string): Promise<CheckInResponse> {
    const checkIn = await this.db.checkIn.findUnique({
      where: { id },
    });

    if (!checkIn) {
      throw new NotFoundException(`Check-in with ID ${id} not found`);
    }

    if (checkIn.userId !== userId) {
      throw new NotFoundException(`Check-in with ID ${id} not found`);
    }

    // ✅ Transform JsonValue to proper type
    return {
      ...checkIn,
      steps: checkIn.steps as unknown as CheckInStepResponse[],
    };
  }

  async createCheckIn(
    userId: string,
    dto: CreateCheckInDto,
  ): Promise<CheckInResponse> {
    if (dto.steps.length !== 5) {
      throw new BadRequestException('Check-in must include all 5 steps');
    }

    const steps = dto.steps.map((s) => s.step).sort();
    const expectedSteps = [1, 2, 3, 4, 5];
    if (JSON.stringify(steps) !== JSON.stringify(expectedSteps)) {
      throw new BadRequestException(
        'Check-in must include steps 1, 2, 3, 4, and 5 exactly once',
      );
    }

    const overallMood = this.calculateOverallMood(dto.steps);
    const checkInDate = this.getStartOfDay(new Date(dto.date));

    try {
      const checkIn = await this.db.checkIn.create({
        data: {
          userId,
          date: checkInDate,
          overallMood,
          completed: true,
          steps: dto.steps as unknown as Prisma.JsonArray,
        },
      });

      return {
        ...checkIn,
        steps: checkIn.steps as unknown as CheckInStepResponse[],
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Check-in already exists for this date');
      }

      console.error('Unexpected error creating check-in:', error);
      throw new InternalServerErrorException('Failed to create check-in');
    }
  }

  private calculateOverallMood(steps: { mood: number }[]): number {
    // this needs to be a rounded whole number
    const sum = steps.reduce((acc, step) => acc + step.mood, 0);
    const average = sum / steps.length;
    return Math.round(average);
  }

  private getStartOfDay(date: Date): Date {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  }
}
