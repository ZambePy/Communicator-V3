import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Timer,
  Minus,
  Plus,
  Sun,
  SunDim,
  Volume2,
  VolumeX,
  Droplet,
  ChevronRight,
  ChevronLeft,
  Globe,
  Crosshair,
  Moon,
  Settings as SettingsIcon,
  AlertOctagon,
  Maximize,
} from 'lucide-react';
import { GazePageLayout } from '../../components/ui/GazePageLayout';
import { GazeButton } from '../../components/ui/GazeButton';
import { useSettings, TEMA_FIXO } from '../../context/SettingsContext';
import { useCloud } from '../../cloud/CloudContext';
import { presetMaisProximo } from '../../dwellMs';
import { supportedLngs, type SupportedLng } from '../../i18n';
import {
  emPorcento,
  emSegundos,
  podeAumentarDwell,
  podeDiminuirDwell,
  proximoBrilho,
  proximoDwellMs,
  BRILHO_MAX,
  BRILHO_MIN,
} from './ajustes';

/**
 * Acessibilidade — os ajustes de conforto e de acionamento, operáveis pelo
 * OLHAR.
 *
 * ## Por que existe, se Configurações já tem tudo isso
 *
 * Configurações é a tela do cuidador: protegida por PIN, com sliders e botões
 * de 40 px feitos para mouse. O cartão "Acessibilidade" da Home levava a uma
 * tela "Em breve" que mandava para lá — ou seja, o paciente não tinha como
 * ajustar sozinho o próprio tempo de permanência, que é justamente o ajuste
 * que mais muda ao longo do dia (cansaço, medicação).
 *
 * ## Uma fonte só
 *
 * Nada aqui tem estado próprio: tudo lê e escreve o MESMO `useSettings()` que
 * Configurações usa, com os mesmos limites (ver `ajustes.ts`). Mudar o tempo
 * aqui muda o slider de lá, e vice-versa. Nenhum ajuste saiu de Configurações.
 *
 * ## O que NÃO está aqui, e por quê
 *
 *   - Suavização do cursor (preset do filtro): em Configurações ela só aparece
 *     no modo desenvolvedor, por decisão registrada lá ("o cuidador ajusta o
 *     tempo de dwell, não o filtro"). Expor ao paciente o que foi escondido do
 *     cuidador seria contradizer essa decisão.
 *   - Tamanho do cursor, clique por piscada e varredura: são flags de
 *     experimento do núcleo, exigem recarregar o app e não estão em
 *     Configurações. Piscar é involuntário — ligar isso pelo olhar, sozinho,
 *     é arriscado.
 *   - Prazo do alerta de emergência: é ajustado no app do cuidador; aqui só é
 *     mostrado.
 *
 * ## Layout
 *
 * Grade 3 × 3, sem rolagem: rolar pelo olhar só acontece fora dos alvos, e
 * numa tela cheia de alvos isso quase nunca acontece. O que não cabe vai para
 * a segunda página, trocada por um alvo do mesmo tamanho dos outros — o mesmo
 * padrão das Frases Rápidas. Os cartões de valor (não clicáveis) ficam entre
 * os alvos, o que também afasta os "−" e "+" de uma linha dos da outra.
 */
