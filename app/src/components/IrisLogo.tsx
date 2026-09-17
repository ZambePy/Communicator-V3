import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { brand, spectrum } from '@/theme';

interface Props {
  size?: number;
  /** gira as lâminas do diafragma continuamente */
  spinning?: boolean;
  /** pulsa a pupila como um olhar vivo */
  breathing?: boolean;
  /** versão branca para fundos escuros */
  onDark?: boolean;
  /**
   * halo colorido atrás do símbolo — usar em surfaces de destaque
   * (hero do cabeçalho, splash, tela de emergência).
   */
  halo?: boolean;
  /**
   * fio de refração espectral orbitando a íris — evocação da íris fotográfica
   * do banner. Usar só quando o produto está "vivo" (sessão em andamento).
   */
  refraction?: boolean;
}

const symbol = require('../../assets/images/symbol.png');
const symbolWhite = require('../../assets/images/symbol-white.png');

/**
 * Símbolo da IrisFlow: as lâminas do diafragma giram lentamente, a pupila fica fixa
 * com dois reflexos (principal e secundário) — a mesma leitura do LOGO oficial.
 */
export function IrisLogo({ size = 96, spinning = true, breathing = true, onDark = false, halo = false, refraction = false }: Props) {
  const rotation = useSharedValue(0);
  const orbit = useSharedValue(0);
  const scale = useSharedValue(1);
  const haloPulse = useSharedValue(0.85);

  useEffect(() => {
    if (spinning) {
      rotation.value = withRepeat(withTiming(360, { duration: 14000, easing: Easing.linear }), -1, false);
    }
    if (refraction) {
      orbit.value = withRepeat(withTiming(360, { duration: 9000, easing: Easing.linear }), -1, false);
    }
    if (breathing) {
      scale.value = withRepeat(
        withSequence(withTiming(1.06, { duration: 1800, easing: Easing.inOut(Easing.quad) }), withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) })),
        -1,
        true,
      );
      haloPulse.value = withRepeat(
        withSequence(withTiming(1.08, { duration: 2400, easing: Easing.inOut(Easing.quad) }), withTiming(0.9, { duration: 2400, easing: Easing.inOut(Easing.quad) })),
        -1,
        true,
      );
    }
  }, [spinning, breathing, refraction, rotation, orbit, scale, haloPulse]);

  const bladesStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
  const pupilStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const orbitStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${orbit.value}deg` }] }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: 0.55 * haloPulse.value, transform: [{ scale: 0.9 + haloPulse.value * 0.25 }] }));

  const pupil = size * 0.34;
  const highlight = pupil * 0.4;
  const secondary = pupil * 0.14;
  const haloSize = size * 1.7;
  const orbitRadius = size * 0.52;
  const dot = Math.max(3, size * 0.055);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {halo && (
        <Animated.View pointerEvents="none" style={[styles.halo, { width: haloSize, height: haloSize }, haloStyle]}>
          <Svg width="100%" height="100%">
            <Defs>
              <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor={onDark ? brand.azure : brand.blue} stopOpacity="0.7" />
                <Stop offset="45%" stopColor={onDark ? brand.azure : brand.blue} stopOpacity="0.18" />
                <Stop offset="100%" stopColor={onDark ? brand.azure : brand.blue} stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#halo)" />
          </Svg>
        </Animated.View>
      )}

      <Animated.View style={[{ width: size, height: size }, bladesStyle]}>
        <Image source={onDark ? symbolWhite : symbol} style={{ width: size, height: size }} contentFit="contain" />
      </Animated.View>

      <Animated.View
        style={[
          styles.pupil,
          {
            width: pupil,
            height: pupil,
            borderRadius: pupil / 2,
            backgroundColor: brand.navy,
            borderColor: onDark ? brand.navy : '#FFFFFF',
            borderWidth: size * 0.02,
          },
          pupilStyle,
        ]}
      >
        {/* Reflexo principal — deslocado como no LOGO oficial (12h/1h). */}
        <View
          style={{
            position: 'absolute',
            top: pupil * 0.1,
            right: pupil * 0.14,
            width: highlight,
            height: highlight,
            borderRadius: highlight / 2,
            backgroundColor: '#FFFFFF',
          }}
        />
        {/* Reflexo secundário — o pequeno brilho abaixo, dá "olhar molhado". */}
        <View
          style={{
            position: 'absolute',
            bottom: pupil * 0.18,
            left: pupil * 0.22,
            width: secondary,
            height: secondary,
            borderRadius: secondary / 2,
            backgroundColor: 'rgba(255,255,255,0.75)',
          }}
        />
      </Animated.View>

      {refraction && (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center, orbitStyle]}>
          <View style={{ position: 'absolute', top: -orbitRadius, width: dot, height: dot, borderRadius: dot / 2, backgroundColor: spectrum.cyan, opacity: 0.85 }} />
          <View style={{ position: 'absolute', left: orbitRadius, width: dot, height: dot, borderRadius: dot / 2, backgroundColor: spectrum.violet, opacity: 0.75 }} />
          <View style={{ position: 'absolute', bottom: -orbitRadius, width: dot, height: dot, borderRadius: dot / 2, backgroundColor: spectrum.rose, opacity: 0.7 }} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pupil: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute' },
});
