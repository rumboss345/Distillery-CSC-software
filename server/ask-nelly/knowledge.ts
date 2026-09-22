import { existsSync, readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

export interface KnowledgeChunk {
  id: string;
  sourceId: string;
  sourceTitle: string;
  text: string;
}

const CHUNK_SIZE = 1400;
const CHUNK_OVERLAP = 180;

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCES_DIR = join(__dirname, '..', 'knowledge', 'ibd', 'sources');

let cachedChunks: KnowledgeChunk[] | null = null;

function titleFromFilename(filename: string): string {
  return filename.replace(/\.txt$/i, '').replace(/_/g, ' ');
}

function splitIntoChunks(sourceId: string, sourceTitle: string, text: string): KnowledgeChunk[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n\n+/);
  const chunks: KnowledgeChunk[] = [];
  let buffer = '';
  let index = 0;

  const flush = () => {
    const piece = buffer.trim();
    if (piece.length < 80) return;
    chunks.push({
      id: `${sourceId}#${index++}`,
      sourceId,
      sourceTitle,
      text: piece,
    });
    buffer = piece.length > CHUNK_OVERLAP ? piece.slice(-CHUNK_OVERLAP) : '';
  };

  for (const para of paragraphs) {
    const next = buffer ? `${buffer}\n\n${para}` : para;
    if (next.length <= CHUNK_SIZE) {
      buffer = next;
      continue;
    }
    if (buffer) flush();
    if (para.length <= CHUNK_SIZE) {
      buffer = para;
    } else {
      for (let i = 0; i < para.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
        const slice = para.slice(i, i + CHUNK_SIZE).trim();
        if (slice.length >= 80) {
          chunks.push({
            id: `${sourceId}#${index++}`,
            sourceId,
            sourceTitle,
            text: slice,
          });
        }
      }
      buffer = '';
    }
  }
  if (buffer.trim()) flush();
  return chunks;
}

export function loadKnowledgeChunks(force = false): KnowledgeChunk[] {
  if (cachedChunks && !force) return cachedChunks;
  if (!existsSync(SOURCES_DIR)) {
    cachedChunks = [];
    return cachedChunks;
  }

  const files = readdirSync(SOURCES_DIR)
    .filter((f) => f.endsWith('.txt'))
    .sort((a, b) => a.localeCompare(b));

  const all: KnowledgeChunk[] = [];
  for (const file of files) {
    const sourceId = file;
    const sourceTitle = titleFromFilename(file);
    const text = readFileSync(join(SOURCES_DIR, file), 'utf8');
    all.push(...splitIntoChunks(sourceId, sourceTitle, text));
  }
  cachedChunks = all;
  return all;
}

export function knowledgeStats() {
  const chunks = loadKnowledgeChunks();
  const sourceIds = new Set(chunks.map((c) => c.sourceId));
  return {
    sourceCount: sourceIds.size,
    chunkCount: chunks.length,
  };
}
