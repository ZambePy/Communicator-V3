import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './i18n';
import './index.css';
import { aplicarSessaoDaUrl } from './sessionFromUrl';
import { descarregar as descarregarAssistente } from './services/assistente';
import { instalarCapturaDeErros } from './services/diagnostico/relatorioDeSuporte';
import { restaurarPedidoDeSocorro } from './services/emergencia/pedidoDeSocorro';

// ANTES de renderizar: a configuração de sessão vinda da URL. `EXPERIMENT` é
// resolvido no import do módulo, então aplicar depois não valeria para esta
// sessão — grava e recarrega, e só recarrega quando algo mudou de fato.
if (aplicarSessaoDaUrl()) {
  console.warn('[sessão] configuração da URL aplicada — recarregando.');
  window.location.reload();
}

// O relatório de suporte precisa dos erros desde o INÍCIO da sessão: instalado
// aqui, antes de renderizar, ele pega inclusive as falhas de boot.
instalarCapturaDeErros();

// Um socorro em andamento sobrevive à recarga da página (o vigia do renderer
// recarrega a página travada): volta antes de desenhar, com o alarme se ele
// estava tocando. Sem socorro, desliga o alarme do sistema que a página
// anterior tenha deixado ligado (revisão de segurança de 19/10/2026).
restaurarPedidoDeSocorro();

// A gravação do modelo do assistente é adiada 1,5 s para não escrever no disco
// a cada letra digitada por fixação. `pagehide` é o último momento confiável
// para descarregar o que estiver pendente — sem isto, fechar o app logo depois
// de o paciente falar uma frase nova perdia aquele aprendizado. `pagehide` e
// não `beforeunload`: este último não dispara de forma confiável no Electron
// nem em telas móveis.
window.addEventListener('pagehide', () => descarregarAssistente());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
