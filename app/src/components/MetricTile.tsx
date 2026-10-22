import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { Text } from './Text';
import { sizes, spacing, useTheme } from '@/theme';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  hint?: string;
  tone?: 'primary' | 'accent' | 'warning' | 'danger';
  index?: number;
}

/** Número de destaque com rótulo curto. Dois por linha; quebram para uma coluna com fonte grande. */
export function MetricTile({ icon, label, value, hint, tone = 'primary', index }: Props) {
  const { colors } = useTheme();
  const cor = {
    primary: { fg: colors.primary, bg: colors.primaryTint, text: colors.primary },
    accent: { fg: colors.accentText, bg: colors.accentTint, text: colors.accentText },
    warning: { fg: colors.warningText, bg: colors.warningTint, text: colors.warningText },
    danger: { fg: colors.dangerText, bg: colors.dangerTint, text: colors.dangerText },
  }[tone];
  return (
    <Card index={index} style={styles.tile} padding={spacing.lg} accessibilityLabel={[value, label, hint].filter(Boolean).join(', ')}>
      <Text variant="h1">{value}</Text>
      <View style={styles.label}>
        <Ionicons name={icon} size={sizes.icon.xs} color={cor.fg} />
        <Text variant="caption" tone="muted" style={styles.flexShrink}>
          {label}
        </Text>
      </View>
      {hint ? (
        <Text variant="caption" style={[styles.hint, { color: cor.text }]}>
          {hint}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  tile: { flexGrow: 1, flexBasis: '40%' },
  label: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xxs },
  flexShrink: { flexShrink: 1 },
  hint: { marginTop: spacing.xxs },
});
