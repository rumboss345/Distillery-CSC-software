import { describe, expect, it } from 'vitest';
import { shouldShowIosInstallHint } from './ios-home-screen';

describe('shouldShowIosInstallHint', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)';

  it('shows on an iPhone that is still in Safari', () => {
    expect(shouldShowIosInstallHint({
      userAgent: iphone,
      standalone: false,
      dismissed: false,
    })).toBe(true);
  });

  it('stays hidden once the tracker is already on the home screen', () => {
    expect(shouldShowIosInstallHint({
      userAgent: iphone,
      standalone: true,
      dismissed: false,
    })).toBe(false);
  });

  it('stays hidden after the hint is dismissed', () => {
    expect(shouldShowIosInstallHint({
      userAgent: iphone,
      standalone: false,
      dismissed: true,
    })).toBe(false);
  });

  it('stays hidden on a desktop browser', () => {
    expect(shouldShowIosInstallHint({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      standalone: false,
      dismissed: false,
    })).toBe(false);
  });
});
