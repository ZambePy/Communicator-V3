import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { Smartphone } from 'lucide-react';
import { PrimaryButton } from './ui/PrimaryButton';
import { useCloud } from '../cloud/CloudContext';
import { cloudConfig } from '../cloud/config';
import {
  cancelarCodigo,
  consultarCodigo,
  ErroDoPareamento,
  horaCurta,
  mensagemDaFalha,
  pedirCodigo,
  tempoRestante,
  urlDoPareamento,
  type OpcoesDoPareamento,
} from '../cloud/pareamento';

/**
 * CONECTAR O CELULAR DO CUIDADOR — seção de Configurações (pedido do dono de
 * 19/10/2026: "conectar o celular do cuidador por QR code, sem digitar código
 * nem senha").
 *
 * O cuidador clica em "Mostrar o código", aponta a câmera do celular para o QR
 * e o celular entra na conta da família. O código vale 3 minutos e uma vez só.
 * Esta tela pergunta ao servidor a cada 2 s se um celular já o usou e, quando
 * o celular confirma que entrou, diz a hora — é também o aviso de que alguém
 * (talvez não o cuidador) entrou na conta. O QR só aparece depois do clique, e
 * fechar a seção, sair da tela ou gerar outro cancela o código: um QR
 * esquecido na tela não fica à espera de uma foto.
 *
 * É tela do cuidador — mouse e teclado —, então os controles são os comuns,
 * sem mínimo de olhar.
 */

const INTERVALO_DA_CONSULTA_MS = 2_000;
/** Depois de usado, quanto esperar a confirmação do celular antes de dizer "confira no celular". */
export const ESPERA_DA_CONFIRMACAO_MS = 30_000;
/** Depois de usado, por quanto tempo ainda perguntar se ele confirmou. */
const CONSULTA_DEPOIS_DO_USO_MS = 120_000;
/** Sem nenhuma resposta do servidor por tanto tempo, a tela avisa. */
export const AVISO_SEM_RESPOSTA_MS = 10_000;

type Fase =
  | { tipo: 'ocioso' }
  | { tipo: 'gerando' }
  | { tipo: 'mostrando'; id: string; url: string; fimEm: number }
  | { tipo: 'usado'; id: string; usadoEm: string; desde: number }
  | { tipo: 'conectado'; conectadoEm: string }
  | { tipo: 'vencido' }
  | { tipo: 'erro'; mensagem: string };

/**
 * O QR em SVG, módulo a módulo (o mesmo jeito de site/src/components/ui/QrCode.tsx):
 * nítido em qualquer tela e sem imagem guardada em lugar nenhum. Escuro sobre
 * branco nos dois temas, com a margem de 4 módulos — é o que as câmeras de
 * celular leem; claro sobre escuro falha em muitos leitores.
 */
export function CodigoQr({ valor, tamanho = 232, rotulo }: { valor: string; tamanho?: number; rotulo: string }) {
  const { n, caminho } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(valor);
    qr.make();
    const total = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < total; r++) {
      for (let c = 0; c < total; c++) {
        if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
      }
    }
    return { n: total + 8, caminho: d };
  }, [valor]);
  return (
    <svg
      role="img"
      aria-label={rotulo}
      data-testid="qr-do-celular"
      width={tamanho}
      height={tamanho}
      viewBox={`0 0 ${n} ${n}`}
      shapeRendering="crispEdges"
      style={{ display: 'block', borderRadius: '0.75rem', flex: '0 0 auto' }}
    >
      <rect width={n} height={n} fill="#ffffff" />
      <path d={caminho} fill="#0b1b3a" />
    </svg>
  );
}

const avisados = new Set<string>();
/** Uma linha no console por tipo de falha (não a cada consulta de 2 s). */
function avisarUmaVez(chave: string, msg: string, erro?: unknown) {
  if (avisados.has(chave)) return;
  avisados.add(chave);
  console.warn(`[pareamento] ${msg}`, erro instanceof Error ? erro.message : erro ?? '');
}

export const ParearCelular: React.FC = () => {
  const cloud = useCloud();
  // App 100% local (sem nuvem configurada): não há conta para o celular entrar.
  if (!cloud.configurada) return null;
  return <SecaoDoPareamento chave={cloud.vinculo?.device_key ?? null} />;
};

