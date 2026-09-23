import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { radius, sizes, spacing, useEntrada, useTheme } from '@/theme';

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

interface Props {
  tone?: NoticeTone;
  title?: string;
  text: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Próximo passo, quando existe (ex.: "Tentar de novo", "Ativar"). */
  action?: { label: string; onPress: () => void };
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const ICONE: Record<NoticeTone, keyof typeof Ionicons.glyphMap> = {
  info: 'information-circle',
  success: 'checkmark-circle',
  warning: 'alert-circle',
  danger: 'alert-circle',
};

/**
 * Aviso dentro da tela (falha ao salvar, confirmação de envio, "ainda não
 * sincronizado"). Leitores de tela anunciam o texto assim que ele aparece.
 */
export function Notice({ tone = 'info', title, text, icon, action, style, testID }: Props) {
  const { colors } = useTheme();
  const entrada = useEntrada();
  const cor = {
    info: { fg: colors.primary, bg: colors.primaryTint },
    success: { fg: colors.accentText, bg: colors.accentTint },
    warning: { fg: colors.warningText, bg: colors.warningTint },
    danger: { fg: colors.dangerText, bg: colors.dangerTint },
  }[tone];
  return (
    <Animated.View
      entering={entrada.suave()}
      style={[styles.box, { backgroundColor: cor.bg }, style]}
      accessibilityLiveRegion={tone === 'danger' ? 'assertive' : 'polite'}
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      testID={testID}
    >
      <Ionicons name={icon ?? ICONE[tone]} size={sizes.icon.md} color={cor.fg} style={styles.icon} />
      <View style={styles.texts}>
        {title ? (
          <Text variant="bodySmall" weight="semibold" style={{ color: cor.fg }}>
            {title}
          </Text>
        ) : null}
        <Text variant="bodySmall">{text}</Text>
        {action ? (
          <PressableScale onPress={action.onPress} accessibilityRole="button" style={styles.action}>
            <Text variant="bodySmall" weight="semibold" style={{ color: cor.fg }}>
              {action.label}
            </Text>
          </PressableScale>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, borderRadius: radius.md },
  icon: { marginTop: spacing.xxs },
  texts: { flex: 1, gap: spacing.xxs },
  action: { alignSelf: 'flex-start', minHeight: sizes.touch, justifyContent: 'center', marginBottom: -spacing.sm },
});
