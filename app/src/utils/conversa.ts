import { Message } from '@/data/types';
import { dateLong } from './format';

export type LinhaDaConversa = { type: 'day'; key: string; label: string } | { type: 'msg'; key: string; message: Message };

/**
 * As linhas da conversa: rótulo de dia + mensagens, em ordem cronológica.
 *
 * A ordem é refeita aqui (e não só confiada à lista): uma mensagem que esperou
 * na fila offline do computador chega pelo tempo real depois das de hoje, com
 * o horário real de ontem. A chave do rótulo leva a primeira mensagem do
 * grupo — antes era só a data, e um segundo grupo do mesmo dia repetia a
 * chave (o React avisa e pode omitir itens).
 */
export function agruparPorDia(messages: Message[], hoje: Date = new Date()): LinhaDaConversa[] {
  const ordenadas = [...messages].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const rows: LinhaDaConversa[] = [];
  const diaDeHoje = hoje.toDateString();
  let lastDay = '';
  for (const m of ordenadas) {
    const day = new Date(m.created_at).toDateString();
    if (day !== lastDay) {
      rows.push({ type: 'day', key: `day-${day}-${m.id}`, label: day === diaDeHoje ? 'Hoje' : dateLong(m.created_at) });
      lastDay = day;
    }
    rows.push({ type: 'msg', key: m.id, message: m });
  }
  return rows;
}
