import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Button, IrisLogo, IrisOrbs, Text } from '@/components';
import { pushIndisponivel } from '@/hooks/usePushNotifications';
import { brand, radius, spacing } from '@/theme';

const { width } = Dimensions.get('window');

const slides: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  {
    icon: 'chatbubbles',
    title: 'O olhar tem voz. E agora chega até você.',
    body: 'Tudo o que a pessoa que você cuida escreve com os olhos no IrisFlow Communicator, no computador dela, aparece aqui em tempo real — e o que você responde é falado na tela dela.',
  },
  {
    icon: 'alert-circle',
    // O escalonamento do servidor (função agendada) reenvia o push a todos os
    // celulares da conta quando ninguém confirma no prazo — mas não telefona
    // para ninguém. O que existe é o alerta em tela cheia aqui e os contatos a
    // um toque de distância, para você ligar.
    title: 'Socorro que não depende de você estar na sala.',
    body: 'A célula de emergência do IrisFlow Communicator manda o pedido de socorro para este app na hora: ele toca, vibra e ocupa a tela inteira até alguém confirmar, com seus contatos de emergência a um toque de distância.',
  },
  {
    icon: 'pulse',
    title: 'Acompanhe a sessão de onde estiver.',
    body: 'Postura, fadiga, precisão da calibração e uso dos módulos, com ajuste remoto de tempo de fixação e suavização.',
  },
];

export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  const ref = useRef<ScrollView>(null);
  const semPush = pushIndisponivel();

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    <LinearGradient colors={[brand.navy, brand.blue, brand.blueSoft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.root, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
      <IrisOrbs />
      <Animated.View entering={FadeInDown.duration(700)} style={styles.logoRow}>
        <IrisLogo size={72} onDark />
        <Text variant="display" tone="onPrimary" style={{ fontSize: 28, lineHeight: 40 }}>
          IrisFlow
        </Text>
        <View style={styles.tag}>
          <Text variant="caption" tone="onPrimary" weight="semibold">
            CUIDADOR
          </Text>
        </View>
      </Animated.View>

      <ScrollView ref={ref} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll} style={{ flexGrow: 0 }}>
        {slides.map((s, i) => (
          <View key={i} style={{ width, paddingHorizontal: spacing.xxl }}>
            <Animated.View entering={FadeInUp.delay(200 + i * 80).duration(600)} style={styles.slide}>
              <View style={styles.iconWrap}>
                <Ionicons name={s.icon} size={34} color="#FFFFFF" />
              </View>
              <Text variant="h1" tone="onPrimary" style={{ marginTop: spacing.xl, fontSize: 24, lineHeight: 34 }}>
                {s.title}
              </Text>
              <Text variant="body" style={{ color: 'rgba(255,255,255,0.82)', marginTop: spacing.md }}>
                {s.body}
              </Text>
            </Animated.View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {slides.map((_, i) => (
          <Dot key={i} active={i === page} />
        ))}
      </View>

      <View style={{ paddingHorizontal: spacing.xxl, gap: spacing.md }}>
        {/* A promessa acima ("na hora") depende de push, e o push não está de
            pé em todo build. Onde a promessa é feita, a ressalva também. */}
        {semPush && (
          <View style={styles.semPush}>
            <Ionicons name="notifications-off-outline" size={18} color="#FFFFFF" />
            <Text variant="caption" style={{ color: 'rgba(255,255,255,0.85)', flex: 1 }}>
              Neste build a notificação por push ainda não está ativa — {semPush}. O alerta em tela cheia continua funcionando com o app aberto; com o app fechado, o aviso não chega ao celular.
            </Text>
          </View>
        )}
        <Button title="Entrar na minha conta" variant="accent" size="lg" icon="log-in-outline" onPress={() => router.push('/(auth)/login')} />
        <Text variant="caption" center style={{ color: 'rgba(255,255,255,0.7)' }}>
          Use o mesmo e-mail e senha criados na página Beta do site.
        </Text>
      </View>
    </LinearGradient>
  );
}

function Dot({ active }: { active: boolean }) {
  const w = useSharedValue(active ? 24 : 8);
  useEffect(() => {
    w.value = withSpring(active ? 24 : 8, { damping: 14 });
  }, [active, w]);
  const s = useAnimatedStyle(() => ({ width: w.value }));
  return <Animated.View style={[styles.dot, { backgroundColor: active ? brand.teal : 'rgba(255,255,255,0.4)' }, s]} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'space-between' },
  logoRow: { alignItems: 'center', gap: spacing.sm },
  tag: { backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill },
  slide: { minHeight: 300 },
  iconWrap: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  semPush: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: radius.md, padding: spacing.md },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { height: 8, borderRadius: 4 },
});
