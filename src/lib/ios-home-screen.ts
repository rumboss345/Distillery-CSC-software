const DISMISS_KEY = 'csc-ios-install-dismissed';

export function isIosDevice(userAgent: string, platform = '', maxTouchPoints = 0): boolean {
  if (/iPad|iPhone|iPod/i.test(userAgent)) return true;
  return platform === 'MacIntel' && maxTouchPoints > 1;
}

export function isStandaloneDisplay(standaloneFlag: boolean, displayModeStandalone: boolean): boolean {
  return standaloneFlag || displayModeStandalone;
}

export function shouldShowIosInstallHint(options: {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  standalone: boolean;
  dismissed: boolean;
}): boolean {
  if (options.dismissed || options.standalone) return false;
  return isIosDevice(options.userAgent, options.platform ?? '', options.maxTouchPoints ?? 0);
}

export function iosInstallDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissIosInstallHint(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // Private mode can block storage. The hint can stay for this visit.
  }
}
