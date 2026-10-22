import { textoLegivel } from './format';

describe('textoLegivel', () => {
  it('motivo todo em maiúsculas vira frase normal', () => {
    expect(textoLegivel('FALTA DE AR')).toBe('Falta de ar');
    expect(textoLegivel('  DOR NO PEITO ')).toBe('Dor no peito');
    expect(textoLegivel('ÁGUA')).toBe('Água');
  });
  it('não mexe em sigla curta nem em texto já escrito com minúsculas', () => {
    expect(textoLegivel('ELA')).toBe('ELA');
    expect(textoLegivel('Quero ver a TV')).toBe('Quero ver a TV');
    expect(textoLegivel('Bom dia!')).toBe('Bom dia!');
  });
});
