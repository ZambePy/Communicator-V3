import { Easing, FadeIn, FadeInDown, FadeInRight, FadeInUp, FadeOut, FadeOutLeft, LinearTransition } from 'react-native-reanimated';
import { useReduceMotion } from './ThemeProvider';
import { easing, motion } from './tokens';

/** Saída forte para o que entra na tela (Emil: nunca `ease-in` em interface). */
export const EASE_OUT = Easing.bezier(...easing.out);
/** Para o que se move dentro da tela. */
export const EASE_IN_OUT = Easing.bezier(...easing.inOut);

/**
 * Animações de entrada que respeitam "reduzir movimento": com a preferência
 * ligada, devolvem `undefined` e o elemento aparece já no lugar.
 *
 *   const entrada = useEntrada();
 *   <Animated.View entering={entrada.cascata(i)} />
 */
export function useEntrada() {
  const reduzir = useReduceMotion();
  return {
    reduzir,
    /** Sobe e aparece, com atraso proporcional à posição na lista. */
    cascata: (indice = 0) => (reduzir ? undefined : FadeInDown.delay(indice * motion.stagger).duration(motion.duration.base).easing(EASE_OUT)),
    /** Só aparece. */
    suave: () => (reduzir ? undefined : FadeIn.duration(motion.duration.base).easing(EASE_OUT)),
    /** Some. */
    saida: () => (reduzir ? undefined : FadeOut.duration(motion.duration.fast)),
    /** Mensagem que acabou de chegar (ou de ser enviada): sobe um pouco e assenta, sem balanço. */
    mensagem: (minha = false) =>
      reduzir ? undefined : (minha ? FadeInUp : FadeInDown).springify().duration(motion.spring.settle.duration).dampingRatio(motion.spring.settle.dampingRatio),
    /** Passo seguinte de um fluxo (cadastro): entra pela direita. */
    passo: () => (reduzir ? undefined : FadeInRight.duration(motion.duration.base).easing(EASE_OUT)),
    /** Passo que sai pela esquerda. */
    passoSaida: () => (reduzir ? undefined : FadeOutLeft.duration(motion.duration.fast)),
    /** Lista que muda de forma (item entrou, saiu ou trocou de tamanho). */
    layout: () => (reduzir ? undefined : LinearTransition.duration(motion.duration.base).easing(EASE_IN_OUT)),
  };
}
