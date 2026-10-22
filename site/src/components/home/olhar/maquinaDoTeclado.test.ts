import { describe, expect, it } from 'vitest'
import {
  GRUPOS,
  INICIO,
  celulas,
  itensDeSugestao,
  selecionar,
  sugerir,
  teclaQueMostra,
  teclasAtivas,
  type EstadoDoTeclado,
  type IdDaTecla,
} from './maquinaDoTeclado'

/* O teclado da abertura é o do app em miniatura (KeyboardScreen.tsx): grade
   3 × 2, grupo e depois letra, sugestões na sexta tecla, e a frase sugerida
   não fala sozinha. */

function acionar(estado: EstadoDoTeclado, ...teclas: IdDaTecla[]) {
  return teclas.reduce((e, t) => selecionar(e, t).estado, estado)
}

describe('o teclado em dois passos', () => {
  it('nível 1: quatro grupos de letras, Y Z com as ações e as sugestões', () => {
    const grade = celulas(INICIO)
    expect(grade).toHaveLength(6)
    expect(grade.slice(0, 4).map((c) => c.tipo)).toEqual(['grupo', 'grupo', 'grupo', 'grupo'])
    expect(grade[4].tipo).toBe('acoes')
    expect(grade[5]).toEqual({ tipo: 'previa', palavras: ['EU', 'SIM', 'NÃO'], frases: 3 })
    // O mesmo arranjo do app, letra por letra.
    expect(GRUPOS.slice(0, 4).flat().join('')).toBe('ABCDEFGHIJKLMNOPQRSTUVWX')
  })

  it('o grupo se abre nas suas letras, e a letra entra no fim do texto', () => {
    const { estado: aberto, efeito } = selecionar(INICIO, 'c0')
    expect(efeito).toBe('abriu')
    expect(celulas(aberto).map((c) => (c.tipo === 'letra' ? c.letra : c.tipo))).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
    const { estado: escrito, efeito: e2 } = selecionar(aberto, 'c4')
    expect(e2).toBe('escreveu')
    expect(escrito).toEqual({ nivel: { tipo: 'grupos' }, texto: 'E' })
  })

  it('sugestões: frases primeiro, depois palavras, no máximo seis', () => {
    expect(itensDeSugestao('E')).toEqual([
      { texto: 'Estou com sede.', frase: true },
      { texto: 'Estou bem.', frase: true },
      { texto: 'Estou com frio.', frase: true },
      { texto: 'EU', frase: false },
      { texto: 'ESTOU', frase: false },
      { texto: 'ESTÁ', frase: false },
    ])
    // Sem acento e sem caixa na comparação: "esta" acha "ESTÁ".
    expect(sugerir('esta').palavras).toContain('ESTÁ')
  })

  it('a frase sugerida substitui o texto e NÃO fala: quem fala é a tecla Falar', () => {
    const comE = acionar(INICIO, 'c0', 'c4')
    const sugestoes = selecionar(comE, 'c5').estado
    expect(sugestoes.nivel).toEqual({ tipo: 'sugestoes' })
    const { estado, efeito } = selecionar(sugestoes, teclaQueMostra(sugestoes, 'Estou com sede.')!)
    expect(efeito).toBe('escreveu')
    expect(estado.texto).toBe('Estou com sede. ')
    expect(selecionar(estado, 'falar').efeito).toBe('falou')
  })

  it('a palavra sugerida troca a palavra começada', () => {
    const comES = { nivel: { tipo: 'sugestoes' } as const, texto: 'ES' }
    const tecla = teclaQueMostra(comES, 'ESTOU')!
    expect(selecionar(comES, tecla).estado.texto).toBe('ESTOU ')
  })

  it('Apagar fica no grupo; Limpar e Espaço voltam ao nível 1', () => {
    const noGrupo = { nivel: { tipo: 'grupo', grupo: 4 } as const, texto: 'OI' }
    expect(selecionar(noGrupo, teclaQueMostra(noGrupo, 'Apagar')!).estado).toEqual({ ...noGrupo, texto: 'O' })
    expect(selecionar(noGrupo, teclaQueMostra(noGrupo, 'Limpar')!).estado).toEqual(INICIO)
    expect(selecionar(noGrupo, teclaQueMostra(noGrupo, 'Espaço')!).estado.texto).toBe('OI ')
  })

  it('Voltar só existe no nível 2 e Falar só com texto: tecla sem função não aciona', () => {
    expect(teclasAtivas(INICIO)).not.toContain('voltar')
    expect(teclasAtivas(INICIO)).not.toContain('falar')
    expect(selecionar(INICIO, 'falar')).toEqual({ estado: INICIO, efeito: 'nada' })
    const aberto = acionar(INICIO, 'c2')
    expect(teclasAtivas(aberto)).toContain('voltar')
    expect(selecionar(aberto, 'voltar').estado.nivel).toEqual({ tipo: 'grupos' })
    // Nas sugestões, as teclas vazias não são alvo.
    const poucas = acionar({ nivel: { tipo: 'grupos' }, texto: 'O' }, 'c5')
    expect(celulas(poucas).filter((c) => c.tipo === 'vazia').length).toBeGreaterThan(0)
    expect(teclasAtivas(poucas)).not.toContain('c5')
  })

  it('o texto da miniatura tem teto', () => {
    let e: EstadoDoTeclado = INICIO
    for (let i = 0; i < 80; i++) e = acionar(e, 'c0', 'c0')
    expect(e.texto.length).toBeLessThanOrEqual(48)
  })
})
