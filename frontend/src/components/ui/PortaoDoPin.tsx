import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserCog } from 'lucide-react';
import { GazeButton } from './GazeButton';

/**
 * Portão de PIN do cuidador — um só, para as duas portas do app
 * (Configurações e Painel do Cuidador).
 *
 * Existia uma cópia em cada tela, com cores cravadas: cartão branco sobre o
 * fundo escuro, título `#1e293b` invisível no tema escuro (que é o padrão) e
 * um "Cancelar" cinza-claro com texto claro por cima — contraste zero na única
 * saída alcançável pelo olhar.
 *
 * Aqui tudo vem dos tokens do tema. O teclado numérico é do cuidador, com
 * mouse, mas as teclas têm 88 px porque /settings é um cartão do menu do
 * paciente: ele chega aqui por fixação e precisa, no mínimo, conseguir sair.
 */

export const ALTURA_DA_TECLA_PX = 88;
/** Alvo de saída para o olhar: alto, e com dwell mais longo que o padrão. */
const ALTURA_DO_CANCELAR_PX = 200;
const PIN_MAX = 8;

export const PortaoDoPin: React.FC<{
  titulo: string;
  dica: string;
  /** Devolve `true` quando o PIN abre a porta. */
  aoEntrar: (pin: string) => boolean;
  mensagemDeErro: string;
  aoCancelar: () => void;
  rotuloCancelar?: string;
}> = ({ titulo, dica, aoEntrar, mensagemDeErro, aoCancelar, rotuloCancelar }) => {
  const { t } = useTranslation();
  const [pin, setPin] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const digitar = (d: string) => {
    if (pin.length < PIN_MAX) setPin((p) => p + d);
  };

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (aoEntrar(pin)) {
      setErro(null);
    } else {
      setErro(mensagemDeErro);
    }
    setPin('');
  };

  return (
    <main
      role="main"
      aria-labelledby="portao-pin-titulo"
      style={{
        minHeight: '100vh',
        background: 'var(--settings-bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}
    >
      <div
        className="glass animate-fade-in-up"
        style={{
          padding: '2.5rem 2.5rem 2rem',
          borderRadius: '2.25rem',
          maxWidth: 520,
          width: '100%',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: '4.5rem',
            height: '4.5rem',
            background: 'var(--color-primary-light)',
            border: '1px solid var(--color-card-border)',
            borderRadius: '1.35rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto',
          }}
        >
          <UserCog size={36} color="var(--color-primary)" />
        </div>

        <h1
          id="portao-pin-titulo"
          style={{
            fontSize: '1.75rem',
            fontWeight: 800,
            color: 'var(--color-text-base)',
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {titulo}
        </h1>
        <p style={{ color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.5 }}>{dica}</p>

        <form
          onSubmit={enviar}
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}
        >
          <label htmlFor="caregiver-pin" className="sr-only">
            {t('settings.auth.pinLabel')}
          </label>
          <input
            id="caregiver-pin"
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value.slice(0, PIN_MAX))}
            maxLength={PIN_MAX}
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="••••"
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? 'pin-error' : undefined}
            style={{
              textAlign: 'center',
              fontSize: '2.5rem',
              letterSpacing: '0.75rem',
              padding: '0.75rem 1rem',
              borderRadius: '1rem',
              background: 'var(--field-bg)',
              color: 'var(--color-text-base)',
              border: `2px solid ${erro ? 'var(--color-danger)' : 'var(--field-border)'}`,
              outline: 'none',
              fontFamily: 'var(--font-family-display)',
            }}
          />
          {erro && (
            <p
              id="pin-error"
              role="alert"
              style={{ color: 'var(--tint-danger-text)', fontSize: '0.95rem', margin: 0 }}
            >
              {erro}
            </p>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '0.75rem',
              margin: '0.5rem auto',
              maxWidth: 320,
              width: '100%',
            }}
          >
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
              <Tecla key={n} onClick={() => digitar(n)}>
                {n}
              </Tecla>
            ))}
            <Tecla tom="perigo" onClick={() => setPin('')}>
              {t('pin.limpar')}
            </Tecla>
            <Tecla onClick={() => digitar('0')}>0</Tecla>
            <Tecla tom="neutro" onClick={() => setPin((p) => p.slice(0, -1))}>
              {t('pin.apagar')}
            </Tecla>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem' }}>
            {/* A SAÍDA por olhar: alta, dwell longo, e legível — o rótulo usa a
                cor de texto do tema sobre o cartão do tema. */}
            <GazeButton
              type="button"
              onClick={aoCancelar}
              aria-label={rotuloCancelar ?? t('common.cancel')}
              height={ALTURA_DO_CANCELAR_PX}
              data-dwell-ms={1800}
              noWarn
              style={{
                flex: 1,
                minHeight: ALTURA_DO_CANCELAR_PX,
                padding: '1rem',
                background: 'var(--color-card-bg)',
                border: '2px solid var(--color-card-border)',
                borderRadius: '1.25rem',
                fontSize: '1.15rem',
                fontWeight: 700,
                color: 'var(--color-text-base)',
                opacity: 1,
              }}
            >
              {rotuloCancelar ?? t('common.cancel')}
            </GazeButton>
            <button
              type="submit"
              aria-label={t('settings.auth.submit')}
              style={{
                flex: 1,
                padding: '1rem',
                background:
                  'linear-gradient(135deg, var(--color-primary-dark, #143e80), var(--color-primary))',
                borderRadius: '1.25rem',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1.1rem',
                fontWeight: 700,
                color: '#ffffff',
                boxShadow: '0 4px 16px var(--color-card-shadow)',
              }}
            >
              {t('settings.auth.submit')}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
};

const Tecla: React.FC<{
  onClick: () => void;
  tom?: 'digito' | 'perigo' | 'neutro';
  children: React.ReactNode;
}> = ({ onClick, tom = 'digito', children }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      minHeight: ALTURA_DA_TECLA_PX,
      borderRadius: '1rem',
      background: tom === 'perigo' ? 'var(--tint-danger-bg)' : 'var(--color-card-bg)',
      border: `1px solid ${tom === 'perigo' ? 'var(--tint-danger-border)' : 'var(--color-card-border)'}`,
      fontSize: tom === 'digito' ? '1.6rem' : '1.05rem',
      fontWeight: 800,
      cursor: 'pointer',
      color:
        tom === 'perigo'
          ? 'var(--tint-danger-text)'
          : tom === 'neutro'
            ? 'var(--color-text-muted)'
            : 'var(--color-text-base)',
      boxShadow: '0 2px 6px var(--color-card-shadow)',
    }}
  >
    {children}
  </button>
);
