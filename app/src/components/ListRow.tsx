import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { motion, sizes, spacing, useTheme } from '@/theme';

export type RowTone = 'primary' | 'accent' | 'danger' | 'warning' | 'muted';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  tone?: RowTone;
  last?: boolean;
  accessibilityHint?: string;
  /** Papel para leitores de tela quando tocável (padrão "button"; "link" abre fora do app). */
  role?: 'button' | 'link';
}

/**
 * Linha de lista: ícone, título, subtítulo e acessório. Altura mínima de 64 dp.
 * O ícone vem só na cor do estado, sem o quadrado de fundo (19/10/2026): um
 * bloco colorido em cada linha transformava toda lista num mosaico de selos.
 */
export function ListRow({ icon, title, subtitle, onPress, right, tone = 'primary', last, accessibilityHint, role = 'button' }: Props) {
  const { colors } = useTheme();
  const cor: Record<RowTone, { fg: string }> = {
    primary: { fg: colors.primary },
    accent: { fg: colors.accentText },
    danger: { fg: colors.dangerText },
    warning: { fg: colors.warningText },
    muted: { fg: colors.textMuted },
  };
  const c = cor[tone];
  return (
    <PressableScale
      onPress={onPress}
      disabled={!onPress}
      haptic={onPress ? 'light' : false}
      accessibilityRole={onPress ? role : undefined}
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      accessibilityHint={accessibilityHint}
      scaleTo={motion.pressScaleCard}
      style={[styles.row, !last && { borderBottomWidth: sizes.hairline, borderBottomColor: colors.border }]}
    >
      <View style={styles.icon}>
        <Ionicons name={icon} size={sizes.icon.md} color={c.fg} />
      </View>
      <View style={styles.texts}>
        <Text variant="body" weight="medium" style={tone === 'danger' && onPress ? { color: colors.dangerText } : undefined}>
          {title}
        </Text>
        {/* `subtitle && …` com subtitle '' deixava uma string solta dentro da
            View ("Text strings must be rendered within a <Text>"). */}
        {subtitle ? (
          <Text variant="caption" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? <Ionicons name={role === 'link' ? 'open-outline' : 'chevron-forward'} size={sizes.icon.sm} color={colors.textMuted} /> : null)}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, minHeight: sizes.row },
  icon: { width: sizes.icon.lg, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, gap: spacing.xxs },
});
