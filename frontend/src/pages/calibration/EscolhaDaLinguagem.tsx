import React from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpenText, Gauge } from 'lucide-react';
import { GazeButton } from '../../components/ui/GazeButton';
import { alvoMinimoPx } from '../../design/gazeMetrics';
import type { LinguagemDoRelatorio } from '@tracker/resultadoSimples';

/**
 * Como os resultados aparecem: em palavras simples ou com os números (pedido
 * de 19/10/2026). A escolha vale para a tela de resultado da calibração E para
 * o painel do teste de precisão.
 *
 * Dois usos, o mesmo par de botões:
 *  - `PerguntaDaLinguagem`: a pergunta de UMA vez, no começo da calibração,
 *    antes do "Começar" (a primeira calibração é o começo do produto);
 *  - `AjusteDaLinguagem`: o mesmo par em Configurações, para mudar depois.
 *
 * Os botões são `GazeButton` grandes (acima do alvo mínimo de 5°), com dwell
 * longo e `recovery`: na primeira abertura quem responde é o cuidador, com o
 * mouse ou o teclado, mas numa recalibração o paciente pode estar sozinho, só
 * com o olhar — e esta pergunta fica no caminho do "Começar".
 */

/** Mínimos, em px; com a zona de acerto de 12 px dos dois lados passam do alvo de 5°. */
const LARGURA_DO_BOTAO = 240;
const ALTURA_DO_BOTAO = 176;
const ZONA_DE_ACERTO_PX = 12;

const OpcoesDaLinguagem: React.FC<{
  valor: LinguagemDoRelatorio | null;
  aoEscolher: (l: LinguagemDoRelatorio) => void;
  escuro: boolean;
}> = ({ valor, aoEscolher, escuro }) => {
  const { t } = useTranslation();
  // Numa tela mais densa que a de referência, o botão cresce até o mínimo da
  // geometria corrente.
  const minimo = alvoMinimoPx() - 2 * ZONA_DE_ACERTO_PX;
  const largura = Math.max(LARGURA_DO_BOTAO, minimo);
  const altura = Math.max(ALTURA_DO_BOTAO, minimo);
  const opcoes: { chave: LinguagemDoRelatorio; titulo: string; dica: string; Icone: typeof Gauge }[] = [
    { chave: 'simples', titulo: t('calib.linguagem.simples'), dica: t('calib.linguagem.simplesDica'), Icone: BookOpenText },
    { chave: 'tecnica', titulo: t('calib.linguagem.tecnica'), dica: t('calib.linguagem.tecnicaDica'), Icone: Gauge },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={t('calib.linguagem.pergunta')}
      style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}
    >
      {opcoes.map(({ chave, titulo, dica, Icone }) => {
        const marcada = valor === chave;
        return (
          <GazeButton
            key={chave}
            type="button"
            role="radio"
            aria-checked={marcada}
            data-testid={`linguagem-${chave}`}
            data-dwell-ms="2000"
            recovery
            variante={marcada ? 'primaria' : 'secundaria'}
            width={largura}
            height={altura}
            onClick={() => aoEscolher(chave)}
            style={{
              flexDirection: 'column',
              gap: '0.5rem',
              padding: '1rem 1.1rem',
              textAlign: 'center',
              borderRadius: '1.25rem',
              ...(escuro && !marcada
                ? { background: 'rgba(255,255,255,0.06)', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.22)' }
                : {}),
            }}
          >
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.45rem' }}>
              <Icone size={26} aria-hidden="true" />
              <strong style={{ fontSize: '1.15rem', fontWeight: 800 }}>{titulo}</strong>
              <span style={{ fontSize: '0.92rem', lineHeight: 1.4, opacity: 0.85, fontWeight: 500 }}>{dica}</span>
            </span>
          </GazeButton>
        );
      })}
    </div>
  );
};

/** A pergunta de UMA vez, no começo da calibração (fundo escuro). */
export const PerguntaDaLinguagem: React.FC<{ aoEscolher: (l: LinguagemDoRelatorio) => void }> = ({
  aoEscolher,
}) => {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="pergunta-linguagem-titulo"
      data-testid="pergunta-linguagem"
      style={{
        alignSelf: 'stretch',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        padding: '1.5rem 1.25rem',
        borderRadius: '1.25rem',
        background: 'rgba(27, 84, 168, 0.12)',
        border: '1px solid rgba(27, 84, 168, 0.55)',
        textAlign: 'center',
      }}
    >
      <h2 id="pergunta-linguagem-titulo" style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#FFFFFF' }}>
        {t('calib.linguagem.titulo')}
      </h2>
      <p style={{ margin: 0, fontSize: '1.1rem', lineHeight: 1.55, color: 'rgba(255,255,255,0.85)' }}>
        {t('calib.linguagem.pergunta')}
      </p>
      <OpcoesDaLinguagem valor={null} aoEscolher={aoEscolher} escuro />
      <p style={{ margin: 0, fontSize: '0.95rem', color: 'rgba(255,255,255,0.65)' }}>{t('calib.linguagem.nota')}</p>
    </section>
  );
};

/** O mesmo par, em Configurações. */
export const AjusteDaLinguagem: React.FC<{
  valor: LinguagemDoRelatorio | null;
  aoEscolher: (l: LinguagemDoRelatorio) => void;
  cardStyle?: React.CSSProperties;
}> = ({ valor, aoEscolher, cardStyle }) => {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="ajuste-linguagem-titulo" data-testid="ajuste-linguagem" style={cardStyle}>
      <h2
        id="ajuste-linguagem-titulo"
        className="t-h2"
        style={{ color: 'var(--color-text-base)', margin: '0 0 0.5rem' }}
      >
        {t('settings.linguagem.titulo')}
      </h2>
      <p style={{ margin: '0 0 1.25rem', color: 'var(--color-text-muted)', fontSize: '1rem' }}>
        {t('settings.linguagem.descricao')}
      </p>
      <OpcoesDaLinguagem valor={valor} aoEscolher={aoEscolher} escuro={false} />
    </section>
  );
};
