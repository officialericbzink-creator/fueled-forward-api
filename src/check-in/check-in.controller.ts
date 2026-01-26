import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  AuthGuard,
  Session,
  type UserSession,
} from '@thallesp/nestjs-better-auth';
import { CheckInService } from './check-in.service';
import { CreateCheckInDto } from './dto/create-check-in.dto';
import { GetHistoryQueryDto } from './dto/get-history-query.dto';
import { CheckInParamDto } from './dto/check-in-param.dto';
import { Timezone } from '../common/decorators/timezone.decorators';

@Controller('check-in')
@UseGuards(AuthGuard)
export class CheckInController {
  constructor(private readonly checkInService: CheckInService) {}

  /**
   * GET /check-in/history?limit=30
   * Get user's check-in history with optional limit
   */
  @Get('history')
  async getCheckInHistory(
    @Session() session: UserSession,
    @Query() query: GetHistoryQueryDto,
    @Timezone() timezone: string,
  ) {
    const checkIns = await this.checkInService.getCheckInHistory(
      session.user.id,
      timezone,
      query.limit,
    );
    return {
      data: checkIns,
      count: checkIns.length,
    };
  }

  /**
   * GET /check-in/today
   * Get today's check-in for the authenticated user
   */
  @Get('today')
  async getTodaysCheckIn(
    @Session() session: UserSession,
    @Timezone() timezone: string,
  ) {
    const checkIn = await this.checkInService.getTodaysCheckIn(
      session.user.id,
      timezone,
    );
    return {
      data: checkIn,
    };
  }

  /**
   * GET /check-in/has-checked-in-today
   * Check if user has checked in today
   */
  @Get('has-checked-in-today')
  async hasCheckedInToday(
    @Session() session: UserSession,
    @Timezone() timezone: string,
  ) {
    const hasCheckedIn = await this.checkInService.hasCheckedInToday(
      session.user.id,
      timezone,
    );
    return {
      hasCheckedIn,
    };
  }

  /**
   * GET /check-in/:id
   * Get a specific check-in by ID
   */
  @Get(':id')
  async getCheckInById(
    @Param() params: CheckInParamDto,
    @Session() session: UserSession,
  ) {
    const checkIn = await this.checkInService.getCheckInById(
      params.id,
      session.user.id,
    );
    return {
      data: checkIn,
    };
  }

  /**
   * POST /check-in
   * Create a new check-in
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createCheckIn(
    @Body() dto: CreateCheckInDto,
    @Session() session: UserSession,
    @Timezone() timezone: string,
  ) {
    try {
      const checkIn = await this.checkInService.createCheckIn(
        session.user.id,
        dto,
        timezone,
      );
      return {
        message: 'Check-in created successfully',
        data: checkIn,
      };
    } catch (error) {
      console.error('Error creating check-in:', error);
      throw error;
    }
  }

  @Post('reminder-time')
  @HttpCode(HttpStatus.OK)
  async setCheckInReminderTime(
    @Body('reminderTime') reminderTime: string,
    @Session() session: UserSession,
  ) {
    try {
      // await this.checkInService.setCheckInReminderTime(
      //   session.user.id,
      //   reminderTime,
      // );
      return {
        message: 'Check-in reminder time updated successfully',
      };
    } catch (error) {
      console.error('Error setting check-in reminder time:', error);
      throw error;
    }
  }
}
