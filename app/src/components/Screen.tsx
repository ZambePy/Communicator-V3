import React from 'react';
import { Platform, RefreshControl, ScrollView, ScrollViewProps, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout, spacing, useTheme, zIndex } from '@/theme';
import { useEspacoDoTopo } from './EspacoDoTopo';

interface Props extends ScrollViewProps {
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Margem lateral padrão (`layout.gutter`). */
  padded?: boolean;
  /**
   * Tela apresentada como modal. No iOS ela abre como folha, já abaixo da barra
   * de status — o recuo do topo seria espaço sobrando.
   */
  modal?: boolean;
}

/**
 * Container de tela: fundo do tema, rolagem, puxar para atualizar e o recuo da
 * área segura no topo (as telas não têm cabeçalho nativo). Uma faixa opaca atrás
 * da barra de status evita que o conteúdo rolado passe por baixo dos ícones dela.
 */
export function Screen({ children, refreshing, onRefresh, padded = true, modal = false, contentContainerStyle, ...rest }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // Faixa do alerta minimizado no topo (revisão de UX de 19/10/2026): o
  // conteúdo desce por baixo dela, senão ela cobria o Voltar/Fechar. A folha
  // do iOS abre por cima da janela e não fica embaixo da faixa.
  const faixa = useEspacoDoTopo();
  const folhaIos = modal && Platform.OS === 'ios';
  const topo = folhaIos ? spacing.lg : insets.top + spacing.sm + faixa;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        {...rest}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          { paddingTop: topo, paddingBottom: insets.bottom + layout.bottom },
          padded && styles.padded,
          styles.content,
          contentContainerStyle,
        ]}
        refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primaryStrong]} progressBackgroundColor={colors.surface} progressViewOffset={topo} /> : undefined}
      >
        {children}
      </ScrollView>
      {/* Com a faixa, o fundo opaco vai até o fim dela: o conteúdo rolado não aparece em volta da faixa. */}
      {!folhaIos && <View pointerEvents="none" style={[styles.statusBackdrop, { height: insets.top + faixa, backgroundColor: colors.background }]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  padded: { paddingHorizontal: layout.gutter },
  content: { width: '100%', maxWidth: layout.maxContent, alignSelf: 'center' },
  statusBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: zIndex.banner - 1 },
});
