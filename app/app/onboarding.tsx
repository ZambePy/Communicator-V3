import React, { useEffect, useRef, useState } from 'react';
import { Linking, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Button, IrisLogo, IrisOrbs, Text } from '@/components';
import { siteRoute } from '@/lib/config';
import { layout, motion, radius, sizes, spacing, useEntrada, useTheme } from '@/theme';

type Slide = { icon: keyof typeof Ionicons.glyphMap; title: string; body: string };

const SLIDES: Slide[] = [
  { icon: 'chatbubbles-outline', title: 'O olhar tem voz', body: 'Veja na hora o que a pessoa que você cuida escreve com os olhos — e responda de onde estiver.' },
  // O que o alerta faz com o app aberto; com o app fechado depende do push do build.
  { icon: 'hand-left-outline', title: 'Socorro sem demora', body: 'Um pedido de ajuda ocupa a tela e vibra até alguém confirmar.' },
  { icon: 'options-outline', title: 'Cuidado a distância', body: 'Acompanhe o uso e ajuste o computador sem sair do lugar.' },
];

export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const entrada = useEntrada();
  const [page, setPage] = useState(0);
  const ref = useRef<ScrollView>(null);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width)));
  };

  return (
    <LinearGradient colors={colors.gradientBrand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.root, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl }]}>
      <IrisOrbs />
      <Animated.View entering={entrada.suave()} style={styles.brand}>
        <IrisLogo size={sizes.logo.lg} onDark halo />
        <Text variant="h2" tone="onDark" accessibilityRole="header">
          IrisFlow
        </Text>
        <View style={[styles.tag, { backgroundColor: colors.onDarkFill }]}>
          <Text variant="caption" tone="onDark" weight="semibold">
            Para quem cuida
          </Text>
        </View>
      </Animated.View>

      <ScrollView ref={ref} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll} style={styles.pager}>
        {SLIDES.map((s, i) => (
          <View key={s.title} style={[styles.slide, { width }]} accessible accessibilityLabel={`${s.title}. ${s.body} Página ${i + 1} de ${SLIDES.length}.`}>
            <View style={[styles.icon, { backgroundColor: colors.onDarkFill, borderColor: colors.onDarkBorder }]}>
              <Ionicons name={s.icon} size={sizes.icon.xl} color={colors.onDark} />
            </View>
            <Text variant="h1" tone="onDark" center style={styles.title}>
              {s.title}
            </Text>
            <Text variant="body" tone="onDarkMuted" center style={styles.body}>
              {s.body}
            </Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {SLIDES.map((s, i) => (
          <Dot key={s.title} active={i === page} />
        ))}
      </View>

      <View style={styles.actions}>
        <Button title="Entrar" variant="light" size="lg" icon="log-in-outline" onPress={() => router.push('/(auth)/login')} />
        {/* A conta nasce no site (página Beta); o app não cadastra ninguém. */}
        <Button
          title="Ainda não tenho conta"
          variant="glass"
          accessibilityHint="Abre a página de inscrição no site da IrisFlow"
          onPress={() => void Linking.openURL(siteRoute('/beta')).catch(() => undefined)}
        />
      </View>
    </LinearGradient>
  );
}

function Dot({ active }: { active: boolean }) {
  const { colors, reduceMotion } = useTheme();
  const larga = sizes.dot * 3;
  const w = useSharedValue(active ? larga : sizes.dot);
  useEffect(() => {
    w.value = reduceMotion ? (active ? larga : sizes.dot) : withSpring(active ? larga : sizes.dot, motion.spring.slide);
  }, [active, w, reduceMotion, larga]);
  const s = useAnimatedStyle(() => ({ width: w.value }));
  return <Animated.View style={[styles.dot, { backgroundColor: active ? colors.accent : colors.onDarkBorder }, s]} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'space-between' },
  brand: { alignItems: 'center', gap: spacing.sm },
  tag: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill },
  pager: { flexGrow: 0 },
  slide: { paddingHorizontal: layout.gutter + spacing.sm, justifyContent: 'center', alignItems: 'center' },
  icon: { width: sizes.tile.xl + spacing.md, height: sizes.tile.xl + spacing.md, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center', borderWidth: sizes.border },
  title: { marginTop: spacing.xxl },
  body: { marginTop: spacing.sm, maxWidth: layout.textMax + spacing.huge },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  dot: { height: sizes.dot, borderRadius: radius.pill },
  actions: { paddingHorizontal: layout.gutter, gap: spacing.md, width: '100%', maxWidth: layout.maxContent, alignSelf: 'center' },
});
