import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Para onde ir depois do PIN do cuidador.
 *
 * As rotas da área do cuidador (guia, conta, relatório, histórico, voz), com a
 * área fechada, vão para Configurações, que mostra o portão do PIN. Sem lembrar
 * o destino, quem tocava em "Ver Guia de Instalação e Dicas do Cuidador" na
 * falha da calibração digitava o PIN e caía nas Configurações — e tinha de
 * achar o guia de novo, num momento em que já está tentando resolver um
 * problema.
 */
export interface EstadoDoPortao {
  depoisDoPin?: string;
}

/** O destino guardado pelo portão, se for um caminho do próprio app. */
export function lerDestinoDepoisDoPin(estado: unknown): string | null {
  const d = (estado as EstadoDoPortao | null)?.depoisDoPin;
  return typeof d === 'string' && d.startsWith('/') && !d.startsWith('//') ? d : null;
}

/** Ao destravar a área do cuidador, segue para o destino guardado pelo portão. */
export function useSeguirDepoisDoPin(areaAberta: boolean): void {
  const location = useLocation();
  const navigate = useNavigate();
  const destino = lerDestinoDepoisDoPin(location.state);
  useEffect(() => {
    if (areaAberta && destino) navigate(destino, { replace: true });
  }, [areaAberta, destino, navigate]);
}
