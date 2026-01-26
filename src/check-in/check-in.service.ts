import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/database/database.service';
import {
  CheckInHistoryResponse,
  CheckInResponse,
  CheckInStepResponse,
} from './dto/check-in-response.dto';
import { CreateCheckInDto } from './dto/create-check-in.dto';
import { Prisma } from 'generated/prisma';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { startOfDay, endOfDay } from 'date-fns';

@Injectable()
export class CheckInService {
  constructor(private readonly db: PrismaService) {}

  async getCheckInHistory(
    userId: string,
    timezone: string,
    limit = 30,
  ): Promise<CheckInHistoryResponse[]> {
    const checkIns = await this.db.checkIn.findMany({
      where: { userId },
      take: limit,
      orderBy: { createdAt: 'desc' },
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

  async getTodaysCheckIn(
    userId: string,
    timezone: string,
  ): Promise<CheckInResponse | null> {
    const { startOfDay: start, endOfDay: end } =
      this.getTodayInTimezone(timezone);

    const checkIn = await this.db.checkIn.findFirst({
      where: {
        userId,
        createdAt: {
          gte: start,
          lt: end,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!checkIn) {
      return null;
    }

    return {
      ...checkIn,
      steps: checkIn.steps as unknown as CheckInStepResponse[],
    };
  }

  async hasCheckedInToday(userId: string, timezone: string): Promise<boolean> {
    const { startOfDay: start, endOfDay: end } =
      this.getTodayInTimezone(timezone);

    const checkIn = await this.db.checkIn.findFirst({
      where: {
        userId,
        createdAt: {
          gte: start,
          lt: end,
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

    return {
      ...checkIn,
      steps: checkIn.steps as unknown as CheckInStepResponse[],
    };
  }

  async createCheckIn(
    userId: string,
    dto: CreateCheckInDto,
    timezone: string,
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

    // Validate they haven't already checked in today
    const hasCheckedIn = await this.hasCheckedInToday(userId, timezone);
    if (hasCheckedIn) {
      throw new ConflictException('You have already checked in today');
    }

    // Validate the submitted date is "today" in their timezone
    const { startOfDay: start, endOfDay: end } =
      this.getTodayInTimezone(timezone);
    const submittedDate = new Date(dto.date);

    if (submittedDate < start || submittedDate >= end) {
      throw new BadRequestException('Check-in date must be today');
    }

    const overallMood = this.calculateOverallMood(dto.steps);

    // Store the date field as start of day in user's timezone, converted to UTC
    const userLocalTime = toZonedTime(new Date(), timezone);
    const checkInDate = fromZonedTime(startOfDay(userLocalTime), timezone);

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

  /**
   * Get today's date range in the user's timezone
   * Returns UTC timestamps for the start and end of "today" in user's local time
   */
  private getTodayInTimezone(timezone: string): {
    startOfDay: Date;
    endOfDay: Date;
  } {
    try {
      // Get current time in user's timezone
      const now = new Date();
      const userLocalTime = toZonedTime(now, timezone);

      // Get start and end of day in user's local time
      const startOfDayLocal = startOfDay(userLocalTime);
      const endOfDayLocal = endOfDay(userLocalTime);

      // Convert back to UTC for database queries
      const startOfDayUTC = fromZonedTime(startOfDayLocal, timezone);
      const endOfDayUTC = fromZonedTime(endOfDayLocal, timezone);

      // console.log('Timezone calculation:', {
      //   timezone,
      //   userLocalTime: userLocalTime.toISOString(),
      //   startOfDayUTC: startOfDayUTC.toISOString(),
      //   endOfDayUTC: endOfDayUTC.toISOString(),
      // });

      return {
        startOfDay: startOfDayUTC,
        endOfDay: endOfDayUTC,
      };
    } catch (error) {
      console.error('Error parsing timezone:', timezone, error);
      // Fallback to UTC
      const now = new Date();
      return {
        startOfDay: startOfDay(now),
        endOfDay: endOfDay(now),
      };
    }
  }

  private calculateOverallMood(steps: { mood: number }[]): number {
    const sum = steps.reduce((acc, step) => acc + step.mood, 0);
    const average = sum / steps.length;
    return Math.round(average);
  }
}
