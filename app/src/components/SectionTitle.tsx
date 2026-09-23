import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { PressableScale } from './PressableScale';
import { sizes, spacing, useTheme } from '@/theme';

interface Props {
  title: string;
  action?: string;
  onAction?: () => void;
  /** Primeira seção logo abaixo do cabeçalho: sem o respiro de cima. */
  first?: boolean;
}

/** Título de seção com atalho opcional ("Ver todos ›"), alvo de 48 dp. */
export function SectionTitle({ title, action, onAction, first }: Props) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, first && styles.first]}>
      <Text variant="h3" accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {action && (
        <PressableScale onPress={onAction} accessibilityRole="link" accessibilityLabel={`${action}: ${title}`} style={styles.action}>
          <Text variant="bodySmall" tone="primary" weight="semibold">
            {action}
          </Text>
          <Ionicons name="chevron-forward" size={sizes.icon.xs} color={colors.primary} />
        </PressableScale>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xxl, marginBottom: spacing.sm, minHeight: sizes.touch },
  first: { marginTop: 0 },
  title: { flex: 1 },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, minHeight: sizes.touch, paddingLeft: spacing.md },
});
