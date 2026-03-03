import {
  Controller,
  Delete,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Session,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GoalsService } from './goals.service';
import { AuthGuard } from 'src/auth/auth.guard';
import type { UserSession } from 'src/auth/auth.types';
import { CreateGoalDto } from './dto/create-goal.dto';
import { GetRecommendationsQueryDto } from './dto/get-goal-recommendations.dto';

@ApiTags('goals')
@ApiCookieAuth('better-auth.session_token')
@UseGuards(AuthGuard)
@Controller('goals')
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  /**
   * GET /goals
   * Get all active goals for today
   */
  @Get('')
  @ApiOkResponse({
    schema: {
      example: {
        data: [{ id: 'goal_id', goal: 'Drink water', completed: false }],
        count: 1,
      },
    },
  })
  async getGoals(@Session() session: UserSession) {
    const goals = await this.goalsService.getTodaysGoals(session.user.id);
    return {
      data: goals,
      count: goals.length,
    };
  }

  /**
   * POST /goals
   * Create a new goal
   */
  @Post('')
  @ApiCreatedResponse({
    schema: {
      example: {
        data: { id: 'goal_id', goal: 'Drink water', completed: false },
        message: 'Goal created successfully',
      },
    },
  })
  async createGoal(
    @Session() session: UserSession,
    @Body() createGoalDto: CreateGoalDto,
  ) {
    const goal = await this.goalsService.createGoal(
      session.user.id,
      createGoalDto,
    );
    return {
      data: goal,
      message: 'Goal created successfully',
    };
  }

  /**
   * PATCH /goals/:id/toggle
   * Toggle goal completion status
   */
  @Patch(':id/toggle')
  @ApiOkResponse({
    schema: {
      example: {
        data: { id: 'goal_id', goal: 'Drink water', completed: true },
        message: 'Goal updated successfully',
      },
    },
  })
  async toggleGoal(
    @Session() session: UserSession,
    @Param('id') goalId: string,
  ) {
    const goal = await this.goalsService.toggleGoalCompletion(
      session.user.id,
      goalId,
    );
    return {
      data: goal,
      message: 'Goal updated successfully',
    };
  }

  /**
   * GET /goals/recommendations
   * Get random goal recommendations
   */
  @Get('recommendations')
  @ApiOkResponse({
    schema: {
      example: {
        data: [{ goal: 'Take a short walk' }],
        count: 1,
      },
    },
  })
  async getGoalRecommendations(@Query() query: GetRecommendationsQueryDto) {
    const recommendations = this.goalsService.getGoalRecommendations(
      query.count,
    );
    return {
      data: recommendations,
      count: recommendations.length,
    };
  }

  /**
   * DELETE /goals/:id
   * Delete a goal
   */
  @Delete(':id')
  @ApiOkResponse({
    schema: {
      example: { success: true },
    },
  })
  async deleteGoal(
    @Session() session: UserSession,
    @Param('id') goalId: string,
  ) {
    const result = await this.goalsService.deleteGoal(session.user.id, goalId);
    return result;
  }
}
