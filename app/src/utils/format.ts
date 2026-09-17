import { Condition, DriftKind, FatigueLevel, FilterPreset, HelpKind, Relation, Session } from '@/data/types';

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return 'ontem';
  return `há ${d} dias`;
}

export function hm(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function dateShort(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
}

export function dateLong(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

/** Data numérica completa (dd/mm/aaaa), ex.: "acesso até 15/03/2027". */
export function formatDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function durationMin(s: Session) {
  const end = s.ended_at ? new Date(s.ended_at).getTime() : Date.now();
  return Math.max(1, Math.round((end - new Date(s.started_at).getTime()) / 60_000));
}

export function formatDuration(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export const relationLabel: Record<Relation, string> = {
  conjuge: 'Cônjuge',
  filho: 'Filho(a)',
  'pai-mae': 'Pai/Mãe',
  irmao: 'Irmão(ã)',
  cuidador: 'Cuidador(a)',
  proprio: 'Próprio usuário',
  outro: 'Outro',
};

export const conditionLabel: Record<Condition, string> = {
  ela: 'ELA',
  tetraplegia: 'Tetraplegia',
  pc: 'Paralisia cerebral',
  avc: 'Sequela de AVC',
  distrofia: 'Distrofia muscular',
  outra: 'Outra condição',
  'prefiro-nao': 'Não informado',
};

export const helpKindLabel: Record<HelpKind, string> = {
  ajuda: 'Pedido de ajuda',
  emergencia: 'Pedido de socorro',
  postura: 'Aviso de postura',
  fadiga: 'Sinal de fadiga',
  recalibracao: 'Recalibração recomendada',
  dispositivo: 'Problema no dispositivo',
};

export const fatigueLabel: Record<FatigueLevel, string> = { ok: 'Descansado', atencao: 'Atenção', alta: 'Fadiga alta' };
export const driftLabel: Record<DriftKind, string> = { nenhum: 'Estável', lento: 'Desvio lento', erratico: 'Desvio errático' };
export const presetLabel: Record<FilterPreset, string> = { estavel: 'Estável', balanceado: 'Balanceado', responsivo: 'Responsivo' };

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}
