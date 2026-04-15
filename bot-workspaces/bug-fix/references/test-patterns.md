# Test Patterns

## Backend Tests (vitest)

Backend services use vitest. Tests live alongside source files or in `__tests__/` directories.

### Mock Pattern

Always use `vi.hoisted()` + `vi.mock()` for dependency mocking:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 1. Hoist mock definitions (runs before imports)
const mockPrisma = vi.hoisted(() => ({
  recording: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

const mockService = vi.hoisted(() => ({
  processRecording: vi.fn(),
}));

// 2. Mock modules
vi.mock('../../../packages/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('../services/recordingService', () => ({
  recordingService: mockService,
}));

// 3. Import the module under test AFTER mocks
import { handler } from './route-handler';

describe('handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle the happy path', async () => {
    mockPrisma.recording.findUnique.mockResolvedValue({ id: '123' });
    // ... test logic
  });

  it('should handle the error case (regression test for bug)', async () => {
    mockPrisma.recording.findUnique.mockResolvedValue(null);
    // ... assert the fix works
  });
});
```

### Running Backend Tests

```bash
cd && pnpm test
# Or target a specific file:
cd && pnpm vitest run apps/gateway/src/services/insights/__tests__/healthService.test.ts
```

## Mobile Tests (jest-expo)

Mobile app uses jest-expo with React Native Testing Library.

### Component Test Pattern

```typescript
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { MyComponent } from '../MyComponent';

// Mock navigation
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent data={mockData} />);
    expect(screen.getByText('Expected Text')).toBeTruthy();
  });

  it('handles null data without crashing', () => {
    // Regression test for the bug
    render(<MyComponent data={null} />);
    expect(screen.getByText('No data')).toBeTruthy();
  });
});
```

### Running Mobile Tests

```bash
cd && pnpm test -- --selectProjects mobile
# Or target a specific file:
cd repo root apps/mobile && npx jest src/components/__tests__/MyComponent.test.tsx
```

## Bug Fix Test Strategy

When fixing a bug, write tests that:

1. **Reproduce the bug** -- a test that would have caught the original issue
2. **Verify the fix** -- the same test now passes with the fix
3. **Cover edge cases** -- null values, empty arrays, missing fields, boundary conditions

Name regression tests clearly:
```typescript
it('should not crash when health score is null (fixes #423)', () => {
  // ...
});
```
