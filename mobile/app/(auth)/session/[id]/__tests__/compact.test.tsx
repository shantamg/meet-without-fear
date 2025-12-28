import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import CompactScreen from '../compact';

// Mock expo-router
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'session-123' }),
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

describe('CompactScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to the onboarding flow for the session', async () => {
    render(<CompactScreen />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/session/session-123/onboarding');
    });
  });
});
