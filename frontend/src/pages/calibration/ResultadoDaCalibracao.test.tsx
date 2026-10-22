import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import React from 'react';
import i18n from '../../i18n';
import { ResultadoDaCalibracao } from './ResultadoDaCalibracao';
import { SettingsProvider } from '../../context/SettingsContext';
import type { AlvoParaRecoletar, CalibrationFitDiagnostics, RelatorioDaRecoleta } from '@tracker/calibration';
import type { QualidadeDoAlvo } from '@tracker/calibration/recoletaDeAlvos';

// -----------------------------------------------------------------------------
// O resultado da calibração: a PALAVRA primeiro (pedido de 19/10/2026).
//
// "Ótima", "Boa" ou "Refazer…", e uma frase do que fazer, nos dois modos. Quem
// escolheu ver os números vê, abaixo, o motivo e os números de sempre.
//
// A regra que não pode ceder: REFAZER NUNCA É OBRIGATÓRIO. Mesmo no pior
// veredito, seguir continua disponível — quem decide é quem está na frente da
// tela, que sabe coisas que o software não sabe: o paciente está cansado, a luz
// vai melhorar, a consulta é daqui a pouco.
// -----------------------------------------------------------------------------

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

const diag = (veredicto: string, over: Record<string, unknown> = {}) =>
  ({
    trainErrorPx: 50,
    looErrorPx: 70,
    looByTarget: [],
    poseMean: null,
    poseStd: null,
    poseDrift: { targets: 8, yawDeg: 1, pitchDeg: 1, rollDeg: 1 },
    gridDiagnosis: {
      veredicto,
      centroPx: 100,
      periferiaPx: 110,
      razao: 1.1,
      piorAlvoPx: 150,
      mensagem: null,
    },
    ...over,
  }) as unknown as CalibrationFitDiagnostics;

const canto: AlvoParaRecoletar = { x: 0.05, y: 0.95, borda: true, motivos: ['erro'] };
const miolo: AlvoParaRecoletar = { x: 0.5, y: 0.5, borda: false, motivos: ['dispersao'] };

const qualidade = (over: Partial<QualidadeDoAlvo> = {}): QualidadeDoAlvo =>
  ({
    chave: '0.0500,0.9500',
    x: 0.05,
    y: 0.95,
    erroLotoPx: 180,
    dispersaoPx: 40,
    amostras: 30,
    borda: true,
    erroLotoDeg: 4.7,
    dispersaoDeg: 1.04,
    referenciaDoErroPx: 60,
    referenciaDaDispersaoPx: 30,
    corteDoErroPx: 120,
    corteDaDispersaoPx: 77,
    motivos: ['erro'],
    severidade: 1.5,
    ...over,
  }) as QualidadeDoAlvo;

const recoleta = (over: Partial<RelatorioDaRecoleta> = {}): RelatorioDaRecoleta =>
  ({
    automatica: true,
    em: '2026-10-19T00:00:00.000Z',
    alvos: [],
    aceito: true,
    motivo: 'melhorou',
    looAntesPx: 54.4,
    looDepoisPx: 6.3,
    looInternoAntesPx: 13,
    looInternoDepoisPx: 4.5,
    tempoUtilMs: 916,
    ...over,
  }) as RelatorioDaRecoleta;

interface Opcoes {
  mostrarNumeros?: boolean;
  pontosRuins?: AlvoParaRecoletar[];
  validacao?: { erroInternoPx: number | null; cantosRuins?: { x: number; y: number }[] } | null;
  qualidade?: QualidadeDoAlvo[] | null;
  aoRefazerPontos?: () => void;
  aoSeguir?: () => void;
}

const montar = (d: CalibrationFitDiagnostics | null, o: Opcoes = {}) =>
  render(
    <MemoryRouter>
      <ResultadoDaCalibracao
        diagnostico={d}
        aoSeguir={o.aoSeguir ?? vi.fn()}
        mostrarNumeros={'mostrarNumeros' in o ? o.mostrarNumeros : true}
        pontosRuins={o.pontosRuins ?? []}
        validacao={o.validacao ?? null}
        qualidade={o.qualidade ?? null}
        aoRefazerPontos={o.aoRefazerPontos}
      />
    </MemoryRouter>
  );