export const AccessibilityScreen: React.FC = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { settings, updateSettings } = useSettings();
  const { ajustesRemotos } = useCloud();
  const [pagina, setPagina] = useState<0 | 1>(0);

  const dwell = settings.dwellMs;
  const preset = presetMaisProximo(dwell);
  const brilho = settings.brightnessLevel ?? 1;
  const idioma = (i18n.resolvedLanguage ?? 'pt-BR') as SupportedLng;
  const prazoDaEmergencia = ajustesRemotos?.emergency_timeout_s ?? null;

  return (
    <GazePageLayout
      showBack
      backRoute="/menu"
      titulo="Acessibilidade"
      subtitulo={`Página ${pagina + 1} de 2 · Os mesmos ajustes de Configurações, pelo olhar`}
    >
      <div
        data-testid="acessibilidade-grade"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gridTemplateRows: 'repeat(3, minmax(0, 1fr))',
          gap: 'clamp(16px, 2.6vh, 32px) clamp(16px, 2vw, 40px)',
          height: '100%',
          width: '100%',
        }}
      >
        {pagina === 0 ? (
          <>
            <Valor
              icone={<Timer size={34} aria-hidden="true" />}
              titulo="Tempo de permanência"
              valor={emSegundos(dwell)}
              detalhe={
                preset
                  ? `${t(`dwell.presets.${preset.id}`)} · quanto tempo olhar até selecionar`
                  : 'Quanto tempo olhar até selecionar'
              }
            />
            <Alvo
              icone={<Minus size={44} aria-hidden="true" />}
              rotulo="Mais rápido"
              apoio="menos tempo olhando"
              aria-label="Diminuir o tempo de permanência"
              disabled={!podeDiminuirDwell(dwell)}
              onClick={() => updateSettings({ dwellMs: proximoDwellMs(dwell, -1) })}
            />
            <Alvo
              icone={<Plus size={44} aria-hidden="true" />}
              rotulo="Mais devagar"
              apoio="mais tempo olhando"
              aria-label="Aumentar o tempo de permanência"
              disabled={!podeAumentarDwell(dwell)}
              onClick={() => updateSettings({ dwellMs: proximoDwellMs(dwell, 1) })}
            />

            <Valor
              icone={<SunDim size={34} aria-hidden="true" />}
              titulo="Brilho da tela"
              valor={emPorcento(brilho)}
              detalhe="Escureça se a luz incomodar ou der vontade de piscar"
            />
            <Alvo
              icone={<Moon size={40} aria-hidden="true" />}
              rotulo="Mais escuro"
              aria-label="Diminuir o brilho da tela"
              disabled={brilho <= BRILHO_MIN + 1e-6}
              onClick={() => updateSettings({ brightnessLevel: proximoBrilho(brilho, -1) })}
            />
            <Alvo
              icone={<Sun size={40} aria-hidden="true" />}
              rotulo="Mais claro"
              aria-label="Aumentar o brilho da tela"
              disabled={brilho >= BRILHO_MAX - 1e-6}
              onClick={() => updateSettings({ brightnessLevel: proximoBrilho(brilho, 1) })}
            />

            <Alvo
              icone={
                settings.soundEnabled ? (
                  <Volume2 size={40} aria-hidden="true" />
                ) : (
                  <VolumeX size={40} aria-hidden="true" />
                )
              }
              rotulo={settings.soundEnabled ? 'Som ao selecionar: ligado' : 'Som ao selecionar: desligado'}
              apoio="olhe para trocar"
              ligado={settings.soundEnabled}
              role="switch"
              aria-checked={settings.soundEnabled}
              aria-label="Som ao selecionar"
              onClick={() => updateSettings({ soundEnabled: !settings.soundEnabled })}
            />
            <Alvo
              icone={<Droplet size={40} aria-hidden="true" />}
              rotulo={settings.amberFilter ? 'Filtro âmbar: ligado' : 'Filtro âmbar: desligado'}
              apoio="menos luz azul"
              ligado={settings.amberFilter}
              role="switch"
              aria-checked={settings.amberFilter}
              aria-label="Filtro âmbar"
              onClick={() => updateSettings({ amberFilter: !settings.amberFilter })}
            />
            <Alvo
              icone={<ChevronRight size={48} aria-hidden="true" />}
              rotulo="Mais ajustes"
              apoio="idioma, calibração e atalhos"
              tracejado
              onClick={() => setPagina(1)}
            />
          </>
        ) : (
          <>
            <Valor
              icone={<Globe size={34} aria-hidden="true" />}
              titulo="Idioma"
              valor={idioma === 'pt-BR' ? 'Português' : 'English'}
              detalhe="Textos da tela e voz"
            />
            {supportedLngs.map((lng) => (
              <Alvo
                key={lng}
                icone={<Globe size={36} aria-hidden="true" />}
                rotulo={lng === 'pt-BR' ? 'Português' : 'English'}
                ligado={idioma === lng}
                aria-pressed={idioma === lng}
                onClick={() => void i18n.changeLanguage(lng)}
              />
            ))}

            <Alvo
              icone={<Crosshair size={40} aria-hidden="true" />}
              rotulo="Calibrar o olhar"
              apoio="se o cursor estiver fora do lugar"
              onClick={() => navigate('/calibration-check')}
            />
            <Alvo
              icone={<Moon size={40} aria-hidden="true" />}
              rotulo="Modo Descanso"
              apoio="pausar e descansar os olhos"
              onClick={() => navigate('/rest')}
            />
            <Alvo
              icone={<SettingsIcon size={40} aria-hidden="true" />}
              rotulo="Todas as configurações"
              apoio="com o cuidador (pede PIN)"
              onClick={() => navigate('/settings')}
            />

            <Valor
              icone={<AlertOctagon size={30} aria-hidden="true" />}
              titulo="Alerta de emergência"
              valor={prazoDaEmergencia ? `${prazoDaEmergencia} s` : 'Padrão'}
              detalhe="Tempo até avisar o cuidador de novo. Ajustado no app do cuidador."
            />
            {TEMA_FIXO === null ? (
              <Alvo
                icone={settings.theme === 'dark' ? <Moon size={40} aria-hidden="true" /> : <Sun size={40} aria-hidden="true" />}
                rotulo={settings.theme === 'dark' ? 'Tema: escuro' : 'Tema: claro'}
                apoio="olhe para trocar"
                onClick={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
              />
            ) : (
              <Valor
                icone={<Maximize size={30} aria-hidden="true" />}
                titulo="Tela cheia"
                valor="Sempre"
                detalhe="Assim os alvos ficam grandes e o olhar é medido do jeito certo."
              />
            )}
            <Alvo
              icone={<ChevronLeft size={48} aria-hidden="true" />}
              rotulo="Tempo e tela"
              apoio="voltar à página 1"
              tracejado
              onClick={() => setPagina(0)}
            />
          </>
        )}
      </div>
    </GazePageLayout>
  );
};

