import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Text } from '@/components';
import { brand, corDoAvatar, darkColors, motion, radius, sizes, spacing, useReduceMotion } from '@/theme';

/**
 * As três ilustrações do tutorial (31/10/2026, mock 01-02 e a tela do meio).
 * Cada uma conta a sua frase com movimento, e só anima quando a página está
 * na tela (`ativa`). Com "reduzir movimento", fica parada no quadro final.
 * Sempre no escuro, como o tutorial inteiro. As medidas e os tons daqui são
 * do desenho (mock 01-02), não da interface: ficam neste arquivo.
 */
const c = darkColors;
/** Cartão claro que imita a notificação no celular. */
const CARTAO = '#F3F6FB';
const TEXTO_DO_CARTAO = brand.navy;
const SECUNDARIO_DO_CARTAO = '#43536E';
/** Fundo da ilustração do socorro (um vinho quase preto, só aqui). */
export const FUNDO_DO_SOCORRO = '#160F24';
const AVATAR = corDoAvatar('Carlos');

type Props = { ativa: boolean };

/** Um ciclo que repete enquanto a página está ativa (0 → 1). */
function useCiclo(ativa: boolean, duracao: number): SharedValue<number> {
  const reduzir = useReduceMotion();
  const t = useSharedValue(reduzir ? 1 : 0);
  useEffect(() => {
    if (reduzir) {
      cancelAnimation(t);
      t.value = 1;
      return;
    }
    if (!ativa) {
      cancelAnimation(t);
      t.value = 0;
      return;
    }
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: duracao, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [ativa, reduzir, duracao, t]);
  return t;
}

function Moldura({ children, fundo = c.surface, rotulo }: { children: React.ReactNode; fundo?: string; rotulo: string }) {
  return (
    <View style={[styles.moldura, { backgroundColor: fundo }]} accessible accessibilityRole="image" accessibilityLabel={rotulo}>
      {children}
    </View>
  );
}

function Remetente({ quando }: { quando: string }) {
  return (
    <View style={styles.remetente}>
      <View style={[styles.mini, { backgroundColor: AVATAR.bg }]}>
        <Text variant="badge" weight="bold" style={{ color: AVATAR.fg }}>
          C
        </Text>
      </View>
      <Text variant="caption" weight="semibold" style={{ color: SECUNDARIO_DO_CARTAO }}>
        Carlos, {quando}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 1. A mensagem chegando
// ---------------------------------------------------------------------------

export function IlustracaoMensagem({ ativa }: Props) {
  const reduzir = useReduceMotion();
  const ciclo = useCiclo(ativa, 3200);
  const chegada = useSharedValue(reduzir ? 1 : 0);
  useEffect(() => {
    if (reduzir) {
      chegada.value = 1;
      return;
    }
    chegada.value = 0;
    if (ativa) chegada.value = withDelay(300, withSpring(1, motion.spring.settle));
  }, [ativa, reduzir, chegada]);

  const cartao = useAnimatedStyle(() => ({
    opacity: interpolate(chegada.value, [0, 0.4, 1], [0, 1, 1]),
    transform: [{ translateY: interpolate(chegada.value, [0, 1], [56, 0]) }, { scale: interpolate(chegada.value, [0, 1], [0.96, 1]) }],
  }));
  const fantasma = useAnimatedStyle(() => ({
    opacity: interpolate(chegada.value, [0, 1], [0.6, 0.35]),
    transform: [{ translateY: interpolate(chegada.value, [0, 1], [24, 0]) }, { scale: 0.92 }],
  }));
  const onda = (atraso: number) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAnimatedStyle(() => {
      const p = (ciclo.value + atraso) % 1;
      return { opacity: reduzir ? 0.35 : interpolate(p, [0, 0.2, 1], [0, 0.45, 0]), transform: [{ scale: interpolate(p, [0, 1], [0.7, 1.35]) }] };
    });
  const onda1 = onda(0);
  const onda2 = onda(0.5);

  return (
    <Moldura rotulo="Uma mensagem de Carlos chegando no celular: Estou com sede.">
      <Animated.View style={[styles.onda, onda1]} />
      <Animated.View style={[styles.onda, onda2]} />
      <Animated.View style={[styles.cartao, styles.cartaoFantasma, fantasma]}>
        <Remetente quando="14:02" />
        <Text variant="fala" weight="heading" style={{ color: TEXTO_DO_CARTAO }}>
          Quero ver o jogo.
        </Text>
      </Animated.View>
      <Animated.View style={[styles.cartao, styles.cartaoPrincipal, cartao]}>
        <Remetente quando="agora" />
        <Text variant="fala" weight="heading" style={{ color: TEXTO_DO_CARTAO }}>
          Estou com sede.
        </Text>
      </Animated.View>
    </Moldura>
  );
}

// ---------------------------------------------------------------------------
// 2. Um toque para responder → falado na tela do computador
// ---------------------------------------------------------------------------

export function IlustracaoResposta({ ativa }: Props) {
  const reduzir = useReduceMotion();
  const t = useCiclo(ativa, 4200);
  // 0.15: o dedo toca "Já estou indo"; 0.30: o balão aparece no computador;
  // 0.45: "Falado na tela"; 0.90: tudo some para recomeçar.
  const toque = useAnimatedStyle(() => ({
    transform: [{ scale: reduzir ? 1 : interpolate(t.value, [0.1, 0.15, 0.22], [1, 0.93, 1], 'clamp') }],
  }));
  const balao = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.25, 0.33, 0.88, 0.95], [0, 1, 1, 0], 'clamp'),
    transform: [{ translateY: interpolate(t.value, [0.25, 0.33], [12, 0], 'clamp') }],
  }));
  const falado = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.42, 0.5, 0.88, 0.95], [0, 1, 1, 0], 'clamp'),
    transform: [{ translateY: interpolate(t.value, [0.42, 0.5], [8, 0], 'clamp') }],
  }));
  const fixo = reduzir ? { opacity: 1, transform: [] } : null;

  return (
    <Moldura rotulo="Você toca em Já estou indo no celular e a resposta é falada na tela do computador.">
      {/* A tela do computador */}
      <View style={styles.computador}>
        <View style={styles.barraDoComputador}>
          <View style={[styles.pontinho, { backgroundColor: c.dotIdle }]} />
          <View style={[styles.pontinho, { backgroundColor: c.dotIdle }]} />
          <View style={[styles.pontinho, { backgroundColor: c.dotIdle }]} />
        </View>
        <Text variant="h3" weight="heading" style={{ color: c.text }}>
          Estou com sede.
        </Text>
        <Animated.View style={[styles.balaoNoComputador, { backgroundColor: c.primaryStrong }, fixo ?? balao]}>
          <Text variant="body" weight="semibold" style={{ color: c.onPrimary }}>
            Já estou indo
          </Text>
        </Animated.View>
        <Animated.View style={[styles.falado, fixo ?? falado]}>
          <Ionicons name="volume-high" size={sizes.icon.xs} color={c.accentText} />
          <Text variant="caption" weight="semibold" style={{ color: c.accentText }}>
            Falado na tela
          </Text>
        </Animated.View>
      </View>
      {/* As respostas no celular */}
      <View style={styles.respostas}>
        <Animated.View style={[styles.resposta, styles.respostaPrincipal, { backgroundColor: c.accentTint }, toque]}>
          <Text variant="body" weight="semibold" style={{ color: c.accentText }}>
            Já estou indo
          </Text>
        </Animated.View>
        <View style={[styles.resposta, { backgroundColor: c.surfaceRaised }]}>
          <Text variant="body" weight="semibold" style={{ color: c.text }}>
            Sim
          </Text>
        </View>
        <View style={[styles.resposta, { backgroundColor: c.surfaceRaised }]}>
          <Text variant="body" weight="semibold" style={{ color: c.text }}>
            Não
          </Text>
        </View>
      </View>
    </Moldura>
  );
}