const palavra = () => screen.getByTestId('palavra-do-resultado');

describe('a palavra chega à tela', () => {
  it('erro pequeno: "Ótima" e a frase de que pode usar', () => {
    montar(diag('ok', { looErrorPx: 40 }));
    expect(palavra().dataset.palavra).toBe('otima');
    expect(palavra()).toHaveTextContent('Ótima');
    expect(palavra()).toHaveTextContent(/pode usar/i);
  });

  it('erro na faixa "Regular" do teste: "Boa"', () => {
    montar(diag('ok', { looErrorPx: 80 }));
    expect(palavra().dataset.palavra).toBe('boa');
    expect(palavra()).toHaveTextContent('Boa');
  });

  it('sessão ruim: "Vale refazer a calibração", com a frase do motivo', () => {
    montar(diag('sessao_ruim'));
    expect(palavra().dataset.palavra).toBe('refazerTudo');
    expect(palavra()).toHaveTextContent(/vale refazer a calibração/i);
    expect(palavra()).toHaveTextContent(/melhore a luz/i);
  });

  it('o erro do teste de precisão vence o da calibração (o painel do teste disse o mesmo)', () => {
    montar(diag('ok', { looErrorPx: 150 }), { validacao: { erroInternoPx: 35 } });
    expect(palavra().dataset.palavra).toBe('otima');
  });

  it('a palavra aparece igual nos dois modos', () => {
    const { unmount } = montar(diag('ok', { looErrorPx: 80 }), { mostrarNumeros: true });
    const tecnica = palavra().dataset.palavra;
    unmount();
    montar(diag('ok', { looErrorPx: 80 }), { mostrarNumeros: false });
    expect(palavra().dataset.palavra).toBe(tecnica);
  });
});

describe('refazer só os pontos ruins', () => {
  it('cantos ruins: "Refazer os cantos" e o botão de refazer só eles', () => {
    const aoRefazerPontos = vi.fn();
    montar(diag('ok', { looErrorPx: 40 }), { pontosRuins: [canto], aoRefazerPontos });
    expect(palavra()).toHaveTextContent('Refazer os cantos');
    const botao = screen.getByTestId('refazer-pontos');
    expect(botao).toHaveTextContent('Refazer só os cantos');
    fireEvent.click(botao);
    expect(aoRefazerPontos).toHaveBeenCalledTimes(1);
  });

  it('um ponto do miolo: "Refazer alguns pontos" e "Refazer só os pontos imprecisos"', () => {
    montar(diag('ok', { looErrorPx: 40 }), { pontosRuins: [miolo, canto] });
    expect(palavra()).toHaveTextContent('Refazer alguns pontos');
    expect(screen.getByTestId('refazer-pontos')).toHaveTextContent('Refazer só os pontos imprecisos');
  });

  it('sem pontos ruins, o botão não aparece — a tela não promete o que não pode fazer', () => {
    montar(diag('ok', { looErrorPx: 40 }));
    expect(screen.queryByTestId('refazer-pontos')).toBeNull();
  });

  // Revisão do pipeline de 19/10/2026: o painel do teste acabou de dizer
  // "Refazer os cantos"; sem como refazer, a tela dizia "Ótima".
  it('sem como refazer, mas com cantos "Ruim" no teste: a palavra do painel, e a frase sem o botão', () => {
    montar(diag('ok', { looErrorPx: 40 }), {
      validacao: { erroInternoPx: 40, cantosRuins: [{ x: 0.05, y: 0.95 }] },
    });
    expect(palavra().dataset.palavra).toBe('refazerCantos');
    expect(palavra()).toHaveTextContent('Refazer os cantos');
    expect(palavra()).toHaveTextContent(/refaça a calibração/);
    expect(palavra()).not.toHaveTextContent(/refazer só os cantos/i);
    expect(screen.queryByTestId('refazer-pontos')).toBeNull();
  });

  it('sem callback, volta à calibração pedindo a recoleta e levando o destino', () => {
    let estado: unknown = 'nao-chegou';
    const Sonda = () => {
      estado = useLocation().state;
      return <span>calibracao</span>;
    };
    render(
      <MemoryRouter initialEntries={[{ pathname: '/calibration/resultado', state: { destino: '/tutorial' } }]}>
        <Routes>
          <Route
            path="/calibration/resultado"
            element={
              <ResultadoDaCalibracao
                diagnostico={diag('ok', { looErrorPx: 40 })}
                mostrarNumeros={false}
                pontosRuins={[canto]}
                validacao={null}
                qualidade={null}
              />
            }
          />
          <Route path="/calibration-check" element={<Sonda />} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId('refazer-pontos'));
    expect(screen.getByText('calibracao')).toBeInTheDocument();
    expect(estado).toEqual({ recoletar: true, destino: '/tutorial' });
  });
});

