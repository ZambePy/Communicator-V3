import React from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { lightColors, opacity, radius, sizes, spacing, useTheme } from '@/theme';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'accent'
  | 'danger'
  | 'dangerOutline'
  /** Sobre gradiente escuro: fundo branco, texto azul. */
  | 'light'
  /** Sobre o vermelho da emergência: fundo branco, texto vermelho. */
  | 'lightDanger'
  /** Sobre gradiente escuro, ação secundária: vidro translúcido. */
  | 'glass';

interface Props {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  size?: 'md' | 'lg' | 'xl';
  accessibilityHint?: string;
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * Botão do sistema de design. Altura mínima de 52 dp (60 no `lg`, 68 no `xl` da
 * emergência); cresce na vertical se a fonte do sistema estiver grande. Enquanto
 * `loading`, mostra o indicador e anuncia "ocupado" para leitores de tela.
 */
export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, style, size = 'md', accessibilityHint, accessibilityLabel, testID }: Props) {
  const { colors } = useTheme();
  const paleta: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: colors.primaryStrong, fg: colors.onPrimary },
    secondary: { bg: colors.primaryTint, fg: colors.primary },
    outline: { bg: 'transparent', fg: colors.primary, border: colors.borderStrong },
    ghost: { bg: 'transparent', fg: colors.primary },
    accent: { bg: colors.accentStrong, fg: colors.onPrimary },
    danger: { bg: colors.dangerStrong, fg: colors.onPrimary },
    dangerOutline: { bg: 'transparent', fg: colors.dangerText, border: colors.border },
    light: { bg: colors.onDark, fg: colors.primaryStrong },
    lightDanger: { bg: colors.onDark, fg: colors.dangerText },
    glass: { bg: colors.onDarkFill, fg: colors.onDark, border: colors.onDarkBorder },
  };
  // `lightDanger`/`light` ficam sobre fundo escuro: o texto usa as cores do tema
  // CLARO para manter o contraste também no modo escuro.
  const cor = paleta[variant];
  const fg = variant === 'lightDanger' ? lightColors.dangerText : variant === 'light' ? lightColors.primaryStrong : cor.fg;
  const minHeight = sizes.button[size];
  const inativo = disabled || loading;

  return (
    <PressableScale
      onPress={onPress}
      disabled={inativo}
      haptic="medium"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(disabled), busy: Boolean(loading) }}
      testID={testID}
      style={[
        styles.base,
        { minHeight, backgroundColor: cor.bg, borderColor: cor.border ?? 'transparent', borderWidth: cor.border ? sizes.border : 0 },
        disabled && !loading && { opacity: opacity.disabled },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon && <Ionicons name={icon} size={size === 'md' ? sizes.icon.sm : sizes.icon.md} color={fg} />}
          <Text variant={size === 'md' ? 'body' : 'h3'} weight="semibold" style={[styles.label, { color: fg }]}>
            {title}
          </Text>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  label: { textAlign: 'center' },
});
