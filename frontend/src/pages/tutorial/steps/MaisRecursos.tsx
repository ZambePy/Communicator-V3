import React from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Image, Music, Newspaper, Settings, Users } from 'lucide-react';

/**
 * O resto do app, em uma tela.
 *
 * Aqui NÃO há missão, e é deliberado: mandar a pessoa visitar seis telas
 * seguidas transformaria o tutorial num passeio de dez minutos, e quem está
 * aprendendo a usar os olhos como ponteiro cansa de verdade. O que estes itens
 * precisam é existir no mapa mental — "isso está no menu" — e não ser
 * praticados um a um.
 *
 * **Ajustes aparece como informação para o CUIDADOR, não como destino do
 * paciente.** A jornada obrigatória do paciente não passa por configuração: é
 * a tela em que uma escolha errada quebra o rastreamento que ele acabou de
 * calibrar, e ele não tem como saber disso.
 */
export const MaisRecursos: React.FC = () => {
  const { t } = useTranslation();

  const itens: { icone: React.ReactNode; chave: string }[] = [
    { icone: <Bell size={22} aria-hidden="true" />, chave: 'lembretes' },
    { icone: <Image size={22} aria-hidden="true" />, chave: 'fotos' },
    { icone: <Music size={22} aria-hidden="true" />, chave: 'descanso' },
    { icone: <Newspaper size={22} aria-hidden="true" />, chave: 'noticias' },
    { icone: <Users size={22} aria-hidden="true" />, chave: 'cuidador' },
  ];

  return (
    <div
      className="entrada-encadeada"
      style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <h2
          style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text-base)' }}
        >
          {t('tutorial.recursos.title')}
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: '1.05rem',
            lineHeight: 1.5,
            opacity: 0.85,
            color: 'var(--color-text-base)',
          }}
        >
          {t('tutorial.recursos.lead')}
        </p>
      </div>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.75rem' }}>
        {itens.map(({ icone, chave }) => (
          <li
            key={chave}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.85rem',
              padding: '0.9rem 1rem',
              borderRadius: '1rem',
              border: '1px solid var(--color-card-border)',
              color: 'var(--color-text-base)',
              fontSize: '1rem',
              lineHeight: 1.45,
            }}
          >
            <span style={{ color: 'var(--color-primary)', display: 'flex' }}>{icone}</span>
            <span>
              <strong>{t(`tutorial.recursos.${chave}.nome`)}</strong> —{' '}
              {t(`tutorial.recursos.${chave}.texto`)}
            </span>
          </li>
        ))}
      </ul>

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.75rem',
          padding: '1rem 1.15rem',
          borderRadius: '1rem',
          background: 'var(--tint-info-bg)',
          border: '1px solid var(--tint-info-border)',
          color: 'var(--tint-info-text)',
          fontSize: '0.95rem',
          lineHeight: 1.5,
        }}
      >
        <Settings size={20} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
        <span>{t('tutorial.recursos.ajustes')}</span>
      </div>
    </div>
  );
};
