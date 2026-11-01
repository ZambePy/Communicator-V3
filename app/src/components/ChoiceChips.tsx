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

type Props<T extends string> = {
  options: Option<T>[];
  accessibilityLabel?: string;
} & (
  | { value: T; onChange: (v: T) => void; opcional?: false }
  /** Escolha que pode ficar vazia: tocar no chip escolhido o desmarca. */
  | { value: T | null; onChange: (v: T | null) => void; opcional: true }
);

/**
 * Escolha única em "chips" que quebram linha (31/10/2026: o escolhido é o azul
 * claro com texto marinho, os outros só o contorno — mock 05).
 */
export function ChoiceChips<T extends string>(props: Props<T>) {
  const { options, value, accessibilityLabel } = props;
  const { colors } = useTheme();
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((o) => {
        const ativo = o.value === value;
        const fg = ativo ? colors.onSelected : colors.text;
        return (
          <PressableScale
            key={o.value}
            haptic={false}
            onPress={() => {
              if (ativo) {
                if (props.opcional) {
                  haptics.selecao();
                  props.onChange(null);
                }
                return;
              }
              haptics.selecao();
              (props.onChange as (v: T) => void)(o.value);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: ativo, checked: ativo }}
            accessibilityLabel={o.label}
            style={[styles.chip, { backgroundColor: ativo ? colors.selected : colors.surface, borderColor: ativo ? colors.selected : colors.fieldBorder }]}
          >
            {o.icon ? <Ionicons name={o.icon} size={sizes.icon.sm} color={fg} /> : null}
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
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm + 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: sizes.touch, paddingHorizontal: spacing.lg + 2, borderRadius: radius.pill, borderWidth: 1.5 },
});
