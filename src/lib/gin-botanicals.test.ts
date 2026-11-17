import { describe, expect, it } from 'vitest';
import { ginRunRecipeLabel } from './gin-botanicals';

describe('ginRunRecipeLabel', () => {
  it('names the saved recipe or custom botanicals', () => {
    expect(ginRunRecipeLabel('House Gin', true)).toBe('House Gin');
    expect(ginRunRecipeLabel(null, true)).toBe('Custom botanical charge');
    expect(ginRunRecipeLabel('', false)).toBeNull();
  });
});