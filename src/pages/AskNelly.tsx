import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  askNellyChat,
  fetchAskNellyStatus,
  type AskNellyChatTurn,
  type AskNellySource,
} from '../lib/auth-api';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: AskNellySource[];
  mode?: 'ai' | 'excerpt';
}

const STARTERS = [
  'What start Brix is typical for molasses wash?',
  'When should we add yeast nutrients like DAP?',
  'How do foreshots, hearts, and feints differ on a pot still?',
  'What causes scaling from molasses during distillation?',
];

function renderAssistantText(text: string) {
  return text.split('\n').map((line, i) => (
    <span key={i}>
      {line}
      {'\n'}
    </span>
  ));
}

export function AskNelly() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        'Hi — I\'m Nelly, your internal production guide. I answer from the IBD Diploma in Distilling revision notes (cereal, molasses, fermentation, distillation, maturation). Ask about wash prep, fermentation, cuts, barrels, or quality.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ aiEnabled: boolean; sourceCount: number; chunkCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAskNellyStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setError(null);
    const userMsg: ChatMessage = { role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const history: AskNellyChatTurn[] = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content.replace(/\*\*/g, '') }));

    try {
      const result = await askNellyChat(trimmed, history);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: result.answer,
          sources: result.sources,
          mode: result.mode,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach Ask Nelly.');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
  };

  return (
    <div className="ask-nelly-page">
      <div className="page-header">
        <h2>Ask Nelly</h2>
        <p>
          Internal production assistant grounded in IBD Diploma distilling notes.
          {status && (
            <>
              {' '}
              {status.sourceCount} sources · {status.chunkCount} passages
              {status.aiEnabled ? ' · AI answers on' : ' · reference excerpts (set API key on server for AI)'}
            </>
          )}
        </p>
      </div>

      <div className="ask-nelly-layout card">
        <div className="ask-nelly-messages" ref={scrollRef}>
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`ask-nelly-bubble ask-nelly-bubble--${msg.role}`}
            >
              <div className="ask-nelly-bubble-label">
                {msg.role === 'user' ? 'You' : 'Nelly'}
                {msg.mode === 'ai' && msg.role === 'assistant' && (
                  <span className="ask-nelly-mode-tag">AI</span>
                )}
              </div>
              <div className="ask-nelly-bubble-body">{renderAssistantText(msg.content)}</div>
              {msg.sources && msg.sources.length > 0 && (
                <details className="ask-nelly-sources">
                  <summary>Sources ({msg.sources.length})</summary>
                  <ul>
                    {msg.sources.map((s) => (
                      <li key={`${s.sourceId}-${s.excerpt.slice(0, 24)}`}>
                        <strong>{s.sourceTitle}</strong>
                        <p>{s.excerpt}</p>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ))}
          {loading && (
            <div className="ask-nelly-bubble ask-nelly-bubble--assistant">
              <div className="ask-nelly-bubble-label">Nelly</div>
              <div className="ask-nelly-bubble-body ask-nelly-thinking">Searching IBD notes…</div>
            </div>
          )}
        </div>

        <div className="ask-nelly-starters">
          {STARTERS.map((q) => (
            <button
              key={q}
              type="button"
              className="btn btn-sm btn-secondary"
              disabled={loading}
              onClick={() => void sendMessage(q)}
            >
              {q}
            </button>
          ))}
        </div>

        {error && <p className="ask-nelly-error">{error}</p>}

        <form className="ask-nelly-form" onSubmit={onSubmit}>
          <textarea
            rows={2}
            value={input}
            placeholder="Ask about molasses wash, fermentation, distillation, maturation…"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void sendMessage(input);
              }
            }}
          />
          <button type="submit" className="btn btn-primary" disabled={loading || !input.trim()}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
