// src/goals/goals.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/database.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { GOAL_RECOMMENDATIONS } from './constants';

@Injectable()
export class GoalsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get all active goals for today (incomplete + today's completed)
   */
  async getTodaysGoals(userId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const goals = await this.prisma.dailyGoal.findMany({
      where: {
        userId,
        OR: [
          { completed: false },
          {
            completed: true,
            completedAt: {
              gte: startOfDay,
            },
          },
        ],
      },
      orderBy: [{ completed: 'asc' }, { createdAt: 'desc' }],
    });

    return goals;
  }

  /**
   * Create a new daily goal
   */
  async createGoal(userId: string, createGoalDto: CreateGoalDto) {
    const goal = await this.prisma.dailyGoal.create({
      data: {
        userId,
        goal: createGoalDto.goal,
        completed: false,
      },
    });

    return goal;
  }

  /**
   * Toggle goal completion status
   */
  async toggleGoalCompletion(userId: string, goalId: string) {
    const existingGoal = await this.prisma.dailyGoal.findFirst({
      where: {
        id: goalId,
        userId,
      },
    });

    if (!existingGoal) {
      throw new NotFoundException('Goal not found');
    }

    const updatedGoal = await this.prisma.dailyGoal.update({
      where: { id: goalId },
      data: {
        completed: !existingGoal.completed,
        completedAt: !existingGoal.completed ? new Date() : null,
      },
    });

    return updatedGoal;
  }

  /**
   * Delete a goal
   */
  async deleteGoal(userId: string, goalId: string) {
    const existingGoal = await this.prisma.dailyGoal.findFirst({
      where: {
        id: goalId,
        userId,
      },
    });

    if (!existingGoal) {
      throw new NotFoundException('Goal not found');
    }

    await this.prisma.dailyGoal.delete({
      where: { id: goalId },
    });

    return { message: 'Goal deleted successfully' };
  }

  /**
   * Get random goal recommendations
   */
  getGoalRecommendations(count: number = 4) {
    const shuffled = [...GOAL_RECOMMENDATIONS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }
}
