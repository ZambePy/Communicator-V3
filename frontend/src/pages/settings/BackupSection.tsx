import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ArchiveRestore, CircleCheck, Download } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { baixarTexto, lerArquivoDeBackup, nomeDoArquivoDeBackup } from '../../services/backup/arquivo';
import { ErroDeBackup } from '../../services/backup/erro';
import { conferirSoma, serializarBackup, validarBackup, type BackupV1 } from '../../services/backup/formato';
import { montarBackup, type OpcoesDoMontarBackup } from '../../services/backup/montarBackup';
import { restaurarBackup, type OpcoesDaRestauracao } from '../../services/backup/restaurarBackup';
import {
  descartarResumoDaRestauracao, lerResumoDaRestauracao, pacientesQueDeixamDeAparecer, resumoDoBackup,
  type PacienteDoBackup, type ResumoDaRestauracao, type ResumoDoBackup,
} from '../../services/backup/resumo';

/**
 * BACKUP E RESTAURAÇÃO (rodada 3, 21/10/2026) — na área do cuidador, com mouse e
 * teclado.
 *
 * Antes havia um botão que baixava só as configurações e nenhum jeito de
 * restaurar: quem trocava de computador (ou formatava o atual) perdia os
 * pacientes, as frases, o vocabulário que o assistente aprendeu, o histórico de
 * dor e as gravações da própria voz. Agora o backup leva tudo o que é da pessoa
 * (ver `services/backup/chaves.ts`) e a restauração:
 *
 *   - mostra o que vai entrar ANTES de trocar qualquer coisa;
 *   - pede o PIN do cuidador (a área dos Ajustes pode estar aberta há tempo);
 *   - guarda uma cópia do que havia antes (feito por `restaurarBackup`);
 *   - recarrega a página, e o recado do que foi feito aparece aqui.
 *
 * Todo erro aparece em palavras. Nada falha em silêncio.
 */

export interface DependenciasDaSecaoDeBackup {
  montar?: (opcoes?: OpcoesDoMontarBackup) => Promise<BackupV1>;
  restaurar?: (backup: BackupV1, opcoes: OpcoesDaRestauracao) => Promise<ResumoDaRestauracao>;
  baixar?: (nome: string, texto: string) => void;
  ler?: (arquivo: File) => Promise<unknown>;
  agora?: () => Date;
}

// -----------------------------------------------------------------------------
// Texto
// -----------------------------------------------------------------------------

const dataPorExtenso = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'data desconhecida' : d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
};

const gravacoes = (n: number): string => (n === 1 ? '1 gravação da voz' : `${n} gravações da voz`);

const mensagemDe = (e: unknown, padrao: string): string => (e instanceof ErroDeBackup ? e.message : padrao);

