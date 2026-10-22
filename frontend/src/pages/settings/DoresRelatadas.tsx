import React from 'react';
import { HeartPulse } from 'lucide-react';
import type { RegistroDeDor } from '../../utils/clinicalLogger';
import { faixaDoNivel } from '../core/dor/regioesDoCorpo';

/** Quantos relatos o cartão mostra (a exportação leva todos). */
const NA_LISTA = 8;
const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Configurações → Histórico clínico: o que o paciente relatou no mapa da dor
 * (19/10/2026). Lugar e nível como dados — a lista e a exportação em JSON do
 * relatório clínico (que já leva o histórico inteiro, `dores` incluído).
 *
 * O nível aparece em número, palavra e cor; a cor nunca sozinha.
 */
export const DoresRelatadas: React.FC<{ dores: readonly RegistroDeDor[]; agora?: number }> = ({ dores, agora = Date.now() }) => {
  const validos = dores.filter((d) => d && typeof d.nivel === 'number' && Number.isFinite(Date.parse(d.timestamp)));
  const recentes = [...validos].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  const semana = recentes.filter((d) => agora - Date.parse(d.timestamp) <= SETE_DIAS_MS);
  const maiorNaSemana = semana.reduce((m, d) => Math.max(m, d.nivel), -1);

  return (
    <div
      data-testid="dores-relatadas"
      style={{
        background: 'var(--color-bg-base)',
        border: '1.5px solid var(--color-card-border)',
        borderRadius: '1.25rem',
        padding: '1.25rem',
      }}
    >
      <h3
        style={{
          fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-text-muted)', margin: '0 0 1rem 0',
          display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}
      >
        <HeartPulse size={20} color="var(--color-primary)" aria-hidden="true" /> Dores relatadas ({recentes.length})
      </h3>
      {recentes.length === 0 ? (
        <p style={{ fontSize: '0.95rem', color: 'var(--color-text-muted)', fontStyle: 'italic', margin: 0 }}>
          Nenhuma dor relatada no mapa da dor.
        </p>
      ) : (
        <>
          <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', color: 'var(--color-text-base)' }}>
            {semana.length === 0
              ? 'Nenhum relato nos últimos 7 dias.'
              : `${semana.length} ${semana.length === 1 ? 'relato' : 'relatos'} nos últimos 7 dias · maior nível: ${maiorNaSemana} de 10`}
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 260, overflowY: 'auto' }}>
            {recentes.slice(0, NA_LISTA).map((d) => {
              const faixa = faixaDoNivel(d.nivel);
              return (
                <li
                  key={d.id}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem',
                    padding: '0.6rem 0.85rem', background: 'var(--color-card-bg)',
                    border: '1.5px solid var(--color-card-border)', borderLeft: `6px solid ${faixa.cor}`, borderRadius: '0.75rem',
                  }}
                >
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text-base)' }}>{d.lugar}</span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                      {new Date(d.timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </span>
                  <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-text-base)', whiteSpace: 'nowrap' }}>
                    {d.nivel}/10 · {faixa.rotulo.toLowerCase()}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
};
