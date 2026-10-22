import React, { useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { FileDown, Printer } from 'lucide-react';
import { PrimaryButton } from '../../../components/ui/PrimaryButton';
import { PranchaDeLetras } from './PranchaDeLetras';
import { imprimirPrancha, ponteDaPrancha, salvarPranchaEmPdf } from './imprimir';

/**
 * Configurações → Prancha de letras impressa (pedido de 19/10/2026): o plano
 * C, para quando o computador não está por perto. Quem imprime é o cuidador,
 * com mouse e teclado — os botões não são alvos do olhar (`data-no-dwell`):
 * uma janela de impressão aberta por engano fica na frente de quem só tem o
 * olhar, até alguém chegar para fechá-la.
 *
 * No app instalado, imprimir passa pelo processo principal e a página
 * continua viva enquanto o cuidador escolhe a impressora — antes o
 * `window.print()` parava o app inteiro, a Emergência incluída (revisão de UX
 * de 20/10/2026, achado 8). A tela diz se a folha saiu.
 */
export const PranchaImpressa: React.FC<{ estiloDoCartao: React.CSSProperties }> = ({ estiloDoCartao }) => {
  const ponte = ponteDaPrancha();
  const [emCurso, setEmCurso] = useState<null | 'imprimir' | 'pdf'>(null);
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const imprimir = async () => {
    if (emCurso) return;
    setMensagem(null);
    // A cópia de impressão entra na página ANTES de abrir o diálogo.
    flushSync(() => setEmCurso('imprimir'));
    try {
      const r = await imprimirPrancha();
      // `null`: o navegador imprimiu por conta própria e não diz o resultado.
      if (r?.ok) setMensagem({ tipo: 'ok', texto: r.impressora ? `Prancha enviada para a impressora ${r.impressora}.` : 'Prancha enviada para a impressora padrão.' });
      else if (r && !r.cancelado) setMensagem({ tipo: 'erro', texto: r.erro ?? 'Não foi possível imprimir agora.' });
    } finally {
      setEmCurso(null);
    }
  };

  const salvarPdf = async () => {
    if (emCurso || !ponte) return;
    setMensagem(null);
    flushSync(() => setEmCurso('pdf'));
    try {
      const r = await salvarPranchaEmPdf(ponte);
      if (r.ok) setMensagem({ tipo: 'ok', texto: `Prancha salva em ${r.caminho}` });
      else if (!r.cancelado) setMensagem({ tipo: 'erro', texto: r.erro ?? 'Não foi possível salvar o PDF agora.' });
    } finally {
      setEmCurso(null);
    }
  };

  return (
    <section aria-labelledby="prancha-title" style={estiloDoCartao}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <Printer size={28} color="var(--color-primary)" aria-hidden="true" />
        <h2 id="prancha-title" className="t-h2" style={{ color: 'var(--color-text-base)', margin: 0 }}>
          Prancha de letras impressa
        </h2>
      </div>
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div aria-hidden="true" className="prancha-previa">
          <PranchaDeLetras />
        </div>
        <div style={{ flex: '1 1 18rem', display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0 }}>
          <p style={{ margin: 0, color: 'var(--color-text-muted)', lineHeight: 1.55 }}>
            Para quando o computador não estiver por perto — falta de luz, banho, passeio, hospital. A folha tem as letras
            no mesmo lugar do teclado da tela, SIM e NÃO e algumas frases prontas. Imprima em A4 deitado e deixe perto da
            cama; quem segura a folha aponta, e a pessoa responde com o olhar.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <PrimaryButton type="button" data-no-dwell="true" onClick={() => void imprimir()} disabled={emCurso !== null}>
              <Printer size={20} aria-hidden="true" /> {emCurso === 'imprimir' ? 'Abrindo a impressão…' : 'Imprimir prancha'}
            </PrimaryButton>
            {ponte && (
              <PrimaryButton type="button" variant="secondary" data-no-dwell="true" onClick={() => void salvarPdf()} disabled={emCurso !== null}>
                <FileDown size={20} aria-hidden="true" /> {emCurso === 'pdf' ? 'Gerando o PDF…' : 'Salvar em PDF'}
              </PrimaryButton>
            )}
          </div>
          {mensagem && (
            <p role={mensagem.tipo === 'erro' ? 'alert' : 'status'} style={{ margin: 0, fontWeight: 700, color: mensagem.tipo === 'erro' ? 'var(--tint-danger-text)' : 'var(--tint-ok-text)', overflowWrap: 'anywhere' }}>
              {mensagem.texto}
            </p>
          )}
        </div>
      </div>
      {emCurso !== null &&
        createPortal(
          <div className="prancha-impressao" data-testid="prancha-impressao">
            <PranchaDeLetras />
          </div>,
          document.body,
        )}
    </section>
  );
};