/** "Carla", "Carla e Dora", "Carla, Dora e Eva"; passando de `max`, nomeia os primeiros e conta o resto ("… e mais 4"). */
function listaDeNomes(nomes: string[], max = 8): string {
  if (nomes.length === 0) return '';
  if (nomes.length === 1) return nomes[0];
  if (nomes.length > max) return `${nomes.slice(0, max).join(', ')} e mais ${nomes.length - max}`;
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

const ITENS_IGNORADOS = (n: number): string =>
  n === 1
    ? '1 item deste arquivo não é restaurado pelo IrisFlow e será ignorado.'
    : `${n} itens deste arquivo não são restaurados pelo IrisFlow e serão ignorados.`;

/**
 * O que a confirmação do "Tudo" diz sobre os pacientes DESTE computador que deixam de aparecer. Quem escolhe o arquivo
 * errado só veria depois da recarga; aqui ainda dá para cancelar. Vazio quando ninguém some.
 */
function avisoDeQuemDeixaDeAparecer(somem: PacienteDoBackup[], arquivoTemPacientes: boolean): string[] {
  if (somem.length === 0) return [];
  const lista = listaDeNomes(somem.map((p) => p.nome));
  const unico = somem.length === 1;
  if (!arquivoTemPacientes) {
    return [
      `Este backup não tem nenhum paciente, e este computador tem ${somem.length}: ${lista}. Se você continuar, ${unico ? 'o paciente deixa' : 'os pacientes deixam'} de aparecer aqui. Os dados continuam na cópia de segurança. Confira se escolheu o arquivo certo.`,
    ];
  }
  return [`${unico ? 'Deixa' : 'Deixam'} de aparecer neste computador: ${lista}. Os dados continuam na cópia de segurança.`];
}

/** A lista de pacientes DESTE computador, como está guardada. Se o navegador não deixar ler, o aviso é só um reforço que falta. */
function lerPacientesDeAqui(): string | null {
  try {
    return localStorage.getItem('irisflow_profiles');
  } catch (e) {
    console.warn('[backup] não foi possível ler os pacientes deste computador para a confirmação:', e);
    return null;
  }
}

// -----------------------------------------------------------------------------
// Blocos visuais
// -----------------------------------------------------------------------------

type Tom = 'ok' | 'erro';

const COR_DO_TOM: Record<Tom, { fundo: string; borda: string; texto: string }> = {
  ok: { fundo: 'var(--tint-ok-bg)', borda: 'var(--tint-ok-border)', texto: 'var(--tint-ok-text)' },
  erro: { fundo: 'var(--tint-danger-bg)', borda: 'var(--tint-danger-border)', texto: 'var(--tint-danger-text)' },
};

const Aviso: React.FC<{ tom: Tom; role?: 'alert' | 'status'; testId?: string; children: React.ReactNode }> = ({ tom, role, testId, children }) => {
  const cor = COR_DO_TOM[tom];
  const Icone = tom === 'ok' ? CircleCheck : AlertTriangle;
  return (
    <div
      role={role}
      data-testid={testId}
      className="t-body"
      style={{
        display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '0.9rem 1rem',
        borderRadius: 'var(--radius-md)', background: cor.fundo, border: `1px solid ${cor.borda}`, color: cor.texto,
      }}
    >
      <Icone size={22} aria-hidden="true" style={{ flex: '0 0 auto', marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>{children}</div>
    </div>
  );
};

const Bloco: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', paddingTop: '1.25rem', borderTop: '1px solid var(--color-card-border)' }}>
    <h3 className="t-h3" style={{ margin: 0, color: 'var(--color-text-base)' }}>{titulo}</h3>
    {children}
  </div>
);

// -----------------------------------------------------------------------------
// A confirmação com o PIN
//
// Própria, como `DialogoDeConfirmacao` (o `confirm` nativo é invisível ao olhar e trava o
// rastreamento), mas com o campo do PIN. Desenhada no CORPO da página (`createPortal`): o
// cartão dos Ajustes tem `backdrop-filter`, que prende qualquer elemento `fixed` dentro dele.
// Só mouse e teclado (`data-no-dwell` em cada botão): uma fixação acidental não restaura nada.
// Abaixo do botão de Emergência (99990), como as outras confirmações.
// -----------------------------------------------------------------------------

const PIN_MAX = 8;

const ConfirmacaoComPin: React.FC<{
  titulo: string;
  descricao: string;
  /** Avisos que fazem parte da descrição (quem lê só ela, num leitor de tela, também os ouve). */
  avisos?: string[];
  ocupado: boolean;
  erro: string | null;
  aoConfirmar: (pin: string) => void;
  aoCancelar: () => void;
}> = ({ titulo, descricao, avisos = [], ocupado, erro, aoConfirmar, aoCancelar }) => {
  const [pin, setPin] = useState('');
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => { campo.current?.focus(); }, []);

  useEffect(() => {
    if (ocupado) return; // no meio da restauração não se abandona
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        aoCancelar();
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [ocupado, aoCancelar]);

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === '' || ocupado) return;
    aoConfirmar(pin);
    setPin('');
  };

  return createPortal(
    <div
      data-no-dwell="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 99985, background: 'rgba(15,23,42,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
      }}
    >
      <form
        onSubmit={enviar}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="backup-confirmacao-titulo"
        aria-describedby="backup-confirmacao-descricao"
        data-no-dwell="true"
        style={{
          width: 560, maxWidth: '100%', maxHeight: '100%', overflowY: 'auto',
          background: 'var(--color-card-bg, #ffffff)', color: 'var(--color-text-base, #1e293b)',
          borderRadius: '1.5rem', border: '2px solid var(--color-card-border, #e2e8f0)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.35)', padding: '1.75rem', fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
          <AlertTriangle size={32} color="#F0A030" aria-hidden="true" style={{ flex: '0 0 auto', marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <h2 id="backup-confirmacao-titulo" style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800 }}>{titulo}</h2>
            <div id="backup-confirmacao-descricao">
              <p style={{ margin: '0.75rem 0 0', fontSize: '1rem', lineHeight: 1.6 }}>{descricao}</p>
              {avisos.map((aviso) => (
                <p key={aviso} style={{ margin: '0.75rem 0 0', fontSize: '1rem', lineHeight: 1.6, fontWeight: 700 }}>{aviso}</p>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: '1.25rem' }}>
          <label htmlFor="backup-pin" className="campo__rotulo">PIN do cuidador</label>
          <input
            id="backup-pin"
            ref={campo}
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={PIN_MAX}
            className="campo"
            value={pin}
            disabled={ocupado}
            onChange={(e) => setPin(e.target.value.slice(0, PIN_MAX))}
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? 'backup-pin-erro' : undefined}
            style={{ fontSize: '1.4rem', letterSpacing: '0.4rem' }}
          />
          {erro && (
            <p id="backup-pin-erro" role="alert" style={{ margin: '0.5rem 0 0', fontWeight: 700, color: 'var(--tint-danger-text, #991b1b)' }}>
              {erro}
            </p>
          )}
        </div>

        {ocupado && <p role="status" style={{ margin: '1rem 0 0', fontWeight: 700 }}>Restaurando… não feche o aplicativo.</p>}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem', flexWrap: 'wrap' }}>
          <button type="button" data-no-dwell="true" className="btn btn--secondary" disabled={ocupado} onClick={aoCancelar}>
            Cancelar
          </button>
          <button type="submit" data-no-dwell="true" className="btn btn--danger" disabled={ocupado || pin === ''}>
            {ocupado ? 'Restaurando…' : 'Restaurar agora'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
};

// -----------------------------------------------------------------------------
// O recado do que a última restauração fez (guardado na sessão, atravessa a recarga)
// -----------------------------------------------------------------------------

const RecadoDaRestauracao: React.FC<{ resumo: ResumoDaRestauracao; aoDispensar: () => void }> = ({ resumo, aoDispensar }) => {
  const data = dataPorExtenso(resumo.backupCriadoEm);
  const titulo = resumo.modo === 'paciente' && resumo.paciente ? `Dados de ${resumo.paciente.nome} restaurados` : 'Backup restaurado';
  const oQueMudou = resumo.modo === 'paciente' && resumo.paciente
    ? `Os dados de ${resumo.paciente.nome} agora são os do backup de ${data}. O resto deste computador não mudou.`
    : `Este computador agora tem os dados do backup de ${data}.`;
  return (
    <Aviso tom="ok" role="status" testId="recado-da-restauracao">
      <strong>{titulo}</strong>
      <span>{oQueMudou}</span>
      {resumo.voz && (
        <span>
          {gravacoes(resumo.voz.gravacoes)} {resumo.voz.gravacoes === 1 ? 'voltou' : 'voltaram'}.
          {resumo.voz.ignoradas > 0 && ` ${resumo.voz.ignoradas} não puderam voltar (áudio ausente ou estragado).`}
        </span>
      )}
      {resumo.voz && !!resumo.voz.copiadas && resumo.voz.copiadas > 0 && (
        <span data-testid="recado-das-copias-da-voz">
          {resumo.voz.copiadas} {resumo.voz.copiadas === 1 ? 'era' : 'eram'} a mesma gravação de uma que já estava aqui, mas com outro áudio.{' '}
          {resumo.voz.copiadas === 1
            ? 'Nada foi trocado: a de antes ficou e esta entrou como gravação a mais.'
            : 'Nenhuma foi trocada: as de antes ficaram e estas entraram como gravações a mais.'}{' '}
          Ouça e apague a que não quiser.
        </span>
      )}
      <span>
        {resumo.copia.onde === 'pasta-do-app'
          ? `O que havia antes ficou guardado na cópia de segurança ${resumo.copia.nome}, na pasta ${resumo.copia.pasta}.`
          : `O que havia antes foi baixado pelo navegador no arquivo ${resumo.copia.nome}.`}
      </span>
      {resumo.pacienteDesmarcado && <span><strong>Escolha o paciente de novo para continuar.</strong></span>}
      <div>
        <button type="button" className="btn btn--secondary" onClick={aoDispensar}>Entendi</button>
      </div>
    </Aviso>
  );
};

// -----------------------------------------------------------------------------

interface ArquivoLido {
  nome: string;
  backup: BackupV1;
  resumo: ResumoDoBackup;
}

export const BackupSection: React.FC<{ cardStyle?: React.CSSProperties; deps?: DependenciasDaSecaoDeBackup }> = ({ cardStyle, deps }) => {
  const { loginCaregiver } = useAuth();
  const montar = deps?.montar ?? ((opcoes?: OpcoesDoMontarBackup) => montarBackup(opcoes));
  const restaurar = deps?.restaurar ?? ((b: BackupV1, opcoes: OpcoesDaRestauracao) => restaurarBackup(b, opcoes));
  const baixar = deps?.baixar ?? baixarTexto;
  const ler = deps?.ler ?? lerArquivoDeBackup;
  const agora = deps?.agora ?? (() => new Date());

  // Salvar
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'erro'; texto: string; oferecerSemVoz?: boolean } | null>(null);

  // Restaurar
  const [arquivoLido, setArquivoLido] = useState<ArquivoLido | null>(null);
  const [erroDoArquivo, setErroDoArquivo] = useState<string | null>(null);
  const [escopo, setEscopo] = useState<'tudo' | 'paciente'>('tudo');
  const [pacienteEscolhido, setPacienteEscolhido] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  /** Os pacientes daqui que o "Tudo" faz sumir, lidos quando a confirmação abre. */
  const [deixamDeAparecer, setDeixamDeAparecer] = useState<PacienteDoBackup[]>([]);
  const [erroDoPin, setErroDoPin] = useState<string | null>(null);
  const [restaurando, setRestaurando] = useState(false);
  const [erroDaRestauracao, setErroDaRestauracao] = useState<string | null>(null);
  const [terminou, setTerminou] = useState(false);

  // O recado da restauração anterior. Fica até a pessoa dispensar: depois da recarga ela pode ter caído
  // na escolha do paciente, e só chegar aqui mais tarde.
  const [recado, setRecado] = useState<ResumoDaRestauracao | null>(() => lerResumoDaRestauracao());

  // Fechada a confirmação, o foco volta ao botão que a abriu: sem isto ele cai no topo da página e quem
  // usa só o teclado tem de percorrer os Ajustes inteiros de novo.
  const botaoRestaurar = useRef<HTMLButtonElement>(null);
  const confirmacaoFoiAberta = useRef(false);
  useEffect(() => {
    if (confirmando) {
      confirmacaoFoiAberta.current = true;
    } else if (confirmacaoFoiAberta.current) {
      confirmacaoFoiAberta.current = false;
      botaoRestaurar.current?.focus();
    }
  }, [confirmando]);

  const salvar = async (comVoz: boolean) => {
    setSalvando(true);
    setAviso(null);
    try {
      const backup = await montar({ comVoz });
      const nome = nomeDoArquivoDeBackup(agora());
      baixar(nome, serializarBackup(backup).texto);
      const naVoz = resumoDoBackup(backup).gravacoesDaVoz;
      const sobreAVoz = !comVoz
        ? ', sem as gravações da voz, que continuam guardadas neste computador'
        : naVoz > 0 ? `, com ${gravacoes(naVoz)}` : '';
      // Não dá para saber se a pessoa concluiu o "Salvar como": a frase não diz que foi salvo, diz o que fazer com o arquivo.
      setAviso({ tom: 'ok', texto: `Backup gerado: ${nome}${sobreAVoz}. Guarde o arquivo em um lugar seguro, fora deste computador.` });
    } catch (e) {
      console.warn('[backup] não foi possível gerar o backup:', e);
      setAviso({
        tom: 'erro',
        texto: mensagemDe(e, 'Não foi possível salvar o backup agora. Tente de novo.'),
        oferecerSemVoz: e instanceof ErroDeBackup && e.codigo === 'grande-demais' && comVoz,
      });
    } finally {
      setSalvando(false);
    }
  };

  const aoEscolherArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const entrada = e.currentTarget;
    const arquivo = entrada.files?.[0];
    entrada.value = ''; // permite escolher o mesmo arquivo de novo
    if (!arquivo) return;
    setErroDoArquivo(null);
    setArquivoLido(null);
    setErroDaRestauracao(null);
    setTerminou(false);
    try {
      const validado = validarBackup(await ler(arquivo));
      if (!validado.ok) {
        setErroDoArquivo(validado.motivo);
        return;
      }
      // Estragado ou alterado, o arquivo é recusado já aqui: descobrir só depois de digitar o PIN seria tarde.
      const conferido = await conferirSoma(validado.backup);
      if (!conferido.ok) {
        setErroDoArquivo(conferido.motivo);
        return;
      }
      const resumo = resumoDoBackup(validado.backup);
      setEscopo('tudo');
      setPacienteEscolhido(resumo.pacientes[0]?.id ?? '');
      setArquivoLido({ nome: arquivo.name, backup: validado.backup, resumo });
    } catch (erro) {
      console.warn('[backup] não foi possível ler o arquivo escolhido:', erro);
      setErroDoArquivo(mensagemDe(erro, 'Não foi possível ler o arquivo escolhido.'));
    }
  };

  const descartar = () => {
    setArquivoLido(null);
    setConfirmando(false);
    setErroDaRestauracao(null);
  };

  const abrirAConfirmacao = () => {
    setErroDoPin(null);
    // A lista de AGORA, não a de quando o arquivo foi escolhido. Só o "Tudo" faz alguém sumir.
    setDeixamDeAparecer(arquivoLido && escopo === 'tudo' ? pacientesQueDeixamDeAparecer(lerPacientesDeAqui(), arquivoLido.backup) : []);
    setConfirmando(true);
  };

  const confirmarComPin = async (pin: string) => {
    if (!arquivoLido) return;
    if (!loginCaregiver(pin)) {
      setErroDoPin('PIN incorreto. Tente de novo.');
      return;
    }
    setErroDoPin(null);
    setErroDaRestauracao(null);
    setRestaurando(true);
    try {
      await restaurar(arquivoLido.backup, escopo === 'paciente' ? { perfil: pacienteEscolhido } : {});
      // A página recarrega sozinha. Se chegou aqui sem recarregar, a pessoa precisa saber o que fazer.
      setTerminou(true);
    } catch (e) {
      console.warn('[backup] a restauração falhou:', e);
      setErroDaRestauracao(mensagemDe(e, 'Não foi possível restaurar o backup. Se algum dado mudou, a cópia de segurança feita antes continua guardada.'));
    } finally {
      setRestaurando(false);
      setConfirmando(false);
    }
  };

  const resumo = arquivoLido?.resumo ?? null;
  const temPacientes = (resumo?.pacientes.length ?? 0) > 0;
  const nomeEscolhido = resumo?.pacientes.find((p) => p.id === pacienteEscolhido)?.nome ?? '';
  const dataDoBackup = arquivoLido ? dataPorExtenso(arquivoLido.backup.criadoEm) : '';
  const descricaoDaConfirmacao = escopo === 'paciente'
    ? `Os dados de ${nomeEscolhido} serão trocados pelos do backup de ${dataDoBackup}. O resto deste computador não muda. Uma cópia do que há agora fica guardada antes. Digite o PIN do cuidador para continuar.`
    : `Os dados deste computador serão trocados pelos do backup de ${dataDoBackup}. Uma cópia do que há agora fica guardada antes. Digite o PIN do cuidador para continuar.`;

  return (
    <section aria-labelledby="backup-title" style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '1.25rem' }} data-testid="secao-backup">
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <ArchiveRestore size={28} color="var(--color-primary)" aria-hidden="true" />
          <h2 id="backup-title" className="t-h2" style={{ color: 'var(--color-text-base)', margin: 0 }}>
            Backup e restauração
          </h2>
        </div>
        <p className="t-body" style={{ color: 'var(--color-text-muted)', margin: 0, maxWidth: '68ch' }}>
          O backup leva para outro computador, ou guarda por segurança, o que é da pessoa: pacientes, ajustes, frases, vocabulário
          aprendido, histórico e, no aplicativo instalado, as gravações da voz. A licença, a calibração e as configurações de câmera
          e tela não vão: cada computador tem as suas.
        </p>
      </div>

      {recado && (
        <RecadoDaRestauracao
          resumo={recado}
          aoDispensar={() => {
            descartarResumoDaRestauracao();
            setRecado(null);
          }}
        />
      )}

      <Bloco titulo="Salvar um backup">
        <p className="t-body" style={{ color: 'var(--color-text-muted)', margin: 0, maxWidth: '68ch' }}>
          Gera um arquivo para você guardar fora deste computador, em um pen drive, por exemplo. Ele tem dados de saúde e a voz da
          pessoa: guarde em lugar seguro.
        </p>
        <div>
          <button type="button" className="btn btn--secondary" disabled={salvando} onClick={() => void salvar(true)}>
            <Download size={20} aria-hidden="true" /> {salvando ? 'Salvando…' : 'Salvar backup'}
          </button>
        </div>
        {aviso && (
          <Aviso tom={aviso.tom} role={aviso.tom === 'erro' ? 'alert' : 'status'}>
            <span>{aviso.texto}</span>
            {aviso.oferecerSemVoz && (
              <div>
                <button type="button" className="btn btn--secondary" disabled={salvando} onClick={() => void salvar(false)}>
                  Salvar sem as gravações da voz
                </button>
              </div>
            )}
          </Aviso>
        )}
      </Bloco>

      <Bloco titulo="Restaurar de um backup">
        <p className="t-body" style={{ color: 'var(--color-text-muted)', margin: 0, maxWidth: '68ch' }}>
          Escolha um arquivo de backup do IrisFlow. Antes de trocar qualquer coisa, o aplicativo mostra o que vai entrar e guarda uma
          cópia do que há neste computador agora.
        </p>
        <div>
          <label htmlFor="backup-arquivo" className="campo__rotulo">Arquivo de backup</label>
          <input id="backup-arquivo" type="file" accept=".json,application/json" className="campo" onChange={(e) => void aoEscolherArquivo(e)} />
        </div>

        {erroDoArquivo && <Aviso tom="erro" role="alert"><span>{erroDoArquivo}</span></Aviso>}
        {erroDaRestauracao && <Aviso tom="erro" role="alert"><span>{erroDaRestauracao}</span></Aviso>}
        {terminou && (
          <Aviso tom="ok" role="status">
            <span>Restauração concluída. A tela deve recarregar sozinha; se não recarregar, feche e abra o IrisFlow.</span>
          </Aviso>
        )}

        {arquivoLido && resumo && (
          <div
            data-testid="previa-do-backup"
            style={{
              display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.1rem 1.25rem',
              borderRadius: 'var(--radius-md)', border: '1px solid var(--color-card-border)', background: 'var(--field-bg)',
            }}
          >
            <div>
              <strong className="t-h3" style={{ color: 'var(--color-text-base)' }}>O que vai entrar</strong>
              <ul className="t-body" style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', color: 'var(--color-text-base)' }}>
                <li>Arquivo: {arquivoLido.nome}.</li>
                <li>Backup feito em {dataDoBackup}, pelo IrisFlow {resumo.app}.</li>
                <li>{temPacientes ? `Pacientes: ${resumo.pacientes.map((p) => p.nome).join(', ')}.` : 'Nenhum paciente.'}</li>
                {resumo.configuracoes && <li>Configurações do aplicativo.</li>}
                {resumo.vocabulario && <li>Vocabulário aprendido.</li>}
                {resumo.historico && <li>Histórico de uso e de dor.</li>}
                {resumo.gravacoesDaVoz > 0 && <li>Gravações da voz: {resumo.gravacoesDaVoz}.</li>}
              </ul>
              <p className="t-body" style={{ color: 'var(--color-text-muted)', margin: '0.75rem 0 0' }}>
                Não mudam: a licença, a calibração e as configurações de câmera e tela deste computador.
              </p>
              {resumo.itensIgnorados > 0 && (
                <p className="t-body" data-testid="itens-ignorados" style={{ color: 'var(--color-text-muted)', margin: '0.5rem 0 0' }}>
                  {ITENS_IGNORADOS(resumo.itensIgnorados)} Eles são próprios de cada computador ou de outra versão do aplicativo.
                </p>
              )}
            </div>

            <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <legend className="campo__rotulo">O que restaurar</legend>
              <label className="t-body" style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', color: 'var(--color-text-base)' }}>
                <input
                  type="radio"
                  name="backup-escopo"
                  checked={escopo === 'tudo'}
                  onChange={() => setEscopo('tudo')}
                  style={{ width: 22, height: 22, marginTop: 2, flex: '0 0 auto' }}
                />
                <span>
                  <strong>Tudo.</strong> Este computador passa a ter o que o backup tem. O que for da pessoa e existir só aqui é
                  substituído; a cópia de segurança guarda esses dados antes. As gravações da voz são acrescentadas às que já estão
                  aqui: nenhuma é apagada. Se a mesma gravação já existir aqui com um áudio diferente, as duas ficam.
                </span>
              </label>
              <label className="t-body" style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', color: 'var(--color-text-base)' }}>
                <input
                  type="radio"
                  name="backup-escopo"
                  checked={escopo === 'paciente'}
                  disabled={!temPacientes}
                  onChange={() => setEscopo('paciente')}
                  style={{ width: 22, height: 22, marginTop: 2, flex: '0 0 auto' }}
                />
                <span>
                  <strong>Só um paciente.</strong>{' '}
                  {temPacientes
                    ? 'Troca apenas os dados do paciente escolhido; o resto deste computador não muda.'
                    : 'Este backup não tem pacientes.'}
                </span>
              </label>
              <div>
                <label htmlFor="backup-paciente" className="campo__rotulo">Paciente</label>
                <select
                  id="backup-paciente"
                  className="campo"
                  disabled={escopo !== 'paciente'}
                  value={pacienteEscolhido}
                  onChange={(e) => setPacienteEscolhido(e.target.value)}
                >
                  {resumo.pacientes.map((p) => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
              </div>
            </fieldset>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                ref={botaoRestaurar}
                type="button"
                data-no-dwell="true"
                className="btn btn--danger"
                disabled={restaurando || (escopo === 'paciente' && pacienteEscolhido === '')}
                onClick={abrirAConfirmacao}
              >
                Restaurar…
              </button>
              <button type="button" className="btn btn--secondary" disabled={restaurando} onClick={descartar}>
                Descartar
              </button>
            </div>
          </div>
        )}
      </Bloco>

      {confirmando && arquivoLido && (
        <ConfirmacaoComPin
          titulo="Restaurar o backup?"
          descricao={descricaoDaConfirmacao}
          avisos={escopo === 'tudo' ? avisoDeQuemDeixaDeAparecer(deixamDeAparecer, temPacientes) : []}
          ocupado={restaurando}
          erro={erroDoPin}
          aoConfirmar={(pin) => void confirmarComPin(pin)}
          aoCancelar={() => setConfirmando(false)}
        />
      )}
    </section>
  );
};
