import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Shimmer } from './Shimmer';
import { radius, sizes, spacing, useTheme } from '@/theme';

/**
 * Esqueletos de carregamento para as listas que antes mostravam a tela vazia
 * ("Nenhum alerta", conversa em branco) enquanto o primeiro fetch corria —
 * o cuidador não sabia se não havia nada ou se ainda estava carregando.
 */

/** Conversa: bolhas alternadas, como a lista real. */
export function ConversationSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <View style={styles.conversa} accessible accessibilityLabel="Carregando conversa" testID="skeleton-conversa">
      <Shimmer height={sizes.badge + spacing.xs} width={sizes.button.lg + spacing.md} style={styles.pill} />
      {Array.from({ length: rows }, (_, i) => {
        const mine = i % 2 === 1;
        return (
          <View key={i} style={[styles.bubbleRow, mine && styles.mine]}>
            <Shimmer height={mine ? sizes.touch - spacing.xs : sizes.touch + spacing.md} width={`${48 + ((i * 17) % 30)}%`} style={styles.bubble} />
          </View>
        );
      })}
    </View>
  );
}

/** Alertas: cartões com ícone, título, descrição e selo de estado. */
export function AlertListSkeleton({ rows = 3 }: { rows?: number }) {
  const { colors } = useTheme();
  return (
    <View style={styles.lista} accessible accessibilityLabel="Carregando alertas" testID="skeleton-alertas">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Shimmer height={sizes.tile.md} width={sizes.tile.md} />
          <View style={styles.linhas}>
            <Shimmer height={spacing.lg + spacing.xxs} width="55%" />
            <Shimmer height={spacing.md + spacing.xxs} width="85%" />
            <Shimmer height={sizes.badge + spacing.sm} width={sizes.button.lg * 2} style={styles.pillInicio} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  conversa: { padding: spacing.lg, gap: spacing.md },
  pill: { alignSelf: 'center', borderRadius: radius.pill },
  pillInicio: { alignSelf: 'flex-start', borderRadius: radius.pill, marginTop: spacing.xs },
  bubbleRow: { flexDirection: 'row' },
  mine: { justifyContent: 'flex-end' },
  bubble: { borderRadius: radius.lg },
  lista: { gap: spacing.md },
  card: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: sizes.border },
  linhas: { flex: 1, gap: spacing.sm },
});
