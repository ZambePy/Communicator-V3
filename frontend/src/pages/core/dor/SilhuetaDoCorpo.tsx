import React from 'react';
import type { LocalDaDor, Vista } from './regioesDoCorpo';

/**
 * Silhueta do corpo, de frente ou de costas, com a região da dor acesa.
 *
 * É ilustração dentro de um alvo grande — nunca o alvo em si (ver o cabeçalho
 * de `regioesDoCorpo.ts`): as regiões aqui têm o tamanho do desenho, não o do
 * olhar. Por isso `aria-hidden`: quem lê a tela ouve o rótulo do botão.
 *
 * A esquerda do desenho é a esquerda do PACIENTE. Na vista de costas isso é
 * literal (é como a pessoa se veria por trás); na de frente não há rosto de
 * propósito, para o desenho não ser lido como "outra pessoa olhando para mim".
 * Os braços, as mãos, as pernas e os pés sempre aparecem na vista de costas.
 */

type Regiao =
  | 'cabeca' | 'pescoco' | 'peito' | 'barriga' | 'tronco'
  | 'bracoE' | 'bracoD' | 'maoE' | 'maoD' | 'pernaE' | 'pernaD' | 'peE' | 'peD';

const CAMINHOS: Record<Exclude<Regiao, 'cabeca' | 'maoE' | 'maoD'>, string> = {
  pescoco: 'M53,36 L67,36 L68,47 L52,47 Z',
  peito: 'M31,57 C31,50 37,47 45,47 L75,47 C83,47 89,50 89,57 L86,84 L34,84 Z',
  barriga: 'M34,84 L86,84 L84,112 C76,118 44,118 36,112 Z',
  tronco: 'M31,57 C31,50 37,47 45,47 L75,47 C83,47 89,50 89,57 L86,84 L84,112 C76,118 44,118 36,112 L34,84 Z',
  bracoE: 'M30,52 C24,53 21,58 20,65 L14,114 L24,116 L31,74 Z',
  bracoD: 'M90,52 C96,53 99,58 100,65 L106,114 L96,116 L89,74 Z',
  pernaE: 'M37,114 C44,119 52,120 58,119 L57,197 L45,197 Z',
  pernaD: 'M83,114 C76,119 68,120 62,119 L63,197 L75,197 Z',
  peE: 'M44,199 L57,199 L58,207 C52,210 44,210 39,207 Z',
  peD: 'M76,199 L63,199 L62,207 C68,210 76,210 81,207 Z',
};

/** Quais regiões do desenho acendem para um ou mais lugares. Exportado para teste. */
export function regioesAcesas(destaque: LocalDaDor | readonly LocalDaDor[] | null, vista: Vista): Set<Regiao> {
  const acesas = new Set<Regiao>();
  if (!destaque) return acesas;
  const locais: readonly LocalDaDor[] = Array.isArray(destaque) ? destaque : [destaque as LocalDaDor];
  for (const local of locais) acenderLocal(acesas, local, vista);
  return acesas;
}

function acenderLocal(acesas: Set<Regiao>, local: LocalDaDor, vista: Vista): void {
  const lados = (e: Regiao, d: Regiao) => {
    if (local.lado === 'esquerdo' || local.lado === 'ambos') acesas.add(e);
    if (local.lado === 'direito' || local.lado === 'ambos') acesas.add(d);
  };
  switch (local.parte) {
    case 'cabeca': acesas.add('cabeca'); break;
    case 'pescoco': acesas.add('pescoco'); break;
    case 'peito': acesas.add(vista === 'costas' ? 'tronco' : 'peito'); break;
    case 'barriga': acesas.add(vista === 'costas' ? 'tronco' : 'barriga'); break;
    // As costas só existem na vista de costas: de frente, acender o peito
    // diria outra coisa.
    case 'costas': if (vista === 'costas') acesas.add('tronco'); break;
    case 'braco': lados('bracoE', 'bracoD'); break;
    case 'mao': lados('maoE', 'maoD'); break;
    case 'perna': lados('pernaE', 'pernaD'); break;
    case 'pe': lados('peE', 'peD'); break;
    case 'corpo':
      for (const r of ['cabeca', 'pescoco', 'peito', 'barriga', 'tronco', 'bracoE', 'bracoD', 'maoE', 'maoD', 'pernaE', 'pernaD', 'peE', 'peD'] as Regiao[]) acesas.add(r);
      break;
  }
}

const BASE = { fill: 'rgba(159, 176, 200, 0.22)', stroke: 'rgba(159, 176, 200, 0.6)' };

export const SilhuetaDoCorpo: React.FC<{
  vista: Vista;
  destaque: LocalDaDor | readonly LocalDaDor[] | null;
  /** Cor da região acesa. Padrão: o âmbar de "compromisso" do app. */
  cor?: string;
  altura?: string;
}> = ({ vista, destaque, cor = '#F0A030', altura = '100%' }) => {
  const acesas = regioesAcesas(destaque, vista);
  const estilo = (r: Regiao): { fill: string; stroke: string; strokeWidth: number } =>
    acesas.has(r)
      ? { fill: cor, stroke: '#FFF4D6', strokeWidth: 1.6 }
      : { fill: BASE.fill, stroke: BASE.stroke, strokeWidth: 1.2 };
  const caminho = (r: keyof typeof CAMINHOS) => (
    <path key={r} d={CAMINHOS[r]} data-regiao={r} data-acesa={acesas.has(r) ? 'true' : undefined} {...estilo(r)} />
  );

  return (
    <svg
      viewBox="0 0 120 214"
      aria-hidden="true"
      focusable="false"
      data-vista={vista}
      style={{ height: altura, width: 'auto', display: 'block', overflow: 'visible' }}
    >
      <ellipse cx="60" cy="21" rx="14" ry="16" data-regiao="cabeca" data-acesa={acesas.has('cabeca') ? 'true' : undefined} {...estilo('cabeca')} />
      {caminho('pescoco')}
      {vista === 'frente' ? [caminho('peito'), caminho('barriga')] : caminho('tronco')}
      {caminho('bracoE')}
      {caminho('bracoD')}
      <ellipse cx="18" cy="124" rx="6.5" ry="8.5" data-regiao="maoE" data-acesa={acesas.has('maoE') ? 'true' : undefined} {...estilo('maoE')} />
      <ellipse cx="102" cy="124" rx="6.5" ry="8.5" data-regiao="maoD" data-acesa={acesas.has('maoD') ? 'true' : undefined} {...estilo('maoD')} />
      {caminho('pernaE')}
      {caminho('pernaD')}
      {caminho('peE')}
      {caminho('peD')}
      {/* De costas: a coluna e as escápulas dizem "costas" sem palavra. De
          frente: clavícula e umbigo, discretos — sem rosto (ver acima). */}
      {vista === 'costas' ? (
        <g fill="none" stroke="rgba(244, 247, 251, 0.45)" strokeWidth="1.4" strokeLinecap="round">
          <path d="M60,50 L60,111" />
          <path d="M44,60 C48,66 52,66 54,62" />
          <path d="M76,60 C72,66 68,66 66,62" />
        </g>
      ) : (
        <g fill="none" stroke="rgba(244, 247, 251, 0.35)" strokeWidth="1.3" strokeLinecap="round">
          <path d="M45,53 Q60,57 75,53" />
          <circle cx="60" cy="101" r="1.4" fill="rgba(244, 247, 251, 0.45)" stroke="none" />
        </g>
      )}
    </svg>
  );
};
