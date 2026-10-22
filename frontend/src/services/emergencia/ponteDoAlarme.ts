/**
 * Pede ao processo principal do Electron o que a página não alcança durante o
 * alarme de emergência: trazer a janela para a frente (inclusive minimizada ou
 * atrás de outra), mantê-la por cima, piscar na barra de tarefas e, se o ajuste
 * permitir, subir o volume do Windows ao máximo — devolvendo o volume anterior
 * quando o alarme para (`electron/alarme.ts`).
 *
 * Fora do Electron (navegador, testes) não há ponte, e o alarme fica só com o
 * som da página. Nunca lança: o alarme da página não pode depender disto.
 */

export interface OpcoesDoAlarmeDoSistema {
  volumeMaximo: boolean;
}

interface PonteDoAlarme {
  alarme?: (ligar: boolean, opcoes?: OpcoesDoAlarmeDoSistema) => Promise<unknown> | void;
}

function ponte(): PonteDoAlarme | null {
  if (typeof window === 'undefined') return null;
  const sys = (window as unknown as { irisflowSystem?: PonteDoAlarme }).irisflowSystem;
  return sys && typeof sys.alarme === 'function' ? sys : null;
}

let ligado = false;

export function ligarAlarmeDoSistema(opcoes: OpcoesDoAlarmeDoSistema): void {
  const p = ponte();
  if (!p || ligado) return;
  ligado = true;
  try {
    void Promise.resolve(p.alarme!(true, opcoes)).catch((e) => console.warn('[socorro] o sistema não atendeu o alarme', e));
  } catch (e) {
    console.warn('[socorro] o sistema não atendeu o alarme', e);
  }
}

export function desligarAlarmeDoSistema(): void {
  const p = ponte();
  if (!p || !ligado) return;
  ligado = false;
  try {
    void Promise.resolve(p.alarme!(false)).catch((e) => console.warn('[socorro] falha ao desligar o alarme do sistema', e));
  } catch (e) {
    console.warn('[socorro] falha ao desligar o alarme do sistema', e);
  }
}

/**
 * Na abertura da página sem pedido ativo (revisão de segurança de 19/10/2026).
 * O processo principal não recarrega junto com a página: um alarme ligado
 * antes de a página travar e ser recarregada (o vigia do renderer faz isso)
 * ficava preso — janela por cima de tudo, piscando, volume no máximo — sem
 * tela nenhuma que o desligasse. Manda "desligado" sem olhar o estado desta
 * página, que acabou de nascer e não sabe o que a anterior ligou.
 */
export function reconciliarAlarmeDoSistema(): void {
  const p = ponte();
  ligado = false;
  if (!p) return;
  try {
    void Promise.resolve(p.alarme!(false)).catch((e) => console.warn('[socorro] falha ao desligar o alarme do sistema', e));
  } catch (e) {
    console.warn('[socorro] falha ao desligar o alarme do sistema', e);
  }
}
