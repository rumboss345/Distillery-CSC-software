export type UserRole = 'admin' | 'user';
export type UserStatus = 'pending' | 'approved' | 'rejected';

export interface User {
  id: number;
  email: string;
  password_hash: string;
  name: string | null;
  role: UserRole;
  status: UserStatus;
  approval_token: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
