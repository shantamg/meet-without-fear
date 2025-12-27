/**
 * React 19 compatibility type augmentations
 *
 * This file fixes type compatibility issues between React 19's stricter JSX types
 * and libraries that use ForwardRefExoticComponent (lucide-react-native, react-native-safe-area-context).
 *
 * @see https://github.com/lucide-icons/lucide/issues/2718
 */
import type { JSX } from 'react';

declare module 'react' {
  // Extend JSX.ElementType to accept ForwardRefExoticComponent
  // This fixes the "cannot be used as a JSX component" error
  interface ExoticComponent<P = object> {
    (props: P): JSX.Element | null;
  }
}

// Extend lucide-react-native types to be compatible with React 19
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
