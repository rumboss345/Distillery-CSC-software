import { useEffect, useState } from 'react';
import { dismissIosInstallHint, iosInstallDismissed, shouldShowIosInstallHint } from '../lib/ios-home-screen';

function runningStandalone(): boolean {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  const display = window.matchMedia('(display-mode: standalone)').matches;
  return Boolean(nav.standalone) || display;
}

export function IosHomeScreenHint() {
  const [visible, setVisible] = useState(() => shouldShowIosInstallHint({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: runningStandalone(),
    dismissed: iosInstallDismissed(),
  }));

  useEffect(() => {
    document.body.classList.toggle('ios-install-visible', visible);
    return () => document.body.classList.remove('ios-install-visible');
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="ios-install-hint" role="note">
      <p>
        Add CSC Tracker to your iPhone. Tap Share, then <strong>Add to Home Screen</strong>.
      </p>
      <button
        type="button"
        className="btn btn-sm btn-secondary"
        onClick={() => {
          dismissIosInstallHint();
          setVisible(false);
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
