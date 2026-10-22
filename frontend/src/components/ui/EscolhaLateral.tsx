import React, { useEffect, useId } from 'react';
import { GazeButton } from './GazeButton';
import { registrarZonaLateral } from './zonasLaterais';

/** Um dos dois lados da escolha. */
export interface LadoDaEscolha {
  /** O que aparece no lado (grande). */
  rotulo: React.ReactNode;
  aoEscolher: () => void;
  /**
   * Nome acessível: o que o leitor de tela e a varredura do acionador
   * anunciam. Sem ele, vale o texto do rótulo.
   */
  nome?: string;
  /**
   * A escolha só NAVEGA (o teclado lateral estreitando o alfabeto): rearma
   * também pela permanência do olhar, como os grupos do teclado
   * (`data-rearme-permanencia`, ver `rearmePorSaida.ts`). Escolha que age
   * (escreve, responde, fala) não tem a marca: o olhar parado age no máximo uma
   * vez e precisa sair e voltar para agir de novo.
   */
  soNavega?: boolean;
  /** Fora do ar agora: aparece apagado e não escolhe — nem pelo olhar, nem pelo mouse. */
  desligado?: boolean;
  estilo?: React.CSSProperties;
  /** Atributos `data-*` a mais (a marca do Sim/Não, um dwell próprio). Vencem os daqui. */
  dados?: Record<`data-${string}`, string | undefined>;
}

interface EscolhaLateralProps {
  /**
   * `null`: o lado fica vazio — nem zona nem botão; o olhar descansa nele sem
   * escolher nada. A tela de socorro tem fases com uma saída só (revisão de
   * 21/10/2026, Important 1).
   */
  esquerda: LadoDaEscolha | null;
  direita: LadoDaEscolha | null;
  /**
   * O que fica no meio (a pergunta, o texto escrito, a instrução). O meio não é
   * de nenhum lado: é onde o olhar descansa e lê sem escolher nada.
   */
  centro?: React.ReactNode;
  /** Largura do meio, em % da largura. Padrão: 28 com conteúdo, 8 sem. */
  larguraDoMeio?: number;
  style?: React.CSSProperties;
}

/** Registra o botão de `id` como zona lateral enquanto ele está na tela. */
function useZonaLateral(id: string): void {
  useEffect(() => {
    const el = document.getElementById(id);
    if (!el) return undefined;
    return registrarZonaLateral(el, 'escolha');
  }, [id]);
}

const Lado: React.FC<{ lado: LadoDaEscolha; id: string; posicao: 'esquerda' | 'direita' }> = ({ lado, id, posicao }) => {
  useZonaLateral(id);
  return (
    <GazeButton
      id={id}
      type="button"
      aria-label={lado.nome}
      aria-disabled={lado.desligado ? 'true' : undefined}
      data-dwell-eixo="x"
      data-lado={posicao}
      data-no-dwell={lado.desligado ? 'true' : undefined}
      data-rearme-permanencia={lado.soNavega ? 'true' : undefined}
      {...lado.dados}
      onClick={() => {
        if (!lado.desligado) lado.aoEscolher();
      }}
      // O alvo é meia tela de altura: a medida que importa aqui é a largura da
      // coluna, e ela é conferida pelo layout de quem usa.
      noWarn
      style={{
        flex: '1 1 0',
        minWidth: 0,
        height: '100%',
        borderRadius: 'var(--radius-xl, 2rem)',
        padding: 'clamp(0.75rem, 2vw, 2rem)',
        boxSizing: 'border-box',
        // Sem dwell o CSS comum do botão tira o ponteiro, e o `elementFromPoint`
        // passaria por ele: a zona deixaria de estar "à vista" e o olhar cairia
        // no que está atrás. Aqui o lado sem dwell continua ocupando a coluna.
        pointerEvents: 'auto',
        cursor: lado.desligado ? 'default' : 'pointer',
        opacity: lado.desligado ? 0.45 : 1,
        ...lado.estilo,
      }}
    >
      <span
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.75rem',
          whiteSpace: 'normal',
          textAlign: 'center',
          maxWidth: '100%',
          minWidth: 0,
        }}
      >
        {lado.rotulo}
      </span>
    </GazeButton>
  );
};

/** O lugar de um lado vazio: ocupa a mesma coluna, para o meio não sair do lugar. */
const LadoVazio: React.FC = () => (
  <div className="escolha-lateral__vazio" aria-hidden="true" style={{ flex: '1 1 0', minWidth: 0 }} />
);

/**
 * Duas metades grandes que o olhar escolhe pela COLUNA (modo só horizontal,
 * pedido de 21/10/2026): olhar para a esquerda escolhe a esquerda, para a
 * direita, a direita — qualquer que seja o `y`, que para quem perdeu o olhar
 * vertical não diz para onde ele olha. Quem resolve é o despachante do dwell,
 * pelas zonas laterais (`zonasLaterais.ts`); aqui as metades se registram.
 *
 * Mouse, teclado e o acionador do Plano B escolhem como em qualquer botão.
 * Usada no Sim · Não do modo só horizontal, no teclado lateral e na pergunta
 * do cuidador.
 */
export const EscolhaLateral: React.FC<EscolhaLateralProps> = ({ esquerda, direita, centro, larguraDoMeio, style }) => {
  const base = useId();
  const meio = larguraDoMeio ?? (centro ? 28 : 8);
  return (
    <div
      className="escolha-lateral"
      style={{ display: 'flex', alignItems: 'stretch', width: '100%', height: '100%', minHeight: 0, ...style }}
    >
      {esquerda ? <Lado lado={esquerda} id={`${base}-esquerda`} posicao="esquerda" /> : <LadoVazio />}
      <div
        className="escolha-lateral__meio"
        style={{
          flex: `0 0 ${meio}%`,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: centro ? '0 clamp(0.5rem, 1.5vw, 1.5rem)' : 0,
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        {centro}
      </div>
      {direita ? <Lado lado={direita} id={`${base}-direita`} posicao="direita" /> : <LadoVazio />}
    </div>
  );
};
