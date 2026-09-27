import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { FormularioPesquisa } from './FormularioPesquisa'
import type { RespostasPesquisa } from '@/services/api'

/* A pesquisa da beta (etapa 3) e a edição das respostas no /perfil. */

const LANCAMENTO = '2099-11-10T03:00:00Z'

function montar(props: Partial<Parameters<typeof FormularioPesquisa>[0]> = {}) {
  const onEnviar = vi.fn(async (_r: RespostasPesquisa) => {})
  render(
    <FormularioPesquisa
      nomeDoResponsavel="Ana Paula Souza"
      lancamento={LANCAMENTO}
      textoDoBotao="Concluir inscrição"
      onEnviar={onEnviar}
      {...props}
    />,
  )
  return onEnviar
}

function responderOObrigatorio(apelido: string) {
  fireEvent.click(screen.getByLabelText('Meu pai ou minha mãe'))
  fireEvent.change(screen.getByLabelText('Como essa pessoa gosta de ser chamada?'), { target: { value: apelido } })
  fireEvent.change(screen.getByLabelText('Condição principal'), { target: { value: 'ela' } })
  fireEvent.click(screen.getByLabelText('Windows'))
  fireEvent.click(screen.getByLabelText('Agora não'))
}

describe('apelido de quem vai usar (SITE-1)', () => {
  it('aceita apelido de 2 letras ("Vó"), o mesmo mínimo do banco', async () => {
    const onEnviar = montar()
    responderOObrigatorio('Vó')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Concluir inscrição' }))
    })
    expect(onEnviar).toHaveBeenCalledWith(expect.objectContaining({ userName: 'Vó', relation: 'pai-mae' }))
  })

  it('1 letra é recusada no próprio campo, com o motivo', async () => {
    const onEnviar = montar()
    responderOObrigatorio('V')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Concluir inscrição' }))
    })
    expect(onEnviar).not.toHaveBeenCalled()
    expect(screen.getByText(/Use ao menos 2 letras/)).toBeInTheDocument()
  })
})

describe('editar as respostas (SITE-17)', () => {
  it('esvaziar telefone e "como conheceu" que tinham resposta pede para apagar', async () => {
    const onEnviar = montar({
      textoDoBotao: 'Salvar respostas',
      inicial: {
        relation: 'pai-mae',
        userName: 'Vó',
        condition: 'ela',
        os: 'windows',
        wantsCaregiverApp: false,
        feedbackConsent: true,
        howFound: 'Instagram',
        phone: '11987654321',
      },
    })
    fireEvent.change(screen.getByLabelText(/Telefone/), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText(/Como conheceu/), { target: { value: '' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Salvar respostas' }))
    })
    expect(onEnviar).toHaveBeenCalledWith(
      expect.objectContaining({ apagarTelefone: true, apagarComoConheceu: true, phone: '', howFound: '' }),
    )
  })

  it('na primeira vez, campo vazio não apaga nada', async () => {
    const onEnviar = montar()
    responderOObrigatorio('Zé')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Concluir inscrição' }))
    })
    expect(onEnviar).toHaveBeenCalledWith(expect.objectContaining({ apagarTelefone: false, apagarComoConheceu: false }))
  })
})
