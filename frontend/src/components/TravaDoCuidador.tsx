import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Rotas da área do cuidador. Todas saem de Configurações; sair delas fecha a
 * área (ver `TravaDoCuidador`).
 */
export const ROTAS_DO_CUIDADOR = ['/settings', '/caregiver', '/conta', '/historico', '/relatorio'] as const;

export function ehRotaDoCuidador(pathname: string): boolean {
  return ROTAS_DO_CUIDADOR.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

/** Sem mouse, teclado nem roda por este tempo, a área do cuidador se fecha. */
export const INATIVIDADE_DO_CUIDADOR_MS = 5 * 60_000;

/**
 * Trava automática da área do cuidador (FE-1).
 *
 * O PIN destravava a área pela sessão INTEIRA da janela — no Electron, dias.
 * Depois do cuidador, o paciente chegava a Configurações pelo cartão do menu,
 * sem PIN, e podia ligar o modo apresentação (que descarta os pedidos de
 * socorro), sair da máquina ou refazer a apresentação, tudo pelo olhar.
 *
 * Agora a área se fecha:
 *   - ao sair das rotas do cuidador (Voltar, menu, calibração, emergência…);
 *   - esquecida aberta: sem entrada física por `INATIVIDADE_DO_CUIDADOR_MS`.
 *     O clique pelo olhar é um `.click()` da página (`isTrusted` falso) e não
 *     conta como alguém presente com o mouse.
 * Fechar a área não desmarca o paciente (`encerrarAcessoDoCuidador`).
 */
export const TravaDoCuidador: React.FC = () => {
  const { isCaregiver, encerrarAcessoDoCuidador } = useAuth();
  const { pathname } = useLocation();

  useEffect(() => {
    if (isCaregiver && !ehRotaDoCuidador(pathname)) encerrarAcessoDoCuidador?.();
  }, [isCaregiver, pathname, encerrarAcessoDoCuidador]);

  useEffect(() => {
    if (!isCaregiver || !encerrarAcessoDoCuidador) return;
    let timer = setTimeout(encerrarAcessoDoCuidador, INATIVIDADE_DO_CUIDADOR_MS);
    const mexeu = (e: Event) => {
      if (!e.isTrusted) return;
      clearTimeout(timer);
      timer = setTimeout(encerrarAcessoDoCuidador, INATIVIDADE_DO_CUIDADOR_MS);
    };
    const eventos = ['pointerdown', 'pointermove', 'keydown', 'wheel'] as const;
    for (const ev of eventos) window.addEventListener(ev, mexeu, { capture: true, passive: true });
    return () => {
      clearTimeout(timer);
      for (const ev of eventos) window.removeEventListener(ev, mexeu, { capture: true });
    };
  }, [isCaregiver, encerrarAcessoDoCuidador]);

  return null;
};
