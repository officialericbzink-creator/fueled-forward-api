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
import { GoalsService } from './goals.service';
import { AuthGuard, type UserSession } from '@thallesp/nestjs-better-auth';
import { CreateGoalDto } from './dto/create-goal.dto';
import { GetRecommendationsQueryDto } from './dto/get-goal-recommendations.dto';

@UseGuards(AuthGuard)
@Controller('goals')
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  /**
   * GET /goals
   * Get all active goals for today
   */
  @Get('')
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
  async deleteGoal(
    @Session() session: UserSession,
    @Param('id') goalId: string,
  ) {
    const result = await this.goalsService.deleteGoal(session.user.id, goalId);
    return result;
  }
}
