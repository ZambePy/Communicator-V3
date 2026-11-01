import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * O tutorial de boas-vindas aparece só na primeira abertura (31/10/2026).
 * Depois, quem está sem conta cai direto no login (que tem "Criar conta").
 * É uma conveniência deste aparelho: sem o armazenamento (lido com erro), o
 * tutorial aparece de novo, o que não atrapalha ninguém.
 */
export const CHAVE_DO_TUTORIAL = '@irisflow/tutorial-visto';

let lembrado: boolean | null = null;
const ouvintes = new Set<(v: boolean) => void>();

export async function tutorialJaVisto(): Promise<boolean> {
  if (lembrado !== null) return lembrado;
  try {
    lembrado = (await AsyncStorage.getItem(CHAVE_DO_TUTORIAL)) === '1';
  } catch {
    lembrado = false;
  }
  return lembrado;
}

export async function marcarTutorialVisto(): Promise<void> {
  lembrado = true;
  ouvintes.forEach((f) => f(true));
  await AsyncStorage.setItem(CHAVE_DO_TUTORIAL, '1').catch(() => undefined);
}

/** `null` enquanto lê; depois, se o tutorial já foi visto neste aparelho. */
export function useTutorialVisto(): boolean | null {
  const [visto, setVisto] = useState<boolean | null>(lembrado);
  useEffect(() => {
    let vivo = true;
    void tutorialJaVisto().then((v) => {
      if (vivo) setVisto(v);
    });
    ouvintes.add(setVisto);
    return () => {
      vivo = false;
      ouvintes.delete(setVisto);
    };
  }, []);
  return visto;
}

/** Só para testes: esquece o que foi lido. */
export function _esquecerTutorial(): void {
  lembrado = null;
}
