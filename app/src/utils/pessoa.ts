import type { Beneficiary, Condition, Relation } from '@/data/types';

/**
 * Rótulos curtos da pessoa acompanhada (31/10/2026, mock 05 e 09). A relação é
 * "quem a pessoa é para você" — o mesmo sentido do site (`FormularioPesquisa`).
 */
export const RELACOES: { value: Relation; label: string }[] = [
  { value: 'pai-mae', label: 'Mãe ou pai' },
  { value: 'conjuge', label: 'Cônjuge' },
  { value: 'filho', label: 'Filho ou filha' },
  { value: 'cuidador', label: 'Paciente' },
  { value: 'outro', label: 'Outro' },
];

/** Condição: opcional na tela; sem escolha vai `prefiro-nao`. */
export const CONDICOES: { value: Condition; label: string }[] = [
  { value: 'ela', label: 'ELA' },
  { value: 'avc', label: 'AVC' },
  { value: 'tetraplegia', label: 'Lesão medular' },
  { value: 'outra', label: 'Outra' },
];

const RELACAO_CURTA: Record<Relation, string> = {
  'pai-mae': 'Mãe ou pai',
  conjuge: 'Cônjuge',
  filho: 'Filho ou filha',
  irmao: 'Irmão ou irmã',
  cuidador: 'Paciente',
  proprio: 'Você mesmo',
  outro: 'Outro',
};

const CONDICAO_CURTA: Record<Condition, string | null> = {
  ela: 'ELA',
  avc: 'AVC',
  tetraplegia: 'Lesão medular',
  pc: 'Paralisia cerebral',
  distrofia: 'Distrofia muscular',
  outra: 'Outra condição',
  'prefiro-nao': null,
};

/** "Cônjuge, ELA" — sem a condição quando ela não foi informada. */
export function resumoDaPessoa(b: Pick<Beneficiary, 'relation' | 'condition'>): string {
  return [RELACAO_CURTA[b.relation], CONDICAO_CURTA[b.condition]].filter(Boolean).join(', ');
}

/** Só os dígitos do que foi digitado. */
export function soDigitos(v: string): string {
  return v.replace(/\D/g, '');
}

/** "(11) 9 8765-4321" para 11 dígitos, "(11) 3456-7890" para 10. Outros tamanhos voltam como estão. */
export function formatarCelular(v: string | null | undefined): string {
  const d = soDigitos(v ?? '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v ?? '';
}

/** Duas letras ou mais (o CHECK de `beneficiaries.user_name`). */
export function nomeDaPessoaValido(nome: string): boolean {
  return nome.replace(/[^A-Za-zÀ-ÿ]/g, '').length >= 2;
}

/** "1 ligado", "2 computadores", "Nenhum" */
export function resumoDosComputadores(devices: { revoked_at: string | null; online: boolean }[]): string {
  const ativos = devices.filter((d) => !d.revoked_at);
  if (ativos.length === 0) return 'Nenhum';
  const ligados = ativos.filter((d) => d.online).length;
  if (ligados > 0) return ligados === 1 ? '1 ligado' : `${ligados} ligados`;
  return ativos.length === 1 ? '1 desligado' : `${ativos.length} desligados`;
}
