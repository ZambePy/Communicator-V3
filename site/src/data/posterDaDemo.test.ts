import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEMO_COMMUNICATOR } from './home'

/* Auditoria P2-13 (21/10/2026): o pôster da gravação do Communicator era o quadro
   do teclado em que o botão "Emergência" cai por cima de "Voltar ao tutorial" (um
   defeito do próprio app, que não se corrige no site). A decisão do coordenador
   foi trocar o quadro, sem mexer no app nem regravar: o pôster passou a ser o menu
   (10,5 s da gravação), em que a Emergência aparece sozinha. Este teste impede a
   volta do quadro antigo. Os defeitos que seguem na gravação (0–9 s) estão no
   relatório, não aqui. */

const AQUI = dirname(fileURLToPath(import.meta.url))
const PUBLICO = resolve(AQUI, '../../public')

/** SHA-256 do pôster que mostrava a Emergência sobre "Voltar ao tutorial". */
const QUADRO_COM_O_DEFEITO = '0781fb371377193b8364c765f878c71284c40785215eb6718987d24755172d78'

function arquivo(caminho: string): Buffer {
  return readFileSync(resolve(PUBLICO, caminho.replace(/^\//, '')))
}

/** Largura e altura de um JPEG, lidas do primeiro marcador de quadro (SOF). */
function tamanhoDoJpeg(b: Buffer): { largura: number; altura: number } {
  let i = 2
  while (i < b.length) {
    if (b[i] !== 0xff) throw new Error('JPEG inválido')
    const marcador = b[i + 1]
    const comprimento = b.readUInt16BE(i + 2)
    if (marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)) {
      return { altura: b.readUInt16BE(i + 5), largura: b.readUInt16BE(i + 7) }
    }
    i += 2 + comprimento
  }
  throw new Error('JPEG sem marcador de quadro')
}

describe('pôster da gravação do Communicator', () => {
  it('não é o quadro do teclado com a Emergência sobre "Voltar ao tutorial"', () => {
    const hash = createHash('sha256').update(arquivo(DEMO_COMMUNICATOR.poster)).digest('hex')
    expect(hash).not.toBe(QUADRO_COM_O_DEFEITO)
  })

  it('continua em 1600 × 900, a proporção do monitor da home', () => {
    expect(tamanhoDoJpeg(arquivo(DEMO_COMMUNICATOR.poster))).toEqual({ largura: 1600, altura: 900 })
  })

  it('segue leve: abaixo de 90 KB, porque só carrega quando o vídeo entra na tela', () => {
    expect(arquivo(DEMO_COMMUNICATOR.poster).length).toBeLessThan(90 * 1024)
  })
})
