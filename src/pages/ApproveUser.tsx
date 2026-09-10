import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { approveByToken } from '../lib/auth-api';

export function ApproveUser() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [message, setMessage] = useState('Approving account…');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Missing approval token.');
      return;
    }

    approveByToken(token)
      .then((result) => {
        setMessage(result.message);
        setDone(true);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Approval failed');
      });
  }, [token]);

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <h1>User approval</h1>
        </div>

        {error ? (
          <div className="auth-error">{error}</div>
        ) : (
          <div className={done ? 'auth-success' : 'auth-info'}>{message}</div>
        )}

        <p className="auth-footer">
          <Link to="/login">Go to sign in</Link>
        </p>
      </div>
    </div>
  );
}
