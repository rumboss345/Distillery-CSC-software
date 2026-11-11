import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAssignableUsers } from '../hooks/useAssignableUsers';
import { staffDisplayName } from '../hooks/useStaffMessageNotifications';
import {
  fetchStaffMessageThread,
  fetchStaffMessages,
  markAllStaffMessagesRead,
  markStaffMessageRead,
  sendStaffBroadcast,
  sendStaffMessage,
  type StaffMessage,
} from '../lib/auth-api';
import { isAdminRole } from '../lib/roles';
import { useStaffMessageContext } from '../context/StaffMessageContext';

type Folder = 'inbox' | 'sent' | 'staff-threads';

const BROADCAST_RECIPIENT = '__all__';

function formatWhen(iso: string): string {
  const date = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function MessagingCenter() {
  const { user } = useAuth();
  const { users: staff } = useAssignableUsers();
  const { refreshSummary, setUnreadCount } = useStaffMessageContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [folder, setFolder] = useState<Folder>('inbox');
  const [messages, setMessages] = useState<StaffMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [recipientId, setRecipientId] = useState('');
  const [body, setBody] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const canViewStaffThreads = isAdminRole(user?.role);
  const [threadStaffA, setThreadStaffA] = useState('');
  const [threadStaffB, setThreadStaffB] = useState('');
  const [threadError, setThreadError] = useState<string | null>(null);

  const composeTo = searchParams.get('to');
  useEffect(() => {
    if (composeTo) setRecipientId(composeTo);
  }, [composeTo]);

  const recipients = useMemo(
    () => staff.filter((row) => row.id !== user?.id),
    [staff, user?.id],
  );

  const loadMessages = useCallback(async (nextFolder: Folder) => {
    setLoading(true);
    setThreadError(null);
    try {
      if (nextFolder === 'staff-threads') {
        const idA = Number(threadStaffA);
        const idB = Number(threadStaffB);
        if (!Number.isInteger(idA) || !Number.isInteger(idB) || idA <= 0 || idB <= 0) {
          setMessages([]);
          setSelectedId(null);
          return;
        }
        if (idA === idB) {
          setThreadError('Choose two different staff members.');
          setMessages([]);
          setSelectedId(null);
          return;
        }
        const { messages: rows } = await fetchStaffMessageThread(idA, idB);
        setMessages(rows);
        setSelectedId((current) => current ?? rows[0]?.id ?? null);
        return;
      }
      const { messages: rows } = await fetchStaffMessages(nextFolder);
      setMessages(rows);
      if (nextFolder === 'inbox') {
        const firstUnread = rows.find((m) => !m.read_at);
        setSelectedId((current) => current ?? firstUnread?.id ?? rows[0]?.id ?? null);
      } else {
        setSelectedId((current) => current ?? rows[0]?.id ?? null);
      }
    } catch (err) {
      if (nextFolder === 'staff-threads') {
        setThreadError(err instanceof Error ? err.message : 'Could not load that conversation.');
        setMessages([]);
        setSelectedId(null);
      }
    } finally {
      setLoading(false);
    }
  }, [threadStaffA, threadStaffB]);

  useEffect(() => {
    void loadMessages(folder);
  }, [folder, loadMessages]);

  useEffect(() => {
    if (folder !== 'staff-threads') return;
    if (!threadStaffA || !threadStaffB) return;
    void loadMessages('staff-threads');
  }, [folder, threadStaffA, threadStaffB, loadMessages]);

  const selected = messages.find((m) => m.id === selectedId) ?? null;

  const openReply = (msg: StaffMessage) => {
    setFolder('inbox');
    setRecipientId(String(msg.sender_id));
    setSearchParams({ to: String(msg.sender_id) });
    setBody('');
  };

  const handleSend = async () => {
    setSendError(null);
    setSendSuccess(null);
    if (!recipientId) {
      setSendError('Choose who should receive this message.');
      return;
    }
    if (!body.trim()) {
      setSendError('Enter a message (up to 2000 characters).');
      return;
    }
    setSending(true);
    try {
      if (recipientId === BROADCAST_RECIPIENT) {
        const result = await sendStaffBroadcast(body);
        setBody('');
        setRecipientId('');
        setSearchParams({});
        await loadMessages('sent');
        setFolder('sent');
        setSendSuccess(
          `Sent to everyone on staff (${result.recipientCount} ${result.recipientCount === 1 ? 'person' : 'people'}).`,
        );
      } else {
        const id = Number(recipientId);
        if (!Number.isInteger(id) || id <= 0) {
          setSendError('Choose who should receive this message.');
          return;
        }
        await sendStaffMessage(id, body);
        setBody('');
        setSearchParams({});
        await loadMessages('sent');
        setFolder('sent');
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not send the message.');
    } finally {
      setSending(false);
    }
  };

  const handleSelect = async (msg: StaffMessage) => {
    setSelectedId(msg.id);
    if (folder === 'staff-threads') return;
    if (folder === 'inbox' && !msg.read_at) {
      try {
        const result = await markStaffMessageRead(msg.id);
        setUnreadCount(result.unreadCount);
        setMessages((rows) =>
          rows.map((row) =>
            row.id === msg.id ? { ...row, read_at: row.read_at ?? new Date().toISOString() } : row,
          ),
        );
        await refreshSummary();
      } catch {
        /* keep UI usable */
      }
    }
  };

  const handleMarkAllRead = async () => {
    const result = await markAllStaffMessagesRead();
    setUnreadCount(result.unreadCount);
    await loadMessages('inbox');
    await refreshSummary();
  };

  return (
    <div className="page messaging-center-page">
      <header className="page-header">
        <h1>Messaging Center</h1>
        <p>Send notes to other staff. New messages pop up while you work and when you sign in.</p>
      </header>

      <div className="messaging-center-layout">
        <section className="card messaging-compose">
          <h2 className="card-title">New message</h2>
          <div className="form-group">
            <label htmlFor="msg-recipient">To</label>
            <select
              id="msg-recipient"
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
            >
              <option value="">Select staff member…</option>
              <option value={BROADCAST_RECIPIENT}>Everyone on staff</option>
              {recipients.map((row) => (
                <option key={row.id} value={row.id}>
                  {staffDisplayName(row.name, row.email)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="msg-body">Message</label>
            <textarea
              id="msg-body"
              rows={4}
              maxLength={2000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Shift handoff, tank change, or anything the team should know…"
            />
          </div>
          {sendError && <p className="field-hint" style={{ color: 'var(--danger, #dc2626)' }}>{sendError}</p>}
          {sendSuccess && <p className="field-hint">{sendSuccess}</p>}
          <button type="button" className="btn btn-primary" disabled={sending} onClick={() => void handleSend()}>
            {sending ? 'Sending…' : 'Send message'}
          </button>
        </section>

        <section className="card messaging-list-panel">
          <div className="messaging-folder-tabs" role="tablist" aria-label="Message folders">
            <button
              type="button"
              role="tab"
              className={`btn btn-sm${folder === 'inbox' ? ' btn-primary' : ' btn-secondary'}`}
              aria-selected={folder === 'inbox'}
              onClick={() => setFolder('inbox')}
            >
              Inbox
            </button>
            <button
              type="button"
              role="tab"
              className={`btn btn-sm${folder === 'sent' ? ' btn-primary' : ' btn-secondary'}`}
              aria-selected={folder === 'sent'}
              onClick={() => setFolder('sent')}
            >
              Sent
            </button>
            {canViewStaffThreads && (
              <button
                type="button"
                role="tab"
                className={`btn btn-sm${folder === 'staff-threads' ? ' btn-primary' : ' btn-secondary'}`}
                aria-selected={folder === 'staff-threads'}
                onClick={() => setFolder('staff-threads')}
                data-testid="staff-threads-tab"
              >
                Staff threads
              </button>
            )}
            {folder === 'inbox' && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => void handleMarkAllRead()}>
                Mark all read
              </button>
            )}
          </div>

          {folder === 'staff-threads' && (
            <div className="messaging-staff-thread-pickers" data-testid="staff-thread-pickers">
              <label className="messaging-staff-thread-picker">
                <span className="field-hint">Staff member</span>
                <select
                  value={threadStaffA}
                  onChange={(e) => setThreadStaffA(e.target.value)}
                  data-testid="staff-thread-a"
                >
                  <option value="">Select…</option>
                  {staff.map((row) => (
                    <option key={row.id} value={row.id}>
                      {staffDisplayName(row.name, row.email)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="messaging-staff-thread-picker">
                <span className="field-hint">Staff member</span>
                <select
                  value={threadStaffB}
                  onChange={(e) => setThreadStaffB(e.target.value)}
                  data-testid="staff-thread-b"
                >
                  <option value="">Select…</option>
                  {staff.map((row) => (
                    <option key={row.id} value={row.id}>
                      {staffDisplayName(row.name, row.email)}
                    </option>
                  ))}
                </select>
              </label>
              <p className="field-hint">
                Owners and administrators can read direct messages between two staff members. Broadcasts still appear as separate one-to-one copies.
              </p>
              {threadError && (
                <p className="field-hint" style={{ color: 'var(--danger, #dc2626)' }}>{threadError}</p>
              )}
            </div>
          )}

          {loading ? (
            <p className="field-hint">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="field-hint">
              {folder === 'staff-threads'
                ? threadStaffA && threadStaffB
                  ? 'No direct messages between these staff members yet.'
                  : 'Choose two staff members to view their conversation.'
                : 'No messages in this folder yet.'}
            </p>
          ) : (
            <ul className="messaging-thread-list">
              {messages.map((msg) => {
                const peer =
                  folder === 'staff-threads'
                    ? `${staffDisplayName(msg.sender_name, msg.sender_email)} → ${staffDisplayName(msg.recipient_name, msg.recipient_email)}`
                    : folder === 'inbox'
                      ? staffDisplayName(msg.sender_name, msg.sender_email)
                      : staffDisplayName(msg.recipient_name, msg.recipient_email);
                const unread = folder === 'inbox' && !msg.read_at;
                return (
                  <li key={msg.id}>
                    <button
                      type="button"
                      className={`messaging-thread-item${selectedId === msg.id ? ' selected' : ''}${unread ? ' unread' : ''}`}
                      onClick={() => void handleSelect(msg)}
                    >
                      <span className="messaging-thread-peer">{peer}</span>
                      <span className="messaging-thread-preview">
                        {msg.body.length > 80 ? `${msg.body.slice(0, 80)}…` : msg.body}
                      </span>
                      <span className="messaging-thread-when">{formatWhen(msg.created_at)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card messaging-detail">
          {selected ? (
            <>
              <h2 className="card-title">
                {folder === 'staff-threads'
                  ? `${staffDisplayName(selected.sender_name, selected.sender_email)} → ${staffDisplayName(selected.recipient_name, selected.recipient_email)}`
                  : folder === 'inbox'
                    ? `From ${staffDisplayName(selected.sender_name, selected.sender_email)}`
                    : `To ${staffDisplayName(selected.recipient_name, selected.recipient_email)}`}
              </h2>
              <p className="field-hint">{formatWhen(selected.created_at)}</p>
              <div className="staff-message-detail-body">{selected.body}</div>
              {folder === 'inbox' && (
                <button type="button" className="btn btn-secondary" onClick={() => openReply(selected)}>
                  Reply
                </button>
              )}
            </>
          ) : (
            <p className="field-hint">Select a message to read it.</p>
          )}
        </section>
      </div>
    </div>
  );
}
