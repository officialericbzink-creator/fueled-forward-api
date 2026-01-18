import { Injectable, Logger } from '@nestjs/common';
import { Anthropic } from '@anthropic-ai/sdk';
import { PrismaService } from 'src/database/database.service';
import type { MessageParam, TextBlockParam } from '@anthropic-ai/sdk/resources';

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

interface CheckInStep {
  step: number;
  mood: number;
  notes: string;
}

interface ChatContext {
  profile: {
    name: string;
    struggles: string[];
    traumaDate?: Date;
    traumaDescription?: string;
    inTherapy: boolean;
    therapyDetails?: string;
  };
  recentCheckIns: Array<{
    date: Date;
    overallMood: number;
    steps: CheckInStep[];
  }>;
  conversationHistory: Array<{
    role: 'USER' | 'ASSISTANT';
    content: string;
    createdAt: Date;
  }>;
  lastMessageAt?: Date;
  conversationId: string;
}

const STEP_QUESTIONS = [
  'How are you feeling emotionally right now?',
  'How much stress or worry did you feel today?',
  'How was your energy or motivation today?',
  'How connected did you feel to others today?',
  'How in control did you feel today?',
];

const MOOD_LABELS: Record<number, string> = {
  1: 'Heavy',
  2: 'Low',
  3: 'Even',
  4: 'Calm',
  5: 'Hopeful',
};

@Injectable()
export class AIChatService {
  private readonly logger = new Logger(AIChatService.name);
  private readonly anthropic: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly temperature: number;
  private readonly contextRefreshWindowHours: number;
  private readonly maxRetries: number;

