/**
 * Logo Component
 *
 * Renders the Meet Without Fear logo - two interlocked speech bubbles
 * Blue (left) and Orange (right) representing connection and partnership
 */

import Svg, { Path } from 'react-native-svg';
import { colors } from '../theme';

interface LogoProps {
  /** Width of the logo (height auto-calculated based on aspect ratio) */
  size?: number;
}

/**
 * Meet Without Fear logo - two interlocked speech bubbles
 * Blue on left, orange on right, with curved tails
 */
export function Logo({ size = 120 }: LogoProps) {
  // Logo aspect ratio is 260:150 (width:height)
  const height = size * (150 / 260);

  return (
    <Svg width={size} height={height} viewBox="0 0 260 150">
      {/* Right ellipse bottom half with gap for tail (back layer) */}
      <Path
        d="M 105,70 A 60,45 0 0,0 185,112"
        fill="none"
        stroke={colors.brandOrange}
        strokeWidth="10"
        strokeLinecap="round"
      />
      <Path
        d="M 207,102 A 60,45 0 0,0 225,70"
        fill="none"
        stroke={colors.brandOrange}
        strokeWidth="10"
        strokeLinecap="round"
      />

      {/* Right speech bubble tail (back layer) */}
      <Path
        d="M 207,102 Q 220,118 215,128 Q 198,115 185,112"
        fill="none"
        stroke={colors.brandOrange}
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Left ellipse with gap for tail (middle layer) */}
      <Path
        d="M 53,102 A 60,45 0 1,1 75,112"
        fill="none"
        stroke={colors.brandBlue}
        strokeWidth="10"
        strokeLinecap="round"
      />

      {/* Speech bubble tail connecting the gap */}
      <Path
        d="M 53,102 Q 40,118 45,128 Q 62,115 75,112"
        fill="none"
        stroke={colors.brandBlue}
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Right ellipse top half (front layer) */}
      <Path
        d="M 105,70 A 60,45 0 0,1 225,70"
        fill="none"
        stroke={colors.brandOrange}
        strokeWidth="10"
      />
    </Svg>
  );
}
