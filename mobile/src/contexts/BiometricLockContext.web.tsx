import { createContext, useContext, type ReactNode } from 'react';

interface BiometricLockContextValue {
  isLocked: boolean;
  biometricName: string;
  shouldAutoTrigger: boolean;
  setShouldAutoTrigger: (value: boolean) => void;
  unlock: () => Promise<{ success: boolean; error?: string }>;
}

const BiometricLockContext = createContext<BiometricLockContextValue | undefined>(undefined);

export function BiometricLockProvider({ children }: { children: ReactNode }) {
  return (
    <BiometricLockContext.Provider
      value={{
        isLocked: false,
        biometricName: 'Biometrics',
        shouldAutoTrigger: false,
        setShouldAutoTrigger: () => {},
        unlock: async () => ({ success: false }),
      }}
    >
      {children}
    </BiometricLockContext.Provider>
  );
}

export function useBiometricLock() {
  const context = useContext(BiometricLockContext);
  if (!context) {
    throw new Error('useBiometricLock must be used within BiometricLockProvider');
  }
  return context;
}
