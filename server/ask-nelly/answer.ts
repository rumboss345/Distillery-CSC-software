import type { KnowledgeChunk } from './knowledge.js';
import { loadKnowledgeChunks } from './knowledge.js';
import { searchKnowledge } from './search.js';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AskNellySource {
  sourceId: string;
  sourceTitle: string;
  excerpt: string;
}

export interface AskNellyResult {
  answer: string;
  sources: AskNellySource[];
  mode: 'ai' | 'excerpt';
}

function trimExcerpt(text: string, max = 520): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function buildContextBlock(chunks: KnowledgeChunk[]): string {
  return chunks
    .map(
      (c, i) =>
        `[${i + 1}] Source: ${c.sourceTitle}\n${c.text}`,
    )
    .join('\n\n---\n\n');
}

function excerptAnswer(question: string, chunks: KnowledgeChunk[]): string {
  if (chunks.length === 0) {
    return 'I could not find IBD reference material on that topic. Try rephrasing with production terms (molasses, Brix, fermentation, cuts, maturation).';
  }

  const lines = chunks.map((c, i) => {
    return `**${i + 1}. ${c.sourceTitle}**\n${trimExcerpt(c.text, 480)}`;
  });

  return [
    'Here is what the **IBD Diploma in Distilling** revision notes say that best matches your question:',
    '',
    ...lines,
    '',
    '_Ask Nelly is in reference mode (no AI API key configured). Set `ASK_NELLY_OPENAI_API_KEY` on the server for conversational answers._',
    '',
    `**Your question:** ${question.trim()}`,
  ].join('\n');
}

async function aiAnswer(
  question: string,
  history: ChatTurn[],
  chunks: KnowledgeChunk[],
): Promise<string> {
  const apiKey = process.env.ASK_NELLY_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  const model = process.env.ASK_NELLY_MODEL ?? 'gpt-4o-mini';
  const baseUrl = (process.env.ASK_NELLY_OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');

  if (!apiKey) {
    throw new Error('Missing API key');
  }

  const system = `You are Nelly, the internal production assistant for CSC Distillery staff.
Answer questions about distillation production using ONLY the provided IBD (Institute of Brewing & Distilling) Diploma excerpts.
If the excerpts do not contain enough information, say so clearly and suggest what production data to check in the tracker (wash batches, fermentation logs, cuts, etc.).
Use plain language suitable for distillery operators. Mention relevant safety, quality, and molasses/rum context when appropriate.
Cite sources by their bracket number [1], [2], etc. Do not invent regulations or numbers not supported by the excerpts.`;

  const context = buildContextBlock(chunks);
  const messages = [
    { role: 'system' as const, content: system },
    {
      role: 'user' as const,
      content: `Reference excerpts:\n\n${context}`,
    },
    ...history.slice(-6).map((t) => ({ role: t.role, content: t.content })),
    { role: 'user' as const, content: question },
  ];

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AI request failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('Empty AI response');
  return content;
}

export function isAskNellyAiEnabled(): boolean {
  return Boolean(process.env.ASK_NELLY_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY);
}

export async function askNelly(question: string, history: ChatTurn[] = []): Promise<AskNellyResult> {
  const trimmed = question.trim();
  if (!trimmed) {
    return { answer: 'Ask a production question to get started.', sources: [], mode: 'excerpt' };
  }

  const chunks = loadKnowledgeChunks();
  const hits = searchKnowledge(trimmed, chunks, 6);
  const sources: AskNellySource[] = hits.map((c) => ({
    sourceId: c.sourceId,
    sourceTitle: c.sourceTitle,
    excerpt: trimExcerpt(c.text, 280),
  }));

  if (isAskNellyAiEnabled()) {
    try {
      const answer = await aiAnswer(trimmed, history, hits);
      return { answer, sources, mode: 'ai' };
    } catch (err) {
      console.error('Ask Nelly AI error:', err);
      const fallback = excerptAnswer(trimmed, hits);
      return {
        answer: `${fallback}\n\n_(AI answer unavailable: ${err instanceof Error ? err.message : 'error'} — showing excerpts instead.)_`,
        sources,
        mode: 'excerpt',
      };
    }
  }

  return {
    answer: excerptAnswer(trimmed, hits),
    sources,
    mode: 'excerpt',
  };
}
