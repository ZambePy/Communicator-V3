import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { GazeStatusBanner } from './GazeStatusBanner';
import { mensagemPara } from '@tracker/distanceAdvisory';

// -----------------------------------------------------------------------------
// O aceite pede que "o texto do banner diga a direção correta".
//
// `distanceAdvisory.test.ts` cobre a máquina de estados e o texto. Este arquivo
// cobre o que faltava: que o texto CHEGA à tela, e que a ordem de precedência
// não o deixa aparecer quando há coisa mais grave acontecendo.
// -----------------------------------------------------------------------------

const semProblemas = {
  state: 'tracking',
  cameraError: null,
  calibrationInvalidated: null,
};

/**
 * As asserções checam o TEXTO QUE `mensagemPara` DEVOLVE, não uma redação
 * específica. A redação é do núcleo (`distanceAdvisory`) e `distanceAdvisory
 * .test.ts` é quem a cobre; travá-la aqui de novo fazia este arquivo quebrar
 * a cada ajuste de palavra no núcleo, sem que o banner tivesse regredido em
 * nada — que é exatamente o que ele existe para detectar. O que este arquivo
 * garante é o que o cabeçalho acima promete: o texto CHEGA à tela, e a
 * precedência não o engole.
 */
function textoDe(estado: 'perto' | 'longe'): string {
  const m = mensagemPara(estado);
  if (!m) throw new Error(`mensagemPara('${estado}') devolveu null`);
  return m;
}

