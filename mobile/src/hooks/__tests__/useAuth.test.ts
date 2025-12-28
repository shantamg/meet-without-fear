import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { useAuthProvider, useAuth, AuthContext } from '../useAuth';

import * as SecureStore from 'expo-secure-store';

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useSegments: () => ['(public)'],
  useRootNavigationState: () => ({ key: 'root' }),
}));

const mockGetItemAsync = SecureStore.getItemAsync as jest.MockedFunction<
  typeof SecureStore.getItemAsync
>;
const mockSetItemAsync = SecureStore.setItemAsync as jest.MockedFunction<
  typeof SecureStore.setItemAsync
>;
const mockDeleteItemAsync = SecureStore.deleteItemAsync as jest.MockedFunction<
  typeof SecureStore.deleteItemAsync
>;

/**
 * Helper to create a wrapper with AuthContext
 */
function createAuthWrapper(authValue: ReturnType<typeof useAuthProvider>): React.FC<{ children: React.ReactNode }> {
  return ({ children }) =>
    React.createElement(AuthContext.Provider, { value: authValue }, children);
}

describe('useAuthProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no stored session
    mockGetItemAsync.mockResolvedValue(null);
    mockSetItemAsync.mockResolvedValue();
    mockDeleteItemAsync.mockResolvedValue();
  });

  describe('initial state', () => {
    it('starts with loading state', () => {
      const { result } = renderHook(() => useAuthProvider());

      expect(result.current.isLoading).toBe(true);
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
    });

    it('checks for stored session on mount', async () => {
      renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(mockGetItemAsync).toHaveBeenCalledWith('auth_token');
        expect(mockGetItemAsync).toHaveBeenCalledWith('auth_user');
      });
    });

    it('restores session from storage', async () => {
      const storedUser = {
        id: 'user_123',
        email: 'test@example.com',
        name: 'Test User',
      };
      mockGetItemAsync.mockImplementation((key) => {
        if (key === 'auth_token') return Promise.resolve('token_123');
        if (key === 'auth_user') return Promise.resolve(JSON.stringify(storedUser));
        return Promise.resolve(null);
      });

      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user).toEqual(storedUser);
    });

    it('handles missing token gracefully', async () => {
      mockGetItemAsync.mockResolvedValue(null);

      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
    });
  });

  describe('signIn', () => {
    it('initiates email verification flow', async () => {
      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.signIn('test@example.com');
      });

      expect(result.current.pendingVerification).toBe(true);
    });
  });

  describe('verifySignInCode', () => {
    it('validates code length', async () => {
      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // First initiate sign in
      await act(async () => {
        await result.current.signIn('test@example.com');
      });

      // Try to verify with invalid code
      await expect(
        act(async () => {
          await result.current.verifySignInCode('123'); // Too short
        })
      ).rejects.toThrow('Invalid verification code');
    });

    it('completes sign in with valid code', async () => {
      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Initiate sign in
      await act(async () => {
        await result.current.signIn('test@example.com');
      });

      // Verify with valid code
      await act(async () => {
        await result.current.verifySignInCode('123456');
      });

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.pendingVerification).toBe(false);
      expect(result.current.user?.email).toBe('test@example.com');
    });

    it('stores session after successful verification', async () => {
      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.signIn('test@example.com');
      });

      await act(async () => {
        await result.current.verifySignInCode('123456');
      });

      expect(mockSetItemAsync).toHaveBeenCalledWith('auth_token', expect.any(String));
      expect(mockSetItemAsync).toHaveBeenCalledWith('auth_user', expect.any(String));
    });

    it('throws error when no pending verification', async () => {
      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await expect(
        act(async () => {
          await result.current.verifySignInCode('123456');
        })
      ).rejects.toThrow('No pending email verification');
    });
  });

  describe('signUp', () => {
    it('initiates signup verification flow', async () => {
      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.signUp('new@example.com', 'New User');
      });

      expect(result.current.pendingVerification).toBe(true);
    });

    it('verifies signup with name included in user', async () => {
      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.signUp('new@example.com', 'John Doe');
      });

      await act(async () => {
        await result.current.verifySignUpCode('123456');
      });

      expect(result.current.user?.name).toBe('John Doe');
      expect(result.current.user?.firstName).toBe('John');
      expect(result.current.user?.lastName).toBe('Doe');
    });
  });

  describe('signOut', () => {
    it('clears auth state', async () => {
      // Start with stored session
      const storedUser = {
        id: 'user_123',
        email: 'test@example.com',
        name: 'Test User',
      };
      mockGetItemAsync.mockImplementation((key) => {
        if (key === 'auth_token') return Promise.resolve('token_123');
        if (key === 'auth_user') return Promise.resolve(JSON.stringify(storedUser));
        return Promise.resolve(null);
      });

      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      await act(async () => {
        await result.current.signOut();
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
    });

    it('removes stored session', async () => {
      const storedUser = {
        id: 'user_123',
        email: 'test@example.com',
        name: 'Test User',
      };
      mockGetItemAsync.mockImplementation((key) => {
        if (key === 'auth_token') return Promise.resolve('token_123');
        if (key === 'auth_user') return Promise.resolve(JSON.stringify(storedUser));
        return Promise.resolve(null);
      });

      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      await act(async () => {
        await result.current.signOut();
      });

      expect(mockDeleteItemAsync).toHaveBeenCalledWith('auth_token');
      expect(mockDeleteItemAsync).toHaveBeenCalledWith('auth_user');
    });
  });

  describe('getToken', () => {
    it('returns stored token', async () => {
      mockGetItemAsync.mockImplementation((key) => {
        if (key === 'auth_token') return Promise.resolve('my_token');
        if (key === 'auth_user')
          return Promise.resolve(JSON.stringify({ id: '1', email: 'a@b.com', name: 'A' }));
        return Promise.resolve(null);
      });

      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const token = await result.current.getToken();
      expect(token).toBe('my_token');
    });
  });
});

