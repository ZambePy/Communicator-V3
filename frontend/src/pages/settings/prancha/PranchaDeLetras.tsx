import React from 'react';
import './prancha.css';
import { montarPrancha, type ItemDaPrancha } from './montarPrancha';

const Item: React.FC<{ item: ItemDaPrancha }> = ({ item }) => (
  <div className="prancha__item" data-tipo={item.tipo}>
    {item.tipo === 'letra' && <span className="prancha__letra">{item.texto}</span>}
    {item.tipo === 'acao' && (
      <>
        <span className="prancha__acao">{item.texto}</span>
        {item.dica && <span className="prancha__dica">{item.dica}</span>}
      </>
    )}
    {item.tipo === 'frase' && <span className="prancha__frase">{item.texto}</span>}
  </div>
);

/**
 * A folha A4 deitada da prancha de letras: o arranjo do teclado da tela,
 * NÃO/SIM no alto (dos mesmos lados da tela Sim · Não), frases prontas no
 * sexto quadro e o modo de usar no rodapé, para quem segura a folha.
 */
export const PranchaDeLetras: React.FC = () => {
  const quadros = montarPrancha();
  return (
    <div className="prancha" data-testid="prancha-de-letras">
      <div className="prancha__topo">
        <div className="prancha__resposta prancha__resposta--nao">
          <span className="prancha__sinal" aria-hidden="true">✕</span> NÃO
        </div>
        <div className="prancha__titulo">
          <h1>Prancha de letras</h1>
          <p>As letras estão no mesmo lugar do teclado da tela. Primeiro o quadro, depois a letra.</p>
        </div>
        <div className="prancha__resposta prancha__resposta--sim">
          <span className="prancha__sinal" aria-hidden="true">✓</span> SIM
        </div>
      </div>

      <div className="prancha__grade">
        {quadros.map((q) => (
          <div key={q.numero} className="prancha__quadro" data-quadro={q.numero}>
            <span className="prancha__numero">{q.numero}</span>
            <div className="prancha__itens">
              {q.itens.map((item) => <Item key={item.texto} item={item} />)}
            </div>
          </div>
        ))}
      </div>

      <div className="prancha__rodape">
        <p>
          <strong>Como usar:</strong> pergunte “qual quadro?” e aponte um de cada vez (ou siga o olhar). Depois aponte as
          letras do quadro, uma por vez. A pessoa confirma olhando para o SIM ou piscando. Anote cada letra.
        </p>
        <span className="prancha__marca">IrisFlow</span>
      </div>
    </div>
  );
};
