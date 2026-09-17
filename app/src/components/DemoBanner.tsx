import React from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { radius, spacing, useTheme } from '@/theme';
import { Text } from './Text';

/**
 * Aviso de modo demonstração (sem Supabase configurado): tudo na tela é simulado.
 * Aparece em Início, Conversa e Relatórios — o rodapé dos Ajustes repete a informação.
 */
export function DemoBanner({ text = 'Modo demonstração — dados simulados, nenhum paciente real.', style }: { text?: string; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <Animated.View entering={FadeInDown.duration(400)} style={[styles.banner, { backgroundColor: colors.accentTint, borderColor: colors.accent }, style]}>
      <Ionicons name="flask" size={16} color={colors.accentDeep} />
      <Text variant="caption" style={{ color: colors.accentDeep, flex: 1 }}>
        {text}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
});
