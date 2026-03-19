import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Session,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from 'src/auth/auth.guard';
import type { UserSession } from 'src/auth/auth.types';
import { CreateEntryDto } from './dto/create-entry.dto';
import { GetRecentQueryDto } from './dto/get-recent-query.dto';
import { EntriesService } from './entries.service';

@ApiTags('entries')
@ApiCookieAuth('better-auth.session_token')
@UseGuards(AuthGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@Controller('entries')
export class EntriesController {
  constructor(private readonly entriesService: EntriesService) {}

  /**
   * POST /entries
   * Create a journal entry. Summary is generated server-side (AI or truncated).
   */
  @Post()
  @ApiBody({ type: CreateEntryDto, description: 'Entry type and content' })
  @ApiCreatedResponse({
    description: 'Entry created with generated summary and insights (when ANTHROPIC_API_KEY is set)',
    schema: {
      example: {
        data: {
          id: 'clxx…',
          userId: 'user-uuid',
          type: 'journal_entry',
          content: 'Today I felt…',
          summary: 'A reflective day with mixed emotions.',
          insights: {
            summary: 'A reflective day with mixed emotions.',
            emotions: ['sadness', 'hope'],
            sentiment: 'mixed',
            crisis_level: 'none',
            crisis_signals: [],
            needs_attention: false,
          },
          createdAt: '2026-03-19T12:00:00.000Z',
          updatedAt: '2026-03-19T12:00:00.000Z',
        },
      },
    },
  })
  async create(
    @Session() session: UserSession,
    @Body() dto: CreateEntryDto,
  ) {
    const data = await this.entriesService.create(session.user.id, dto);
    return { data };
  }

  /**
   * GET /entries/recent
   * Latest entries for the authenticated user (newest first). Declared before GET /entries so path is matched correctly.
   */
  @Get('recent')
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max entries to return (1–50)', example: 10 })
  @ApiOkResponse({
    description: 'Recent journal entries (includes insights when present)',
    schema: {
      example: {
        data: [
          {
            id: 'clxx…',
            userId: 'user-uuid',
            type: 'journal_entry',
            content: '…',
            summary: 'A reflective day.',
            insights: {
              emotions: ['hope'],
              sentiment: 'positive',
              crisis_level: 'none',
              crisis_signals: [],
              needs_attention: false,
            },
            createdAt: '2026-03-19T12:00:00.000Z',
            updatedAt: '2026-03-19T12:00:00.000Z',
          },
        ],
        count: 1,
      },
    },
  })
  async recent(
    @Session() session: UserSession,
    @Query() query: GetRecentQueryDto,
  ) {
    const limit = query.limit ?? 10;
    const data = await this.entriesService.findRecentForUser(
      session.user.id,
      limit,
    );
    return { data, count: data.length };
  }

  /**
   * GET /entries
   * All journal entries for the authenticated user (newest first).
   */
  @Get()
  @ApiOkResponse({
    description: 'All journal entries (includes insights when present)',
    schema: {
      example: {
        data: [
          {
            id: 'clxx…',
            userId: 'user-uuid',
            type: 'journal_entry',
            content: '…',
            summary: 'A reflective day.',
            insights: {
              emotions: ['calm', 'gratitude'],
              sentiment: 'positive',
              crisis_level: 'none',
              crisis_signals: [],
              needs_attention: false,
            },
            createdAt: '2026-03-19T12:00:00.000Z',
            updatedAt: '2026-03-19T12:00:00.000Z',
          },
        ],
        count: 1,
      },
    },
  })
  async list(@Session() session: UserSession) {
    const data = await this.entriesService.findAllForUser(session.user.id);
    return { data, count: data.length };
  }

  /**
   * DELETE /entries/:id
   * Delete a journal entry. Only the owner can delete.
   */
  @Delete(':id')
  @ApiParam({ name: 'id', description: 'Journal entry ID' })
  @ApiOkResponse({
    description: 'Entry deleted',
    schema: { example: { message: 'Entry deleted successfully' } },
  })
  async delete(
    @Session() session: UserSession,
    @Param('id') id: string,
  ) {
    return this.entriesService.delete(session.user.id, id);
  }
}
