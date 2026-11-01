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
      rows.push({ type: 'day', key: `day-${day}-${m.clientId ?? m.id}`, label: day === diaDeHoje ? 'Hoje' : dateLong(m.created_at) });
      lastDay = day;
    }
    // `clientId`: a mensagem enviada daqui guarda a chave que teve enquanto era
    // enviada — o balão não pisca nem anima de novo quando o banco confirma.
    rows.push({ type: 'msg', key: m.clientId ?? m.id, message: m });
  }
  return rows;
}

/** O estado de um balão do cuidador, em palavras (mock 07). */
export function estadoDoEnvio(m: Message): { texto: string; tom: 'muted' | 'accent' | 'danger' } {
  if (m.envio === 'enviando') return { texto: 'Enviando…', tom: 'muted' };
  if (m.envio === 'falhou') return { texto: 'Não enviou. Tocar para tentar de novo', tom: 'danger' };
  if (m.spoken) return { texto: 'Falado na tela', tom: 'accent' };
  return { texto: 'Enviado', tom: 'muted' };
}