const estiloDaSecao: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  padding: '1.5rem',
  borderRadius: '1.25rem',
  background: 'var(--color-card-bg)',
  border: '1px solid var(--color-card-border)',
};

const estiloDoTexto: React.CSSProperties = {
  margin: 0,
  fontSize: '1rem',
  lineHeight: 1.5,
  color: 'var(--color-text-base)',
};

const estiloDaNota: React.CSSProperties = { ...estiloDoTexto, color: 'var(--color-text-muted)' };

const linhaDeBotoes: React.CSSProperties = { display: 'flex', gap: '0.6rem', flexWrap: 'wrap' };

type Tom = 'ok' | 'warn' | 'info';

function Aviso({ tom, children }: { tom: Tom; children: React.ReactNode }) {
  return (
    <p
      style={{
        ...estiloDoTexto,
        padding: '0.85rem 1rem',
        borderRadius: '0.75rem',
        background: `var(--tint-${tom}-bg)`,
        border: `1px solid var(--tint-${tom}-border)`,
        color: `var(--tint-${tom}-text)`,
      }}
    >
      {children}
    </p>
  );
}

function SecaoDoPareamento({ chave }: { chave: string | null }) {
  const [fase, setFase] = useState<Fase>({ tipo: 'ocioso' });
  const [restante, setRestante] = useState(0);
  const [semResposta, setSemResposta] = useState(false);
  const [, redesenhar] = useState(0);
  const secaoRef = useRef<HTMLElement>(null);
  /** A fase vai mudar por um clique do cuidador aqui (ver o efeito do foco, abaixo). */
  const moverFoco = useRef(false);
  const faseRef = useRef(fase);
  faseRef.current = fase;

  const opcoes = useMemo<OpcoesDoPareamento | null>(() => (chave ? { chave } : null), [chave]);
  const idConsultado = fase.tipo === 'mostrando' || fase.tipo === 'usado' ? fase.id : null;

  const gerar = useCallback(async () => {
    if (!opcoes) return;
    moverFoco.current = true;
    // O QR que estava na tela para de valer já, mesmo que o novo não saia.
    const anterior = faseRef.current;
    if (anterior.tipo === 'mostrando') void cancelarCodigo(opcoes, anterior.id);
    setFase({ tipo: 'gerando' });
    setSemResposta(false);
    try {
      const c = await pedirCodigo(opcoes);
      setFase({ tipo: 'mostrando', id: c.id, url: urlDoPareamento(cloudConfig.siteUrl, c.codigo), fimEm: Date.now() + c.restanteS * 1000 });
      setRestante(c.restanteS);
    } catch (e) {
      const falha = e instanceof ErroDoPareamento ? e.falha : 'servico';
      avisarUmaVez(`gerar:${falha}`, 'o código para o celular não foi gerado', e);
      setFase({ tipo: 'erro', mensagem: mensagemDaFalha(falha, e instanceof ErroDoPareamento ? e.tenteEm : undefined) });
    }
  }, [opcoes]);

  const fechar = useCallback(() => {
    const f = faseRef.current;
    if (f.tipo === 'mostrando' && opcoes) void cancelarCodigo(opcoes, f.id);
    moverFoco.current = true;
    setFase({ tipo: 'ocioso' });
  }, [opcoes]);

  // Saiu da tela com o QR aberto: o código para de valer na hora.
  useEffect(
    () => () => {
      const f = faseRef.current;
      if (f.tipo === 'mostrando' && opcoes) void cancelarCodigo(opcoes, f.id);
    },
    [opcoes],
  );

  // Contagem regressiva. No fim, uma última pergunta: se um celular usou o
  // código no último segundo, a tela diz isso; senão o código é cancelado no
  // servidor ANTES de a tela dizer que venceu — nunca "venceu" com ele valendo.
  useEffect(() => {
    if (fase.tipo !== 'mostrando' || !opcoes) return;
    const { id, fimEm } = fase;
    let vivo = true;
    let encerrado = false;
    const tique = () => {
      const s = Math.max(0, Math.ceil((fimEm - Date.now()) / 1000));
      setRestante(s);
      if (s > 0 || encerrado) return;
      encerrado = true;
      void consultarCodigo(opcoes, id)
        .catch(() => null)
        .then(async (e) => {
          if (!vivo) return;
          if (e?.estado === 'conectado') return setFase({ tipo: 'conectado', conectadoEm: e.conectadoEm ?? new Date().toISOString() });
          if (e?.estado === 'usado') return setFase({ tipo: 'usado', id, usadoEm: e.usadoEm ?? new Date().toISOString(), desde: Date.now() });
          await cancelarCodigo(opcoes, id);
          if (vivo) setFase({ tipo: 'vencido' });
        });
    };
    tique();
    const t = setInterval(tique, 1000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [fase, opcoes]);

  // Pergunta ao servidor se um celular já usou o código, e se ele confirmou.
  // Um laço só por código: segue de "mostrando" para "usado" sem recomeçar.
  useEffect(() => {
    if (!idConsultado || !opcoes) return;
    const id = idConsultado;
    let vivo = true;
    let ultimaResposta = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const consultar = async () => {
      try {
        const e = await consultarCodigo(opcoes, id);
        if (!vivo) return;
        ultimaResposta = Date.now();
        setSemResposta(false);
        if (e.estado === 'conectado') {
          setFase({ tipo: 'conectado', conectadoEm: e.conectadoEm ?? new Date().toISOString() });
          return;
        }
        if (e.estado === 'usado') {
          setFase((f) => (f.tipo === 'usado' ? f : { tipo: 'usado', id, usadoEm: e.usadoEm ?? new Date().toISOString(), desde: Date.now() }));
        } else if (e.estado !== 'aguardando') {
          // Vencido, cancelado (outro código foi gerado em outra janela) ou sumiu.
          setFase((f) => (f.tipo === 'mostrando' ? { tipo: 'vencido' } : f));
          return;
        }
      } catch (e) {
        if (!vivo) return;
        if (e instanceof ErroDoPareamento && e.falha === 'computador_desvinculado') {
          setFase({ tipo: 'erro', mensagem: mensagemDaFalha('computador_desvinculado') });
          return;
        }
        if (Date.now() - ultimaResposta >= AVISO_SEM_RESPOSTA_MS) {
          setSemResposta(true);
          avisarUmaVez(`consulta:${id}`, 'sem resposta do servidor sobre o código do celular', e);
        }
      }
      const f = faseRef.current;
      if (f.tipo === 'usado' && Date.now() - f.desde > CONSULTA_DEPOIS_DO_USO_MS) return;
      if (vivo) timer = setTimeout(() => void consultar(), INTERVALO_DA_CONSULTA_MS);
    };
    timer = setTimeout(() => void consultar(), INTERVALO_DA_CONSULTA_MS);
    return () => {
      vivo = false;
      if (timer) clearTimeout(timer);
    };
  }, [idConsultado, opcoes]);

  // Depois de usado, o texto muda de "esperando" para "confira no celular".
  useEffect(() => {
    if (fase.tipo !== 'usado') return;
    const falta = fase.desde + ESPERA_DA_CONFIRMACAO_MS - Date.now();
    if (falta <= 0) return;
    const t = setTimeout(() => redesenhar((n) => n + 1), falta + 50);
    return () => clearTimeout(t);
  }, [fase]);

  // Cada fase tem outro botão principal, e o botão clicado some: quem usa o
  // teclado ficaria com o foco "no nada". Só depois de um clique AQUI — uma
  // mudança vinda da consulta automática não puxa a tela de quem está em outro
  // campo de Configurações.
  useEffect(() => {
    if (!moverFoco.current || fase.tipo === 'gerando') return;
    moverFoco.current = false;
    secaoRef.current?.querySelector<HTMLButtonElement>('[data-acao-principal]')?.focus();
  }, [fase.tipo]);

  let estado: React.ReactNode = null;
  let corpo: React.ReactNode = null;
  if (!opcoes) {
    estado = (
      <p style={estiloDoTexto}>
        Para conectar um celular, este computador precisa estar conectado à conta da família. Entre com o e-mail e a senha
        da conta e volte aqui.
      </p>
    );
  } else if (fase.tipo === 'ocioso' || fase.tipo === 'gerando') {
    estado = (
      <p style={estiloDoTexto}>
        O celular entra na conta da família sem digitar e-mail nem senha. Clique em Mostrar o código e aponte a câmera do
        celular para a tela.
      </p>
    );
    corpo = (
      <div style={linhaDeBotoes}>
        <PrimaryButton data-acao-principal type="button" disabled={fase.tipo === 'gerando'} onClick={() => void gerar()}>
          {fase.tipo === 'gerando' ? 'Gerando o código…' : 'Mostrar o código'}
        </PrimaryButton>
      </div>
    );
  } else if (fase.tipo === 'mostrando') {
    estado = <p style={{ ...estiloDoTexto, fontSize: '1.1rem', fontWeight: 700 }}>Aponte a câmera do celular para o código.</p>;
    corpo = (
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <CodigoQr valor={fase.url} rotulo="Código para o celular do cuidador entrar na conta" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: '1 1 16rem' }}>
          <p style={estiloDoTexto} data-testid="tempo-do-codigo">
            Vale por mais {tempoRestante(restante)}.
          </p>
          <p style={estiloDaNota}>
            O código serve uma vez só. Não tire foto dele nem o mande para ninguém: quem o usar entra na conta da família.
          </p>
          <div style={linhaDeBotoes}>
            <PrimaryButton data-acao-principal type="button" variant="secondary" onClick={() => void gerar()}>
              Gerar outro
            </PrimaryButton>
            <PrimaryButton type="button" variant="ghost" onClick={fechar}>
              Fechar
            </PrimaryButton>
          </div>
        </div>
      </div>
    );
  } else if (fase.tipo === 'usado') {
    const hora = horaCurta(fase.usadoEm);
    if (Date.now() - fase.desde < ESPERA_DA_CONFIRMACAO_MS) {
      estado = <Aviso tom="info">O código foi lido às {hora}. Esperando o celular terminar de entrar…</Aviso>;
    } else {
      estado = <Aviso tom="warn">O código foi usado às {hora}. Confira no celular se ele entrou.</Aviso>;
      corpo = (
        <div style={linhaDeBotoes}>
          <PrimaryButton data-acao-principal type="button" variant="secondary" onClick={() => void gerar()}>
            Gerar outro código
          </PrimaryButton>
        </div>
      );
    }
  } else if (fase.tipo === 'conectado') {
    estado = <Aviso tom="ok">Celular conectado às {horaCurta(fase.conectadoEm)}.</Aviso>;
    corpo = (
      <>
        <p style={estiloDaNota}>
          Se não foi um celular da família que leu o código, troque a senha da conta no site do IrisFlow e fale com a equipe.
        </p>
        <div style={linhaDeBotoes}>
          <PrimaryButton data-acao-principal type="button" variant="secondary" onClick={() => void gerar()}>
            Conectar outro celular
          </PrimaryButton>
        </div>
      </>
    );
  } else if (fase.tipo === 'vencido') {
    estado = <p style={estiloDoTexto}>O código venceu sem ser usado. Gere outro quando o celular estiver por perto.</p>;
    corpo = (
      <div style={linhaDeBotoes}>
        <PrimaryButton data-acao-principal type="button" onClick={() => void gerar()}>
          Gerar outro código
        </PrimaryButton>
      </div>
    );
  } else {
    estado = <Aviso tom="warn">{fase.mensagem}</Aviso>;
    corpo = (
      <div style={linhaDeBotoes}>
        <PrimaryButton data-acao-principal type="button" variant="secondary" onClick={() => void gerar()}>
          Tentar de novo
        </PrimaryButton>
      </div>
    );
  }

  return (
    <section
      ref={secaoRef}
      aria-labelledby="parear-celular-title"
      style={estiloDaSecao}
      data-testid="parear-celular"
    >
      <h2
        id="parear-celular-title"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          margin: 0,
          fontSize: '1.2rem',
          fontWeight: 800,
          color: 'var(--color-text-base)',
        }}
      >
        <Smartphone size={20} color="var(--color-primary)" aria-hidden="true" />
        Conectar o celular do cuidador
      </h2>
      {/* Só a frase do estado é anunciada a quem usa leitor de tela; a
          contagem de segundos e os botões, não. */}
      <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {estado}
        {semResposta && idConsultado ? <Aviso tom="warn">Sem conexão para saber se o celular entrou. Tentando de novo…</Aviso> : null}
      </div>
      {corpo}
    </section>
  );
}
