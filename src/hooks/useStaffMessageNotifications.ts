import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  fetchIncomingStaffMessages,
  fetchStaffMessageSummary,
  markStaffMessageRead,
  type StaffMessage,
} from '../lib/auth-api';

const POLL_MS = 8000;
const ANNOUNCED_KEY_PREFIX = 'staff-msg-announced-';

function announcedKey(userId: number) {
  return `${ANNOUNCED_KEY_PREFIX}${userId}`;
}

function readAnnouncedId(userId: number): number {
  try {
    const raw = sessionStorage.getItem(announcedKey(userId));
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function writeAnnouncedId(userId: number, id: number) {
  try {
    sessionStorage.setItem(announcedKey(userId), String(id));
  } catch {
    /* ignore */
  }
}

export function staffDisplayName(name: string | null, email: string): string {
  const trimmed = name?.trim();
  return trimmed || email;
}

export function useStaffMessageNotifications() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [unreadCount, setUnreadCount] = useState(0);
  const [popup, setPopup] = useState<StaffMessage | null>(null);
  const announcedRef = useRef(0);
  const pollingRef = useRef(false);

  const refreshSummary = useCallback(async () => {
    if (!userId) return;
    const { unreadCount: count } = await fetchStaffMessageSummary();
    setUnreadCount(count);
  }, [userId]);

  const announceNew = useCallback(
    (messages: StaffMessage[]) => {
      if (!userId || messages.length === 0) return;
      const maxId = Math.max(...messages.map((m) => m.id));
      const newest = messages.reduce((a, b) => (a.id >= b.id ? a : b));
      if (maxId > announcedRef.current) {
        announcedRef.current = maxId;
        writeAnnouncedId(userId, maxId);
        setPopup(newest);
      }
      void refreshSummary();
    },
    [userId, refreshSummary],
  );

  const pollIncoming = useCallback(async () => {
    if (!userId || pollingRef.current) return;
    pollingRef.current = true;
    try {
      const afterId = announcedRef.current;
      const { messages } = await fetchIncomingStaffMessages(afterId);
      if (messages.length > 0) {
        announceNew(messages);
      } else {
        await refreshSummary();
      }
    } catch {
      /* offline or session expired — skip noisy errors while polling */
    } finally {
      pollingRef.current = false;
    }
  }, [userId, announceNew, refreshSummary]);

  useEffect(() => {
    if (!userId) {
      setUnreadCount(0);
      setPopup(null);
      return;
    }
    announcedRef.current = readAnnouncedId(userId);
    void pollIncoming();
    const timer = window.setInterval(() => {
      if (document.querySelector('.modal-overlay')) return;
      void pollIncoming();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [userId, pollIncoming]);

  const dismissPopup = useCallback(() => {
    setPopup(null);
  }, []);

  const markPopupRead = useCallback(async () => {
    if (!popup) return;
    try {
      const result = await markStaffMessageRead(popup.id);
      setUnreadCount(result.unreadCount);
    } catch {
      await refreshSummary();
    }
    setPopup(null);
  }, [popup, refreshSummary]);

  return {
    unreadCount,
    popup,
    dismissPopup,
    markPopupRead,
    refreshSummary,
    setUnreadCount,
  };
}
