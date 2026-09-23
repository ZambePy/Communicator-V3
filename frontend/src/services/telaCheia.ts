/**
 * O que dizer sobre a tela cheia — e sobre como SAIR dela.
 *
 * O IrisFlow abre em tela cheia no Electron (`electron/main.ts`, `TELA_CHEIA`)
 * por validade de medida, não por estética: a conversão px→cm usa o viewport
 * contra a diagonal física do monitor, e só em tela cheia os dois coincidem.
 * Mas uma tela cheia sem saída explicada assusta o cuidador ("travou?") e ele
 * acaba desligando o computador no botão.
 *
 * A saída descrita aqui é a que o código de fato implementa
 * (`alternaTelaCheia` em `src/electronSecurity.ts`): F11 alterna — no macOS,
 * Ctrl+Cmd+F —, e Alt+F4 / Cmd+Q fecham o aplicativo. Se um dia isso mudar lá,
 * este texto tem de mudar junto (o teste confere as duas pontas).
 */

export const POR_QUE_TELA_CHEIA =
  'O IrisFlow funciona em tela cheia para que os alvos fiquem grandes e o olhar seja medido corretamente.';

/** Fase do produto, dita ao usuário — a assinatura e o site falam em beta. */
export const FASE_DO_PRODUTO = 'Beta';

export const SOBRE_O_BETA =
  'Esta é uma versão Beta: o IrisFlow ainda está em testes com famílias. Se algo parecer errado, ' +
  'o relatório de suporte (em Configurações) ajuda a equipe a entender.';

export const SOBRE_ATUALIZACOES =
  'As atualizações chegam sozinhas: baixam em segundo plano, sem interromper, e entram quando o ' +
  'aplicativo reinicia. Quando uma versão nova estiver pronta, aparece um aviso com "Reiniciar agora" e "Depois".';

export interface Plataforma {
  /** Rodando dentro do app instalado (há ponte do Electron). */
  electron: boolean;
  /** macOS — os atalhos mudam. */
  mac: boolean;
}

export function detectarPlataforma(): Plataforma {
  if (typeof window === 'undefined') return { electron: false, mac: false };
  const w = window as unknown as { irisflowSystem?: unknown; irisflowCloud?: unknown };
  const electron = w.irisflowSystem !== undefined || w.irisflowCloud !== undefined;
  const ua = typeof navigator !== 'undefined' ? `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}` : '';
  return { electron, mac: /Mac/i.test(ua) };
}

export interface InstrucaoDeSaida {
  /** Tecla que alterna a tela cheia. */
  alternar: string;
  /** Atalho que fecha o aplicativo. */
  fechar: string;
  /** Frase pronta para o cuidador. */
  texto: string;
}

export function instrucaoDeSaida(p: Plataforma): InstrucaoDeSaida {
  const alternar = p.mac ? 'Ctrl + Cmd + F' : 'F11';
  const fechar = p.mac ? 'Cmd + Q' : 'Alt + F4';
  if (!p.electron) {
    // No navegador (desenvolvimento/demonstração) quem manda é o navegador.
    return {
      alternar,
      fechar,
      texto: `No navegador, ${alternar} liga e desliga a tela cheia.`,
    };
  }
  return {
    alternar,
    fechar,
    texto:
      `Para sair da tela cheia, o cuidador aperta ${alternar} no teclado — e aperta de novo para voltar. ` +
      `Para fechar o IrisFlow: ${fechar}.`,
  };
}