// ---------------------------------------------------------------------------
// 3. O pedido de ajuda tocando
// ---------------------------------------------------------------------------

export function IlustracaoSocorro({ ativa }: Props) {
  const reduzir = useReduceMotion();
  const t = useCiclo(ativa, 1800);
  const anel = (atraso: number) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAnimatedStyle(() => {
      const p = (t.value + atraso) % 1;
      return {
        opacity: reduzir ? 0 : interpolate(p, [0, 0.15, 1], [0, 0.7, 0]),
        transform: [{ scale: interpolate(p, [0, 1], [1, 1.14]) }],
      };
    });
  const anel1 = anel(0);
  const anel2 = anel(0.5);
  // O "toque": um leve balanço no começo de cada ciclo.
  const balanco = useAnimatedStyle(() => ({
    transform: [{ rotate: `${reduzir ? 0 : interpolate(t.value, [0, 0.05, 0.1, 0.15, 0.2], [0, -1.5, 1.5, -1, 0], 'clamp')}deg` }],
  }));

  return (
    <Moldura fundo={FUNDO_DO_SOCORRO} rotulo="Um pedido de ajuda de Carlos tocando no celular, com o botão Estou indo.">
      <View style={styles.centroDoSocorro}>
        <Animated.View style={[styles.anel, { borderColor: c.dangerText }, anel1]} />
        <Animated.View style={[styles.anel, { borderColor: c.dangerText }, anel2]} />
        <Animated.View style={[styles.alerta, { backgroundColor: c.dangerTint, borderColor: c.dangerText }, balanco]}>
          <Text variant="caption" weight="semibold" style={{ color: c.dangerText }}>
            Pedido de ajuda
          </Text>
          <Text variant="h2" style={[styles.alertaTitulo, { color: c.text }]}>
            Carlos precisa de você agora.
          </Text>
          <View style={[styles.estouIndo, { backgroundColor: CARTAO }]}>
            <Text variant="body" weight="semibold" style={{ color: TEXTO_DO_CARTAO }}>
              Estou indo
            </Text>
          </View>
        </Animated.View>
      </View>
    </Moldura>
  );
}

