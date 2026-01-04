import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

// Import the modules we need to test
import {
  requestNotificationPermissions,
  getExpoPushToken,
  configureNotificationHandler,
} from '../../services/notifications';
import { usePushNotifications } from '../usePushNotifications';
import { useNotifications, useNotificationCount } from '../useNotifications';

// Mock expo-router
const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: jest.fn(),
    back: jest.fn(),
  }),
}));

// Mock useAuth
const mockIsAuthenticated = { value: true };
jest.mock('../useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: mockIsAuthenticated.value,
    isLoading: false,
  }),
}));

// Mock useProfile
const mockMutate = jest.fn();
jest.mock('../useProfile', () => ({
  useUpdatePushToken: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}));

// Mock apiClient for useNotifications
jest.mock('../../lib/api', () => ({
  apiClient: {
    get: jest.fn().mockResolvedValue({
      data: {
        notifications: [],
        nextCursor: null,
        unreadCount: 0,
      },
    }),
    patch: jest.fn().mockResolvedValue({
      data: { success: true, unreadCount: 0 },
    }),
  },
}));

// Create a wrapper with QueryClient
function createWrapper(): React.FC<{ children: React.ReactNode }> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useNotifications (in-app notifications)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAuthenticated.value = true;
  });

  it('returns empty notifications when loading', () => {
    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    });

    expect(result.current.notifications).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('provides markRead function', () => {
    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    });

    expect(typeof result.current.markRead).toBe('function');
  });

  it('provides markAllRead function', () => {
    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    });

    expect(typeof result.current.markAllRead).toBe('function');
  });

  it('provides loadMore function for infinite scroll', () => {
    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    });

    expect(typeof result.current.loadMore).toBe('function');
  });
});

describe('useNotificationCount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAuthenticated.value = true;
  });

  it('returns unread count', async () => {
    const { result } = renderHook(() => useNotificationCount(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(typeof result.current.unreadCount).toBe('number');
    });
  });
});

