import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import {
  Prisma,
  type CheckIn,
  type DailyGoal,
  type JournalEntry,
  type Message,
  type UserSnapshot,
} from 'generated/prisma';
import { PrismaService } from '../database/database.service';
import { SNAPSHOT_JSON_SYSTEM_PROMPT } from './snapshot-ai.constants';

const MAX_JOURNALS = 50;
/** Most recent N chat turns (user + assistant) included in the snapshot payload. */
const MAX_MESSAGES = 30;
const MAX_CHECK_INS = 40;
const MAX_GOALS = 40;
/** Journal rows use AI `summary` only; longer summaries are trimmed. */
const MAX_JOURNAL_SUMMARY_CHARS = 1500;
/** If a journal has no summary yet, include a short trimmed excerpt of `content` only as fallback. */
const MAX_JOURNAL_CONTENT_FALLBACK_CHARS = 800;
const MAX_MESSAGE_CHARS = 2000;

export type SnapshotThemeItem = {
  label: string;
  why: string;
};

type UserWithProfile = Prisma.UserGetPayload<{ include: { profile: true } }>;

type SnapshotUserBundle = {
  user: UserWithProfile | null;
  journals: JournalEntry[];
  checkIns: CheckIn[];
  goals: DailyGoal[];
  messages: Message[];
  windowStart: Date;
  /** When set, journal/check-in/goal/message queries only returned rows strictly after this time (incremental run). */
  deltaSince: Date | null;
};

export type SnapshotAiResult = {
  struggles: [SnapshotThemeItem, SnapshotThemeItem, SnapshotThemeItem];
  positives: [SnapshotThemeItem, SnapshotThemeItem, SnapshotThemeItem];
  contextDigest: string;
};

@Injectable()
export class SnapshotService {
  private readonly logger = new Logger(SnapshotService.name);

  constructor(private readonly prisma: PrismaService) {}

