/**
 * Auth Types and Context
 *
 * Separated from useAuth.ts to avoid Clerk import side effects in E2E mode.
 */

import { createContext, useContext } from 'react';
import type { UserDTO } from '@meet-without-fear/shared';

/**
 * User type from backend
 */
export interface User extends UserDTO {
  avatarUrl?: string;
}

/**
 * Authentication context value
 * Clerk-first: Clerk is the auth source, backend profile is just data
 */
export interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
  getToken: () => Promise<string | null>;
  updateUser: (updates: Partial<User>) => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Hook to access authentication state and methods
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
