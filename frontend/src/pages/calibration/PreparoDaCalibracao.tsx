import React from 'react';
import { useTranslation } from 'react-i18next';
import { Crosshair, Eye, MoveVertical, LogOut } from 'lucide-react';
import { alvosDeCalibracao, currentCalibrationGeometry } from '@tracker/calibration';

/**
 * Preparação da calibração.
 *
 * É um CARTÃO dentro do estágio `tutorial` do `CalibrationCheck`, não uma tela
 * própria. Aquele estágio já é a tela pré-início: tem o painel de prontidão, a
 * escolha entre calibração completa e rápida, e o estado de carregamento do
 * modelo. Uma segunda tela de preparação ao lado seria a duplicação que este
 * projeto já acumulou vezes demais — e substituir o estágio perderia as três
 * coisas acima.
 *
 * O que faltava ali era CONTEÚDO: o que vai acontecer, quanto tempo leva, e as
 * duas instruções que mudam o resultado.
 *
 * A instrução sobre piscar é a que mais muda o resultado, e é fácil de errar:
 * "não pisque" produz o PIOR resultado possível — o olho resseca durante a
 * coleta e o landmark degrada exatamente nos pontos em que precisa estar bom.
 * O texto pede o contrário: piscar normalmente, sem segurar.
 */

/**
 * Teto da duração, em minutos. Cada alvo leva no máximo o assentamento mais o
 * teto da janela de coleta (2,8 s no canto), e os 14 alvos do perfil padrão
 * cabem em 1 minuto mesmo com todos no teto — o ponto fecha antes quando o
 * olhar estabiliza.
 */
const MINUTOS = 1;

/**
 * O que a calibração completa vai pedir. O número sai do mesmo plano que a
 * calibração usa (`alvosDeCalibracao`): antes era um 9 fixo, e a tela seguia
 * prometendo nove pontos depois que a calibração passou a ter os quatro cantos
 * da tela (e o meio da borda de baixo, M7).
 */
export const PreparoDaCalibracao: React.FC = () => {
  const { t } = useTranslation();
  const alvos = alvosDeCalibracao(currentCalibrationGeometry()).length;

  const instrucoes = [
    { chave: 'i1', Icone: Crosshair },
    { chave: 'i2', Icone: Eye },
    { chave: 'i3', Icone: MoveVertical },
    { chave: 'i4', Icone: LogOut },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        padding: '1.25rem',
        borderRadius: '1.15rem',
        background: 'var(--tint-info-bg)',
        border: '1px solid var(--tint-info-border)',
        textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <strong style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-text-base)' }}>
          {t('calib.preparo.title')}
        </strong>
        <span
          style={{
            fontSize: '0.95rem',
            lineHeight: 1.55,
            opacity: 0.85,
            color: 'var(--color-text-base)',
          }}
        >
          {t('calib.preparo.lead', { alvos, min: MINUTOS })}
        </span>
      </div>

      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.9rem',
        }}
      >
        {instrucoes.map(({ chave, Icone }) => (
          <li key={chave} style={{ display: 'flex', gap: '0.8rem', alignItems: 'flex-start' }}>
            <Icone
              size={20}
              color="var(--color-primary)"
              aria-hidden="true"
              style={{ flexShrink: 0, marginTop: 2 }}
            />
            <span
              style={{
                fontSize: '0.98rem',
                lineHeight: 1.55,
                color: 'var(--color-text-base)',
                opacity: 0.9,
              }}
            >
              {t(`calib.preparo.${chave}`)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
