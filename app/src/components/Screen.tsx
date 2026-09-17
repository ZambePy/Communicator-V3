import React from 'react';
import { RefreshControl, ScrollView, ScrollViewProps, StyleSheet, View } from 'react-native';
import { useTheme, spacing } from '@/theme';

interface Props extends ScrollViewProps {
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** conteúdo já contém cabeçalho em gradiente — sem padding superior */
  padded?: boolean;
}

/** Container de tela com fundo temático, scroll e pull-to-refresh. */
export function Screen({ children, refreshing, onRefresh, padded = true, contentContainerStyle, ...rest }: Props) {
  const { colors } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        {...rest}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[padded && styles.padded, styles.content, contentContainerStyle]}
        refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} /> : undefined}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  padded: { paddingHorizontal: spacing.xl },
  content: { paddingBottom: 120 },
});
