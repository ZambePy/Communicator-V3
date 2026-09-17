import logoNegativo from '../../assets/brand/irisflow-wordmark-negativo.png';
import simbolo from '../../assets/brand/irisflow-simbolo.png';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher';
import { INTRO_SEEN_KEY } from './bootDestination';

/**
 * Boas-vindas — a primeira abertura.
 *
 * Fundo limpo, o símbolo respirando, o nome, uma frase e um botão. Nenhum
 * parágrafo: quem chega aqui ainda não sabe se o produto é para ele, e a
 * explicação que convence é a experiência dos próximos três minutos — a
 * câmera entendendo a pessoa, o primeiro alvo preenchendo, a calibração.
 *
 * O idioma continua escolhível aqui, discreto no rodapé: escolher "English" e
 * continuar lendo português seria pior do que não oferecer a escolha.
 */
export const IntroScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const comecar = () => {
    try {
      localStorage.setItem(INTRO_SEEN_KEY, 'true');
    } catch {
      // Sem persistência a apresentação reaparece. Chato, não impeditivo.
    }
    navigate('/login');
  };

  return (
    <main
      role="main"
      aria-labelledby="intro-title"
      style={{
        minHeight: '100vh',
        background: 'var(--settings-bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2.5rem 2rem',
        gap: '3rem',
        position: 'relative',
      }}
    >
      {/* Encadeado: a íris entra, depois o nome, depois o botão. A ordem em
          que aparecem é a ordem em que se lê a tela — e quem lê com o olhar
          precisa que alguém diga por onde começar. */}
      <div
        className="entrada-encadeada"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '2rem',
          textAlign: 'center',
        }}
      >
        <SimboloDaIris />

        <div
          style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', alignItems: 'center' }}
        >
          {/* Wordmark negativo (recorte do logotipo do site), para fundo escuro. O símbolo
              animado acima já é a íris; aqui entra só a marca, sem repetir a
              íris num segundo desenho. */}
          <h1
            id="intro-title"
            className="font-display"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '1.15rem',
              fontWeight: 400,
              margin: 0,
              lineHeight: 1.2,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--color-text-base)',
            }}
          >
            <img
              src={logoNegativo}
              alt="IrisFlow"
              draggable={false}
              style={{ width: 'min(300px, 60vw)', height: 'auto', display: 'block' }}
            />
            <span style={{ opacity: 0.8 }}>Communicator</span>
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: '1.35rem',
              lineHeight: 1.5,
              color: 'var(--color-text-base)',
              opacity: 0.85,
            }}
          >
            {t('onboarding.intro.tagline')}
          </p>
        </div>

        <PrimaryButton
          type="button"
          onClick={comecar}
          style={{
            padding: '1.25rem 3.5rem',
            fontSize: '1.25rem',
            borderRadius: '1.5rem',
            minHeight: 72,
          }}
        >
          {t('onboarding.intro.start')} <ArrowRight size={22} aria-hidden="true" />
        </PrimaryButton>
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          opacity: 0.75,
        }}
      >
        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
          {t('onboarding.intro.language')}
        </span>
        <LanguageSwitcher />
      </div>
    </main>
  );
};

/**
 * A íris da marca, em CSS: um anel que respira devagar e uma pupila fixa.
 * Sem imagem — a animação é a única coisa que se move na tela, e o movimento
 * é lento de propósito (quem olha é alguém que vai fixar o olhar por 1,5 s
 * para clicar; nada aqui pode competir com isso).
 */
const SimboloDaIris: React.FC = () => (
  <div
    aria-hidden="true"
    className="iris-simbolo"
    style={{
      position: 'relative',
      width: 176,
      height: 176,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <span className="iris-simbolo__halo" />
    {/* O símbolo de verdade (a íris em espiral da marca), não um anel genérico.
        A espiral gira devagar; o halo respira. É o único movimento da tela. */}
    <img src={simbolo} alt="" draggable={false} className="iris-simbolo__marca" />
  </div>
);
