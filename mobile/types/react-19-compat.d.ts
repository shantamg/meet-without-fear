/**
 * React 19 / React Native type compatibility
 *
 * Using @types/react 18.x for compatibility with React Native.
 * React 19 runtime is used, but types are from React 18 to avoid
 * JSX component type issues.
 *
 * @see https://github.com/facebook/react-native/issues/48937
 */

// Extend lucide-react-native types for proper icon typing
declare module 'lucide-react-native' {
  import type { ComponentType } from 'react';
  import type { SvgProps } from 'react-native-svg';

  export interface LucideProps extends SvgProps {
    size?: number | string;
    color?: string;
    strokeWidth?: number | string;
    absoluteStrokeWidth?: boolean;
  }

  export type LucideIcon = ComponentType<LucideProps>;
}

export {};
