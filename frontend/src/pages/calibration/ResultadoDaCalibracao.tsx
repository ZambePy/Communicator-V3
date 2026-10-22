import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, RefreshCw, ArrowRight, Crosshair } from 'lucide-react';
import { GazeButton } from '../../components/ui/GazeButton';
import { NumeroAnimado } from '../../components/ui/NumeroAnimado';
import { lerCalibracao, lugarDoPonto, palavraDaCalibracao } from './veredito';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { isDevMode } from '../../devMode';
import { alvoMinimoPx } from '../../design/gazeMetrics';
import {
  alvosParaRecoletar,
  getCalibrationFitDiagnostics,
  getQualidadeDosAlvos,
  getValidacaoDoModelo,
  type AlvoParaRecoletar,
  type CalibrationFitDiagnostics,
} from '@tracker/calibration';
import type { QualidadeDoAlvo } from '@tracker/calibration/recoletaDeAlvos';
import type { PalavraDoResultado } from '@tracker/resultadoSimples';

/**
 * Resultado da calibração.
 *
 * A PALAVRA vem primeiro (pedido de 19/10/2026): "Ótima", "Boa" ou
 * "Refazer…", e uma frase do que fazer. Os limiares são os do teste de
 * precisão (ver `veredito.ts`), então esta tela e o painel do teste, que
 * acabou de aparecer, dizem a mesma coisa. Quem escolheu ver os números (a
 * pergunta de uma vez, no começo da calibração; Configurações muda) vê,
 * abaixo, o motivo técnico e os números de sempre — LOTO, deriva, tremor — e o
 * antes e o depois da recoleta, se houve.
 *
 * Quando o que ficou ruim são alguns pontos, dá para refazer SÓ eles (a
 * recoleta do núcleo, com a trava: o modelo novo só fica se melhorar).
 *
 * **Refazer nunca é obrigatório.** Em todo veredito o botão de seguir está lá:
 * a decisão é de quem está na frente da tela, que sabe coisas que o software
 * não sabe — o paciente está cansado hoje, a luz vai melhorar em dez minutos.
 *
 * Os três botões são `GazeButton` em ladrilhos acima do alvo mínimo de 5°: o
 * paciente chega aqui sozinho depois de recalibrar, e só com o olhar.
 */

const TOM_OK = { bg: 'var(--tint-ok-bg)', borda: 'var(--tint-ok-border)', cor: 'var(--tint-ok-text)' };
const TOM_REFAZER = {
  bg: 'var(--tint-warn-bg)',
  borda: 'var(--tint-warn-border)',
  cor: 'var(--tint-warn-text)',
};
const tomDa = (p: PalavraDoResultado) => (p === 'otima' || p === 'boa' ? TOM_OK : TOM_REFAZER);

/**
 * Lado mínimo do ladrilho, em px. Com a zona de acerto de 12 px dos dois lados
 * dá 200 px, acima do alvo mínimo de 5° na geometria de referência; numa tela
 * mais densa o ladrilho cresce até o mínimo da geometria corrente.
 */
const LADO_DO_BOTAO = 176;
const ZONA_DE_ACERTO_PX = 12;

