import { useEffect, useState } from 'react';

// Modo desenvolvedor: esconde o cursor de gaze e desliga o dwell para quem está
// operando com mouse. Fica em sessionStorage para sobreviver a um F5 e morrer
// com a aba; a mudança é avisada por evento para o provider reagir na hora.
//
// SÓ EXISTE NO BUILD DE DESENVOLVIMENTO (`npm run dev` / `electron:dev`). Ele
// pula licença, termo, perfil e calibração — no instalador seria uma porta
// para usar o produto sem assinatura e um painel de engenharia na mão do
// cuidador. No build de produção `import.meta.env.DEV` é `false` em tempo de
// compilação: os botões de entrada nem chegam ao bundle, e mesmo uma chave
// deixada no sessionStorage não liga nada.

const KEY = 'irisflow_dev_mode';
const EVENT = 'irisflow:devmode';

export function isDevMode(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return sessionStorage.getItem(KEY) === 'true';
  } catch {
    return false;
  }
}

export function setDevMode(on: boolean): void {
  if (on && !import.meta.env.DEV) return;
  try {
    if (on) sessionStorage.setItem(KEY, 'true');
    else sessionStorage.removeItem(KEY);
  } catch { /* sessionStorage indisponível */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: on }));
}

export function onDevModeChange(cb: (on: boolean) => void): () => void {
  const handler = (e: Event) => cb(Boolean((e as CustomEvent).detail));
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

/** Versão reativa de `isDevMode`, para componentes que mostram ou escondem algo. */
export function useDevMode(): boolean {
  const [on, setOn] = useState(isDevMode);
  useEffect(() => onDevModeChange(setOn), []);
  return on;
}
