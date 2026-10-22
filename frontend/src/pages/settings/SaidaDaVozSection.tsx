import React, { useEffect, useState } from 'react';
import { Cable, Check, Play, TriangleAlert, Volume2 } from 'lucide-react';
import { GazeButton } from '../../components/ui/GazeButton';
import { useSettings } from '../../context/SettingsContext';
import { alvoMinimoPx } from '../../design/gazeMetrics';
import { ponteDaVoz, tocarWav, usarSaidaDaVoz } from '../../services/voz/local';
import { ponteDaVozGuardada } from '../../services/voz/vozGuardada/armazem';
import {
  EVENTO_DA_SAIDA_DA_VOZ,
  ROTULO_DA_SAIDA_PADRAO,
  ehRotuloGenerico,
  listarSaidas,
  saidaDaVozPerdida,
  sinalDeTeste,
  type DetalheDaSaidaDaVoz,
  type SaidaDeAudio,
} from '../../services/voz/saida';

/** A zona de acerto invisível do `GazeButton` soma 12 px de cada lado ao botão desenhado. */
const ZONA_DE_ACERTO_PX = 12;
/** Mesmo numa tela mais densa que a de referência, nenhuma opção fica menor que isto. */
const ALTURA_MINIMA_PX = 88;

type Teste =
  | { fase: 'parado' }
  | { fase: 'tocando' }
  | { fase: 'ok' | 'aviso' | 'falhou'; texto: string };

/**
 * Configurações → "Voz nas chamadas" (roadmap 3, de 19/10/2026; rodada 3, de
 * 21/10/2026).
 *
 * Numa chamada de WhatsApp ou Meet, a voz do paciente vai para um cabo de áudio
 * virtual (VB-CABLE): o IrisFlow toca em "CABLE Input" e o aplicativo da
 * chamada usa "CABLE Output" como microfone. Esta seção deixa escolher a saída
 * da voz, testa, e diz com todas as letras o que NÃO segue a escolha — a voz do
 * sistema (`speechSynthesis`) não tem roteamento no Chromium.
 *
 * A escolha vale SÓ PARA A SESSÃO (revisão final, rodada 2, B1, 21/10/2026): ao abrir o
 * IrisFlow a voz volta ao alto-falante, e a tela diz isso. Quem escolhia o cabo e esquecia de
 * voltar abria o app no dia seguinte com a voz saindo pelo cabo — ninguém na sala a ouvia.
 *
 * Funciona só com o olhar: as opções e o "Testar" são `GazeButton` do tamanho
 * mínimo de 5° (e botões comuns para mouse e teclado). Se o aparelho escolhido
 * some (cabo desinstalado), a voz continua saindo — pelo alto-falante — e a
 * seção diz isso, em vez de a fala quebrar.
 *
 * Só aparece no aplicativo instalado (Electron): a voz clonada e as mensagens
 * guardadas, as únicas que seguem a escolha, vêm de lá. No navegador a fala
 * sai pela voz do sistema, que não tem roteamento — oferecer a escolha ali
 * seria oferecer um botão que não muda nada.
 */
