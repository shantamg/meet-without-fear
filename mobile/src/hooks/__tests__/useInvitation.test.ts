import { renderHook, waitFor, act } from '@testing-library/react-native';
import {
  useInvitationLink,
  usePendingInvitation,
  getPendingInvitation,
  clearPendingInvitation,
  createInvitationLink,
} from '../useInvitation';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Mock expo-linking
jest.mock('expo-linking', () => ({
  createURL: jest.fn((path) => `beheard://${path}`),
  parse: jest.fn((url) => {
    // Handle beheard:// scheme
    if (url.startsWith('beheard://')) {
      const path = url.replace('beheard://', '');
      return { path, queryParams: {} };
    }
    // Handle https:// scheme
    try {
      const parsed = new URL(url);
      return {
        path: parsed.pathname.slice(1),
        queryParams: Object.fromEntries(parsed.searchParams),
      };
    } catch {
      return { path: '', queryParams: {} };
    }
  }),
  getInitialURL: jest.fn(),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';

const mockGetItem = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;
const mockSetItem = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;
const mockRemoveItem = AsyncStorage.removeItem as jest.MockedFunction<typeof AsyncStorage.removeItem>;
const mockGetInitialURL = Linking.getInitialURL as jest.MockedFunction<typeof Linking.getInitialURL>;
const mockAddEventListener = Linking.addEventListener as jest.Mock;
const mockCreateURL = Linking.createURL as jest.MockedFunction<typeof Linking.createURL>;

describe('useInvitationLink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetInitialURL.mockResolvedValue(null);
    mockSetItem.mockResolvedValue();
  });

  it('returns null when no invitation URL', async () => {
    const { result } = renderHook(() => useInvitationLink());

    await waitFor(() => {
      expect(result.current).toBeNull();
    });
  });

  it('extracts invitation ID from initial URL', async () => {
    mockGetInitialURL.mockResolvedValue('beheard://invitation/abc123');

    const { result } = renderHook(() => useInvitationLink());

    await waitFor(() => {
      expect(result.current).toBe('abc123');
    });

    expect(mockSetItem).toHaveBeenCalledWith('pending_invitation', 'abc123');
  });

  it('handles https URL format', async () => {
    mockGetInitialURL.mockResolvedValue('https://beheard.app/invitation/xyz789');

    const { result } = renderHook(() => useInvitationLink());

    await waitFor(() => {
      expect(result.current).toBe('xyz789');
    });
  });

  it('subscribes to URL events', () => {
    renderHook(() => useInvitationLink());

    expect(mockAddEventListener).toHaveBeenCalledWith('url', expect.any(Function));
  });

  it('cleans up URL listener on unmount', () => {
    const removeFn = jest.fn();
    (mockAddEventListener as jest.Mock).mockReturnValue({ remove: removeFn });

    const { unmount } = renderHook(() => useInvitationLink());

    unmount();

    expect(removeFn).toHaveBeenCalled();
  });

  it('handles URL events while running', async () => {
    let urlHandler: (event: { url: string }) => void;
    (mockAddEventListener as jest.Mock).mockImplementation((event: string, handler: (event: { url: string }) => void) => {
      urlHandler = handler;
      return { remove: jest.fn() };
    });

    const { result } = renderHook(() => useInvitationLink());

    // Simulate receiving a URL event
    await act(async () => {
      urlHandler({ url: 'beheard://invitation/event123' });
    });

    await waitFor(() => {
      expect(result.current).toBe('event123');
    });
  });
});

describe('usePendingInvitation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockRemoveItem.mockResolvedValue();
  });

  it('starts with loading state', () => {
    const { result } = renderHook(() => usePendingInvitation());

    expect(result.current.isLoading).toBe(true);
  });

  it('returns null when no pending invitation', async () => {
    mockGetItem.mockResolvedValue(null);

    const { result } = renderHook(() => usePendingInvitation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.pendingInvitation).toBeNull();
  });

  it('returns pending invitation from storage', async () => {
    mockGetItem.mockResolvedValue('stored-invitation-id');

    const { result } = renderHook(() => usePendingInvitation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.pendingInvitation).toBe('stored-invitation-id');
  });

  it('clears invitation when clearInvitation is called', async () => {
    mockGetItem.mockResolvedValue('to-clear-id');

    const { result } = renderHook(() => usePendingInvitation());

    await waitFor(() => {
      expect(result.current.pendingInvitation).toBe('to-clear-id');
    });

    await act(async () => {
      await result.current.clearInvitation();
    });

    expect(mockRemoveItem).toHaveBeenCalledWith('pending_invitation');
    expect(result.current.pendingInvitation).toBeNull();
  });
});

describe('getPendingInvitation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns invitation ID from storage', async () => {
    mockGetItem.mockResolvedValue('invitation-from-storage');

    const result = await getPendingInvitation();

    expect(result).toBe('invitation-from-storage');
    expect(mockGetItem).toHaveBeenCalledWith('pending_invitation');
  });

  it('returns null when no invitation stored', async () => {
    mockGetItem.mockResolvedValue(null);

    const result = await getPendingInvitation();

    expect(result).toBeNull();
  });

  it('handles storage errors gracefully', async () => {
    // Suppress console.error for this test
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetItem.mockRejectedValue(new Error('Storage error'));

    const result = await getPendingInvitation();

    expect(result).toBeNull();
    consoleSpy.mockRestore();
  });
});

describe('clearPendingInvitation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRemoveItem.mockResolvedValue();
  });

  it('removes invitation from storage', async () => {
    await clearPendingInvitation();

    expect(mockRemoveItem).toHaveBeenCalledWith('pending_invitation');
  });

  it('handles storage errors gracefully', async () => {
    // Suppress console.error for this test
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockRemoveItem.mockRejectedValue(new Error('Storage error'));

    // Should not throw
    await expect(clearPendingInvitation()).resolves.toBeUndefined();

    consoleSpy.mockRestore();
  });
});

describe('createInvitationLink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateURL.mockImplementation((path) => `beheard://${path}`);
  });

  it('creates invitation link with ID', () => {
    const link = createInvitationLink('my-invitation-123');

    expect(link).toBe('beheard://invitation/my-invitation-123');
    expect(mockCreateURL).toHaveBeenCalledWith('invitation/my-invitation-123');
  });
});

describe('invitation flow integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetItem.mockResolvedValue();
    mockGetItem.mockResolvedValue(null);
    mockRemoveItem.mockResolvedValue();
  });

  it('preserves invitation through auth flow', async () => {
    // 1. User opens app with invitation link
    mockGetInitialURL.mockResolvedValue('beheard://invitation/auth-flow-test');

    const { result: linkResult } = renderHook(() => useInvitationLink());

    await waitFor(() => {
      expect(linkResult.current).toBe('auth-flow-test');
    });

    // 2. Invitation is stored
    expect(mockSetItem).toHaveBeenCalledWith('pending_invitation', 'auth-flow-test');

    // 3. After auth completes, retrieve pending invitation
    mockGetItem.mockResolvedValue('auth-flow-test');

    const { result: pendingResult } = renderHook(() => usePendingInvitation());

    await waitFor(() => {
      expect(pendingResult.current.pendingInvitation).toBe('auth-flow-test');
    });

    // 4. After joining session, clear invitation
    await act(async () => {
      await pendingResult.current.clearInvitation();
    });

    expect(mockRemoveItem).toHaveBeenCalledWith('pending_invitation');
  });
});
