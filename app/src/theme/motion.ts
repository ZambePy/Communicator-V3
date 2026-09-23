import { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useReduceMotion } from './ThemeProvider';
import { motion } from './tokens';

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
    cascata: (indice = 0) => (reduzir ? undefined : FadeInDown.delay(indice * motion.stagger).duration(motion.duration.base)),
    /** Só aparece. */
    suave: () => (reduzir ? undefined : FadeIn.duration(motion.duration.base)),
    /** Some. */
    saida: () => (reduzir ? undefined : FadeOut.duration(motion.duration.fast)),
  };
}
