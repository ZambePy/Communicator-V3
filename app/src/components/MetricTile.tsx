import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { Text } from './Text';
import { radius, spacing, useTheme } from '@/theme';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  hint?: string;
  tone?: 'primary' | 'accent' | 'warning' | 'danger';
  index?: number;
}

export function MetricTile({ icon, label, value, hint, tone = 'primary', index = 0 }: Props) {
  const { colors } = useTheme();
  const color = tone === 'accent' ? colors.accent : tone === 'warning' ? colors.warning : tone === 'danger' ? colors.danger : colors.primary;
  const bg = tone === 'accent' ? colors.accentTint : tone === 'warning' ? colors.warningTint : tone === 'danger' ? colors.dangerTint : colors.primaryTint;
  return (
    <Card index={index} style={styles.tile} padding={spacing.md}>
      <View style={[styles.icon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text variant="h2" weight="bold" style={{ marginTop: spacing.sm }}>
        {value}
      </Text>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      {hint && (
        <Text variant="caption" style={{ color, marginTop: 2 }}>
          {hint}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, minWidth: 140 },
  icon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});
