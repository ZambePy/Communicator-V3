import React from 'react';
import { Text as RNText, TextProps as RNTextProps, StyleSheet } from 'react-native';
import { fonts, typeScale, useTheme } from '@/theme';

type Variant = 'display' | 'h1' | 'h2' | 'h3' | 'body' | 'bodySmall' | 'caption' | 'label';
type Tone = 'default' | 'muted' | 'primary' | 'accent' | 'danger' | 'onPrimary' | 'warning';

export interface TextProps extends RNTextProps {
  variant?: Variant;
  tone?: Tone;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  center?: boolean;
}

/**
 * Tipografia da IrisFlow: fonte do sistema em peso forte nos títulos de destaque (display/h1),
 * Inter no restante. Corpo mínimo de 15 px e contraste alto, conforme a regra tipográfica do plano.
 */
export function Text({ variant = 'body', tone = 'default', weight, center, style, ...rest }: TextProps) {
  const { colors } = useTheme();
  const color =
    tone === 'muted'
      ? colors.textMuted
      : tone === 'primary'
        ? colors.primary
        : tone === 'accent'
          ? colors.accent
          : tone === 'danger'
            ? colors.danger
            : tone === 'warning'
              ? colors.warning
              : tone === 'onPrimary'
                ? colors.textOnPrimary
                : colors.text;

  const isDisplay = variant === 'display' || variant === 'h1';
  const family = isDisplay ? fonts.display : fonts[weight ?? defaultWeight(variant)];

  return <RNText {...rest} style={[styles.base, styles[variant], { color, fontFamily: family }, center && styles.center, style]} />;
}

function defaultWeight(v: Variant): 'regular' | 'medium' | 'semibold' | 'bold' {
  switch (v) {
    case 'h2':
    case 'h3':
      return 'bold';
    case 'label':
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
  // display/h1 usam a fonte do sistema: o peso vem de fontWeight, não do nome da família.
  display: { fontSize: typeScale.display, lineHeight: typeScale.display * 1.35, letterSpacing: -0.5, fontWeight: '700' },
  h1: { fontSize: typeScale.h1, lineHeight: typeScale.h1 * 1.35, fontWeight: '700' },
  h2: { fontSize: typeScale.h2, lineHeight: typeScale.h2 * 1.3 },
  h3: { fontSize: typeScale.h3, lineHeight: typeScale.h3 * 1.35 },
  body: { fontSize: typeScale.body, lineHeight: typeScale.body * 1.5 },
  bodySmall: { fontSize: typeScale.bodySmall, lineHeight: typeScale.bodySmall * 1.45 },
  caption: { fontSize: typeScale.caption, lineHeight: typeScale.caption * 1.4, letterSpacing: 0.2 },
  label: { fontSize: 13, lineHeight: 18, letterSpacing: 0.8, textTransform: 'uppercase' },
});