  getDefaultAnalysisWindowDays(): number {
    const raw = process.env.SNAPSHOT_DEFAULT_ANALYSIS_WINDOW_DAYS?.trim();
    if (!raw) return 30;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1 || n > 365) return 30;
    return n;
  }

  async findAllForUser(userId: string, limit = 50): Promise<UserSnapshot[]> {
    return this.prisma.userSnapshot.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  async generateAndSave(userId: string): Promise<UserSnapshot> {
    const windowDays = this.getDefaultAnalysisWindowDays();
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - windowDays);
    windowStart.setHours(0, 0, 0, 0);

    const lastSnapshot = await this.prisma.userSnapshot.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const userBundle = await this.loadUserDataBundle(
      userId,
      windowStart,
      lastSnapshot,
    );

    if (lastSnapshot && this.hasNoNewActivitySinceLastSnapshot(userBundle)) {
      throw new BadRequestException(
        'No new journals, check-ins, goals, or chat messages since your last snapshot. Add activity before generating again.',
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Snapshot generation is not configured (missing ANTHROPIC_API_KEY).',
      );
    }

    const userPayload = this.buildAggregationPayload(
      userBundle,
      lastSnapshot,
      windowDays,
    );

    const model =
      process.env.ANTHROPIC_SNAPSHOT_MODEL?.trim() ||
      process.env.ANTHROPIC_JOURNAL_MODEL?.trim() ||
      'claude-sonnet-4-20250514';

    const parsed = await this.callSnapshotModel(apiKey, model, userPayload);
    const normalized = this.finalizeSnapshot(parsed);

    const strugglesJson = normalized.struggles as unknown as Prisma.InputJsonValue;
    const positivesJson = normalized.positives as unknown as Prisma.InputJsonValue;

    return this.prisma.userSnapshot.create({
      data: {
        userId,
        struggles: strugglesJson,
        positives: positivesJson,
        contextDigest: normalized.contextDigest,
        metadata: {
          analysisWindowDays: windowDays,
          model,
        },
      },
    });
  }

  private async loadUserDataBundle(
    userId: string,
    windowStart: Date,
    lastSnapshot: UserSnapshot | null,
  ): Promise<SnapshotUserBundle> {
    const deltaSince = lastSnapshot?.createdAt ?? null;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    const conversation = await this.prisma.conversation.findUnique({
      where: { userId },
    });

    const clearedMs = conversation?.clearedAt?.getTime() ?? 0;

    const messageLowerBoundMs = deltaSince
      ? Math.max(deltaSince.getTime(), clearedMs)
      : Math.max(windowStart.getTime(), clearedMs);
    const messageLowerBound = new Date(messageLowerBoundMs);

    const journalWhere = deltaSince
      ? { userId, createdAt: { gt: deltaSince } }
      : { userId, createdAt: { gte: windowStart } };

    const checkInWhere = deltaSince
      ? { userId, date: { gt: deltaSince } }
      : { userId, date: { gte: windowStart } };

    const goalWhere = deltaSince
      ? {
          userId,
          OR: [
            { createdAt: { gt: deltaSince } },
            { updatedAt: { gt: deltaSince } },
          ],
        }
      : {
          userId,
          OR: [
            { createdAt: { gte: windowStart } },
            { updatedAt: { gte: windowStart } },
          ],
        };

    const [journals, checkIns, goals, messagesDesc] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where: journalWhere,
        orderBy: { createdAt: 'desc' },
        take: MAX_JOURNALS,
      }),
      this.prisma.checkIn.findMany({
        where: checkInWhere,
        orderBy: { date: 'desc' },
        take: MAX_CHECK_INS,
      }),
      this.prisma.dailyGoal.findMany({
        where: goalWhere,
        orderBy: { updatedAt: 'desc' },
        take: MAX_GOALS,
      }),
      conversation
        ? this.prisma.message.findMany({
            where: {
              conversationId: conversation.id,
              createdAt: deltaSince ? { gt: messageLowerBound } : { gte: messageLowerBound },
            },
            orderBy: { createdAt: 'desc' },
            take: MAX_MESSAGES,
          })
        : Promise.resolve([]),
    ]);

    const messages =
      messagesDesc.length > 0 ? [...messagesDesc].reverse() : messagesDesc;

    return {
      user,
      journals,
      checkIns,
      goals,
      messages,
      windowStart,
      deltaSince,
    };
  }

  /** True when incremental bundle has nothing new to analyze (skips Claude). */
  private hasNoNewActivitySinceLastSnapshot(bundle: SnapshotUserBundle): boolean {
    if (!bundle.deltaSince) return false;
    return (
      bundle.journals.length === 0 &&
      bundle.checkIns.length === 0 &&
      bundle.goals.length === 0 &&
      bundle.messages.length === 0
    );
  }

  private buildAggregationPayload(
    bundle: SnapshotUserBundle,
    lastSnapshot: UserSnapshot | null,
    windowDays: number,
  ): string {
    const sections: string[] = [];

    sections.push(`## Analysis window\n`);
    if (bundle.deltaSince) {
      sections.push(
        `Incremental run: raw sections below include only activity after the previous snapshot at ${bundle.deltaSince.toISOString()} UTC. Prior themes and digest above carry earlier context.\n`,
      );
    } else {
      sections.push(
        `First snapshot (no prior run): approximately the last ${windowDays} days of activity (from ${bundle.windowStart.toISOString()} UTC), unless noted otherwise.\n`,
      );
    }

    if (lastSnapshot?.contextDigest) {
      sections.push(
        `## Previous snapshot digest (for continuity — verify against data below)\n`,
      );
      sections.push(`${lastSnapshot.contextDigest}\n`);
    }

    if (lastSnapshot) {
      const priorStruggles = this.formatPriorThemeLines(lastSnapshot.struggles);
      const priorPositives = this.formatPriorThemeLines(lastSnapshot.positives);
      if (priorStruggles.length > 0 || priorPositives.length > 0) {
        sections.push(
          `## Previous snapshot — themes (for continuity; revise using fresh data below)\n`,
        );
        if (priorStruggles.length > 0) {
          sections.push(`### Struggles (from last run)\n`);
          sections.push(`${priorStruggles.join('\n')}\n`);
        }
        if (priorPositives.length > 0) {
          sections.push(`### Positives (from last run)\n`);
          sections.push(`${priorPositives.join('\n')}\n`);
        }
      }
    }

    if (bundle.user?.profile) {
      const p = bundle.user.profile;
      sections.push(`## Profile (onboarding / context)\n`);
      if (p.struggles?.length)
        sections.push(`Stated struggles: ${p.struggles.join(', ')}\n`);
      if (p.inTherapy) sections.push(`In therapy: yes\n`);
      if (p.therapyDetails) sections.push(`Therapy note: ${p.therapyDetails}\n`);
    }

    sections.push(
      `## Journal entries (newest first; AI summaries only—full entry text is not sent)\n`,
    );
    if (bundle.journals.length === 0) {
      sections.push(`(none in window)\n`);
    } else {
      for (const j of bundle.journals) {
        let emotions = '';
        if (j.insights && typeof j.insights === 'object') {
          const o = j.insights as Record<string, unknown>;
          if (Array.isArray(o.emotions) && o.emotions.length)
            emotions = ` emotions: ${o.emotions.join(', ')}`;
        }
        const summaryText = j.summary?.trim() ?? '';
        const body = summaryText
          ? this.truncate(summaryText, MAX_JOURNAL_SUMMARY_CHARS)
          : `(no summary yet — excerpt: ${this.truncate(j.content, MAX_JOURNAL_CONTENT_FALLBACK_CHARS)})`;
        sections.push(
          `- [${j.createdAt.toISOString()}] type=${j.type}${emotions}\n  summary: ${body}\n`,
        );
      }
    }

    sections.push(`## Check-ins\n`);
    if (bundle.checkIns.length === 0) {
      sections.push(`(none in window)\n`);
    } else {
      for (const c of bundle.checkIns) {
        sections.push(
          `- date=${c.date.toISOString()} overallMood=${c.overallMood} completed=${c.completed} steps=${JSON.stringify(c.steps)}`,
        );
      }
      sections.push('');
    }

    sections.push(`## Daily goals\n`);
    if (bundle.goals.length === 0) {
      sections.push(`(none in window)\n`);
    } else {
      for (const g of bundle.goals) {
        sections.push(
          `- goal="${g.goal}" completed=${g.completed} completedAt=${g.completedAt?.toISOString() ?? 'null'} created=${g.createdAt.toISOString()}`,
        );
      }
      sections.push('');
    }

    sections.push(
      `## AI chat messages (chronological; Eric conversation — up to ${MAX_MESSAGES} most recent in range)\n`,
    );
    if (bundle.messages.length === 0) {
      sections.push(`(none in window)\n`);
    } else {
      for (const m of bundle.messages) {
        const text = this.truncate(m.content, MAX_MESSAGE_CHARS);
        sections.push(`- [${m.createdAt.toISOString()}] ${m.role}: ${text}`);
      }
    }

    return sections.join('\n');
  }

  /** Prior snapshot JSON themes → bullet lines for the next prompt. */
  private formatPriorThemeLines(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const lines: string[] = [];
    for (const el of raw) {
      if (el && typeof el === 'object' && 'label' in el) {
        const o = el as Record<string, unknown>;
        const label = String(o.label ?? '').trim();
        const why = String(o.why ?? '').trim();
        if (label || why) lines.push(`- ${label}${why ? ` — ${why}` : ''}`);
      } else if (typeof el === 'string') {
        const s = el.trim();
        if (s) lines.push(`- ${s}`);
      }
    }
    return lines;
  }

  private truncate(s: string, max: number): string {
    const t = s.trim();
    if (t.length <= max) return t;
    return `${t.slice(0, max)}…`;
  }

  private async callSnapshotModel(
    apiKey: string,
    model: string,
    userPayload: string,
  ): Promise<SnapshotAiResult> {
    const anthropic = new Anthropic({ apiKey });
    try {
      const response = await anthropic.messages.create({
        model,
        max_tokens: 1400,
        temperature: 0.4,
        system: SNAPSHOT_JSON_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `User data:\n\n${userPayload}`,
          },
        ],
      });

      const textContent = response.content
        .filter((block) => block.type === 'text')
        .map((block) => (block as { type: 'text'; text: string }).text)
        .join('\n')
        .trim();

      if (!textContent) {
        throw new BadRequestException('Snapshot model returned empty content.');
      }

      const parsed = this.parseSnapshotJson(textContent);
      if (!parsed) {
        this.logger.warn(`Snapshot JSON parse failed, raw: ${textContent.slice(0, 500)}`);
        throw new BadRequestException('Snapshot model returned invalid JSON.');
      }
      return parsed;
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`Snapshot AI error: ${(err as Error).message}`, (err as Error).stack);
      throw new ServiceUnavailableException(
        'Snapshot generation failed. Please try again later.',
      );
    }
  }

  private parseSnapshotJson(raw: string): SnapshotAiResult | null {
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
    try {
      const obj = JSON.parse(cleaned) as Record<string, unknown>;
      const context_digest = obj.context_digest;
      if (typeof context_digest !== 'string') return null;
      const struggles = this.coerceThemeArray(obj.struggles, 'Struggle');
      const positives = this.coerceThemeArray(obj.positives, 'Positive');
      if (!struggles || !positives) return null;
      return {
        struggles,
        positives,
        contextDigest: context_digest,
      };
    } catch {
      return null;
    }
  }

  /** Accepts [{label, why}] or legacy plain strings → normalized triplets (first 3 only). */
  private coerceThemeArray(
    val: unknown,
    labelPrefix: string,
  ): [SnapshotThemeItem, SnapshotThemeItem, SnapshotThemeItem] | null {
    if (!Array.isArray(val)) return null;
    const items: SnapshotThemeItem[] = [];
    for (const el of val.slice(0, 3)) {
      const item = this.coerceThemeItem(el, labelPrefix);
      items.push(item);
    }
    while (items.length < 3) {
      items.push({
        label: `${labelPrefix}: not enough data`,
        why: 'Not enough user data in this window to support a specific observation.',
      });
    }
    return [items[0]!, items[1]!, items[2]!];
  }

  private coerceThemeItem(el: unknown, labelPrefix: string): SnapshotThemeItem {
    if (el && typeof el === 'object' && 'label' in el) {
      const o = el as Record<string, unknown>;
      const label = String(o.label ?? '').trim();
      const why = String(o.why ?? '').trim();
      return {
        label: label || `${labelPrefix}: not enough data`,
        why:
          why ||
          'Not enough user data in this window to support a specific observation.',
      };
    }
    if (typeof el === 'string') {
      const s = el.trim();
      return {
        label: s || `${labelPrefix}: not enough data`,
        why: 'Not enough user data in this window to support a specific observation.',
      };
    }
    return {
      label: `${labelPrefix}: not enough data`,
      why: 'Not enough user data in this window to support a specific observation.',
    };
  }

  private finalizeSnapshot(parsed: SnapshotAiResult): SnapshotAiResult {
    return {
      struggles: parsed.struggles,
      positives: parsed.positives,
      contextDigest: parsed.contextDigest.trim() || 'Limited context captured.',
    };
  }
}
