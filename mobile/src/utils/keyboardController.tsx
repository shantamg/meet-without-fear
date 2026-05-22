import React from 'react';
import {
  KeyboardAvoidingView as RNKeyboardAvoidingView,
  NativeModules,
  Platform,
  TurboModuleRegistry,
} from 'react-native';
import Reanimated, { useAnimatedStyle } from 'react-native-reanimated';
import type { KeyboardAvoidingViewProps as RNKeyboardAvoidingViewProps } from 'react-native';
import type { ViewProps } from 'react-native';

type KeyboardStickyComposerProps = ViewProps & {
  offset?: {
    closed?: number;
    opened?: number;
  };
  enabled?: boolean;
};

type KeyboardControllerModule = {
  KeyboardProvider?: React.ComponentType<React.PropsWithChildren>;
  KeyboardAvoidingView?: React.ComponentType<React.PropsWithChildren<RNKeyboardAvoidingViewProps>>;
  KeyboardStickyView?: React.ComponentType<React.PropsWithChildren<KeyboardStickyComposerProps>>;
  useReanimatedKeyboardAnimation?: () => {
    height: { value: number };
    progress: { value: number };
  };
};

let keyboardControllerModule: KeyboardControllerModule | null | undefined;

export function hasLinkedKeyboardController(): boolean {
  if (__DEV__ && process.env.EXPO_PUBLIC_ENABLE_NATIVE_KEYBOARD_CONTROLLER !== 'true') {
    return false;
  }

  if (NativeModules.KeyboardController) {
    return true;
  }

  try {
    return Boolean(TurboModuleRegistry.get('KeyboardController'));
  } catch {
    return false;
  }
}

export function KeyboardStickyComposer({ children, ...props }: React.PropsWithChildren<KeyboardStickyComposerProps>) {
  const module = getKeyboardControllerModule();

  if (module?.useReanimatedKeyboardAnimation) {
    return (
      <LinkedKeyboardStickyComposer
        {...props}
        useReanimatedKeyboardAnimation={module.useReanimatedKeyboardAnimation}
      >
        {children}
      </LinkedKeyboardStickyComposer>
    );
  }

  return <>{children}</>;
}

function LinkedKeyboardStickyComposer({
  children,
  offset: { closed = 0, opened = 0 } = {},
  style,
  enabled = true,
  useReanimatedKeyboardAnimation,
  ...props
}: React.PropsWithChildren<KeyboardStickyComposerProps> & {
  useReanimatedKeyboardAnimation: NonNullable<KeyboardControllerModule['useReanimatedKeyboardAnimation']>;
}) {
  const { height, progress } = useReanimatedKeyboardAnimation();
  const animatedStyle = useAnimatedStyle(() => {
    const insetOffset = progress.value > 0.001 ? opened : closed;
    return {
      transform: [{ translateY: enabled ? height.value + insetOffset : closed }],
    };
  }, [closed, opened, enabled]);

  return (
    <Reanimated.View style={[style, animatedStyle]} {...props}>
      {children}
    </Reanimated.View>
  );
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
