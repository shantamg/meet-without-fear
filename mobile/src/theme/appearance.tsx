import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, ColorSchemeName } from 'react-native';

export type AppearancePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'mwf.appearancePreference';

export const appPalettes = {
  light: {
    bg: '#f6f3ec',
    bgElev: '#ffffff',
    bgPane: '#fbf9f4',
    border: 'rgba(28, 25, 20, 0.08)',
    borderStrong: 'rgba(28, 25, 20, 0.14)',
    divider: 'rgba(28, 25, 20, 0.07)',
    text: '#1a1815',
    textMuted: '#6c6961',
    textFaint: '#9a978d',
    selected: 'rgba(28, 25, 20, 0.06)',
    chipBg: 'rgba(28, 25, 20, 0.05)',
    accent: '#b7742f',
    accentSoft: '#f2e4c9',
    accentText: '#8a4f19',
    success: '#3a8b63',
    successSoft: '#e7f1e9',
    warning: '#b7742f',
    warningSoft: '#f4e6cf',
    info: '#517884',
    infoSoft: '#e3eef0',
    progressPending: 'rgba(28, 25, 20, 0.14)',
    danger: '#dc3f3f',
    dangerSoft: '#f8dddd',
    overlay: 'rgba(20, 18, 15, 0.46)',
    scrim: 'rgba(20, 18, 15, 0.58)',
  },
  dark: {
    bg: '#0d0f12',
    bgElev: '#14171c',
    bgPane: '#11141a',
    border: 'rgba(255, 250, 240, 0.07)',
    borderStrong: 'rgba(255, 250, 240, 0.14)',
    divider: 'rgba(255, 250, 240, 0.06)',
    text: '#ece9e1',
    textMuted: '#9b988e',
    textFaint: '#65635c',
    selected: 'rgba(255, 250, 240, 0.06)',
    chipBg: 'rgba(255, 250, 240, 0.06)',
    accent: '#b8824a',
    accentSoft: '#33291f',
    accentText: '#d0a06d',
    success: '#b6aa79',
    successSoft: 'rgba(182, 170, 121, 0.16)',
    warning: '#b8824a',
    warningSoft: 'rgba(184, 130, 74, 0.16)',
    info: '#8aa7ac',
    infoSoft: 'rgba(138, 167, 172, 0.16)',
    progressPending: 'rgba(255, 250, 240, 0.14)',
    danger: '#ef4444',
    dangerSoft: 'rgba(239, 68, 68, 0.16)',
    overlay: 'rgba(0, 0, 0, 0.56)',
    scrim: 'rgba(0, 0, 0, 0.68)',
  },
} as const;

type PaletteName = keyof typeof appPalettes.light;
type Palette = Record<PaletteName, string>;

interface AppearanceContextValue {
  preference: AppearancePreference;
  scheme: 'light' | 'dark';
  palette: Palette;
  setPreference: (preference: AppearancePreference) => Promise<void>;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function resolveScheme(preference: AppearancePreference, systemScheme: ColorSchemeName) {
  if (preference === 'system') return systemScheme === 'dark' ? 'dark' : 'light';
  return preference;
}

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<AppearancePreference>('system');
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(Appearance.getColorScheme());

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (
          mounted &&
          (stored === 'system' || stored === 'light' || stored === 'dark')
        ) {
          setPreferenceState(stored);
        }
      })
      .catch(() => {});

    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const setPreference = async (nextPreference: AppearancePreference) => {
    setPreferenceState(nextPreference);
    await AsyncStorage.setItem(STORAGE_KEY, nextPreference);
  };

  const scheme = resolveScheme(preference, systemScheme);
  const value = useMemo(
    () => ({
      preference,
      scheme,
      palette: appPalettes[scheme],
      setPreference,
    }),
    [preference, scheme]
  );

  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) {
    const scheme = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
    return {
      preference: 'system' as const,
      scheme,
      palette: appPalettes[scheme] as Palette,
      setPreference: async () => {},
    };
  }
  return context;
}
