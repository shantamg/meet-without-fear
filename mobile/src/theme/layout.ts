import { Platform } from 'react-native';

export const APP_MAX_WIDTH = 480;

export const appWidthStyle = Platform.OS === 'web'
  ? {
      width: '100%' as const,
      maxWidth: APP_MAX_WIDTH,
      alignSelf: 'center' as const,
    }
  : {};

export const modalPageStyle = Platform.OS === 'web'
  ? {
      flex: 1,
      width: '100%' as const,
      alignItems: 'center' as const,
      backgroundColor: '#0f172a',
    }
  : {
      flex: 1,
    };