describe('o aviso de distância chega à tela', () => {
  it('perto demais: o banner diz o que o núcleo mandou dizer sobre estar PERTO', () => {
    render(<GazeStatusBanner {...semProblemas} distanceAdvice={mensagemPara('perto')} />);
    expect(screen.getByTestId('gaze-status-banner')).toBeInTheDocument();
    expect(screen.getByText(textoDe('perto'))).toBeInTheDocument();
    // E não o de longe: as duas direções não podem sair trocadas.
    expect(screen.queryByText(textoDe('longe'))).not.toBeInTheDocument();
  });

  it('longe demais: o banner diz o que o núcleo mandou dizer sobre estar LONGE', () => {
    render(<GazeStatusBanner {...semProblemas} distanceAdvice={mensagemPara('longe')} />);
    expect(screen.getByText(textoDe('longe'))).toBeInTheDocument();
    expect(screen.queryByText(textoDe('perto'))).not.toBeInTheDocument();
  });

  it('dentro da faixa: banner nenhum', () => {
    const { container } = render(
      <GazeStatusBanner {...semProblemas} distanceAdvice={mensagemPara('dentro')} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('sem a prop, nada muda — a compatibilidade é preservada', () => {
    const { container } = render(<GazeStatusBanner {...semProblemas} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('a ordem de precedência', () => {
  it('erro de câmera VENCE o aviso de distância', () => {
    // Sem câmera, a distância não importa — e empilhar dois banners num
    // software assistivo é pior que mostrar só o mais grave.
    render(
      <GazeStatusBanner
        {...semProblemas}
        cameraError="Dispositivo em uso."
        distanceAdvice={mensagemPara('perto')}
      />
    );
    expect(screen.getByText(/câmera não está disponível/i)).toBeInTheDocument();
    expect(screen.queryByText(/afaste-se/i)).not.toBeInTheDocument();
  });

  it('calibração invalidada VENCE o aviso de distância', () => {
    render(
      <GazeStatusBanner
        {...semProblemas}
        calibrationInvalidated="O pipeline mudou."
        distanceAdvice={mensagemPara('longe')}
      />
    );
    expect(screen.getByText(/calibração deixou de valer/i)).toBeInTheDocument();
    expect(screen.queryByText(/aproxime-se/i)).not.toBeInTheDocument();
  });

  it('falta de calibração não aparece mais, e deixa o aviso de distância passar', () => {
    // "Ainda não há calibração" foi removido a pedido: era o único banner que
    // aparecia em TODAS as telas, inclusive no login e no onboarding, onde não
    // há controle por olhar nenhum. Os outros continuam.
    //
    // Como ele saiu, deixou de vencer a precedência: quem estava atrás dele na
    // fila agora chega à tela.
    render(
      <GazeStatusBanner
        {...semProblemas}
        state="uncalibrated"
        distanceAdvice={mensagemPara('perto')}
      />
    );
    expect(screen.queryByText(/ainda não há calibração/i)).not.toBeInTheDocument();
    expect(screen.getByText(textoDe('perto'))).toBeInTheDocument();
  });

  it('sozinha, a falta de calibração não produz banner nenhum', () => {
    const { container } = render(<GazeStatusBanner {...semProblemas} state="uncalibrated" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('o aviso de distância usa tom de AVISO, não de erro', () => {
    // O sistema continua funcionando, só com precisão pior que a calibrada.
    // Tratar isso como erro ensinaria o cuidador a ignorar banners vermelhos —
    // e aí o banner que importa de verdade também seria ignorado.
    // ⚠️ O React renderiza `style` como `rgb(...)`, não como hex — procurar
    // por '78350f' no HTML nunca casa.
    const aviso = render(
      <GazeStatusBanner {...semProblemas} distanceAdvice={mensagemPara('perto')} />
    );
    const cardAviso = aviso.getByTestId('gaze-status-banner').firstElementChild as HTMLElement;
    aviso.unmount();

    const erro = render(<GazeStatusBanner {...semProblemas} cameraError="x" />);
    const cardErro = erro.getByTestId('gaze-status-banner').firstElementChild as HTMLElement;

    // Âmbar (#78350f) para aviso, vermelho (#7f1d1d) para erro.
    expect(cardAviso.style.backgroundColor).toBe('rgb(120, 53, 15)');
    expect(cardErro.style.backgroundColor).toBe('rgb(127, 29, 29)');
    expect(cardAviso.style.backgroundColor).not.toBe(cardErro.style.backgroundColor);
  });
});

// -----------------------------------------------------------------------------
// Reajuste rápido (alvo único de 2 s).
//
// A saída para "a geometria saiu do lugar" é reancorar, não recalibrar. O botão
// só pode aparecer nos avisos em que isso é verdade — nos erros de câmera e de
// calibração inválida ele não conserta nada, e um botão que não conserta ensina
// a apertar botões por reflexo.
// -----------------------------------------------------------------------------
describe('o botão de reajuste rápido', () => {
  it('aparece no aviso de distância e chama de volta ao ser clicado', () => {
    const onReancorar = vi.fn();
    render(
      <GazeStatusBanner
        {...semProblemas}
        distanceAdvice={mensagemPara('perto')}
        onReancorar={onReancorar}
      />
    );
    const botao = screen.getByRole('button', { name: /reajustar/i });
    fireEvent.click(botao);
    expect(onReancorar).toHaveBeenCalledTimes(1);
  });

  it('aparece no aviso de postura, que não tem outra saída na tela', () => {
    render(<GazeStatusBanner {...semProblemas} avisoDePostura onReancorar={() => {}} />);
    expect(screen.getByTestId('gaze-status-banner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reajustar/i })).toBeInTheDocument();
  });

  it('a distância tem precedência sobre a postura: um banner, não dois', () => {
    render(
      <GazeStatusBanner
        {...semProblemas}
        distanceAdvice={mensagemPara('longe')}
        avisoDePostura
        onReancorar={() => {}}
      />
    );
    expect(screen.getAllByTestId('gaze-status-banner')).toHaveLength(1);
    expect(screen.getByText(textoDe('longe'))).toBeInTheDocument();
  });

  it('NÃO aparece em erro de câmera nem em calibração inválida', () => {
    const semCamera = render(
      <GazeStatusBanner {...semProblemas} cameraError="x" onReancorar={() => {}} />
    );
    expect(semCamera.queryByRole('button', { name: /reajustar/i })).toBeNull();
    semCamera.unmount();

    render(
      <GazeStatusBanner
        {...semProblemas}
        calibrationInvalidated="a tela mudou de tamanho"
        onReancorar={() => {}}
      />
    );
    expect(screen.queryByRole('button', { name: /reajustar/i })).toBeNull();
  });

  it('durante a coleta o botão para de aceitar clique', () => {
    const onReancorar = vi.fn();
    render(
      <GazeStatusBanner
        {...semProblemas}
        distanceAdvice={mensagemPara('perto')}
        onReancorar={onReancorar}
        reancorando
      />
    );
    const botao = screen.getByRole('button', { name: /olhe o centro/i });
    expect(botao).toBeDisabled();
    fireEvent.click(botao);
    expect(onReancorar).not.toHaveBeenCalled();
  });

  it('sem callback não há botão — o aviso continua aparecendo', () => {
    render(<GazeStatusBanner {...semProblemas} distanceAdvice={mensagemPara('perto')} />);
    expect(screen.getByTestId('gaze-status-banner')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reajustar/i })).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// O vigia de recalibração existia no engine e ninguém o mostrava. Aqui: o
// veredicto chega à tela com os dois botões, cada um chama o que deve, e a
// precedência põe distância e postura (2 s) antes dos nove pontos.
// -----------------------------------------------------------------------------
describe('o aviso do vigia de recalibração', () => {
  it('aparece com "Calibrar de novo" e "Agora não", e cada botão chama o seu callback', () => {
    const onRecalibrar = vi.fn();
    const onDispensar = vi.fn();
    render(
      <GazeStatusBanner
        {...semProblemas}
        avisoDeRecalibracao="bcea"
        onRecalibrar={onRecalibrar}
        onDispensarRecalibracao={onDispensar}
      />
    );
    expect(screen.getByText(/mira piorou/i)).toBeInTheDocument();
    expect(screen.getByText(/tremendo/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('recalibrar-agora'));
    expect(onRecalibrar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('recalibrar-depois'));
    expect(onDispensar).toHaveBeenCalledTimes(1);
  });

  it('o motivo "vies" tem o próprio texto', () => {
    render(<GazeStatusBanner {...semProblemas} avisoDeRecalibracao="vies" onRecalibrar={() => {}} />);
    expect(screen.getByText(/mesmo lado/)).toBeInTheDocument();
  });

  it('distância e postura vêm ANTES: o reajuste de 2 s é a saída mais barata', () => {
    render(
      <GazeStatusBanner
        {...semProblemas}
        distanceAdvice={mensagemPara('perto')}
        avisoDeRecalibracao="bcea"
        onReancorar={() => {}}
        onRecalibrar={() => {}}
      />
    );
    expect(screen.getAllByTestId('gaze-status-banner')).toHaveLength(1);
    expect(screen.queryByTestId('recalibrar-agora')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reajustar/i })).toBeInTheDocument();
  });

  it('sem motivo, nada aparece', () => {
    render(<GazeStatusBanner {...semProblemas} avisoDeRecalibracao={null} onRecalibrar={() => {}} />);
    expect(screen.queryByTestId('gaze-status-banner')).not.toBeInTheDocument();
  });
});
