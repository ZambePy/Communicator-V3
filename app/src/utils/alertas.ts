import type { HelpRequest } from '@/data/types';
import { hm } from './format';

/** "Ontem, 22:10" / "Hoje, 09:12" / "12/10, 08:00" */
export function quando(iso: string, agora = new Date()): string {
  const d = new Date(iso);
  const ontem = new Date(agora);
  ontem.setDate(agora.getDate() - 1);
  const dia = d.toDateString() === agora.toDateString() ? 'Hoje' : d.toDateString() === ontem.toDateString() ? 'Ontem' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${dia}, ${hm(iso)}`;
}

/**
 * O que acontece com um pedido urgente agora, numa frase (mock 08). Só o que
 * vale para ESTE pedido — no lugar da explicação fixa do prazo que ficava no
 * topo da tela.
 */
export function situacaoDoPedido(h: HelpRequest, prazoS: number, agoraMs = Date.now()): string {
  if (h.acknowledged_at) return `Respondido às ${hm(h.acknowledged_at)}.`;
  if (h.escalated_at) return 'Ninguém respondeu a tempo. Foi para todos os celulares.';
  const recebido = Date.parse(h.received_at ?? h.created_at);
  const faltam = Math.ceil((recebido + prazoS * 1000 - agoraMs) / 1000);
  if (Number.isFinite(faltam) && faltam > 0) return `Ainda ninguém respondeu. Em ${faltam} s vai para os outros celulares.`;
  return 'Ainda ninguém respondeu. Já vai para os outros celulares.';
}
