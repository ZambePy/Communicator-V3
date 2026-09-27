import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Eraser, Eye, EyeOff, ImageDown, Check, AlertTriangle, Palette, X } from 'lucide-react';
import { GazeButton } from '../../components/ui/GazeButton';
import { useGaze } from '../../context/GazeContext';
import { canvasParaAlbum, salvarNoAlbum } from '../entertainment/album';

/**
 * DESENHO COM O OLHAR.
 *
 * O canvas não é um alvo de dwell — desenhar é contínuo, não um clique. Então
 * a tela assina `useGaze().subscribe` e pinta na posição de cada amostra
 * enquanto o pincel estiver ligado. O liga/desliga é um `GazeButton` na barra
 * lateral: é o único jeito de o paciente parar de pintar, já que ele não pode
 * "levantar a mão".
 *
 * O desenho por mouse continua funcionando, para quem estiver testando o app
 * sem rastreamento.
 */

/**
 * Dwell do liga/desliga do pincel.
 *
 * 1,5 s, bem acima do dwell normal, porque este botão é a única forma de
 * PARAR. Se ele ligasse com o dwell curto dos outros alvos, o olhar de
 * passagem pela barra lateral ligaria o pincel e riscaria o desenho inteiro no
 * caminho de volta ao canvas.
 */
const DWELL_DO_PINCEL_MS = 1500;

const CORES = [
  { valor: '#1b54a8', nome: 'Azul' },
  { valor: '#dc2626', nome: 'Vermelho' },
  { valor: '#16a34a', nome: 'Verde' },
  { valor: '#eab308', nome: 'Amarelo' },
];

const ESPESSURAS = [
  { valor: 10, nome: 'Fina' },
  { valor: 20, nome: 'Média' },
  { valor: 34, nome: 'Grossa' },
];

/**
 * Salto máximo, em px, que ainda é tratado como o mesmo traço.
 *
 * O olhar salta: um sacádico atravessa a tela em ~40 ms, e ligar os dois
 * extremos com uma reta desenharia um risco que o paciente não pediu. Acima
 * deste limiar o traço é reiniciado — o pincel "pula" em vez de arrastar.
 */
const SALTO_MAXIMO_PX = 220;

