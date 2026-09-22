import type { KnowledgeChunk } from './knowledge.js';

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'it', 'its', 'this', 'that',
  'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they', 'what', 'which', 'who', 'whom', 'how', 'when',
  'where', 'why', 'with', 'from', 'about', 'into', 'through', 'during', 'before', 'after', 'above',
  'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'all', 'each', 'few',
  'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
  'very', 'just', 'also', 'me', 'my', 'our', 'your', 'their', 'tell', 'explain',
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s°-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

export function scoreChunk(queryTokens: string[], chunk: KnowledgeChunk): number {
  if (queryTokens.length === 0) return 0;
  const hay = `${chunk.sourceTitle} ${chunk.text}`.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (hay.includes(token)) {
      score += token.length >= 6 ? 3 : 1;
    }
  }
  const phrase = queryTokens.join(' ');
  if (phrase.length > 4 && hay.includes(phrase)) score += 8;
  return score;
}

export function searchKnowledge(
  query: string,
  chunks: KnowledgeChunk[],
  limit = 6,
): KnowledgeChunk[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return chunks.slice(0, limit);

  const ranked = chunks
    .map((chunk) => ({ chunk, score: scoreChunk(tokens, chunk) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    return chunks.slice(0, limit);
  }

  const picked: KnowledgeChunk[] = [];
  const seenSources = new Set<string>();
  for (const row of ranked) {
    if (picked.length >= limit) break;
    picked.push(row.chunk);
    seenSources.add(row.chunk.sourceId);
  }
  for (const row of ranked) {
    if (picked.length >= limit) break;
    if (seenSources.has(row.chunk.sourceId)) continue;
    picked.push(row.chunk);
    seenSources.add(row.chunk.sourceId);
  }
  return picked;
}
