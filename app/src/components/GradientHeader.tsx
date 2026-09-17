import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { brand, spacing, useTheme } from '@/theme';

interface Props {
  children: React.ReactNode;
  /** altura extra abaixo do conteúdo para cartões "flutuarem" sobre o cabeçalho */
  overlap?: number;
  variant?: 'primary' | 'danger';
}

/**
 * Cabeçalho em gradiente abyss → navy → azul institucional, com halo radial
 * (evocação do olho iluminado) no canto superior direito e uma transição suave
 * para o fundo da tela. Sem "curva branca" — mais próximo do banner da marca.
 */
export function GradientHeader({ children, overlap = 0, variant = 'primary' }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const g = variant === 'danger' ? [colors.gradientDanger[0], colors.gradientDanger[1], colors.gradientDanger[1]] : colors.gradientHeader;
  const haloColor = variant === 'danger' ? '#F0A0A0' : brand.azure;

  return (
    <LinearGradient colors={[g[0], g[1], g[2]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.header, { paddingTop: insets.top + spacing.md, paddingBottom: spacing.xl + overlap }]}>
      {/* Halo radial — luz que emana do símbolo. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="hdrHalo" cx="82%" cy="18%" r="60%">
              <Stop offset="0%" stopColor={haloColor} stopOpacity="0.55" />
              <Stop offset="55%" stopColor={haloColor} stopOpacity="0.08" />
              <Stop offset="100%" stopColor={haloColor} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#hdrHalo)" />
        </Svg>
      </View>

      <Animated.View entering={FadeIn.duration(500)} style={styles.inner}>
        {children}
      </Animated.View>

      {/* Fade suave para o fundo — substitui a curva branca. */}
      <LinearGradient
        pointerEvents="none"
        colors={['transparent', colors.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.fade, { height: overlap > 0 ? 48 : 12 }]}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.xl, overflow: 'hidden' },
  inner: { zIndex: 1 },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
