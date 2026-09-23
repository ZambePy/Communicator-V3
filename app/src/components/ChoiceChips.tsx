import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { haptics } from '@/lib/haptics';
import { radius, sizes, spacing, useTheme } from '@/theme';

interface Option<T extends string> {
  value: T;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  accessibilityLabel?: string;
}

/**
 * Escolha única em "chips" com ícone, que quebram linha quando falta espaço —
 * para rótulos longos demais para um seletor segmentado.
 */
export function ChoiceChips<T extends string>({ options, value, onChange, accessibilityLabel }: Props<T>) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((o) => {
        const ativo = o.value === value;
        const fg = ativo ? colors.onPrimary : colors.text;
        return (
          <PressableScale
            key={o.value}
            haptic={false}
            onPress={() => {
              if (ativo) return;
              haptics.selecao();
              onChange(o.value);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: ativo, checked: ativo }}
            accessibilityLabel={o.label}
            style={[styles.chip, { backgroundColor: ativo ? colors.primaryStrong : colors.surfaceAlt, borderColor: ativo ? colors.primaryStrong : colors.border }]}
          >
            {o.icon ? <Ionicons name={o.icon} size={sizes.icon.sm} color={ativo ? colors.onPrimary : colors.textMuted} /> : null}
            <Text variant="bodySmall" weight={ativo ? 'semibold' : 'medium'} style={{ color: fg }}>
              {o.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: sizes.touch, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: sizes.border },
});
