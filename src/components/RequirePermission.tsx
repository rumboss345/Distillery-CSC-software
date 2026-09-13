import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { canAccessPath } from '../lib/permissions';

export function RequirePermission() {
  const { user, loading, hasPermission } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Checking access…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (location.pathname.startsWith('/admin')) {
    if (user.role !== 'admin') {
      return <Navigate to="/" replace />;
    }
    return <Outlet />;
  }

  if (!canAccessPath(location.pathname, hasPermission)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
