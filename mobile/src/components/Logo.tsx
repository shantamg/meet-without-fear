/**
 * Logo Component
 *
 * Renders the Meet Without Fear logo (two overlapping circles)
 * Uses the brand accent color from theme.
 */

import Svg, { Circle } from 'react-native-svg';
import { colors } from '../theme';

interface LogoProps {
  /** Width of the logo (height auto-calculated based on aspect ratio) */
  size?: number;
  /** Override the default accent color */
  color?: string;
}

/**
 * Meet Without Fear logo - two overlapping circles
 * representing connection and partnership
 */
export function Logo({ size = 120, color = colors.accent }: LogoProps) {
  // Logo aspect ratio is roughly 240:140 (width:height)
  const height = size * (140 / 240);
  const strokeWidth = size * (10 / 240);
  const radius = size * (50 / 240);

  // Center positions scaled to size
  const leftCx = size * (95 / 240);
  const rightCx = size * (145 / 240);
  const cy = height / 2;

  return (
    <Svg width={size} height={height} viewBox="0 0 240 140">
      {/* Left circle */}
      <Circle
        cx="95"
        cy="70"
        r="50"
        fill="none"
        stroke={color}
        strokeWidth="10"
      />
      {/* Right circle */}
      <Circle
        cx="145"
        cy="70"
        r="50"
        fill="none"
        stroke={color}
        strokeWidth="10"
      />
    </Svg>
  );
}
