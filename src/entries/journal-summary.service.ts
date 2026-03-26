import Anthropic from '@anthropic-ai/sdk';

const SUMMARY_PROMPT = `
Analyze the following journal entry and respond in valid JSON ONLY. Do not include markdown, code fences, or any extra text.

Return exactly this JSON structure:

{
  "summary": "",
  "emotions": [],
  "sentiment": "",
  "crisis_level": "",
  "crisis_signals": [],
  "needs_attention": false
}

Fields:
- "summary": 1–2 concise, empathetic and supportive sentences (max ~60 words total) reflecting key emotions and themes (no advice, no judgment).
- "emotions": array of primary emotions detected (use lowercase strings). Examples: sadness, anxiety, anger, stress, joy, relief, loneliness, overwhelm, hope.
- "sentiment": one of ["positive", "neutral", "negative", "mixed"].
- "crisis_level": one of ["none", "low", "moderate", "high"] based on signs of distress or risk.
- "crisis_signals": array of short phrases identifying warning signs (each item should be brief, ~3–6 words). Use [] if none.
- "needs_attention": boolean (true if crisis_level is "moderate" or "high").

Guidelines:
- Keep all outputs concise and minimal.
- Do not repeat the same information across multiple fields.
- Be empathetic, non-judgmental, and avoid assumptions.
- Do NOT provide advice in the summary.
- Avoid verbosity; use short phrases where possible.
- If there are signs of self-harm, suicidal ideation, or severe distress, set crisis_level to "high".
- Output only valid JSON. No explanation, no additional text.
`;

export type JournalInsights = {
  summary: string;
  emotions?: string[];
  sentiment?: string;
  crisis_level?: string;
  crisis_signals?: string[];
  needs_attention?: boolean;
};

export type SummarizeResult = { summary: string; insights: JournalInsights | null };

/**
 * Generate summary and optional insights. Uses Anthropic if ANTHROPIC_API_KEY is set; otherwise returns truncated content and no insights.
 */
export async function summarizeContent(content: string): Promise<SummarizeResult> {
  const fallbackSummary = (() => {
    const trimmed = content.trim();
    const max = 200;
    return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}…`;
  })();

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return { summary: fallbackSummary, insights: null };
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const model =
      process.env.ANTHROPIC_JOURNAL_MODEL ?? 'claude-sonnet-4-20250514';

    const response = await anthropic.messages.create({
      model,
      max_tokens: 400,
      temperature: 0.5,
      system: SUMMARY_PROMPT,
      messages: [{ role: 'user', content }],
    });

    const textContent = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as { type: 'text'; text: string }).text)
      .join('\n')
      .trim();

    if (!textContent) {
      return { summary: fallbackSummary, insights: null };
    }

    const parsed = parseJsonInsights(textContent);
    const summary =
      parsed?.summary && typeof parsed.summary === 'string'
        ? parsed.summary
        : fallbackSummary;
    const insights = parsed ? (parsed as JournalInsights) : null;
    return { summary, insights };
  } catch (err) {
    console.error('Journal summary AI error:', err);
    return { summary: fallbackSummary, insights: null };
  }
}

function parseJsonInsights(raw: string): JournalInsights | null {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    const obj = JSON.parse(cleaned);
    if (obj && typeof obj.summary === 'string') return obj as JournalInsights;
  } catch {
    // ignore
  }
  return null;
}
