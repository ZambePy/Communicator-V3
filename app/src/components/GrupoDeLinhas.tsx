import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { motion, radius, sizes, spacing, useTheme } from '@/theme';

/** Bloco de linhas "rótulo · valor ›" (mock 09). Uma superfície, fios entre as linhas. */
export function GrupoDeLinhas({ titulo, children }: { titulo?: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  const itens = React.Children.toArray(children).filter(Boolean);
  return (
    <View>
      {titulo ? (
        <Text variant="bodySmall" weight="semibold" tone="muted" accessibilityRole="header" style={styles.titulo}>
          {titulo}
        </Text>
      ) : null}
      <View style={[styles.grupo, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: colors.mode === 'light' ? sizes.border : 0 }]}>
        {itens.map((c, i) => (
          <View key={i} style={i > 0 ? { borderTopWidth: sizes.border, borderTopColor: colors.border } : undefined}>
            {c}
          </View>
        ))}
      </View>
    </View>
  );
}

interface LinhaProps {
  rotulo: string;
  valor?: string;
  /** Cor do valor: `accent` para "Ligado", `muted` padrão. */
  tom?: 'muted' | 'accent' | 'danger' | 'default';
  onPress?: () => void;
  accessibilityHint?: string;
  testID?: string;
}

export function LinhaDeValor({ rotulo, valor, tom = 'muted', onPress, accessibilityHint, testID }: LinhaProps) {
  const { colors } = useTheme();
  const corDoValor = tom === 'accent' ? colors.accentText : tom === 'danger' ? colors.dangerText : tom === 'default' ? colors.text : colors.textMuted;
  const conteudo = (
    <>
      <Text variant="body" weight="medium" style={styles.rotulo} numberOfLines={2}>
        {rotulo}
      </Text>
      <View style={styles.direita}>
        {valor ? (
          <Text variant="caption" style={[styles.valor, { color: corDoValor }]} numberOfLines={1}>
            {valor}
          </Text>
        ) : null}
        {onPress ? <Ionicons name="chevron-forward" size={sizes.icon.xs} color={colors.textMuted} /> : null}
      </View>
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.linha} accessible accessibilityLabel={valor ? `${rotulo}: ${valor}` : rotulo} testID={testID}>
        {conteudo}
      </View>
    );
  }
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={motion.pressScaleCard}
      accessibilityRole="button"
      accessibilityLabel={valor ? `${rotulo}: ${valor}` : rotulo}
      accessibilityHint={accessibilityHint}
      testID={testID}
      style={styles.linha}
    >
      {conteudo}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  titulo: { marginTop: spacing.xxl, marginBottom: spacing.sm },
  grupo: { borderRadius: radius.lg - 2, paddingHorizontal: spacing.lg + 2, overflow: 'hidden' },
  linha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, minHeight: sizes.touch + spacing.sm, paddingVertical: spacing.md },
  rotulo: { flexShrink: 1 },
  direita: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
  valor: { flexShrink: 1, textAlign: 'right' },
});
