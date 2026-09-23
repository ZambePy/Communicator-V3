import React from 'react';
import { Text as RNText, TextProps as RNTextProps, StyleSheet } from 'react-native';
import { fonts, fontScaleCap, typeScale, TypeVariant, useTheme } from '@/theme';

export type TextTone = 'default' | 'muted' | 'primary' | 'accent' | 'danger' | 'warning' | 'onPrimary' | 'onDark' | 'onDarkMuted';
export type TextWeight = 'regular' | 'medium' | 'semibold' | 'bold' | 'display';

export interface TextProps extends RNTextProps {
  variant?: TypeVariant;
  tone?: TextTone;
  weight?: TextWeight;
  center?: boolean;
}

/**
 * Tipografia da IrisFlow (Inter). Tamanho, altura de linha e tracking vêm de
 * `typeScale`; o limite de ampliação pela fonte do sistema, de `fontScaleCap`
 * (o corpo acompanha até 2×). `tone` escolhe só cores que passam em AA.
 */
export function Text({ variant = 'body', tone = 'default', weight, center, style, maxFontSizeMultiplier, ...rest }: TextProps) {
  const { colors } = useTheme();
  const color: Record<TextTone, string> = {
    default: colors.text,
    muted: colors.textMuted,
    primary: colors.primary,
    accent: colors.accentText,
    danger: colors.dangerText,
    warning: colors.warningText,
    onPrimary: colors.onPrimary,
    onDark: colors.onDark,
    onDarkMuted: colors.onDarkMuted,
  };
  const family = fonts[weight ?? defaultWeight(variant)];

  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? fontScaleCap[variant]}
      {...rest}
      style={[styles.base, typeScale[variant], variant === 'label' && styles.label, { color: color[tone], fontFamily: family }, center && styles.center, style]}
    />
  );
}

function defaultWeight(v: TypeVariant): TextWeight {
  switch (v) {
    case 'display':
      return 'display';
    case 'h1':
    case 'h2':
      return 'bold';
    case 'h3':
    case 'label':
    case 'tab':
    case 'badge':
      return 'semibold';
    case 'caption':
      return 'medium';
    default:
      return 'regular';
  }
}

const styles = StyleSheet.create({
  base: { includeFontPadding: false },
  center: { textAlign: 'center' },
  label: { textTransform: 'uppercase' },
});
