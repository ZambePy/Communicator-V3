import React from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from './PressableScale';
import { opacity, radius, sizes, useTheme } from '@/theme';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  /** Obrigatório: o botão não tem texto visível, o leitor de tela lê isto. */
  accessibilityLabel: string;
  accessibilityHint?: string;
  onPress?: () => void;
  /** `plain` sem fundo · `tinted` fundo neutro · `primary` fundo azul claro · `onDark` vidro sobre gradiente. */
  variant?: 'plain' | 'tinted' | 'primary' | 'onDark';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Botão só de ícone, sempre com 48 × 48 dp de área de toque. */
export function IconButton({ icon, accessibilityLabel, accessibilityHint, onPress, variant = 'plain', disabled, style, testID }: Props) {
  const { colors } = useTheme();
  const bg = variant === 'tinted' ? colors.surfaceAlt : variant === 'primary' ? colors.primaryTint : variant === 'onDark' ? colors.onDarkFill : 'transparent';
  const fg = variant === 'onDark' ? colors.onDark : variant === 'primary' ? colors.primary : colors.text;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(disabled) }}
      testID={testID}
      style={[styles.base, { backgroundColor: bg }, disabled && { opacity: opacity.disabled }, style]}
    >
      <Ionicons name={icon} size={sizes.icon.md} color={fg} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { width: sizes.touch, height: sizes.touch, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
