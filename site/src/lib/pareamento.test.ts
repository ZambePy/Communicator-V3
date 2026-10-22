import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  capturarCodigoDoEndereco,
  codigoCapturado,
  emNavegadorDeOutroApp,
  esquecerCodigo,
  FORMATO_DO_CODIGO,
  lerCodigo,
  linkDoAndroid,
  linkDoApp,
} from './pareamento'
// O formato e o sorteio do servidor: o que ele gera tem de passar aqui.
import { FORMATO_DO_CODIGO as FORMATO_DO_SERVIDOR, gerarCodigo } from '../../../supabase/functions/desktop-sync/codigoDoCelular'

/* /parear#t=<código>: o código abre a conta da família por 3 minutos. A
   página o tira da barra de endereço e só o passa ao app. */

const CODIGO = 'Qx7_-k2LmN0pRsTuVwXyZ1a2b3c4d5e6f7g8h9i0jAB'

function janela(caminho: string) {
  const url = new URL(caminho, 'https://irisflow.ia.br')
  const replaceState = vi.fn()
  return {
    location: { pathname: url.pathname, hash: url.hash, search: url.search } as Location,
    history: { state: { idx: 0 }, replaceState } as unknown as History,
    replaceState,
  }
}

afterEach(() => esquecerCodigo())

describe('código no endereço', () => {
  it('lê do fragmento (e, por garantia, da busca), só no formato certo', () => {
    expect(lerCodigo(`#t=${CODIGO}`, '')).toBe(CODIGO)
    expect(lerCodigo('', `?t=${CODIGO}`)).toBe(CODIGO)
    expect(lerCodigo('#t=curto', '')).toBeNull()
    expect(lerCodigo(`#t=${CODIGO};end`, '')).toBeNull()
    expect(lerCodigo('', '')).toBeNull()
  })

  it('na /parear: guarda na memória e tira da barra de endereço, sem recarregar', () => {
    const j = janela(`/parear#t=${CODIGO}`)
    capturarCodigoDoEndereco(j)
    expect(codigoCapturado()).toBe(CODIGO)
    expect(j.replaceState).toHaveBeenCalledWith({ idx: 0 }, '', '/parear')
  })

  it('código fora do formato também sai da barra, e não é guardado', () => {
    const j = janela('/parear#t=isto-nao-e-um-codigo')
    capturarCodigoDoEndereco(j)
    expect(codigoCapturado()).toBeNull()
    expect(j.replaceState).toHaveBeenCalledWith({ idx: 0 }, '', '/parear')
  })

  it('outra rota, ou a /parear sem código (volta do Android com #sem-app), não é tocada', () => {
    for (const caminho of [`/beta#t=${CODIGO}`, '/parear#sem-app', '/parear']) {
      const j = janela(caminho)
      capturarCodigoDoEndereco(j)
      expect(j.replaceState, caminho).not.toHaveBeenCalled()
    }
    expect(codigoCapturado()).toBeNull()
  })

  it('não grava nada no navegador', () => {
    const antes = { local: localStorage.length, sessao: sessionStorage.length, cookie: document.cookie }
    capturarCodigoDoEndereco(janela(`/parear#t=${CODIGO}`))
    expect({ local: localStorage.length, sessao: sessionStorage.length, cookie: document.cookie }).toEqual(antes)
  })
})

describe('links do app', () => {
  it('iPhone e outros: o scheme do app (app/app.json → "irisflow")', () => {
    expect(linkDoApp(CODIGO)).toBe(`irisflow://parear?t=${CODIGO}`)
  })

  it('Android: intent com o PACOTE do app (nenhum outro app pega o código) e volta para cá sem o app', () => {
    const l = linkDoAndroid(CODIGO, 'https://irisflow.ia.br/parear#sem-app')
    expect(l).toBe(
      `intent://parear?t=${CODIGO}#Intent;scheme=irisflow;package=br.com.irisflow.cuidador;` +
        'S.browser_fallback_url=https%3A%2F%2Firisflow.ia.br%2Fparear%23sem-app;end',
    )
    // A volta não leva o código.
    expect(decodeURIComponent(l.split('S.browser_fallback_url=')[1])).not.toContain(CODIGO)
  })

  it('nada fora do formato vira link (um ";" mudaria o sentido do intent)', () => {
    expect(() => linkDoApp('curto')).toThrow()
    expect(() => linkDoAndroid(`${CODIGO.slice(0, 39)};end`, 'x')).toThrow()
  })

  it('o formato daqui é o do servidor, e o código sorteado por ele passa', () => {
    expect(FORMATO_DO_CODIGO.source).toBe(FORMATO_DO_SERVIDOR.source)
    for (let i = 0; i < 20; i++) expect(lerCodigo(`#t=${gerarCodigo()}`, '')).not.toBeNull()
  })
})

describe('navegador por dentro de outro app', () => {
  it('reconhece Instagram, Facebook, Line e WebView; Chrome e Safari, não', () => {
    expect(emNavegadorDeOutroApp('Mozilla/5.0 (Linux; Android 14; wv) Instagram 300.0')).toBe(true)
    expect(emNavegadorDeOutroApp('Mozilla/5.0 [FBAN/FBIOS;FBAV/450.0]')).toBe(true)
    expect(emNavegadorDeOutroApp('Mozilla/5.0 (Linux; Android 13; SM-A546E Build/TP1A; wv) AppleWebKit/537.36')).toBe(true)
    expect(emNavegadorDeOutroApp('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36')).toBe(false)
    expect(emNavegadorDeOutroApp('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')).toBe(false)
  })
})
