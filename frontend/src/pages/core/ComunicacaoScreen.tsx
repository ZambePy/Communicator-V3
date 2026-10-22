import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, CheckCircle2, LayoutGrid, Heart, PersonStanding, MicVocal, type LucideIcon } from 'lucide-react';
import { GazePageLayout } from '../../components/ui/GazePageLayout';
import { GazeGrid } from '../../components/ui/GazeGrid';
import { GazeButton } from '../../components/ui/GazeButton';

export interface CartaoDaComunicacao {
  id: string;
  titulo: string;
  descricao: string;
  rota: string;
  Icone: LucideIcon;
  cor: string;
}

/**
 * As formas de se comunicar, num lugar só (19/10/2026). O cartão "Comunicação"
 * do menu levava direto às frases rápidas; com a tela Sim · Não (Plano B) e as
 * próximas — mapa da dor, voz guardada — elas precisavam de um caminho pelo
 * olhar sem estourar a grade 3×3 do menu. As frases continuam a um olhar daqui
 * (primeiro cartão), e o tutorial e a tela de boas-vindas seguem indo direto a
 * elas.
 */
export const CARTOES_DA_COMUNICACAO: CartaoDaComunicacao[] = [
  { id: 'frases', titulo: 'Frases rápidas', descricao: 'O dia a dia, falado na hora', rota: '/phrases', Icone: MessageSquare, cor: '#FF8A8A' },
  { id: 'sim-nao', titulo: 'Sim · Não · Chamar', descricao: 'Responder com um olhar', rota: '/sim-nao', Icone: CheckCircle2, cor: '#6EE7A0' },
  { id: 'pictogramas', titulo: 'Pictogramas', descricao: 'Imagens que falam', rota: '/pictograms', Icone: LayoutGrid, cor: '#7DB4F5' },
  { id: 'opcoes', titulo: 'Minhas opções', descricao: 'Frases favoritas', rota: '/options', Icone: Heart, cor: '#C89BF7' },
  // 19/10/2026: o mapa da dor e a voz guardada. Com seis cartões a grade
  // passa a 3 × 2 — os alvos continuam no piso de 5° da `GazeGrid`.
  { id: 'dor', titulo: 'Onde dói', descricao: 'Mostrar onde e quanto', rota: '/dor', Icone: PersonStanding, cor: '#FDBA74' },
  { id: 'minha-voz', titulo: 'Minha voz', descricao: 'Mensagens guardadas', rota: '/minha-voz', Icone: MicVocal, cor: '#5EEAD4' },
];

export const ComunicacaoScreen: React.FC = () => {
  const navigate = useNavigate();
  const colunas = CARTOES_DA_COMUNICACAO.length > 4 ? 3 : 2;
  const linhas = Math.ceil(CARTOES_DA_COMUNICACAO.length / colunas);
  return (
    <GazePageLayout showBack={true} backRoute="/menu" titulo="Comunicação" subtitulo="Olhe para escolher">
      <div style={{ height: '100%', width: '100%' }}>
        {/* `rolarSoSeNaoCouber`: com as duas linhas cabendo, a grade não recorta
            a zona de acerto da primeira linha (nem o anel do dwell). */}
        <GazeGrid columns={colunas} rows={linhas} rolarSoSeNaoCouber>
          {CARTOES_DA_COMUNICACAO.map((c) => (
            <GazeButton
              key={c.id}
              onClick={() => navigate(c.rota)}
              aria-label={`${c.titulo}: ${c.descricao}`}
              style={{ height: '100%', borderRadius: 'var(--radius-xl, 2rem)' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.9rem', textAlign: 'center', padding: '1rem' }}>
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 'clamp(64px, 9vh, 96px)', height: 'clamp(64px, 9vh, 96px)', borderRadius: '30%',
                    background: `linear-gradient(155deg, color-mix(in srgb, ${c.cor} 72%, #ffffff), ${c.cor})`,
                    color: '#0B1B33',
                  }}
                >
                  <c.Icone size={44} strokeWidth={2} />
                </span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.5rem, 3vh, 2.1rem)', fontWeight: 800, color: 'var(--color-text-base)' }}>
                  {c.titulo}
                </span>
                <span style={{ fontSize: 'clamp(1rem, 1.8vh, 1.25rem)', fontWeight: 600, color: 'var(--color-text-muted)' }}>{c.descricao}</span>
              </div>
            </GazeButton>
          ))}
        </GazeGrid>
      </div>
    </GazePageLayout>
  );
};
