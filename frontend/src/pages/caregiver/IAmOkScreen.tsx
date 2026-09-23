import React, { useCallback, useEffect, useState } from 'react';
import { ThumbsUp, Send } from 'lucide-react';
import { emitirFalaDoPaciente } from '../../cloud/eventos';
import { useToast } from '../../context/ToastContext';
import { GazePageLayout } from '../../components/ui/GazePageLayout';
import { GazeButton } from '../../components/ui/GazeButton';

export const IAmOkScreen: React.FC = () => {
  const toast = useToast();
  const [timeLeft, setTimeLeft] = useState(30);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  /**
   * Envia o "estou bem" pelo barramento da nuvem — o mesmo caminho de toda
   * fala do paciente, com fila offline e reenvio quando a internet volta.
   *
   * Duas correções moram aqui.
   *
   * A primeira: havia também uma chamada a `api.sendIAmOk`, que aponta para
   * um backend que NÃO EXISTE neste produto (`VITE_API_URL`, sem serviço no
   * repositório). Ela falhava sempre, e o `setSent(true)` estava no `finally`
   * — então a tela anunciava "Sinal enviado aos cuidadores com sucesso!"
   * exatamente quando o envio tinha falhado, e sumia com os botões, sem
   * segunda chance. Para uma tela cuja única função é tranquilizar a família,
   * era a pior falha possível: mentir dizendo que tranquilizou.
   *
   * A segunda: o barramento já entrega ao celular do cuidador. Não havia
   * nada a acrescentar — só o que tirar.
   */
  const dispatchSignal = useCallback(() => {
    if (sending || sent) return;
    setSending(true);
    emitirFalaDoPaciente('Estou bem', 'sistema');
    setSent(true);
    setSending(false);
    toast.success('Sinal "Estou Bem" enviado ao cuidador.');
  }, [sending, sent, toast]);

  useEffect(() => {
    if (sent) return;
    if (timeLeft === 0) {
      dispatchSignal();
      return;
    }
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, sent, dispatchSignal]);

  return (
    <GazePageLayout showBack={true} backRoute="/menu">
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div
          className="surface surface--elevated"
          style={{
            padding: '3rem 3rem',
            borderRadius: 'var(--radius-xl)',
            textAlign: 'center',
            maxWidth: 720,
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'inline-flex', background: 'var(--tint-ok-bg)', border: '1px solid var(--tint-ok-border)', padding: '1.5rem', borderRadius: '50%', marginBottom: '1.25rem' }}>
            <ThumbsUp size={64} color="var(--color-ok)" aria-hidden="true" />
          </div>

          <h1
            id="iamok-title"
            className="t-h1"
            style={{ color: 'var(--color-text-base)', margin: '0 0 1rem 0' }}
          >
            Modo "Estou Bem"
          </h1>

          {sent ? (
            <div role="status" aria-live="polite" style={{ marginTop: '1.5rem' }}>
              <p style={{ fontSize: '1.6rem', color: 'var(--tint-ok-text)', fontWeight: 700 }}>
                Sinal "Estou bem" enviado ao cuidador.
              </p>
              {/* Sem conta vinculada o barramento não tem para onde entregar.
                  Dizer "enviado" nesse caso seria a mesma mentira de antes,
                  com outra roupa. */}
              <p style={{ fontSize: '1.05rem', color: 'var(--color-text-base)', opacity: 0.75, marginTop: '0.75rem' }}>
                Se este computador ainda não estiver ligado a uma conta IrisFlow, o aviso fica guardado e
                sai assim que a conta for configurada.
              </p>
              {/* Sem animação contínua: o sinal saiu, e o ícone parado diz isso. */}
              <div style={{ display: 'inline-flex', marginTop: '1.5rem' }}>
                <Send size={48} color="var(--color-ok)" aria-hidden="true" />
              </div>
            </div>
          ) : (
            <div style={{ marginTop: '1rem' }}>
              <p className="t-body-lg" style={{ color: 'var(--color-text-muted)', fontWeight: 500, margin: 0 }}>
                Enviando notificação automática em:
              </p>
              <div
                role="timer"
                aria-live="polite"
                aria-atomic="true"
                style={{ fontFamily: 'var(--font-display)', fontSize: '5rem', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: 'var(--color-ok)', margin: '1rem 0' }}
              >
                {timeLeft}s
              </div>

              {/* Dois alvos lado a lado, ambos com 200 px de altura (≥ 5°) e
                  1,5° de folga entre eles — antes eram faixas de 76 px. */}
              <div style={{ display: 'flex', gap: '3.75rem', marginTop: '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <GazeButton
                  onClick={dispatchSignal}
                  disabled={sending}
                  width={230}
                  height={200}
                  style={{
                    background: 'var(--color-ok)',
                    border: '2px solid var(--color-ok)',
                    borderRadius: 'var(--radius-lg)',
                    color: 'var(--color-navy)',
                  }}
                >
                  <span style={{ fontSize: '1.4rem', fontWeight: 800 }}>
                    {sending ? 'Enviando…' : 'Enviar Agora'}
                  </span>
                </GazeButton>

                <GazeButton
                  onClick={() => window.history.back()}
                  variante="perigo"
                  width={230}
                  height={200}
                  style={{ borderRadius: 'var(--radius-lg)' }}
                >
                  <span style={{ fontSize: '1.4rem', fontWeight: 800 }}>
                    Cancelar
                  </span>
                </GazeButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </GazePageLayout>
  );
};
