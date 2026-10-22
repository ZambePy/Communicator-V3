import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ClipboardList, FileText, MessageCircleQuestion, NotebookPen } from 'lucide-react';
import { BackButton } from '../../components/ui/BackButton';
import { GazeButton } from '../../components/ui/GazeButton';
import { GazeGrid } from '../../components/ui/GazeGrid';
import { DiarioRapido } from './DiarioRapido';
import { FolhaDaConsulta } from './FolhaDaConsulta';
import { PerguntasDaConsulta } from './PerguntasDaConsulta';

/**
 * Consulta (21/10/2026): preparar o que se leva ao médico. Três partes, cada
 * uma com poucos alvos para o olhar:
 *  - o diário do dia (sono e humor em dois toques; a dor vem do mapa da dor);
 *  - as perguntas que a pessoa quer fazer, escritas por ela no teclado ou
 *    por quem cuida;
 *  - a folha de uma página, com 7 ou 30 dias, para imprimir ou salvar em PDF.
 *
 * A parte aberta fica no endereço (`?v=`): o botão Voltar do sistema e o de
 * dentro da tela levam ao começo, e abrir de novo cai onde se estava.
 */

const PARTES = ['diario', 'perguntas', 'folha'] as const;
type Parte = (typeof PARTES)[number];

const alvo: React.CSSProperties = { width: '100%', height: '100%', borderRadius: 'var(--radius-xl, 2rem)' };
const pilha: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', padding: '0.75rem' };
const rotulo: React.CSSProperties = { fontSize: 'clamp(1.2rem, 2.5vh, 1.7rem)', fontWeight: 800, textAlign: 'center', lineHeight: 1.2 };

export const ConsultaScreen: React.FC = () => {
  const navigate = useNavigate();
  const [busca] = useSearchParams();
  const pedida = busca.get('v');
  const parte: Parte | null = PARTES.find((p) => p === pedida) ?? null;

  const porta = (v: Parte, icone: React.ReactNode, texto: string) => (
    <GazeButton onClick={() => navigate(`/consulta?v=${v}`)} style={alvo}>
      <span style={pilha}>
        {icone}
        <span style={rotulo}>{texto}</span>
      </span>
    </GazeButton>
  );

  return (
    <main
      role="main"
      aria-labelledby="consulta-title"
      style={{ minHeight: '100vh', background: 'var(--settings-bg)', display: 'flex', justifyContent: 'center', padding: '2rem 1.5rem', overflowY: 'auto' }}
    >
      <div
        className="glass-card coluna-livre-da-emergencia"
        style={{
          '--coluna-largura': '980px',
          width: '100%',
          maxWidth: 980,
          height: 'fit-content',
          background: 'var(--color-card-bg)',
          border: '1px solid var(--color-card-border)',
          borderRadius: '1.5rem',
          padding: '2rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
        } as React.CSSProperties}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <BackButton to={parte ? '/consulta' : '/settings'} />
          <h1 id="consulta-title" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-text-base)' }}>
            <ClipboardList size={22} color="var(--color-primary)" aria-hidden="true" />
            Consulta
          </h1>
        </div>

        {parte === null && (
          <>
            <p style={{ margin: 0, color: 'var(--color-text-base)', opacity: 0.85, lineHeight: 1.55 }}>
              Prepare a consulta: registre como foi o dia, deixe anotado o que perguntar e leve uma página ao médico.
            </p>
            <GazeGrid columns={3} rows={1}>
              {porta('diario', <NotebookPen size={44} aria-hidden="true" />, 'Diário de hoje')}
              {porta('perguntas', <MessageCircleQuestion size={44} aria-hidden="true" />, 'Perguntas para o médico')}
              {porta('folha', <FileText size={44} aria-hidden="true" />, 'Folha da consulta')}
            </GazeGrid>
          </>
        )}
        {parte === 'diario' && <DiarioRapido />}
        {parte === 'perguntas' && <PerguntasDaConsulta />}
        {parte === 'folha' && <FolhaDaConsulta />}
      </div>
    </main>
  );
};
