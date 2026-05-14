import React from 'react';
import {
  KeyboardAvoidingView as RNKeyboardAvoidingView,
  NativeModules,
  Platform,
  TurboModuleRegistry,
} from 'react-native';
import type { KeyboardAvoidingViewProps as RNKeyboardAvoidingViewProps } from 'react-native';
import type { ViewProps } from 'react-native';

type KeyboardControllerModule = {
  KeyboardProvider?: React.ComponentType<React.PropsWithChildren>;
  KeyboardAvoidingView?: React.ComponentType<React.PropsWithChildren<RNKeyboardAvoidingViewProps>>;
  KeyboardStickyView?: React.ComponentType<React.PropsWithChildren<ViewProps>>;
};

let keyboardControllerModule: KeyboardControllerModule | null | undefined;

export function hasLinkedKeyboardController(): boolean {
  if (NativeModules.KeyboardController) {
    return true;
  }

  try {
    return Boolean(TurboModuleRegistry.get('KeyboardController'));
  } catch {
    return false;
  }
}

export function KeyboardStickyComposer({ children, ...props }: React.PropsWithChildren<ViewProps>) {
  const ControllerStickyView = getKeyboardControllerModule()?.KeyboardStickyView;

  if (ControllerStickyView) {
    return (
      <ControllerStickyView {...props}>
        {children}
      </ControllerStickyView>
    );
  }

  return <>{children}</>;
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