describe('usePushNotifications', () => {
  // Get references to the mocked functions
  const mockGetPermissionsAsync = Notifications.getPermissionsAsync as jest.MockedFunction<
    typeof Notifications.getPermissionsAsync
  >;
  const mockRequestPermissionsAsync = Notifications.requestPermissionsAsync as jest.MockedFunction<
    typeof Notifications.requestPermissionsAsync
  >;
  const mockGetExpoPushTokenAsync = Notifications.getExpoPushTokenAsync as jest.MockedFunction<
    typeof Notifications.getExpoPushTokenAsync
  >;
  const mockAddNotificationReceivedListener =
    Notifications.addNotificationReceivedListener as jest.MockedFunction<
      typeof Notifications.addNotificationReceivedListener
    >;
  const mockAddNotificationResponseReceivedListener =
    Notifications.addNotificationResponseReceivedListener as jest.MockedFunction<
      typeof Notifications.addNotificationResponseReceivedListener
    >;
  const mockSetNotificationHandler = Notifications.setNotificationHandler as jest.MockedFunction<
    typeof Notifications.setNotificationHandler
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    // Reset auth mock
    mockIsAuthenticated.value = true;

    // Ensure device mock is set
    (Device as { isDevice: boolean }).isDevice = true;

    // Default mock implementations
    mockGetPermissionsAsync.mockResolvedValue({
      status: 'granted',
      expires: 'never',
      granted: true,
      canAskAgain: true,
    } as Notifications.PermissionResponse);
    mockRequestPermissionsAsync.mockResolvedValue({
      status: 'granted',
      expires: 'never',
      granted: true,
      canAskAgain: true,
    } as Notifications.PermissionResponse);
    mockGetExpoPushTokenAsync.mockResolvedValue({
      data: 'ExponentPushToken[test-token]',
      type: 'expo',
    });
    mockAddNotificationReceivedListener.mockReturnValue({ remove: jest.fn() });
    mockAddNotificationResponseReceivedListener.mockReturnValue({ remove: jest.fn() });
    mockMutate.mockImplementation((data, options) => {
      if (options?.onSuccess) {
        options.onSuccess({ registered: true });
      }
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('notification service', () => {
    it('requests permission when not already granted', async () => {
      mockGetPermissionsAsync.mockResolvedValueOnce({
        status: 'undetermined',
        expires: 'never',
        granted: false,
        canAskAgain: true,
      } as Notifications.PermissionResponse);

      await requestNotificationPermissions();

      expect(mockRequestPermissionsAsync).toHaveBeenCalled();
    });

    it('does not request permission when already granted', async () => {
      mockGetPermissionsAsync.mockResolvedValueOnce({
        status: 'granted',
        expires: 'never',
        granted: true,
        canAskAgain: true,
      } as Notifications.PermissionResponse);

      await requestNotificationPermissions();

      expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
    });

    it('returns push token when permission is granted', async () => {
      const token = await getExpoPushToken();

      expect(token).toBe('ExponentPushToken[test-token]');
    });

    it('returns null when permission is denied', async () => {
      // Reset all mocks and set denied status for both calls
      mockGetPermissionsAsync.mockReset();
      mockRequestPermissionsAsync.mockReset();
      mockGetPermissionsAsync.mockResolvedValue({
        status: 'denied',
        expires: 'never',
        granted: false,
        canAskAgain: false,
      } as Notifications.PermissionResponse);
      mockRequestPermissionsAsync.mockResolvedValue({
        status: 'denied',
        expires: 'never',
        granted: false,
        canAskAgain: false,
      } as Notifications.PermissionResponse);

      const token = await getExpoPushToken();

      expect(token).toBeNull();
    });

    it('configures notification handler', () => {
      configureNotificationHandler();

      expect(mockSetNotificationHandler).toHaveBeenCalled();
    });
  });

  describe('usePushNotifications hook', () => {
    it('registers push token with backend when authenticated', async () => {
      renderHook(() => usePushNotifications(), {
        wrapper: createWrapper(),
      });

      // Allow async operations to complete
      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalledWith(
          expect.objectContaining({
            pushToken: 'ExponentPushToken[test-token]',
          }),
          expect.any(Object)
        );
      });
    });

    it('does not register when not authenticated', async () => {
      mockIsAuthenticated.value = false;

      renderHook(() => usePushNotifications(), {
        wrapper: createWrapper(),
      });

      // Wait a tick and verify no mutation was called
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('sets up notification listeners when authenticated', async () => {
      renderHook(() => usePushNotifications(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(mockAddNotificationReceivedListener).toHaveBeenCalled();
        expect(mockAddNotificationResponseReceivedListener).toHaveBeenCalled();
      });
    });

    it('handles notification tap with deep link', async () => {
      let responseCallback: ((response: Notifications.NotificationResponse) => void) | undefined;
      mockAddNotificationResponseReceivedListener.mockImplementation((callback) => {
        responseCallback = callback;
        return { remove: jest.fn() };
      });

      renderHook(() => usePushNotifications(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(responseCallback).toBeDefined();
      });

      // Simulate notification tap
      const mockResponse = {
        notification: {
          request: {
            content: {
              data: { screen: '/session/123' },
            },
          },
        },
      } as unknown as Notifications.NotificationResponse;

      act(() => {
        responseCallback?.(mockResponse);
      });

      expect(mockRouterPush).toHaveBeenCalledWith('/session/123');
    });

    it('cleans up listeners on unmount', async () => {
      const mockRemove = jest.fn();
      mockAddNotificationReceivedListener.mockReturnValue({ remove: mockRemove });
      mockAddNotificationResponseReceivedListener.mockReturnValue({ remove: mockRemove });

      const { unmount } = renderHook(() => usePushNotifications(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(mockAddNotificationReceivedListener).toHaveBeenCalled();
      });

      unmount();

      // Each subscription's remove() should be called (at least 2 times for the 2 listeners)
      expect(mockRemove).toHaveBeenCalled();
      expect(mockRemove.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('notification preferences', () => {
    it('tracks permission status', async () => {
      const { result } = renderHook(() => usePushNotifications(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.permissionStatus).toBe('granted');
      });
    });

    it('exposes method to request permissions', async () => {
      const { result } = renderHook(() => usePushNotifications(), {
        wrapper: createWrapper(),
      });

      expect(typeof result.current.requestPermission).toBe('function');
    });

    it('updates permission status after requesting', async () => {
      // Start with undetermined
      mockGetPermissionsAsync.mockResolvedValue({
        status: 'undetermined',
        expires: 'never',
        granted: false,
        canAskAgain: true,
      } as Notifications.PermissionResponse);

      const { result } = renderHook(() => usePushNotifications(), {
        wrapper: createWrapper(),
      });

      // Wait for initial state
      await waitFor(() => {
        expect(result.current.permissionStatus).toBe('undetermined');
      });

      // Set up mocks for permission request
      mockRequestPermissionsAsync.mockResolvedValue({
        status: 'granted',
        expires: 'never',
        granted: true,
        canAskAgain: true,
      } as Notifications.PermissionResponse);
      mockGetPermissionsAsync.mockResolvedValue({
        status: 'granted',
        expires: 'never',
        granted: true,
        canAskAgain: true,
      } as Notifications.PermissionResponse);

      await act(async () => {
        await result.current.requestPermission();
      });

      await waitFor(() => {
        expect(result.current.permissionStatus).toBe('granted');
      });
    });
  });
});
