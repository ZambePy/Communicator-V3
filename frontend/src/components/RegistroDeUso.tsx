import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { DWELL_SELECTOR } from '../context/GazeContext';
import { useSettings } from '../context/SettingsContext';
import { registrarCorrecao, registrarSelecao, rotaContaComoUso } from '../services/evolucao/registroDeUso';

// Coleta do USO para a evolução semanal (21/10/2026).
//
// UM ouvinte de clique, em captura, no documento: a seleção pelo olhar é um
// `.click()` da página (ver GazeContext), então o mesmo ouvinte vê o olhar, o
// mouse e o acionador — e nenhuma tela precisa saber que está sendo medida.
// Medir tela por tela deixaria de fora justamente a próxima que alguém criar.
//
// O QUE CONTA: clique num alvo do olhar (`DWELL_SELECTOR`, a mesma lista que
// o dispatcher e a varredura usam), numa rota do paciente (ver
// `rotaContaComoUso`), com a janela visível. O que fica de fora de propósito:
//   - `data-no-dwell`: não é alvo do olhar (botão desabilitado, imprimir, PDF);
//     quem clica nele é o cuidador, não o paciente;
//   - a Emergência: o botão do topo, a faixa da borda e os dois CANCELAR
//     (`SELETOR_DA_EMERGENCIA`). A rota /emergency já ficava de fora ("um
//     aumento ali é aflição"), mas esses botões são acionados de OUTRAS rotas e
//     contavam como minuto útil — inflando a evolução com o pior momento da
//     pessoa (revisão final, rodada 1, M7, 21/10/2026);
//   - janela escondida: o app aberto numa aba esquecida não é uso.
//
// LIMITE CONHECIDO: o ouvinte não distingue o olhar do mouse do cuidador. Na
// tela do paciente isso é raro e o erro é para MAIS minutos úteis, não para
// menos; está dito no relatório da tarefa.
//
// Contar nunca pode atrapalhar o clique: o ouvinte não impede nada, e uma falha
// do registro vira aviso no console (no máximo um por minuto — uma seleção
// acontece a cada olhar fixado, e armazenamento cheio falharia em todas).

/** O que é da Emergência: o botão (topo e faixa) e o CANCELAR da contagem. Os mesmos marcadores do despachante e da varredura. */
const SELETOR_DA_EMERGENCIA = '[data-emergency="true"], [data-cancelar-emergencia="true"]';

const INTERVALO_DO_AVISO_MS = 60_000;
let ultimoAviso = -Infinity;
function avisarNoConsole(erro: unknown): void {
  const agora = Date.now();
  if (agora - ultimoAviso < INTERVALO_DO_AVISO_MS) return;
  ultimoAviso = agora;
  console.warn('[uso] não foi possível contar a seleção na evolução', erro);
}

export const RegistroDeUso: React.FC = () => {
  const { pathname } = useLocation();
  const { settings } = useSettings();

  // O ouvinte é montado uma vez; rota e dwell mudam por fora dele.
  const rota = useRef(pathname);
  const dwellMs = useRef(settings.dwellMs);
  rota.current = pathname;
  dwellMs.current = settings.dwellMs;

  useEffect(() => {
    const aoClicar = (ev: MouseEvent) => {
      if (document.visibilityState === 'hidden') return;
      if (!rotaContaComoUso(rota.current)) return;
      const alvo = (ev.target as Element | null)?.closest?.(DWELL_SELECTOR);
      if (!alvo || alvo.matches(`[data-no-dwell="true"], :disabled, ${SELETOR_DA_EMERGENCIA}`)) return;
      try {
        const agora = Date.now();
        registrarSelecao(agora, dwellMs.current);
        if ((alvo as HTMLElement).dataset?.desfazer === 'true') registrarCorrecao(agora);
      } catch (e) {
        avisarNoConsole(e);
      }
    };
    document.addEventListener('click', aoClicar, true);
    return () => document.removeEventListener('click', aoClicar, true);
  }, []);

  return null;
};