export const DrawingGame: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { subscribe } = useGaze();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pincelLigado, setPincelLigado] = useState(false);
  const [cor, setCor] = useState(CORES[0].valor);
  const [espessuraIdx, setEspessuraIdx] = useState(1);
  /**
   * Painel de ferramentas (cor, traço e apagar) aberto sobre o canvas (FE-18).
   * Na barra lateral estreita, as quatro cores (140×100) e os botões de 88 px
   * ficavam abaixo do alvo mínimo; no painel, cada um ocupa uma célula grande.
   * Enquanto ele está aberto o pincel não pinta.
   */
  const [ferramentasAbertas, setFerramentasAbertas] = useState(false);

  // O callback do gaze roda a 30 Hz fora do ciclo de render: ler o state
  // direto dele congelaria os valores do primeiro render. Refs mantêm a
  // assinatura estável (uma só) e sempre com o valor atual.
  const pincelRef = useRef(pincelLigado);
  const corRef = useRef(cor);
  const espessuraRef = useRef(ESPESSURAS[espessuraIdx].valor);
  const ferramentasRef = useRef(ferramentasAbertas);
  pincelRef.current = pincelLigado;
  corRef.current = cor;
  espessuraRef.current = ESPESSURAS[espessuraIdx].valor;
  ferramentasRef.current = ferramentasAbertas;

  /** Último ponto pintado, em coordenadas do canvas. `null` = traço novo. */
  const ultimoPontoRef = useRef<{ x: number; y: number } | null>(null);

  // O canvas precisa de largura/altura em ATRIBUTOS (o buffer), não só em CSS:
  // sem isso ele nasce 300×150 e o desenho sai esticado.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ajustar = () => {
      const pai = canvas.parentElement;
      if (!pai) return;
      const l = pai.clientWidth;
      const a = pai.clientHeight;
      if (l > 0 && a > 0 && (canvas.width !== l || canvas.height !== a)) {
        // Redimensionar limpa o buffer; guardar e repor o conteúdo mantém o
        // desenho vivo quando a janela muda de tamanho.
        const ctx = canvas.getContext('2d');
        const anterior = ctx && canvas.width > 0 && canvas.height > 0 ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
        canvas.width = l;
        canvas.height = a;
        if (ctx && anterior) ctx.putImageData(anterior, 0, 0);
      }
    };
    ajustar();
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, []);

  /** Pinta de `ultimoPonto` até (x, y), em coordenadas do canvas. */
  const pintarAte = useCallback((x: number, y: number) => {
    const canvas = canvasRef.current;
    // `getContext` devolve null em ambiente de teste (jsdom sem canvas real).
    // Sair em silêncio é o certo: o resto da tela continua operável.
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const anterior = ultimoPontoRef.current;
    ctx.strokeStyle = corRef.current;
    ctx.lineWidth = espessuraRef.current;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (anterior && Math.hypot(x - anterior.x, y - anterior.y) <= SALTO_MAXIMO_PX) {
      ctx.moveTo(anterior.x, anterior.y);
      ctx.lineTo(x, y);
    } else {
      // Traço novo (ou salto grande): um ponto no lugar de uma reta atravessando.
      ctx.moveTo(x, y);
      ctx.lineTo(x + 0.01, y);
    }
    ctx.stroke();
    ultimoPontoRef.current = { x, y };
  }, []);

  // Assinatura do olhar. Uma só, criada no mount: as opções (cor, espessura,
  // pincel) entram pelos refs acima.
  useEffect(() => {
    const cancelar = subscribe((sample) => {
      if (!pincelRef.current) return;
      // Painel de ferramentas aberto por cima do canvas: escolher uma cor não
      // pode riscar o desenho que está embaixo. O traço recomeça ao fechar.
      if (ferramentasRef.current) {
        ultimoPontoRef.current = null;
        return;
      }
      // Sem rosto a posição é a última válida, não onde o paciente está
      // olhando — pintar aí deixaria um borrão no ponto em que ele piscou.
      if (!sample.hasFace) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = sample.x - rect.left;
      const y = sample.y - rect.top;

      // Olhar fora do canvas (na barra lateral, escolhendo uma cor) NÃO pinta,
      // e ainda quebra o traço: sem isso, voltar da barra para o desenho
      // deixaria um risco reto atravessando a tela.
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
        ultimoPontoRef.current = null;
        return;
      }
      // O buffer pode ter escala diferente do tamanho em CSS.
      const escalaX = rect.width > 0 ? canvas.width / rect.width : 1;
      const escalaY = rect.height > 0 ? canvas.height / rect.height : 1;
      pintarAte(x * escalaX, y * escalaY);
    });
    return cancelar;
  }, [subscribe, pintarAte]);

  const alternarPincel = useCallback(() => {
    setPincelLigado((ligado) => {
      // Ao desligar E ao ligar o traço recomeça: religar o pincel do outro
      // lado da tela não pode emendar com o que foi desenhado antes.
      ultimoPontoRef.current = null;
      return !ligado;
    });
  }, []);

  /** Resultado do último "Guardar no álbum", para o botão e o aviso. */
  const [guardado, setGuardado] = useState<'ok' | 'cheio' | 'indisponivel' | null>(null);

  const apagarTudo = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ultimoPontoRef.current = null;
    setGuardado(null);
  }, []);

  /**
   * Guardar no álbum — o mesmo álbum da câmera (`entertainment/album.ts`).
   *
   * Sem isto o desenho morria ao sair da tela: a pessoa passava minutos num
   * traço pelo olhar e não tinha como mostrar depois. Vai reduzido e sobre
   * fundo branco (JPEG não tem transparência), na mesma chave e forma das
   * fotos, com `filter: 'Desenho'` para a galeria rotular.
   */
  const guardarNoAlbum = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvasParaAlbum(canvas);
    if (!dataUrl) {
      setGuardado('indisponivel');
      return;
    }
    const r = salvarNoAlbum(dataUrl, 'Desenho');
    setGuardado(r.ok ? 'ok' : r.motivo);
  }, []);

  // ── Desenho por mouse (para testes sem rastreamento) ───────────────────────
  const arrastandoRef = useRef(false);
  const pontoDoMouse = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const escalaX = rect.width > 0 ? canvas.width / rect.width : 1;
    const escalaY = rect.height > 0 ? canvas.height / rect.height : 1;
    return { x: (e.clientX - rect.left) * escalaX, y: (e.clientY - rect.top) * escalaY };
  };

  const espessura = ESPESSURAS[espessuraIdx];

  return (
    <main
      role="main"
      aria-labelledby="drawing-title"
      style={{
        display: 'flex',
        width: '100vw',
        height: '100vh',
        boxSizing: 'border-box',
        background: 'var(--color-bg-base)',
        color: 'var(--color-text-base)',
        fontFamily: "'Inter', system-ui, sans-serif",
        overflow: 'hidden',
      }}
    >
      {/* Barra lateral: todos os controles ficam fora do canvas, para que olhar
          um controle nunca pinte por acidente. */}
      <aside
        aria-label="Ferramentas de desenho"
        style={{
          width: 320,
          flexShrink: 0,
          padding: '1.5rem 1.25rem',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.9rem',
          background: 'var(--color-card-bg)',
          borderRight: '2px solid var(--color-card-border)',
          overflowY: 'auto',
        }}
      >
        {/* Todos os controles com pelo menos 120 px de altura (o Voltar, com a
            zona ampliada até o alvo mínimo). Cor, traço e apagar ficam no
            painel de ferramentas, sobre o canvas (FE-18). */}
        <GazeButton
          onClick={() => navigate('/games')}
          width={280}
          height={96}
          isolado
          style={{
            borderRadius: '1.25rem',
            border: '2px solid var(--color-card-border)',
            background: 'var(--color-bg-base)',
          }}
          aria-label={t('lazer.voltarAria')}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1.25rem', fontWeight: 800 }}>
            <ArrowLeft size={28} /> Voltar
          </span>
        </GazeButton>

        <h1 id="drawing-title" style={{ fontSize: '1.35rem', fontWeight: 900, margin: '0.25rem 0 0 0' }}>
          Desenho com Olhar
        </h1>

        <GazeButton
          onClick={alternarPincel}
          data-dwell-ms={DWELL_DO_PINCEL_MS}
          width={280}
          height={130}
          aria-pressed={pincelLigado}
          aria-label={pincelLigado ? 'Desligar o pincel' : 'Ligar o pincel'}
          style={{
            borderRadius: '1.5rem',
            background: pincelLigado
              ? 'linear-gradient(135deg, #16a34a, #15803d)'
              : 'var(--color-bg-base)',
            color: pincelLigado ? '#ffffff' : 'var(--color-text-base)',
            border: pincelLigado ? '3px solid #14532d' : '3px solid var(--color-card-border)',
          }}
        >
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
            {pincelLigado ? <Eye size={34} /> : <EyeOff size={34} />}
            <span style={{ fontSize: '1.3rem', fontWeight: 900 }}>
              {pincelLigado ? 'Pincel ligado' : 'Pincel desligado'}
            </span>
            <span style={{ fontSize: '0.95rem', fontWeight: 600, opacity: 0.8 }}>
              Olhe {DWELL_DO_PINCEL_MS / 1000} s para trocar
            </span>
          </span>
        </GazeButton>

        <GazeButton
          onClick={() => setFerramentasAbertas((a) => !a)}
          width={280}
          height={130}
          aria-expanded={ferramentasAbertas}
          aria-label={ferramentasAbertas ? 'Fechar as ferramentas' : 'Cor e traço'}
          style={{
            borderRadius: '1.5rem',
            border: ferramentasAbertas ? '3px solid var(--color-primary)' : '3px solid var(--color-card-border)',
            background: 'var(--color-bg-base)',
          }}
        >
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.45rem' }}>
            {ferramentasAbertas ? (
              <X size={34} aria-hidden="true" />
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Palette size={32} aria-hidden="true" />
                <span
                  aria-hidden="true"
                  style={{
                    width: Math.max(14, espessura.valor),
                    height: Math.max(14, espessura.valor),
                    borderRadius: '50%',
                    background: cor,
                  }}
                />
              </span>
            )}
            <span style={{ fontSize: '1.25rem', fontWeight: 900 }}>
              {ferramentasAbertas ? 'Fechar' : 'Cor e traço'}
            </span>
            {!ferramentasAbertas && (
              <span style={{ fontSize: '0.95rem', fontWeight: 600, opacity: 0.8 }}>
                {CORES.find((c) => c.valor === cor)?.nome} · traço {espessura.nome.toLowerCase()}
              </span>
            )}
          </span>
        </GazeButton>

        <GazeButton
          onClick={guardarNoAlbum}
          width={280}
          height={130}
          aria-label="Guardar o desenho no álbum"
          style={{
            borderRadius: '1.5rem',
            border: '3px solid var(--color-primary)',
            background: guardado === 'ok' ? 'var(--tint-ok-bg)' : 'var(--color-bg-base)',
            color: guardado === 'ok' ? 'var(--tint-ok-text)' : 'var(--color-primary)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', fontSize: '1.2rem', fontWeight: 800 }}>
            {guardado === 'ok' ? <Check size={28} /> : <ImageDown size={28} />}
            {guardado === 'ok' ? 'Guardado no álbum' : 'Guardar no álbum'}
          </span>
        </GazeButton>

        {(guardado === 'cheio' || guardado === 'indisponivel') && (
          <div
            role="alert"
            data-no-dwell="true"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.6rem',
              padding: '0.85rem 1rem',
              borderRadius: '1rem',
              background: 'var(--tint-warn-bg)',
              border: '2px solid var(--tint-warn-border)',
              fontSize: '1rem',
              fontWeight: 700,
              lineHeight: 1.4,
            }}
          >
            <AlertTriangle size={22} aria-hidden="true" style={{ flexShrink: 0 }} />
            {guardado === 'cheio'
              ? 'Álbum cheio — apague fotos antigas na Galeria.'
              : 'Não foi possível guardar o desenho.'}
          </div>
        )}
      </aside>

      {/* Área de desenho */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Área de desenho"
          onMouseDown={(e) => {
            arrastandoRef.current = true;
            ultimoPontoRef.current = null;
            const p = pontoDoMouse(e);
            if (p) pintarAte(p.x, p.y);
          }}
          onMouseMove={(e) => {
            if (!arrastandoRef.current) return;
            const p = pontoDoMouse(e);
            if (p) pintarAte(p.x, p.y);
          }}
          onMouseUp={() => {
            arrastandoRef.current = false;
            ultimoPontoRef.current = null;
          }}
          onMouseLeave={() => {
            arrastandoRef.current = false;
            ultimoPontoRef.current = null;
          }}
          style={{ display: 'block', width: '100%', height: '100%', cursor: 'crosshair', touchAction: 'none' }}
        />

        {ferramentasAbertas && (
          <div
            role="dialog"
            aria-label="Ferramentas de desenho"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 5,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
              gap: 'clamp(16px, 2.4vh, 28px)',
              padding: 'clamp(1rem, 3vh, 2rem)',
              // A primeira linha começa abaixo da Emergência (fixa no canto de
              // cima): sem isto, "Verde" ficava sob o botão — e a zona dele,
              // que vai até as bordas da janela, pegava o olhar da cor.
              paddingTop: 'calc(var(--reserva-emergencia-y) + 0.5rem)',
              boxSizing: 'border-box',
              background: 'rgba(8, 15, 30, 0.92)',
            }}
          >
            {CORES.map((c) => (
              <GazeButton
                key={c.valor}
                onClick={() => {
                  setCor(c.valor);
                  setFerramentasAbertas(false);
                }}
                role="radio"
                aria-checked={cor === c.valor}
                aria-label={`Cor ${c.nome}`}
                noWarn
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '1.5rem',
                  background: c.valor,
                  border: cor === c.valor ? '6px solid #ffffff' : '3px solid rgba(255,255,255,0.55)',
                  color: '#ffffff',
                  fontSize: '1.6rem',
                  fontWeight: 900,
                  textShadow: '0 1px 4px rgba(0,0,0,0.45)',
                }}
              >
                {c.nome}
              </GazeButton>
            ))}

            <GazeButton
              onClick={() => setEspessuraIdx((i) => (i + 1) % ESPESSURAS.length)}
              noWarn
              aria-label={`Espessura ${espessura.nome}. Acione para trocar.`}
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '1.5rem',
                border: '3px solid var(--color-card-border)',
                background: 'var(--color-card-bg)',
                color: 'var(--color-text-base)',
              }}
            >
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.9rem' }}>
                <span
                  aria-hidden="true"
                  style={{ width: espessura.valor * 1.6, height: espessura.valor * 1.6, borderRadius: '50%', background: cor }}
                />
                <span style={{ fontSize: '1.4rem', fontWeight: 900 }}>Traço: {espessura.nome}</span>
                <span style={{ fontSize: '1rem', fontWeight: 600, opacity: 0.8 }}>olhe para trocar</span>
              </span>
            </GazeButton>

            <GazeButton
              onClick={() => {
                apagarTudo();
                setFerramentasAbertas(false);
              }}
              noWarn
              aria-label="Apagar todo o desenho"
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '1.5rem',
                border: '3px solid #fecaca',
                background: '#fee2e2',
                color: '#b91c1c',
              }}
            >
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.7rem', fontSize: '1.4rem', fontWeight: 900 }}>
                <Eraser size={40} /> Apagar tudo
              </span>
            </GazeButton>
          </div>
        )}

        {/* O aviso do pincel sai de cena com o painel aberto (aparecia através
            das células). */}
        {!ferramentasAbertas && (
        <div
          role="status"
          aria-live="polite"
          data-no-dwell="true"
          style={{
            position: 'absolute',
            bottom: '1.5rem',
            left: '50%',
            transform: 'translateX(-50%)',
            background: pincelLigado ? 'rgba(22,163,74,0.95)' : 'var(--color-card-bg)',
            color: pincelLigado ? '#ffffff' : 'var(--color-text-base)',
            border: '2px solid var(--color-card-border)',
            borderRadius: '1.25rem',
            padding: '0.85rem 1.75rem',
            fontSize: '1.1rem',
            fontWeight: 800,
            pointerEvents: 'none',
            boxShadow: '0 8px 22px var(--color-card-shadow)',
          }}
        >
          {pincelLigado
            ? 'Pintando onde você olhar — desligue o pincel para parar'
            : 'Ligue o pincel na barra ao lado para desenhar com o olhar'}
        </div>
        )}
      </div>
    </main>
  );
};