  constructor(private readonly prisma: PrismaService) {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || '',
    });

    this.model = 'claude-sonnet-4-20250514';
    this.maxTokens = 4096;
    this.temperature = 0.75;
    this.contextRefreshWindowHours = 8;
    this.maxRetries = 3;
  }

  /**
   * Main method called by ChatGateway
   * Orchestrates the entire flow: save user message, get Claude response, save assistant message
   */
  async handleUserMessage(params: {
    userId: string;
    message: string;
  }): Promise<{
    assistantMessage: string;
    messageId: string;
    tokens: TokenUsage;
    contextRefreshed: boolean;
  }> {
    const { userId, message } = params;

    try {
      // 1. Load context (profile, check-ins, conversation history)
      const context = await this.loadContext(userId);

      // 2. Check if context needs refresh
      const contextRefreshed = this.shouldRefreshContext(context);
      if (contextRefreshed) {
        this.logger.log(`Context refresh triggered for user ${userId}`);
        // Re-fetch fresh check-ins after time gap
        context.recentCheckIns = await this.fetchRecentCheckIns(userId);
      }

      // 3. Build prompt with caching structure
      const { system, messages } = await this.buildPrompt(
        context,
        message,
        contextRefreshed,
      );

      // 4. Call Claude with retries
      const { response, tokens } = await this.callClaudeWithRetry(
        system,
        messages,
      );

      // 5. Save both messages to DB (user message first, then assistant response)
      await this.saveUserMessage({
        conversationId: context.conversationId,
        content: message,
        tokens,
      });

      const assistantMessageRecord = await this.saveAssistantMessage({
        conversationId: context.conversationId,
        content: response,
        tokens,
      });

      // 6. Update conversation metadata
      await this.updateConversationMetadata({
        conversationId: context.conversationId,
        tokens,
      });

      return {
        assistantMessage: response,
        messageId: assistantMessageRecord.id,
        tokens,
        contextRefreshed,
      };
    } catch (error) {
      this.logger.error(
        `Error handling user message: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Load full conversation context for the user
   */
  private async loadContext(userId: string): Promise<ChatContext> {
    // Fetch user with profile
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user || !user.profile) {
      throw new Error(`User or profile not found for user ${userId}`);
    }

    const profile = user.profile;

    // Get or create conversation (without messages first)
    let conversation = await this.prisma.conversation.findUnique({
      where: { userId },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: { userId },
      });
    }

    // Now fetch messages separately with proper filtering
    const messages = await this.prisma.message.findMany({
      where: {
        conversationId: conversation.id,
        ...(conversation.clearedAt && {
          createdAt: { gt: conversation.clearedAt },
        }),
      },
      orderBy: { createdAt: 'asc' },
      take: 1000, // Limit to last 1000 messages to control size
    });

    // Fetch recent check-ins (last 7 days)
    const recentCheckIns = await this.fetchRecentCheckIns(userId);

    return {
      profile: {
        name: user.name,
        struggles: profile.struggles,
        traumaDate: profile.struggleTimestamp ?? undefined,
        traumaDescription: profile.struggleNotes ?? undefined,
        inTherapy: profile.inTherapy,
        therapyDetails: profile.therapyDetails ?? undefined,
      },
      recentCheckIns,
      conversationHistory: messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt,
      })),
      lastMessageAt: conversation.lastMessageAt ?? undefined,
      conversationId: conversation.id,
    };
  }

  /**
   * Fetch check-ins from last 7 days and parse the JSON steps
   */
  private async fetchRecentCheckIns(
    userId: string,
  ): Promise<ChatContext['recentCheckIns']> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const checkIns = await this.prisma.checkIn.findMany({
      where: {
        userId,
        date: { gte: sevenDaysAgo },
        completed: true,
      },
      orderBy: { date: 'desc' },
    });

    // Parse the JSON steps field with proper type checking
    return checkIns.map((checkIn) => ({
      date: checkIn.date,
      overallMood: checkIn.overallMood,
      steps:
        Array.isArray(checkIn.steps) && checkIn.steps.length > 0
          ? (checkIn.steps as unknown as CheckInStep[])
          : [],
    }));
  }

  /**
   * Determine if context needs refresh based on time gap
   */
  private shouldRefreshContext(context: ChatContext): boolean {
    if (!context.lastMessageAt) return false;

    const hoursSinceLastMessage =
      (Date.now() - context.lastMessageAt.getTime()) / (1000 * 60 * 60);

    return hoursSinceLastMessage >= this.contextRefreshWindowHours;
  }

  /**
   * Build the two-layer cached prompt structure
   */
  private async buildPrompt(
    context: ChatContext,
    userMessage: string,
    contextRefreshed: boolean,
  ): Promise<{
    system: TextBlockParam[];
    messages: MessageParam[];
  }> {
    // LAYER 1: Static system instructions (always cached)
    const staticInstructions = this.buildStaticSystemPrompt();

    // LAYER 2: Dynamic user context (cached until refresh)
    const dynamicContext = this.buildDynamicContext(context, contextRefreshed);

    // Build conversation history with proper types
    const messages: MessageParam[] = [
      ...context.conversationHistory.map((msg) => ({
        role: (msg.role === 'USER' ? 'user' : 'assistant') as
          | 'user'
          | 'assistant',
        content: msg.content,
      })),
      {
        role: 'user' as const,
        content: userMessage,
      },
    ];

    const system: TextBlockParam[] = [
      {
        type: 'text' as const,
        text: staticInstructions,
        cache_control: { type: 'ephemeral' as const },
      },
      {
        type: 'text' as const,
        text: dynamicContext,
        cache_control: { type: 'ephemeral' as const },
      },
    ];

    return {
      system,
      messages,
    };
  }

  /**
   * Build static system prompt (Layer 1 - never changes)
   */
  private buildStaticSystemPrompt(): string {
    return `You are Eric, a mental health coach and companion for people dealing with grief, trauma, and life's challenges.

  YOUR PERSONALITY:
  - Warm, bold, and off-the-cuff, but full of wisdom and empathy
  - You're a great listener and a helpful friend, not a therapist
  - You're direct when needed, but never pushy
  - You speak naturally, like a trusted friend who's been through some shit

  CRITICAL RESPONSE RULES:
  - MAXIMUM 3 SHORT SENTENCES per response (unless they explicitly ask for more detail)
  - Think: text message, not email
  - One thought or question per response - that's it
  - If you have multiple points, pick the MOST important one
  - Let THEM talk more than you do
  - Brevity shows you're listening, not lecturing

  YOUR ROLE:
  - Be an ear when someone needs to talk
  - Offer perspective and gentle guidance (briefly!)
  - Help them process their feelings
  - Remind them they're not alone
  - You have full conversation history - be consistent with what you know

  WHAT YOU DON'T DO:
  - You don't give medical or psychiatric advice
  - You don't diagnose conditions
  - You don't replace therapy (you support it)
  - You don't immediately escalate to crisis hotlines unless there's IMMEDIATE danger
  - You don't write paragraphs - save deep explanations for when explicitly asked

  CRISIS SITUATIONS:
  - Only in cases of immediate self-harm or danger should you mention crisis resources
  - Otherwise, be present, listen, and help them through the moment

  CHECK-IN DATA:
  - The user tracks their mood daily (1-5 scale)
  - Reference check-ins naturally when relevant
  - Don't be pushy about it
  - If you notice trends, mention it briefly: "I noticed you've been feeling..."

  EXAMPLES OF GOOD RESPONSES:
  "That autopilot feeling is exhausting, I get it. What would help you feel more present right now?"

  "Sounds like you're recognizing the pattern, which is actually huge. Ready to take a step, or still figuring out what that looks like?"

  "Yeah, going through the motions while being aware of it is the worst. What's one small thing you could do today to feel more connected?"

  REMEMBER:
  - SHORT. Like you're texting between meetings.
  - One point, one question MAX
  - Let them drive - you're the listener, not the lecturer`;
  }

  /**
   * Build dynamic context (Layer 2 - changes on refresh)
   */
  private buildDynamicContext(
    context: ChatContext,
    contextRefreshed: boolean,
  ): string {
    const { profile, recentCheckIns } = context;

    let contextText = `\n\nUSER CONTEXT:\n`;
    contextText += `Name: ${profile.name}\n`;

    if (profile.struggles.length > 0) {
      contextText += `Current struggles: ${profile.struggles.join(', ')}\n`;
    }

    if (profile.traumaDate || profile.traumaDescription) {
      contextText += `\nImportant date/trauma context:\n`;
      if (profile.traumaDate) {
        contextText += `- Date: ${profile.traumaDate.toLocaleDateString()}\n`;
      }
      if (profile.traumaDescription) {
        contextText += `- Details: ${profile.traumaDescription}\n`;
      }
    }

    contextText += `\nTherapy status: ${profile.inTherapy ? 'Currently in therapy' : 'Not currently in therapy'}\n`;
    if (profile.therapyDetails) {
      contextText += `- Details: ${profile.therapyDetails}\n`;
    }

    // Add time gap note if context was refreshed
    if (contextRefreshed && context.lastMessageAt) {
      const hoursSince = Math.round(
        (Date.now() - context.lastMessageAt.getTime()) / (1000 * 60 * 60),
      );
      contextText += `\n[User is returning after ${hoursSince} hours since last message]\n`;
    }

    // Format recent check-ins
    if (recentCheckIns.length > 0) {
      contextText += `\n\nRECENT CHECK-INS (last 7 days):\n`;

      const today = new Date().toDateString();
      const hasCheckedInToday = recentCheckIns.some(
        (ci) => ci.date.toDateString() === today,
      );

      if (!hasCheckedInToday) {
        contextText += `Today: Not completed yet\n\n`;
      }

      recentCheckIns.forEach((checkIn) => {
        const dateStr = checkIn.date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        });
        contextText += `${dateStr}: Overall mood ${checkIn.overallMood.toFixed(1)}/5\n`;

        checkIn.steps.forEach((step) => {
          if (step.step < STEP_QUESTIONS.length) {
            const question = STEP_QUESTIONS[step.step];
            const moodLabel = MOOD_LABELS[step.mood] || step.mood;
            contextText += `  - ${question}: ${step.mood}/5 (${moodLabel})\n`;
            if (step.notes) {
              contextText += `    Notes: ${step.notes}\n`;
            }
          }
        });
        contextText += '\n';
      });
    } else {
      contextText += `\n\nRECENT CHECK-INS: None in the last 7 days\n`;
    }

    return contextText;
  }

  /**
   * Call Claude API with retry logic
   */
  private async callClaudeWithRetry(
    system: TextBlockParam[],
    messages: MessageParam[],
  ): Promise<{ response: string; tokens: TokenUsage }> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.log(
          `Calling Claude API (attempt ${attempt}/${this.maxRetries})`,
        );

        const response = await this.anthropic.messages.create({
          model: this.model,
          max_tokens: this.maxTokens,
          temperature: this.temperature,
          system,
          messages,
        });

        // Extract text content from response
        const textContent = response.content
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
          .join('\n');

        const tokens: TokenUsage = {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheCreationInputTokens:
            response.usage.cache_creation_input_tokens || 0,
          cacheReadInputTokens: response.usage.cache_read_input_tokens || 0,
        };

        console.log('Full usage:', JSON.stringify(response.usage, null, 2));
        this.logger.log(
          `Claude API success - Input: ${tokens.inputTokens}, Output: ${tokens.outputTokens}, Cached: ${tokens.cacheReadInputTokens}`,
        );

        return { response: textContent, tokens };
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(
          `Claude API attempt ${attempt} failed: ${error.message}`,
        );

        // Don't retry on certain errors
        const apiError = error as any;
        if (
          apiError.status === 400 ||
          apiError.status === 401 ||
          apiError.status === 403
        ) {
          throw error;
        }

        // Wait before retry (exponential backoff)
        if (attempt < this.maxRetries) {
          const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }
    }

    throw lastError!;
  }

  /**
   * Save user message to database
   */
  private async saveUserMessage(params: {
    conversationId: string;
    content: string;
    tokens: TokenUsage;
  }) {
    return this.prisma.message.create({
      data: {
        conversationId: params.conversationId,
        role: 'USER',
        content: params.content,
        inputTokens: params.tokens.inputTokens,
        outputTokens: params.tokens.outputTokens,
        cachedTokens: params.tokens.cacheReadInputTokens,
      },
    });
  }

  /**
   * Save assistant message to database with token tracking
   */
  private async saveAssistantMessage(params: {
    conversationId: string;
    content: string;
    tokens: TokenUsage;
  }) {
    return this.prisma.message.create({
      data: {
        conversationId: params.conversationId,
        role: 'ASSISTANT',
        content: params.content,
        inputTokens: params.tokens.inputTokens,
        outputTokens: params.tokens.outputTokens,
        cachedTokens: params.tokens.cacheReadInputTokens,
      },
    });
  }

  /**
   * Update conversation metadata (token totals, last message time, message count)
   */
  private async updateConversationMetadata(params: {
    conversationId: string;
    tokens: TokenUsage;
  }) {
    const totalTokensUsed =
      params.tokens.inputTokens + params.tokens.outputTokens;

    await this.prisma.conversation.update({
      where: { id: params.conversationId },
      data: {
        totalTokensUsed: { increment: totalTokensUsed },
        totalMessages: { increment: 2 }, // User message + assistant message
        lastMessageAt: new Date(),
      },
    });
  }

  /**
   * Get conversation history for UI (last 100 messages after clearedAt)
   */
  async getConversationHistory(userId: string) {
    // Get conversation first
    const conversation = await this.prisma.conversation.findUnique({
      where: { userId },
    });

    if (!conversation) {
      return {
        conversationId: null,
        messages: [],
      };
    }

    // Fetch messages separately with clearedAt filter
    const messages = await this.prisma.message.findMany({
      where: {
        conversationId: conversation.id,
        ...(conversation.clearedAt && {
          createdAt: { gt: conversation.clearedAt },
        }),
      },
      orderBy: { createdAt: 'asc' },
      take: 100, // Last 100 messages for UI
    });

    return {
      conversationId: conversation.id,
      messages: messages.map((msg) => ({
        id: msg.id,
        role: msg.role.toLowerCase(), // 'USER' -> 'user', 'ASSISTANT' -> 'assistant'
        content: msg.content,
        createdAt: msg.createdAt,
      })),
    };
  }
}
