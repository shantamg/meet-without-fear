# Auth Flow Implementation

## Source Documentation

- [Auth Flow Wireframes](../../docs/mvp-planning/plans/wireframes/auth-flow.md)
- [Auth API](../../docs/mvp-planning/plans/backend/api/auth.md)

## Prerequisites

- [ ] `mobile/navigation.md` complete

## External Services Required

> **User action needed:** Configure Clerk for mobile

1. **Get Clerk publishable key** (from auth.md setup)

2. **Install Clerk Expo SDK:**
   ```bash
   cd mobile
   npx expo install @clerk/clerk-expo
   ```

3. **Add to environment:**
   ```bash
   # mobile/.env or app.config.js
   EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
   ```

## Scope

Implement Clerk authentication flow with login, signup, and session management.

## Implementation Steps

### 1. Write tests first

Create `mobile/src/__tests__/auth.test.tsx`:

```typescript
describe('Auth Flow', () => {
  it('redirects to login when not authenticated', () => {
    // Render app without auth, verify login screen shown
  });

  it('shows home after successful login', () => {
    // Mock successful auth, verify navigation to home
  });

  it('preserves invitation through auth flow', () => {
    // Open with invitation link, complete auth, verify landed on session
  });
});
```

### 2. Set up Clerk provider

Update `mobile/app/_layout.tsx`:

```typescript
import { ClerkProvider, ClerkLoaded } from '@clerk/clerk-expo';
import * as SecureStore from 'expo-secure-store';

const tokenCache = {
  async getToken(key: string) {
    return SecureStore.getItemAsync(key);
  },
  async saveToken(key: string, value: string) {
    return SecureStore.setItemAsync(key, value);
  },
};

export default function RootLayout() {
  return (
    <ClerkProvider
      publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!}
      tokenCache={tokenCache}
    >
      <ClerkLoaded>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(public)" />
        </Stack>
      </ClerkLoaded>
    </ClerkProvider>
  );
}
```

### 3. Create auth hook

Update `mobile/src/hooks/useAuth.ts`:

```typescript
import { useAuth as useClerkAuth, useUser } from '@clerk/clerk-expo';
import { useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';

export function useAuth() {
  const { isLoaded, isSignedIn, getToken } = useClerkAuth();
  const { user } = useUser();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!isSignedIn && inAuthGroup) {
      router.replace('/login');
    } else if (isSignedIn && !inAuthGroup) {
      router.replace('/');
    }
  }, [isSignedIn, segments, isLoaded]);

  return {
    isAuthenticated: isSignedIn,
    isLoading: !isLoaded,
    user,
    getToken
  };
}
```

### 4. Create login screen

Create `mobile/app/(public)/login.tsx`:

```typescript
import { useSignIn } from '@clerk/clerk-expo';
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';

export default function LoginScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);

  const onSendCode = async () => {
    if (!isLoaded) return;

    await signIn.create({
      identifier: email,
    });

    const emailFactor = signIn.supportedFirstFactors?.find(
      (f) => f.strategy === 'email_code'
    );

    if (emailFactor) {
      await signIn.prepareFirstFactor({
        strategy: 'email_code',
        emailAddressId: emailFactor.emailAddressId,
      });
      setPendingVerification(true);
    }
  };

  const onVerify = async () => {
    if (!isLoaded) return;

    const result = await signIn.attemptFirstFactor({
      strategy: 'email_code',
      code,
    });

    if (result.status === 'complete') {
      await setActive({ session: result.createdSessionId });
    }
  };

  if (pendingVerification) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Enter code</Text>
        <Text style={styles.subtitle}>We sent a code to {email}</Text>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={setCode}
          placeholder="000000"
          keyboardType="number-pad"
          maxLength={6}
        />
        <TouchableOpacity style={styles.button} onPress={onVerify}>
          <Text style={styles.buttonText}>Verify</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign in</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TouchableOpacity style={styles.button} onPress={onSendCode}>
        <Text style={styles.buttonText}>Send code</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 24 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    padding: 16, fontSize: 16, marginBottom: 16
  },
  button: {
    backgroundColor: '#4F46E5', padding: 16, borderRadius: 8,
    alignItems: 'center'
  },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '600' }
});
```

### 5. Create signup screen

Create `mobile/app/(public)/signup.tsx` (similar to login with `useSignUp`).

### 6. Handle invitation deep links

Create `mobile/src/hooks/useInvitation.ts`:

```typescript
import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function useInvitationLink() {
  useEffect(() => {
    const handleUrl = async (event: { url: string }) => {
      const { path, queryParams } = Linking.parse(event.url);
      if (path?.startsWith('invitation/')) {
        const invitationId = path.split('/')[1];
        await AsyncStorage.setItem('pendingInvitation', invitationId);
      }
    };

    const subscription = Linking.addEventListener('url', handleUrl);

    // Check initial URL
    Linking.getInitialURL().then(url => {
      if (url) handleUrl({ url });
    });

    return () => subscription.remove();
  }, []);
}

export async function getPendingInvitation(): Promise<string | null> {
  return AsyncStorage.getItem('pendingInvitation');
}

export async function clearPendingInvitation() {
  await AsyncStorage.removeItem('pendingInvitation');
}
```

### 7. Install dependencies

```bash
npx expo install expo-secure-store @react-native-async-storage/async-storage
```

### 8. Run verification

```bash
npm run check
npm run test
npx expo start  # Manual verification
```

## Verification

- [ ] Clerk provider wraps app
- [ ] Login with email code works
- [ ] Signup with email code works
- [ ] Auth state persists across app restart
- [ ] Invitation link preserved through auth
- [ ] Logged-in users redirected to home
- [ ] `npm run check` passes
- [ ] `npm run test` passes
