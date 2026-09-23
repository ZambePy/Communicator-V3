import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mic } from 'lucide-react';
import { GazePageLayout } from '../../components/ui/GazePageLayout';
import { GazeButton } from '../../components/ui/GazeButton';

/**
 * Telas anunciadas no menu que ainda não têm módulo por trás: hoje, só o
 * Controle de Voz. Um cartão do menu não pode levar a lugar nenhum — o
 * paciente não tem como saber que "não fez nada" e tenta de novo.
 *
 * Quando o módulo existir, troque a rota em App.tsx e apague o caso daqui.
 * (Acessibilidade saiu daqui: virou `pages/acessibilidade/AcessibilidadeScreen`.)
 */
type Modulo = 'voz';

const CONTEUDO: Record<Modulo, { titulo: string; icone: React.ReactNode; badge: string; texto: string }> = {
  voz: {
    titulo: 'Controle de Voz',
    icone: <Mic size={56} />,
    badge: '#5EEAD4',
    texto: 'Os comandos por voz ainda estão em desenvolvimento. Por enquanto, o teclado e as frases rápidas continuam sendo o caminho para falar.',
  },
};

const EmBreve: React.FC<{ modulo: Modulo }> = ({ modulo }) => {
  const navigate = useNavigate();
  const c = CONTEUDO[modulo];

  return (
    <GazePageLayout showBack backRoute="/menu">
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 'var(--space-5)',
          textAlign: 'center',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 120, height: 120, borderRadius: '50%', background: c.badge, color: 'var(--color-navy)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--shadow-2)',
          }}
        >
          {c.icone}
        </div>
        <span className="t-overline">Em breve</span>
        <h1 className="t-display" style={{ margin: 0, color: 'var(--color-text-base)' }}>{c.titulo}</h1>
        <p className="t-body-lg" style={{ maxWidth: '52ch', margin: 0, color: 'var(--color-text-muted)' }}>
          {c.texto}
        </p>
        {/* Dois alvos lado a lado, ambos acima do mínimo de 5° em altura e
            com folga de 1,5° entre eles. */}
        <div style={{ display: 'flex', gap: '3.75rem', marginTop: 'var(--space-4)', flexWrap: 'wrap', justifyContent: 'center' }}>
          <GazeButton onClick={() => navigate('/menu')} width={340} height={200} style={{ borderRadius: 'var(--radius-lg)' }}>
            <ArrowLeft size={30} aria-hidden="true" /> <span style={{ fontSize: '1.4rem', fontWeight: 800 }}>Voltar ao menu</span>
          </GazeButton>
        </div>
      </div>
    </GazePageLayout>
  );
};

export const VoiceControlScreen: React.FC = () => <EmBreve modulo="voz" />;
