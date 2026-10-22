import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, TrendingUp } from 'lucide-react';
import { PrimaryButton } from '../../components/ui/PrimaryButton';

/**
 * Configurações → Evolução e consulta (21/10/2026): a porta para as duas telas
 * novas. É a única, de propósito: o menu do paciente tem nove cartões e o hub da
 * Comunicação, seis; quem prepara a consulta é quem cuida, e está aqui.
 */
export const AtalhoDeEvolucaoEConsulta: React.FC = () => {
  const navigate = useNavigate();
  return (
    <section
      aria-labelledby="atalho-evolucao-title"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        padding: '1.5rem',
        borderRadius: '1.25rem',
        background: 'var(--color-card-bg)',
        border: '1px solid var(--color-card-border)',
      }}
    >
      <h2
        id="atalho-evolucao-title"
        style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-text-base)' }}
      >
        <TrendingUp size={20} color="var(--color-primary)" aria-hidden="true" />
        Evolução e consulta
      </h2>
      <p style={{ margin: 0, fontSize: '0.98rem', lineHeight: 1.55, color: 'var(--color-text-base)', opacity: 0.85 }}>
        A evolução mostra, semana a semana, como foram a calibração, a velocidade e o cansaço. A consulta guarda o diário de sono e humor,
        as perguntas para o médico e uma página para levar ao médico, para imprimir ou salvar em PDF.
      </p>
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <PrimaryButton type="button" variant="secondary" onClick={() => navigate('/evolucao')}>
          <TrendingUp size={17} aria-hidden="true" /> Ver a evolução semanal
        </PrimaryButton>
        <PrimaryButton type="button" variant="secondary" onClick={() => navigate('/consulta')}>
          <FileText size={17} aria-hidden="true" /> Abrir a consulta
        </PrimaryButton>
      </div>
    </section>
  );
};
