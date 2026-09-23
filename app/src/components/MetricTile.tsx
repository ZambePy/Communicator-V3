import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { Text } from './Text';
import { radius, sizes, spacing, useTheme } from '@/theme';

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
      <View style={[styles.icon, { backgroundColor: cor.bg }]}>
        <Ionicons name={icon} size={sizes.icon.sm} color={cor.fg} />
      </View>
      <Text variant="h2" style={styles.value}>
        {value}
      </Text>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
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
  icon: { width: sizes.tile.sm, height: sizes.tile.sm, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  value: { marginTop: spacing.md },
  hint: { marginTop: spacing.xxs },
});