describe('refazer nunca é obrigatório', () => {
  it('seguir continua habilitado no pior veredito', () => {
    const aoSeguir = vi.fn();
    montar(diag('sessao_ruim'), { aoSeguir });
    const seguir = screen.getByTestId('resultado-seguir');
    expect(seguir).toBeEnabled();
    fireEvent.click(seguir);
    expect(aoSeguir).toHaveBeenCalledTimes(1);
  });

  it('a tela diz em voz alta que refazer é opcional', () => {
    montar(diag('sessao_ruim'));
    expect(screen.getByText(/sempre opcional|quem decide é você/i)).toBeInTheDocument();
  });

  it('nenhum botão aparece desabilitado', () => {
    const { container } = montar(diag('sessao_ruim'), { pontosRuins: [canto] });
    expect(container.querySelectorAll('button[disabled]')).toHaveLength(0);
  });

  it('os botões são alvos de olhar de recuperação (a rota não tem cursor)', () => {
    // Fora do cursor, o dispatcher só aciona alvos de recuperação: sem a
    // marcação, quem recalibrou sozinho não teria como sair desta tela.
    const { container } = montar(diag('ok'), { pontosRuins: [canto] });
    const botoes = Array.from(container.querySelectorAll('button'));
    expect(botoes).toHaveLength(3);
    for (const b of botoes) {
      expect(b.dataset.recovery).toBe('true');
      expect(b.className).toContain('gaze-button');
    }
  });
});

describe('o motivo vem antes do número', () => {
  it('deriva postural é dita com todas as letras', () => {
    montar(diag('sessao_ruim', { poseDrift: { targets: 8, yawDeg: 4.5, pitchDeg: 1, rollDeg: 1 } }));
    expect(screen.getByText(/cabeça mudou de posição entre os pontos/i)).toBeInTheDocument();
    expect(screen.getByText(/repete o resultado/i)).toBeInTheDocument();
  });

  it('o motivo aparece no DOM antes do número', () => {
    const { container } = montar(diag('sessao_ruim'));
    const texto = container.textContent ?? '';
    const posMotivo = texto.search(/luz ou distância/i);
    const posNumero = texto.search(/erro médio da calibração/i);
    expect(posMotivo).toBeGreaterThanOrEqual(0);
    expect(posNumero).toBeGreaterThan(posMotivo);
  });
});

