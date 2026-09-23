import React from 'react';

/**
 * Barra de progresso da primeira abertura: seis passos, um traço por passo.
 *
 * Quem chega ao IrisFlow passa por conta → privacidade → perfil → preparo da
 * câmera → calibração antes de falar a primeira palavra. Sem esta barra cada
 * tela parecia a última, e o cuidador não sabia quanto faltava. Os passos são
 * fixos de propósito: a ordem mora em `bootDestination`, e esta lista só a
 * descreve.
 */
export const PASSOS_DO_ONBOARDING = [
  'boasVindas',
  'conta',
  'privacidade',
  'perfil',
  'preparo',
  'calibracao',
] as const;

export type PassoDoOnboarding = (typeof PASSOS_DO_ONBOARDING)[number];

const ROTULO: Record<PassoDoOnboarding, string> = {
  boasVindas: 'Boas-vindas',
  conta: 'Conta',
  privacidade: 'Privacidade',
  perfil: 'Perfil',
  preparo: 'Preparo da câmera',
  calibracao: 'Calibração',
};

export const ProgressoDoOnboarding: React.FC<{
  atual: PassoDoOnboarding;
  style?: React.CSSProperties;
}> = ({ atual, style }) => {
  const indice = PASSOS_DO_ONBOARDING.indexOf(atual);
  const total = PASSOS_DO_ONBOARDING.length;
  return (
    <div
      className="onboarding-progresso"
      data-testid="onboarding-progresso"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={indice + 1}
      aria-valuetext={`Passo ${indice + 1} de ${total}: ${ROTULO[atual]}`}
      style={style}
    >
      <div className="onboarding-progresso__tracos" aria-hidden="true">
        {PASSOS_DO_ONBOARDING.map((passo, i) => (
          <span
            key={passo}
            className={`onboarding-progresso__traco ${
              i < indice
                ? 'onboarding-progresso__traco--feito'
                : i === indice
                  ? 'onboarding-progresso__traco--atual'
                  : ''
            }`.trim()}
          />
        ))}
      </div>
      <span className="onboarding-progresso__rotulo" aria-hidden="true">
        Passo {indice + 1} de {total} · {ROTULO[atual]}
      </span>
    </div>
  );
};