export const SaidaDaVozSection: React.FC<{ cardStyle?: React.CSSProperties }> = ({ cardStyle }) => {
  const { settings, updateSettings } = useSettings();
  const escolhida = settings.saidaDaVoz;
  const noDesktop = ponteDaVoz() !== null || ponteDaVozGuardada() !== null;
  // `null`: ainda lendo a lista do sistema.
  const [saidas, setSaidas] = useState<SaidaDeAudio[] | null>(null);
  const [perdida, setPerdida] = useState<boolean>(() => saidaDaVozPerdida());
  const [teste, setTeste] = useState<Teste>({ fase: 'parado' });

  // A lista do sistema, e de novo toda vez que um aparelho entra ou sai: quem
  // espeta o cabo com esta tela aberta o vê aparecer.
  useEffect(() => {
    if (!noDesktop) return;
    let vivo = true;
    const ler = () => {
      void listarSaidas().then((lista) => {
        if (vivo) setSaidas(lista);
      });
    };
    ler();
    const md = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
    md?.addEventListener?.('devicechange', ler);
    return () => {
      vivo = false;
      md?.removeEventListener?.('devicechange', ler);
    };
  }, [noDesktop]);

  // O serviço avisa quando a saída escolhida deixa de abrir e quando volta.
  useEffect(() => {
    const ouvir = (e: Event) => setPerdida((e as CustomEvent<DetalheDaSaidaDaVoz>).detail?.perdida === true);
    window.addEventListener(EVENTO_DA_SAIDA_DA_VOZ, ouvir);
    setPerdida(saidaDaVozPerdida());
    return () => window.removeEventListener(EVENTO_DA_SAIDA_DA_VOZ, ouvir);
  }, []);

  const rotuloDe = (id: string) => saidas?.find((s) => s.id === id)?.rotulo;
  // Só se diz que o aparelho sumiu com uma lista que existe: lista vazia é
  // "não sei" (sem permissão de mídia, ou a API falhou), não "sumiu".
  const ausenteDaLista = escolhida !== null && !!saidas && saidas.length > 0 && !saidas.some((s) => s.id === escolhida);
  const foraDoAr = escolhida !== null && (perdida || ausenteDaLista);

  // Mesmo cálculo do resto do app: o botão desenhado + a zona de acerto chegam ao alvo de 5°.
  const altura = Math.max(ALTURA_MINIMA_PX, alvoMinimoPx() - 2 * ZONA_DE_ACERTO_PX);

  const escolher = (id: string | null) => {
    updateSettings({ saidaDaVoz: id });
    // Aplicar já, sem esperar o efeito do app: escolher outra vez o aparelho
    // que não abriu é "tentar de novo".
    usarSaidaDaVoz(id);
    setTeste({ fase: 'parado' });
  };

  const testar = async () => {
    setTeste({ fase: 'tocando' });
    try {
      // Pelo mesmo `tocarWav` da voz clonada e da voz guardada: testa o caminho
      // de verdade, e não depende de a voz personalizada estar instalada.
      const tocou = await tocarWav(sinalDeTeste());
      if (saidaDaVozPerdida()) {
        setTeste({ fase: 'aviso', texto: 'A saída escolhida não abriu: o sinal saiu pelo alto-falante padrão.' });
      } else if (!tocou) {
        setTeste({ fase: 'aviso', texto: 'O teste foi interrompido antes de tocar.' });
      } else {
        const nome = escolhida === null ? null : (rotuloDe(escolhida) ?? 'a saída escolhida');
        const onde = nome === null ? 'na saída padrão do computador' : `em “${nome}”`;
        // Pelo cabo o som não sai no alto-falante; sem esta frase, quem testa
        // acha que o teste não funcionou.
        const cabo = nome !== null && /cable/i.test(nome)
          ? ' Pelo cabo o som não sai no alto-falante: confira o microfone “CABLE Output” no aplicativo da chamada.'
          : '';
        setTeste({ fase: 'ok', texto: `Toquei um sinal curto ${onde}.${cabo}` });
      }
    } catch {
      setTeste({ fase: 'falhou', texto: 'Não consegui tocar o sinal de teste neste computador. Tente de novo em instantes.' });
    }
  };

  const opcoes: Array<{ id: string | null; rotulo: string }> = [
    { id: null, rotulo: ROTULO_DA_SAIDA_PADRAO },
    ...(saidas ?? []),
  ];

  if (!noDesktop) return null;

  return (
    <section aria-labelledby="saida-da-voz-title" style={cardStyle} data-testid="saida-da-voz">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <Cable size={28} color="var(--color-primary)" aria-hidden="true" />
        <h2 id="saida-da-voz-title" className="t-h2" style={{ color: 'var(--color-text-base)', margin: 0 }}>
          Voz nas chamadas
        </h2>
      </div>

      <ol style={{ margin: '0 0 1.25rem 0', paddingLeft: '1.4rem', color: 'var(--color-text-base)', lineHeight: 1.6, fontSize: '1.05rem' }}>
        <li>Instale o VB-CABLE, um cabo de áudio virtual. Ele cria a saída “CABLE Input” e o microfone “CABLE Output”.</li>
        <li>Escolha “CABLE Input” abaixo e toque em Testar: a voz sai pelo cabo, e não pelo alto-falante.</li>
        <li>No aplicativo da chamada (WhatsApp, Meet), escolha “CABLE Output” como microfone.</li>
      </ol>

      <div
        role="radiogroup"
        aria-label="Por onde a voz sai"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--gaze-grid-gap, 24px)' }}
      >
        {opcoes.map(({ id, rotulo }) => {
          const marcada = escolhida === id;
          const Icone = id !== null && /cable/i.test(rotulo) ? Cable : Volume2;
          return (
            <GazeButton
              key={id ?? 'padrao'}
              type="button"
              role="radio"
              aria-checked={marcada}
              data-testid={id === null ? 'saida-padrao' : `saida-${id}`}
              variante={marcada ? 'primaria' : 'secundaria'}
              height={altura}
              onClick={() => escolher(id)}
              style={{ flex: '1 1 300px', justifyContent: 'flex-start', textAlign: 'left', padding: '1rem 1.25rem', borderRadius: '1.25rem' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Icone size={26} aria-hidden="true" />
                <span style={{ fontSize: '1.1rem', fontWeight: 800, lineHeight: 1.3 }}>{rotulo}</span>
                {marcada && <Check size={22} aria-hidden="true" />}
              </span>
            </GazeButton>
          );
        })}
      </div>

      {/* B1 (revisão final, rodada 2, 21/10/2026): a escolha é da sessão. Dita antes de a pessoa
          escolher, em uma linha, para quem usa o cabo saber que não precisa lembrar de desfazer. */}
      <p data-testid="saida-so-na-sessao" style={{ margin: '1rem 0 0', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
        Ao fechar o IrisFlow, a voz volta ao alto-falante.
      </p>

      {saidas?.some((s) => ehRotuloGenerico(s.rotulo)) && (
        <p data-testid="saida-sem-nomes" style={{ margin: '1rem 0 0', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          O computador não informou o nome de alguns aparelhos (aparecem como “Saída 2”, “Saída 3”). Escolha um e
          toque em Testar para descobrir qual é: pelo cabo, o som não sai no alto-falante.
        </p>
      )}

      {escolhida !== null && !foraDoAr && (
        <p
          role="status"
          data-testid="saida-so-no-cabo"
          style={{
            margin: '1rem 0 0',
            padding: '0.85rem 1.1rem',
            borderRadius: '1rem',
            background: 'var(--tint-info-bg)',
            border: '1px solid var(--tint-info-border)',
            color: 'var(--tint-info-text)',
            lineHeight: 1.5,
          }}
        >
          Agora a voz sai só {rotuloDe(escolhida) ? `por “${rotuloDe(escolhida)}”` : 'pela saída escolhida'}, e não pelo
          alto-falante do computador. Depois da chamada, volte para “{ROTULO_DA_SAIDA_PADRAO}”.
        </p>
      )}

      {saidas !== null && saidas.length === 0 && (
        <p style={{ margin: '1rem 0 0', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          Não encontrei nenhuma outra saída de áudio neste computador. Se você acabou de instalar o VB-CABLE,
          reinicie o computador e abra esta tela de novo.
        </p>
      )}

      {foraDoAr && (
        <div
          role="status"
          data-testid="saida-perdida"
          style={{
            marginTop: '1rem',
            padding: '1rem 1.25rem',
            borderRadius: '1rem',
            background: 'var(--tint-warn-bg)',
            border: '1px solid var(--tint-warn-border)',
            color: 'var(--tint-warn-text)',
            lineHeight: 1.5,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <strong style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TriangleAlert size={20} aria-hidden="true" /> A saída escolhida não está disponível agora.
          </strong>
          <span>
            A voz está saindo pelo alto-falante padrão (o cabo de áudio pode ter sido desligado ou desinstalado).
            Se ele voltar, a voz volta a sair por ele. Para usar a saída padrão sem esperar, toque no botão abaixo.
          </span>
          <div>
            <GazeButton
              type="button"
              height={altura}
              onClick={() => escolher(null)}
              style={{ padding: '0.75rem 1.5rem', borderRadius: '1.25rem' }}
            >
              <span style={{ fontSize: '1.1rem', fontWeight: 800 }}>Usar a saída padrão</span>
            </GazeButton>
          </div>
        </div>
      )}

      <p data-testid="saida-limite" style={{ margin: '1rem 0 0', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
        Só a voz personalizada e as mensagens de “Minha voz” seguem a saída escolhida. A voz do sistema (a voz de
        reserva do computador), o alarme da emergência e as mensagens lidas do cuidador saem sempre pelo alto-falante.
      </p>

      <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-start' }}>
        <GazeButton
          type="button"
          variante="primaria"
          height={altura}
          disabled={teste.fase === 'tocando'}
          onClick={() => void testar()}
          style={{ padding: '0.75rem 2rem', borderRadius: '1.25rem' }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1.2rem', fontWeight: 800 }}>
            <Play size={24} aria-hidden="true" /> {teste.fase === 'tocando' ? 'Tocando…' : 'Testar'}
          </span>
        </GazeButton>
        {(teste.fase === 'ok' || teste.fase === 'aviso' || teste.fase === 'falhou') && (
          <p
            role={teste.fase === 'falhou' ? 'alert' : 'status'}
            data-testid="saida-teste-resultado"
            style={{
              margin: 0,
              lineHeight: 1.5,
              fontWeight: 600,
              color: teste.fase === 'ok' ? 'var(--tint-ok-text)' : 'var(--tint-warn-text)',
            }}
          >
            {teste.texto}
          </p>
        )}
      </div>
    </section>
  );
};
