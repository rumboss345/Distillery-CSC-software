import { describe, expect, it } from 'vitest';
import { mixedSpiritConfirmMessage } from './blend-spirit-mix';

describe('mixedSpiritConfirmMessage', () => {
  it('asks before blending different distillations or cuts', () => {
    const message = mixedSpiritConfirmMessage([
      { spirit: 'Spirit Run · Hearts', place: 'High proof cane 2' },
      { spirit: 'Low Wine Run · Hearts', place: 'Low wines storage' },
      { spirit: 'Spirit Run · Tails', place: 'Tails tank' },
    ]);
    expect(message).toContain('Spirit Run · Hearts — High proof cane 2');
    expect(message).toContain('Low Wine Run · Hearts — Low wines storage');
    expect(message).toContain('Spirit Run · Tails — Tails tank');
    expect(message).toContain('Are you sure you want to blend these together?');
  });

  it('stays quiet when every pull is the same spirit', () => {
    expect(mixedSpiritConfirmMessage([
      { spirit: 'Spirit Run · Hearts', place: 'Tank A' },
      { spirit: 'Spirit Run · Hearts', place: 'Tank B' },
    ])).toBeNull();
    expect(mixedSpiritConfirmMessage([
      { spirit: 'Low Wine Run · Hearts' },
    ])).toBeNull();
  });
});