const LARGURA_DO_CARTAO = 250;

const styles = StyleSheet.create({
  moldura: {
    height: sizes.ilustracao,
    borderBottomLeftRadius: radius.xl + 2,
    borderBottomRightRadius: radius.xl + 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  onda: { position: 'absolute', width: 260, height: 260, borderRadius: 130, borderWidth: 1, borderColor: '#24406F', backgroundColor: 'rgba(36,64,111,0.18)' },
  cartao: {
    position: 'absolute',
    width: LARGURA_DO_CARTAO,
    backgroundColor: CARTAO,
    borderRadius: radius.lg - 2,
    paddingHorizontal: spacing.lg + 2,
    paddingVertical: spacing.lg,
    gap: spacing.xs,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 16 },
    elevation: 8,
  },
  cartaoFantasma: { top: 64, marginLeft: 28 },
  cartaoPrincipal: { top: 150 },
  remetente: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mini: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  computador: {
    width: 270,
    borderRadius: radius.lg - 6,
    backgroundColor: brand.navy,
    borderWidth: 1,
    borderColor: c.border,
    padding: spacing.lg,
    gap: spacing.sm,
    minHeight: 168,
  },
  barraDoComputador: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.xs },
  pontinho: { width: 7, height: 7, borderRadius: 4 },
  balaoNoComputador: { alignSelf: 'flex-end', borderRadius: radius.lg, borderBottomRightRadius: radius.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  falado: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-end' },
  respostas: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl, width: 300 },
  resposta: { flex: 1, height: sizes.touch, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  respostaPrincipal: { flex: 1.8 },
  centroDoSocorro: { alignItems: 'center', justifyContent: 'center' },
  anel: { position: 'absolute', width: 290, height: 196, borderRadius: radius.xl, borderWidth: 2 },
  alerta: { width: 290, borderRadius: radius.lg + 2, borderWidth: 2, padding: spacing.xl + 2 },
  alertaTitulo: { marginTop: spacing.xs },
  estouIndo: { height: sizes.touch, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg + 2 },
});
