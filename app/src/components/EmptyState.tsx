import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import { Button } from './Button';
import { Text } from './Text';
import { layout, radius, sizes, spacing, useEntrada, useTheme } from '@/theme';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  tone?: 'primary' | 'accent';
  action?: { label: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap };
  compact?: boolean;
}

/** Estado vazio acolhedor: um ícone, uma frase, e — quando existe — o próximo passo. */
export function EmptyState({ icon, title, body, tone = 'primary', action, compact }: Props) {
  const { colors } = useTheme();
  const entrada = useEntrada();
  const fg = tone === 'accent' ? colors.accentText : colors.primary;
  const bg = tone === 'accent' ? colors.accentTint : colors.primaryTint;
  return (
    <Animated.View entering={entrada.suave()} style={[styles.wrap, compact && styles.compact]}>
      <View style={[styles.icon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={sizes.icon.lg} color={fg} />
      </View>
      <Text variant="h3" center style={styles.title}>
        {title}
      </Text>
      {body ? (
        <Text variant="bodySmall" tone="muted" center style={styles.body}>
          {body}
        </Text>
      ) : null}
      {action ? <Button title={action.label} icon={action.icon} variant="secondary" onPress={action.onPress} style={styles.action} /> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: spacing.xxxl, paddingHorizontal: spacing.lg },
  compact: { paddingVertical: spacing.xl },
  icon: { width: sizes.tile.xl, height: sizes.tile.xl, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: spacing.lg },
  body: { marginTop: spacing.xs, maxWidth: layout.textMax },
  action: { marginTop: spacing.xl, alignSelf: 'stretch' },
});
