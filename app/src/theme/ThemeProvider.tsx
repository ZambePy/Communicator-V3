import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useReducedMotion } from 'react-native-reanimated';
import { darkColors, lightColors, ThemeColors, ThemeMode } from './tokens';

export type ThemePreference = 'system' | ThemeMode;

interface ThemeContextValue {
  colors: ThemeColors;
  mode: ThemeMode;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  /**
   * "Reduzir movimento" do sistema. Parte do `useReducedMotion` do Reanimated
   * (o valor na abertura do app) e acompanha a mudança feita com o app aberto —
   * um único ouvinte aqui, em vez de um por componente animado.
   */
  reduceMotion: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: lightColors,
  mode: 'light',
  preference: 'system',
  setPreference: () => undefined,
  reduceMotion: false,
});

const STORAGE_KEY = '@irisflow/theme-preference';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const reduceMotionNaAbertura = useReducedMotion();
  const [reduceMotion, setReduceMotion] = useState(reduceMotionNaAbertura);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (v === 'light' || v === 'dark' || v === 'system') setPreferenceState(v);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduceMotion(Boolean(v)));
    return () => sub?.remove?.();
  }, []);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    AsyncStorage.setItem(STORAGE_KEY, p).catch(() => undefined);
  }, []);

  const mode: ThemeMode = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo<ThemeContextValue>(
    () => ({ colors: mode === 'dark' ? darkColors : lightColors, mode, preference, setPreference, reduceMotion }),
    [mode, preference, setPreference, reduceMotion],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

/** Atalho: `true` quando as animações devem ser cortadas. */
export function useReduceMotion(): boolean {
  return useContext(ThemeContext).reduceMotion;
}
