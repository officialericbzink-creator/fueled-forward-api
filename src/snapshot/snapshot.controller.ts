import { Controller, Get, Post, Query, Session, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from 'src/auth/auth.guard';
import type { UserSession } from 'src/auth/auth.types';
import { SnapshotService } from './snapshot.service';

@ApiTags('snapshot')
@ApiCookieAuth('better-auth.session_token')
@Controller('snapshot')
@UseGuards(AuthGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class SnapshotController {
  constructor(private readonly snapshotService: SnapshotService) {}

  /**
   * GET /snapshot?limit=50
   * List saved snapshots for the authenticated user (newest first).
   */
  @Get()
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({
    schema: {
      example: {
        data: [
          {
            id: 'clxx…',
            userId: 'user-uuid',
            struggles: [
              { label: 'work-related overwhelm', why: 'Several journal entries mention deadline pressure.' },
              { label: 'sleep difficulty', why: 'Check-in notes and chat reference trouble winding down.' },
              { label: 'family tension', why: 'Vent entry and mood steps note conflict after calls.' },
            ],
            positives: [
              { label: 'consistent check-ins', why: 'Daily mood logs completed most days in window.' },
              { label: 'using chat support', why: 'Repeated Eric conversations when distressed.' },
              { label: 'small social goals', why: 'Goals show completed outreach steps.' },
            ],
            contextDigest: '…',
            metadata: { analysisWindowDays: 30, model: 'claude-sonnet-4-20250514' },
            createdAt: '2026-03-19T12:00:00.000Z',
          },
        ],
      },
    },
  })
  async list(
    @Session() session: UserSession,
    @Query('limit') limit?: string,
  ) {
    const n = limit ? parseInt(limit, 10) : 50;
    const data = await this.snapshotService.findAllForUser(session.user.id, n);
    return { data };
  }

  /**
   * POST /snapshot/generate
   * Aggregate user data and create a new AI snapshot (3 struggles, 3 positives, digest).
   */
  @Post('generate')
  @ApiOkResponse({
    schema: {
      example: {
        data: {
          id: 'clxx…',
          struggles: [
            { label: 'work-related overwhelm', why: 'Several journal entries mention deadline pressure.' },
            { label: 'sleep difficulty', why: 'Check-in notes and chat reference trouble winding down.' },
            { label: 'family tension', why: 'Vent entry and mood steps note conflict after calls.' },
          ],
          positives: [
            { label: 'consistent check-ins', why: 'Daily mood logs completed most days in window.' },
            { label: 'using chat support', why: 'Repeated Eric conversations when distressed.' },
            { label: 'small social goals', why: 'Goals show completed outreach steps.' },
          ],
          contextDigest: '…',
          createdAt: '2026-03-19T12:00:00.000Z',
        },
      },
    },
  })
  async generate(@Session() session: UserSession) {
    const data = await this.snapshotService.generateAndSave(session.user.id);
    return { data };
  }
}