/** Cartão de valor: mostra o estado, não é alvo. */
const Valor: React.FC<{
  icone: React.ReactNode;
  titulo: string;
  valor: string;
  detalhe?: string;
}> = ({ icone, titulo, valor, detalhe }) => (
  <div
    role="group"
    aria-label={`${titulo}: ${valor}`}
    style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      gap: '0.35rem',
      padding: 'clamp(0.9rem, 2vh, 1.5rem) clamp(1rem, 1.6vw, 1.75rem)',
      borderRadius: 'var(--radius-xl)',
      background: 'var(--color-card-bg)',
      border: '1px solid var(--color-card-border)',
      minWidth: 0,
      overflow: 'hidden',
    }}
  >
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        color: 'var(--color-primary)',
        fontWeight: 800,
        fontSize: 'clamp(1rem, 1.8vh, 1.2rem)',
      }}
    >
      {icone}
      <span style={{ color: 'var(--color-text-base)' }}>{titulo}</span>
    </span>
    <strong
      aria-live="polite"
      style={{
        fontFamily: 'var(--font-display)',
        fontSize: 'clamp(1.9rem, 4.2vh, 3rem)',
        fontWeight: 800,
        letterSpacing: '-0.02em',
        color: 'var(--color-text-base)',
        lineHeight: 1.1,
      }}
    >
      {valor}
    </strong>
    {detalhe && (
      <span
        style={{
          fontSize: 'clamp(0.85rem, 1.5vh, 1rem)',
          color: 'var(--color-text-muted)',
          fontWeight: 600,
          lineHeight: 1.35,
        }}
      >
        {detalhe}
      </span>
    )}
  </div>
);

/** Alvo grande: ocupa a célula inteira da grade. */
const Alvo: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    icone: React.ReactNode;
    rotulo: string;
    apoio?: string;
    ligado?: boolean;
    tracejado?: boolean;
  }
> = ({ icone, rotulo, apoio, ligado, tracejado, style, ...props }) => (
  <GazeButton
    variante={ligado ? 'primaria' : 'secundaria'}
    style={{
      height: '100%',
      width: '100%',
      borderRadius: 'var(--radius-xl)',
      ...(tracejado
        ? {
            border: '2px dashed var(--state-hover-border)',
            background: 'var(--state-active-bg)',
            color: 'var(--color-primary)',
          }
        : {}),
      ...style,
    }}
    {...props}
  >
    <span
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.45rem',
        textAlign: 'center',
        padding: '0.75rem',
        width: '100%',
      }}
    >
      {icone}
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(1.15rem, 2.2vh, 1.55rem)',
          fontWeight: 800,
          letterSpacing: '-0.015em',
          lineHeight: 1.2,
        }}
      >
        {rotulo}
      </span>
      {apoio && (
        <span style={{ fontSize: 'clamp(0.85rem, 1.5vh, 1rem)', fontWeight: 600, opacity: 0.8 }}>
          {apoio}
        </span>
      )}
    </span>
  </GazeButton>
);
