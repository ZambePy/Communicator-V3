import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { motion, radius, sizes, spacing, useTheme } from '@/theme';

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

/** Linha de lista: bloco de ícone, título, subtítulo e acessório. Altura mínima de 64 dp. */
export function ListRow({ icon, title, subtitle, onPress, right, tone = 'primary', last, accessibilityHint, role = 'button' }: Props) {
  const { colors } = useTheme();
  const cor: Record<RowTone, { fg: string; bg: string }> = {
    primary: { fg: colors.primary, bg: colors.primaryTint },
    accent: { fg: colors.accentText, bg: colors.accentTint },
    danger: { fg: colors.dangerText, bg: colors.dangerTint },
    warning: { fg: colors.warningText, bg: colors.warningTint },
    muted: { fg: colors.textMuted, bg: colors.surfaceAlt },
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
      <View style={[styles.icon, { backgroundColor: c.bg }]}>
        <Ionicons name={icon} size={sizes.icon.sm} color={c.fg} />
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
  icon: { width: sizes.tile.md, height: sizes.tile.md, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, gap: spacing.xxs },
});
