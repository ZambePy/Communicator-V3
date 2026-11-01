import React, { useCallback, useRef, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { Button, Text } from '@/components';
import { FUNDO_DO_SOCORRO, IlustracaoMensagem, IlustracaoResposta, IlustracaoSocorro } from '@/features/IlustracoesDoTutorial';
import { marcarTutorialVisto } from '@/lib/tutorial';
import { brand, darkColors, layout, radius, spacing, useReduceMotion } from '@/theme';

/**
 * Tutorial da primeira abertura (31/10/2026). Antes era uma tela parada com
 * três parágrafos; o dono pediu "tutorial" e "menos texto". Agora são três
 * telas de deslizar, uma ideia cada, contadas pela ilustração e por uma frase:
 *  1. a mensagem chega aqui;
 *  2. um toque responde, e a resposta é falada no computador;
 *  3. o pedido de ajuda toca até alguém responder.
 * Aparece uma vez (`marcarTutorialVisto`); depois, sem conta, abre o login.
 */
const PAGINAS = [
  {
    chave: 'mensagens',
    titulo: 'O que a pessoa escreve com o olhar chega aqui.',
    texto: 'Na hora, mesmo com o celular no bolso.',
    Ilustracao: IlustracaoMensagem,
    fundo: darkColors.surface,
  },
  {
    chave: 'resposta',
    titulo: 'Um toque para responder.',
    texto: 'Sim, Não ou Já estou indo. A resposta é falada na tela do computador.',
    Ilustracao: IlustracaoResposta,
    fundo: darkColors.surface,
  },
  {
    chave: 'socorro',
    titulo: 'Se pedir ajuda, o celular toca até alguém responder.',
    texto: 'Sem resposta em 45 segundos, o alerta vai para todos os celulares da família.',
    Ilustracao: IlustracaoSocorro,
    fundo: FUNDO_DO_SOCORRO,
  },
] as const;

const ULTIMA = PAGINAS.length - 1;

export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduzir = useReduceMotion();
  const lista = useRef<ScrollView>(null);
  const [pagina, setPagina] = useState(0);
  const posicao = useSharedValue(0);
  // O tutorial é sempre escuro (o marinho da marca), nos dois temas.
  const c = darkColors;

  const aoRolar = useAnimatedScrollHandler((e) => {
    posicao.value = width > 0 ? e.contentOffset.x / width : 0;
  });

  const irPara = useCallback(
    (p: number) => {
      lista.current?.scrollTo({ x: p * width, animated: !reduzir });
      setPagina(p);
    },
    [width, reduzir],
  );

  const aoParar = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const p = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width));
    setPagina(Math.min(ULTIMA, Math.max(0, p)));
  };

  const sair = (destino: '/(auth)/criar-conta' | '/(auth)/login') => {
    void marcarTutorialVisto();
    router.push(destino);
  };

  return (
    <View style={[styles.root, { backgroundColor: brand.navy, paddingTop: insets.top }]}>
      <Animated.ScrollView
        ref={lista as React.RefObject<Animated.ScrollView>}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onScroll={aoRolar}
        scrollEventThrottle={16}
        onMomentumScrollEnd={aoParar}
        style={styles.flex}
        accessibilityLabel="Tutorial"
      >
        {PAGINAS.map((p, i) => (
          <View key={p.chave} style={{ width }} accessibilityElementsHidden={i !== pagina} importantForAccessibility={i === pagina ? 'auto' : 'no-hide-descendants'}>
            <View style={[styles.ilustracao, { backgroundColor: p.fundo }]}>
              <p.Ilustracao ativa={i === pagina} />
            </View>
            <View style={styles.textos}>
              <Text variant="h1" tone="onDark" accessibilityRole="header">
                {p.titulo}
              </Text>
              <Text variant="body" style={[styles.texto, { color: c.textMuted }]}>
                {p.texto}
              </Text>
            </View>
          </View>
        ))}
      </Animated.ScrollView>

      <View style={[styles.baixo, { paddingBottom: insets.bottom + spacing.xxl }]}>
        <View style={styles.pontos} accessible accessibilityLabel={`Tela ${pagina + 1} de ${PAGINAS.length}`} testID="pontos-do-tutorial">
          {PAGINAS.map((p, i) => (
            <Ponto key={p.chave} indice={i} posicao={posicao} />
          ))}
        </View>
        {pagina < ULTIMA ? (
          <>
            <Button title="Continuar" size="lg" onPress={() => irPara(pagina + 1)} />
            <Button title="Pular" variant="ghostOnDark" accessibilityHint="Vai para a última tela, de criar conta ou entrar" onPress={() => irPara(ULTIMA)} />
          </>
        ) : (
          <>
            <Button title="Criar minha conta" size="lg" onPress={() => sair('/(auth)/criar-conta')} />
            <Button title="Já tenho conta" variant="ghostOnDark" onPress={() => sair('/(auth)/login')} />
          </>
        )}
      </View>
    </View>
  );
}

/** Ponto da página: cresce para um traço quando é a atual, acompanhando o dedo. */
function Ponto({ indice, posicao }: { indice: number; posicao: SharedValue<number> }) {
  const estilo = useAnimatedStyle(() => {
    const perto = Math.max(0, 1 - Math.abs(posicao.value - indice));
    return {
      width: interpolate(perto, [0, 1], [8, 24]),
      backgroundColor: perto > 0.5 ? darkColors.text : darkColors.dotIdle,
    };
  });
  return <Animated.View style={[styles.ponto, estilo]} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1 },
  ilustracao: { borderBottomLeftRadius: radius.xl + 2, borderBottomRightRadius: radius.xl + 2, overflow: 'hidden' },
  textos: { paddingHorizontal: layout.gutter, paddingTop: spacing.xxl + spacing.xs, maxWidth: layout.maxContent },
  texto: { marginTop: spacing.md },
  baixo: { paddingHorizontal: layout.gutter, gap: spacing.xs, width: '100%', maxWidth: layout.maxContent, alignSelf: 'center' },
  pontos: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', marginBottom: spacing.xl },
  ponto: { height: 8, borderRadius: radius.pill },
});