const mediana = (v: number[]): number | null => {
  const s = v.filter(Number.isFinite).sort((a, b) => a - b);
  if (s.length === 0) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const ResultadoDaCalibracao: React.FC<{
  /**
   * Injetável para teste. Sem ela, LÊ DO CORE — sem isso a tela em produção
   * cairia sempre no veredito "sem medida" sobre um diagnóstico nulo.
   */
  diagnostico?: CalibrationFitDiagnostics | null;
  aoSeguir?: () => void;
  /**
   * Força os números (`true`) ou as palavras (`false`). Sem ele vale a escolha
   * guardada nos ajustes; sem escolha ainda, a regra de antes: números para o
   * cuidador e o modo desenvolvedor.
   */
  mostrarNumeros?: boolean;
  /** Injetáveis para teste; sem eles, lidos do núcleo. */
  pontosRuins?: AlvoParaRecoletar[];
  /** `cantosRuins`: os cantos que o teste mediu como "Ruim" — entram na palavra
   *  mesmo sem o botão de refazer (revisão do pipeline de 19/10/2026). */
  validacao?: { erroInternoPx: number | null; cantosRuins?: { x: number; y: number }[] } | null;
  qualidade?: QualidadeDoAlvo[] | null;
  aoRefazerPontos?: () => void;
}> = ({ diagnostico, aoSeguir, mostrarNumeros, pontosRuins, validacao, qualidade, aoRefazerPontos }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { isCaregiver } = useAuth();
  const { settings } = useSettings();
  const escolha = settings.linguagemDoRelatorio;
  const tecnico =
    mostrarNumeros ??
    (escolha === 'tecnica' ? true : escolha === 'simples' ? false : isCaregiver === true || isDevMode());

  const diag = diagnostico !== undefined ? diagnostico : getCalibrationFitDiagnostics();
  const leitura = lerCalibracao(diag);
  const pontos = pontosRuins !== undefined ? pontosRuins : alvosParaRecoletar();
  const resultado = palavraDaCalibracao(leitura, diag, {
    validacao: validacao !== undefined ? validacao : getValidacaoDoModelo(),
    pontosRuins: pontos,
  });
  const q = qualidade !== undefined ? qualidade : getQualidadeDosAlvos();
  const recoleta = diag?.recoleta ?? null;
  // O destino vem de quem chamou: a regra de "tutorial na primeira vez" mora
  // na calibração, e reproduzi-la aqui criaria duas cópias dela.
  const destino = (location.state as { destino?: string } | null)?.destino ?? '/menu';
  const lado = Math.max(LADO_DO_BOTAO, alvoMinimoPx() - 2 * ZONA_DE_ACERTO_PX);
  const tom = tomDa(resultado.palavra);
  const Icone = resultado.palavra === 'otima' || resultado.palavra === 'boa' ? CheckCircle2 : RefreshCw;

  const refazerPontos = () =>
    aoRefazerPontos
      ? aoRefazerPontos()
      : navigate('/calibration-check', { state: { recoletar: true, destino } });

  const fraseDaRecoleta = recoleta
    ? recoleta.aceito
      ? t('calib.resultado.recoleta.aceita')
      : recoleta.motivo === 'sem_amostras'
        ? t('calib.resultado.recoleta.semAmostras')
        : t('calib.resultado.recoleta.recusada')
    : null;
  const px = (v: number) => (Number.isFinite(v) ? String(Math.round(v)) : '—');

  const tremorPx = mediana((q ?? []).map((a) => a.dispersaoPx));
  const tremorDeg = mediana((q ?? []).map((a) => a.dispersaoDeg));
  const qualidadeDo = (p: { x: number; y: number }) =>
    q?.find((a) => Math.abs(a.x - p.x) < 1e-6 && Math.abs(a.y - p.y) < 1e-6) ?? null;

  const textoMiudo: React.CSSProperties = { fontSize: '0.9rem', opacity: 0.75, color: 'var(--color-text-base)' };

  return (
    <main
      role="main"
      aria-labelledby="resultado-calib-title"
      style={{
        minHeight: '100vh',
        background: 'var(--settings-bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1.5rem',
      }}
    >
      <div
        className="glass-card"
        style={{
          width: '100%',
          maxWidth: 640,
          background: 'var(--color-card-bg)',
          border: '1px solid var(--color-card-border)',
          borderRadius: '1.5rem',
          padding: '2rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.4rem',
        }}
      >
        <h1
          id="resultado-calib-title"
          style={{
            margin: 0,
            fontSize: '1.2rem',
            fontWeight: 700,
            opacity: 0.7,
            color: 'var(--color-text-base)',
          }}
        >
          {tecnico ? t('calib.resultado.title') : t('calib.resultado.tituloPaciente')}
        </h1>

        <div
          data-testid="palavra-do-resultado"
          data-palavra={resultado.palavra}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.7rem',
            padding: '1.4rem',
            borderRadius: '1.15rem',
            background: tom.bg,
            border: `1px solid ${tom.borda}`,
          }}
        >
          <strong
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.7rem',
              fontSize: '2rem',
              fontWeight: 800,
              lineHeight: 1.15,
              color: 'var(--color-text-base)',
            }}
          >
            <Icone size={30} color={tom.cor} aria-hidden="true" />
            {t(`calib.resultado.palavra.${resultado.titulo}`)}
          </strong>
          <span style={{ fontSize: '1.15rem', lineHeight: 1.55, color: 'var(--color-text-base)' }}>
            {t(`calib.resultado.frase.${resultado.frase}`)}
          </span>
          {fraseDaRecoleta && (
            <span
              data-testid="frase-da-recoleta"
              style={{ fontSize: '1rem', lineHeight: 1.5, color: 'var(--color-text-base)', opacity: 0.9 }}
            >
              {fraseDaRecoleta}
            </span>
          )}
        </div>

        {/* O motivo e os números, para quem escolheu ver os números. O motivo
            vem ANTES dos números: "você se mexeu entre os alvos" é acionável;
            "LOO 87 px" não é. */}
        {tecnico && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {leitura.motivo && (
              <span style={{ fontSize: '0.98rem', lineHeight: 1.55, fontWeight: 600, color: 'var(--color-text-base)' }}>
                {t(`calib.resultado.motivo.${leitura.motivo}`)}
              </span>
            )}
            {/* Os números contam até o valor: são o resultado de uma medida
                que acabou de acontecer. A frase inteira sai de um nó só. */}
            {leitura.looErrorPx !== null && (
              <NumeroAnimado
                valor={leitura.looErrorPx}
                formatar={(n) =>
                  t(leitura.semOsCantos ? 'calib.resultado.erroSemCantos' : 'calib.resultado.erro', { px: Math.round(n) })
                }
                style={textoMiudo}
              />
            )}
            {leitura.semOsCantos && diag && Number.isFinite(diag.looErrorPx) && (
              <span style={textoMiudo}>{t('calib.resultado.loto', { px: Math.round(diag.looErrorPx) })}</span>
            )}
            {leitura.derivaGraus !== null && (
              <NumeroAnimado
                valor={leitura.derivaGraus}
                casas={1}
                formatar={(n) => t('calib.resultado.deriva', { g: n.toFixed(1).replace('.', ',') })}
                style={textoMiudo}
              />
            )}
            {tremorPx !== null && tremorDeg !== null && (
              <span style={textoMiudo}>
                {t('calib.resultado.precisao', {
                  px: Math.round(tremorPx),
                  g: tremorDeg.toFixed(2).replace('.', ','),
                })}
              </span>
            )}
            {pontos.map((p) => {
              const a = qualidadeDo(p);
              return (
                <span key={`${p.x},${p.y}`} data-testid="ponto-ruim" style={textoMiudo}>
                  {t('calib.resultado.pontoRuim', {
                    lugar: t(`calib.resultado.lugar.${lugarDoPonto(p)}`),
                    erro: a ? px(a.erroLotoPx) : '—',
                    tremor: a ? px(a.dispersaoPx) : '—',
                    n: a ? a.amostras : '—',
                  })}
                </span>
              );
            })}
            {recoleta && (
              <span data-testid="recoleta-tecnica" style={textoMiudo}>
                {t('calib.resultado.recoleta.tecnica', {
                  n: recoleta.alvos.length,
                  antes: px(recoleta.looAntesPx),
                  depois: px(recoleta.looDepoisPx),
                  decisao: t(
                    recoleta.aceito
                      ? 'calib.resultado.recoleta.decisaoAceita'
                      : 'calib.resultado.recoleta.decisaoRecusada'
                  ),
                })}
              </span>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', alignItems: 'center' }}>
          {/* Sempre há como seguir, em TODOS os vereditos. Folga de 28 px
              entre os ladrilhos: as zonas de acerto (12 px cada) não se tocam. */}
          <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <GazeButton
              type="button"
              recovery
              variante="primaria"
              data-dwell-ms="2000"
              data-testid="resultado-seguir"
              width={lado}
              height={lado}
              onClick={() => (aoSeguir ? aoSeguir() : navigate(destino, { replace: true }))}
              style={{ flexDirection: 'column', gap: '0.5rem', fontSize: '1.1rem', fontWeight: 800, textAlign: 'center' }}
            >
              <ArrowRight size={28} aria-hidden="true" /> {t('calib.resultado.seguir')}
            </GazeButton>

            {pontos.length > 0 && (
              <GazeButton
                type="button"
                recovery
                data-dwell-ms="2500"
                data-testid="refazer-pontos"
                width={lado}
                height={lado}
                onClick={refazerPontos}
                style={{ flexDirection: 'column', gap: '0.5rem', fontSize: '1.05rem', fontWeight: 700, textAlign: 'center' }}
              >
                <Crosshair size={28} aria-hidden="true" />{' '}
                {t(resultado.soCantos ? 'calib.resultado.refazerCantosBtn' : 'calib.resultado.refazerPontosBtn')}
              </GazeButton>
            )}

            {/* Dwell longo: refazer por acidente custa 1–2 min de sessão. */}
            <GazeButton
              type="button"
              recovery
              data-dwell-ms="2500"
              data-testid="resultado-refazer"
              width={lado}
              height={lado}
              onClick={() => navigate('/calibration-check')}
              style={{ flexDirection: 'column', gap: '0.5rem', fontSize: '1.05rem', fontWeight: 700, textAlign: 'center' }}
            >
              <RefreshCw size={26} aria-hidden="true" /> {t('calib.resultado.refazerBtn')}
            </GazeButton>
          </div>

          <span
            style={{
              fontSize: '0.95rem',
              textAlign: 'center',
              opacity: 0.7,
              color: 'var(--color-text-base)',
            }}
          >
            {t('calib.resultado.semObrigacao')}
          </span>
        </div>
      </div>
    </main>
  );
};
