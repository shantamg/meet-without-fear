import React from 'react';
import {
  KeyboardAvoidingView as RNKeyboardAvoidingView,
  NativeModules,
  Platform,
  TurboModuleRegistry,
} from 'react-native';
import type { KeyboardAvoidingViewProps as RNKeyboardAvoidingViewProps } from 'react-native';

type KeyboardControllerModule = {
  KeyboardProvider?: React.ComponentType<React.PropsWithChildren>;
  KeyboardAvoidingView?: React.ComponentType<React.PropsWithChildren<RNKeyboardAvoidingViewProps>>;
};

let keyboardControllerModule: KeyboardControllerModule | null | undefined;

function hasLinkedKeyboardController(): boolean {
  if (NativeModules.KeyboardController) {
    return true;
  }

  try {
    return Boolean(TurboModuleRegistry.get('KeyboardController'));
  } catch {
    return false;
  }
}

function getKeyboardControllerModule(): KeyboardControllerModule | null {
  if (Platform.OS === 'web') {
    return null;
  }

  if (keyboardControllerModule !== undefined) {
    return keyboardControllerModule;
  }

  if (!hasLinkedKeyboardController()) {
    keyboardControllerModule = null;
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    keyboardControllerModule = require('react-native-keyboard-controller');
  } catch {
    keyboardControllerModule = null;
  }

  return keyboardControllerModule ?? null;
}

export function KeyboardControllerProvider({ children }: React.PropsWithChildren) {
  const Provider = getKeyboardControllerModule()?.KeyboardProvider;
  return Provider ? <Provider>{children}</Provider> : <>{children}</>;
}

export function KeyboardAwareAvoidingView({ children, ...props }: React.PropsWithChildren<RNKeyboardAvoidingViewProps>) {
  const ControllerAvoidingView = getKeyboardControllerModule()?.KeyboardAvoidingView;

  if (ControllerAvoidingView) {
    return (
      <ControllerAvoidingView {...props}>
        {children}
      </ControllerAvoidingView>
    );
  }

  return (
    <RNKeyboardAvoidingView {...props}>
      {children}
    </RNKeyboardAvoidingView>
  );
}
