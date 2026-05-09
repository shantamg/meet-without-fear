import { ArrowLeft } from 'lucide-react-native';
import { Pressable, StyleSheet } from 'react-native';

import { useAppAppearance } from '../theme';

interface HeaderBackButtonProps {
  onPress: () => void;
  accessibilityLabel?: string;
  testID?: string;
}

export function HeaderBackButton({
  onPress,
  accessibilityLabel = 'Go back',
  testID,
}: HeaderBackButtonProps) {
  const { palette } = useAppAppearance();

  return (
    <Pressable
      style={styles.button}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      testID={testID}
    >
      <ArrowLeft color={palette.textMuted} size={24} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