describe('useAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItemAsync.mockResolvedValue(null);
    mockSetItemAsync.mockResolvedValue();
    mockDeleteItemAsync.mockResolvedValue();
  });

  it('throws when used outside AuthProvider', () => {
    // Suppress console.error for this test
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      renderHook(() => useAuth());
    }).toThrow('useAuth must be used within an AuthProvider');

    consoleSpy.mockRestore();
  });

  it('returns context value when inside provider', async () => {
    const { result: providerResult } = renderHook(() => useAuthProvider());

    await waitFor(() => {
      expect(providerResult.current.isLoading).toBe(false);
    });

    const wrapper = createAuthWrapper(providerResult.current);

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBe(false);
    expect(typeof result.current.signIn).toBe('function');
    expect(typeof result.current.signOut).toBe('function');
  });
});

describe('auth flow integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItemAsync.mockResolvedValue(null);
    mockSetItemAsync.mockResolvedValue();
    mockDeleteItemAsync.mockResolvedValue();
  });

  it('completes full sign in flow', async () => {
    const { result } = renderHook(() => useAuthProvider());

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Initially not authenticated
    expect(result.current.isAuthenticated).toBe(false);

    // Start sign in
    await act(async () => {
      await result.current.signIn('user@example.com');
    });

    // Should be pending verification
    expect(result.current.pendingVerification).toBe(true);

    // Verify code
    await act(async () => {
      await result.current.verifySignInCode('123456');
    });

    // Should be authenticated
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.pendingVerification).toBe(false);
    expect(result.current.user?.email).toBe('user@example.com');
  });

  it('completes full sign up flow', async () => {
    const { result } = renderHook(() => useAuthProvider());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Start sign up
    await act(async () => {
      await result.current.signUp('newuser@example.com', 'New User');
    });

    expect(result.current.pendingVerification).toBe(true);

    // Verify code
    await act(async () => {
      await result.current.verifySignUpCode('654321');
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.email).toBe('newuser@example.com');
    expect(result.current.user?.name).toBe('New User');
  });

  it('persists auth across hook remounts', async () => {
    const storedUser = {
      id: 'user_persist',
      email: 'persist@example.com',
      name: 'Persist User',
    };

    mockGetItemAsync.mockImplementation((key) => {
      if (key === 'auth_token') return Promise.resolve('persist_token');
      if (key === 'auth_user') return Promise.resolve(JSON.stringify(storedUser));
      return Promise.resolve(null);
    });

    // First mount
    const { result: result1, unmount } = renderHook(() => useAuthProvider());

    await waitFor(() => {
      expect(result1.current.isAuthenticated).toBe(true);
    });

    // Unmount
    unmount();

    // Remount
    const { result: result2 } = renderHook(() => useAuthProvider());

    await waitFor(() => {
      expect(result2.current.isAuthenticated).toBe(true);
    });

    expect(result2.current.user?.email).toBe('persist@example.com');
  });
});