describe('com os números', () => {
  it('mostra o erro em px', () => {
    montar(diag('ok', { looErrorPx: 123 }));
    expect(screen.getByText(/123 px/)).toBeInTheDocument();
  });

  it('com o LOTO da grade interna, diz que os cantos ficaram de fora e mostra o de todos', () => {
    montar(diag('ok', { looErrorPx: 150, looGradeInternaPx: 83 }));
    expect(screen.getByText(/fora os cantos da tela: 83 px/)).toBeInTheDocument();
    expect(screen.getByText(/todos os pontos \(LOTO\): 150 px/)).toBeInTheDocument();
  });

  it('mostra a deriva em graus', () => {
    montar(diag('ok', { poseDrift: { targets: 8, yawDeg: 2.5, pitchDeg: 1, rollDeg: 1 } }));
    expect(screen.getByText(/2,5°/)).toBeInTheDocument();
  });

  it('mostra o tremor da fixação e cada ponto ruim, com o lugar em palavras', () => {
    montar(diag('ok', { looErrorPx: 40 }), {
      pontosRuins: [canto],
      qualidade: [qualidade(), qualidade({ chave: '0.5000,0.5000', x: 0.5, y: 0.5, dispersaoPx: 20, dispersaoDeg: 0.52, erroLotoPx: 30, borda: false, motivos: [] })],
    });
    expect(screen.getByText(/tremor da fixação.*30 px · 0,78°/i)).toBeInTheDocument();
    const ponto = screen.getByTestId('ponto-ruim');
    expect(ponto).toHaveTextContent('Embaixo à esquerda');
    expect(ponto).toHaveTextContent('180 px');
    expect(ponto).toHaveTextContent('30 amostras');
  });

  it('mostra o antes e o depois da recoleta', () => {
    montar(diag('ok', { looErrorPx: 40, recoleta: recoleta({ alvos: [{} as never] }) }));
    expect(screen.getByTestId('recoleta-tecnica')).toHaveTextContent('Recoleta de 1 ponto(s): LOTO 54 → 6 px — modelo novo em uso');
    expect(screen.getByTestId('frase-da-recoleta')).toHaveTextContent(/ficaram melhores/i);
  });

  it('recoleta recusada: diz que a calibração de antes continua valendo', () => {
    montar(diag('ok', { looErrorPx: 40, recoleta: recoleta({ aceito: false, motivo: 'piorou', looDepoisPx: 70 }) }));
    expect(screen.getByTestId('recoleta-tecnica')).toHaveTextContent('mantida a calibração de antes');
    expect(screen.getByTestId('frase-da-recoleta')).toHaveTextContent(/de antes continua valendo/i);
  });
});

describe('em palavras simples', () => {
  it('esconde px, graus e LOTO, e mostra a palavra e a frase', () => {
    montar(
      diag('ok', { looErrorPx: 41, poseDrift: { targets: 8, yawDeg: 2.5, pitchDeg: 1, rollDeg: 1 }, recoleta: recoleta() }),
      { mostrarNumeros: false, pontosRuins: [canto], qualidade: [qualidade()] }
    );
    const texto = document.body.textContent ?? '';
    expect(texto).not.toMatch(/\d+\s*px/);
    expect(texto).not.toMatch(/°/);
    expect(texto).not.toMatch(/LOTO/);
    expect(screen.getByText('Seu olhar foi configurado.')).toBeInTheDocument();
    expect(palavra()).toHaveTextContent('Refazer os cantos');
    // A recoleta também aparece, em uma frase.
    expect(screen.getByTestId('frase-da-recoleta')).toHaveTextContent(/ficaram melhores/i);
    expect(screen.queryByTestId('recoleta-tecnica')).toBeNull();
  });
});

describe('a escolha guardada nos ajustes decide o modo', () => {
  const comAjuste = (linguagem: 'simples' | 'tecnica' | null) => {
    localStorage.setItem('irisflow_settings', JSON.stringify({ schemaVersion: 1, linguagemDoRelatorio: linguagem }));
    return render(
      <SettingsProvider>
        <MemoryRouter>
          <ResultadoDaCalibracao
            diagnostico={diag('ok', { looErrorPx: 123 })}
            aoSeguir={vi.fn()}
            pontosRuins={[]}
            validacao={null}
            qualidade={null}
          />
        </MemoryRouter>
      </SettingsProvider>
    );
  };

  it('"Com os números" mostra os números, mesmo sem ser cuidador', () => {
    comAjuste('tecnica');
    expect(screen.getByText(/123 px/)).toBeInTheDocument();
  });

  it('"Em palavras simples" esconde os números', () => {
    comAjuste('simples');
    expect(screen.queryByText(/123 px/)).toBeNull();
    expect(palavra()).toBeInTheDocument();
  });

  it('sem escolha ainda, vale a regra de antes: o paciente vê a palavra, sem números', () => {
    comAjuste(null);
    expect(screen.queryByText(/123 px/)).toBeNull();
  });
});

describe('sem diagnóstico', () => {
  it('não manda refazer nem inventa número', () => {
    montar(null);
    expect(screen.queryByText(/vale refazer/i)).toBeNull();
    expect(screen.queryByText(/erro médio da calibração/i)).toBeNull();
    expect(palavra().dataset.palavra).toBe('boa');
  });
});
