import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { radius, spacing, useTheme } from '@/theme';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  tone?: 'primary' | 'accent' | 'danger' | 'warning' | 'muted';
  last?: boolean;
}

export function ListRow({ icon, title, subtitle, onPress, right, tone = 'primary', last }: Props) {
  const { colors } = useTheme();
  const color = tone === 'accent' ? colors.accent : tone === 'danger' ? colors.danger : tone === 'warning' ? colors.warning : tone === 'muted' ? colors.textMuted : colors.primary;
  const bg = tone === 'accent' ? colors.accentTint : tone === 'danger' ? colors.dangerTint : tone === 'warning' ? colors.warningTint : tone === 'muted' ? colors.surfaceAlt : colors.primaryTint;
  return (
    <PressableScale onPress={onPress} disabled={!onPress} scaleTo={0.985} style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      <View style={[styles.icon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="body" weight="medium">
          {title}
        </Text>
        {subtitle && (
          <Text variant="caption" tone="muted">
            {subtitle}
          </Text>
        )}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null)}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  icon: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});
