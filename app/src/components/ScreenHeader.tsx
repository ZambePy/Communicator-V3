import React from 'react';
import { StyleSheet, View } from 'react-native';
import { IconButton } from './IconButton';
import { Text } from './Text';
import { spacing } from '@/theme';

interface Props {
  /** Opcional: telas com destaque próprio (ex.: perfil do paciente) mostram só voltar/fechar. */
  title?: string;
  /** Linha pequena acima do título (ex.: o nome do paciente). */
  eyebrow?: string;
  subtitle?: string;
  /** Acessório à direita do título (selo de estado, botão de ícone). */
  right?: React.ReactNode;
  onBack?: () => void;
  onClose?: () => void;
}

/**
 * Cabeçalho de tela com título grande, no fundo da própria tela (sem faixa
 * colorida): hierarquia pela tipografia, não por caixas. Voltar/fechar ficam
 * numa linha própria, com alvo de 48 dp.
 */
export function ScreenHeader({ title, eyebrow, subtitle, right, onBack, onClose }: Props) {
  return (
    <View style={styles.wrap}>
      {(onBack || onClose) && (
        <View style={styles.nav}>
          {onBack && <IconButton icon="arrow-back" accessibilityLabel="Voltar" onPress={onBack} variant="tinted" />}
          {onClose && <IconButton icon="close" accessibilityLabel="Fechar" onPress={onClose} variant="tinted" />}
        </View>
      )}
      {title ? (
        <View style={styles.row}>
          <View style={styles.texts}>
            {eyebrow ? (
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {eyebrow}
              </Text>
            ) : null}
            <Text variant="h1" accessibilityRole="header">
              {title}
            </Text>
          </View>
          {right ? <View style={styles.right}>{right}</View> : null}
        </View>
      ) : null}
      {subtitle ? (
        <Text variant="bodySmall" tone="muted" style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.xl },
  nav: { flexDirection: 'row', marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  texts: { flex: 1, gap: spacing.xxs },
  right: { paddingBottom: spacing.xxs },
  subtitle: { marginTop: spacing.xs },
});
