import { proximaPosicao } from './frases';

describe('proximaPosicao', () => {
  it('fica depois da última, mesmo com buracos deixados por remoções', () => {
    expect(proximaPosicao([])).toBe(0);
    expect(proximaPosicao([{ position: 0 }, { position: 2 }])).toBe(3);
    expect(proximaPosicao([{ position: 5 }])).toBe(6);
    expect(proximaPosicao([{ position: null }])).toBe(0);
  });
});
