import React from 'react';
import { numeroBr } from '../../services/evolucao/formatar';
import type { FolhaDaConsulta, MediaDoDiario } from '../../services/consulta/folha';
import './folha-consulta.css';

/**
 * A folha da consulta no papel (21/10/2026): uma página A4 em pé, só leitura.
 * Tudo o que ela diz vem de `montarFolha` (testado à parte, com os tetos que a
 * mantêm em uma página); aqui só se desenha. Não tem botão nem campo: é a
 * mesma folha na prévia da tela, na impressora e no PDF.
 *
 * Preto sobre branco, e a CÓPIA em papel não segue o tema da tela — o cinza e o
 * branco do papel são do papel. O que é importante vai em negrito, não em cor:
 * numa impressora sem cor a folha lê igual.
 */

const media = (m: MediaDoDiario): string => (m.dias === 0 ? 'sem registro' : `média ${m.media} em 5 (${m.dias} ${m.dias === 1 ? 'dia' : 'dias'})`);

const dias = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;

export const VistaDaFolha: React.FC<{ folha: FolhaDaConsulta }> = ({ folha }) => {
  const { dor } = folha;
  const semDor = dor.relatos === 0;
  return (
    <article className={`consulta-folha consulta-folha--${folha.periodo}`} data-testid="folha-da-consulta">
      <header className="consulta-folha__topo">
        <div>
          <h2 className="consulta-folha__titulo">{folha.titulo}</h2>
          <p className="consulta-folha__paciente">{folha.paciente}</p>
        </div>
        <p className="consulta-folha__periodo">
          <strong>Últimos {folha.periodo} dias</strong>
          <span>{folha.intervalo}</span>
        </p>
      </header>

      <section className="consulta-folha__resumo" aria-label="Resumo do período">
        <div>
          <h3>Dor</h3>
          <p>
            {semDor
              ? 'Nenhum relato de dor no período.'
              : `${dor.relatos} ${dor.relatos === 1 ? 'relato' : 'relatos'} em ${dias(dor.diasComDor)}; maior nível ${dor.nivelMaximo} de 10; média ${numeroBr(dor.nivelMedio)}.`}
            {!semDor && dor.lugares.length > 0 && ` Mais citados: ${dor.lugares.map((l) => `${l.lugar} (${l.relatos})`).join(', ')}.`}
          </p>
        </div>
        <div>
          <h3>Sono</h3>
          <p>{media(folha.sono)}</p>
        </div>
        <div>
          <h3>Humor</h3>
          <p>{media(folha.humor)}</p>
        </div>
      </section>

      <section>
        <h3 className="consulta-folha__secao">Dia a dia</h3>
        <table className="consulta-folha__dias" aria-label="Dia a dia">
          <thead>
            <tr>
              <th scope="col">Dia</th>
              <th scope="col">Dor</th>
              <th scope="col">Sono</th>
              <th scope="col">Humor</th>
              <th scope="col">Nota</th>
            </tr>
          </thead>
          <tbody>
            {folha.dias.map((d) => (
              <tr key={d.dia}>
                <th scope="row">{d.rotulo}</th>
                <td className={d.nivelDeDor !== null && d.nivelDeDor >= 7 ? 'consulta-folha__forte' : undefined}>{d.dor}</td>
                <td>{d.sono}</td>
                <td>{d.humor}</td>
                <td>{d.nota || '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="consulta-folha__secao">Evolução por semana</h3>
        {folha.semanas.length === 0 ? (
          <p className="consulta-folha__vazio">Ainda sem medições nem uso registrados.</p>
        ) : (
          <table className="consulta-folha__semanas" aria-label="Evolução por semana">
            <thead>
              <tr>
                <th scope="col">Semana</th>
                <th scope="col">Erro da calibração</th>
                <th scope="col">Minutos úteis</th>
                <th scope="col">Caract./min</th>
                <th scope="col">Avisos de fadiga</th>
                <th scope="col">Desfazer</th>
              </tr>
            </thead>
            <tbody>
              {folha.semanas.map((s) => (
                <tr key={s.periodo}>
                  <th scope="row">
                    {s.periodo}
                    {s.situacao && <span className="consulta-folha__situacao"> ({s.situacao})</span>}
                  </th>
                  <td>{s.erro}</td>
                  <td>{s.minutos}</td>
                  <td>{s.cpm}</td>
                  <td>{s.fadiga}</td>
                  <td>{s.desfazer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-label="Perguntas para o médico">
        <h3 className="consulta-folha__secao">Perguntas para o médico</h3>
        {folha.perguntas.paciente.length === 0 && folha.perguntas.cuidador.length === 0 ? (
          <p className="consulta-folha__vazio">Nenhuma pergunta pendente.</p>
        ) : (
          <div className="consulta-folha__perguntas">
            <div>
              <h4>Do paciente</h4>
              {folha.perguntas.paciente.length === 0 ? (
                <p className="consulta-folha__vazio">–</p>
              ) : (
                <ol aria-label="Perguntas do paciente">
                  {folha.perguntas.paciente.map((t, i) => <li key={i}>{t}</li>)}
                </ol>
              )}
            </div>
            <div>
              <h4>Do cuidador</h4>
              {folha.perguntas.cuidador.length === 0 ? (
                <p className="consulta-folha__vazio">–</p>
              ) : (
                <ol aria-label="Perguntas do cuidador">
                  {folha.perguntas.cuidador.map((t, i) => <li key={i}>{t}</li>)}
                </ol>
              )}
            </div>
          </div>
        )}
        {folha.perguntas.omitidas > 0 && (
          <p className="consulta-folha__corte">+{folha.perguntas.omitidas} {folha.perguntas.omitidas === 1 ? 'pergunta' : 'perguntas'} só no aparelho</p>
        )}
      </section>

      <footer className="consulta-folha__rodape" data-testid="rodape-da-folha">
        <p>{folha.aviso}</p>
        <p>
          Gerada em {folha.geradaEm}.
          {folha.notasResumidas && ' Notas resumidas para caber nesta página; o texto inteiro está no aparelho.'}
        </p>
      </footer>
    </article>
  );
};
