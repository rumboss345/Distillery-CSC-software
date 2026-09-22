import { describe, expect, it } from 'vitest';
import type { KnowledgeChunk } from './knowledge.js';
import { searchKnowledge, tokenize } from './search.js';

const sampleChunks: KnowledgeChunk[] = [
  {
    id: 'a#0',
    sourceId: 'molasses.txt',
    sourceTitle: 'Molasses Wort',
    text: 'Molasses is diluted to about 14 degrees Brix before fermentation. Yeast nutrients such as DAP may be required.',
  },
  {
    id: 'b#0',
    sourceId: 'pot.txt',
    sourceTitle: 'Pot Distillation',
    text: 'Foreshots and feints are separated from spirit during pot still distillation.',
  },
];

describe('ask-nelly search', () => {
  it('tokenizes and ranks molasses questions', () => {
    expect(tokenize('What Brix for molasses wash?')).toContain('brix');
    const hits = searchKnowledge('molasses Brix fermentation nutrients', sampleChunks, 2);
    expect(hits[0]?.sourceId).toBe('molasses.txt');
  });
});
