import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import * as api from '@/services/api'
import { formatDate } from '@/utils/format'
import './linked-devices.css'

/* ============================================================
   Painel "Aplicativo e computadores" da página da Conta.

   Fecha o ciclo com o desktop e o app do cuidador:
   - `desktop_license()` diz se o aplicativo está liberado para esta conta
     — exatamente a função que o desktop consulta no login, então o que
     aparece aqui é o que o paciente vê lá.
   - `devices` lista os computadores que entraram com esta conta
     (pareados por `pair_device()` no desktop). Desvincular chama
     `revoke_device()`; a chave do computador deixa de valer na hora.
   ============================================================ */

const MOTIVO: Record<string, string> = {
  beta: 'Liberado durante o programa beta, com todos os recursos.',
  beta_encerrada: 'O programa beta terminou. Fale com a equipe para continuar usando o aplicativo.',
  avaliacao: 'Liberado durante a avaliação.',
  avaliacao_encerrada: 'A avaliação terminou. Cadastre uma forma de pagamento para liberar o aplicativo.',
  ativa: 'Liberado.',
  inadimplente: 'Pagamento pendente: o aplicativo continua liberado por alguns dias.',
  cancelada: 'Assinatura cancelada: o aplicativo continua liberado até o fim do período pago.',
  sem_assinatura: 'Sem assinatura ativa.',
}

const OS_LABEL = { windows: 'Windows', macos: 'macOS', linux: 'Linux' } as const

function vistoHa(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 2) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 48) return `há ${h} h`
  return formatDate(iso)
}

export function LinkedDevices() {
  const [license, setLicense] = useState<api.AppLicense | null>(null)
  const [devices, setDevices] = useState<api.LinkedDevice[] | null>(null)
  const [falha, setFalha] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setFalha(null)
    try {
      const [l, d] = await Promise.all([api.fetchAppLicense(), api.fetchDevices()])
      setLicense(l)
      setDevices(d)
    } catch (e) {
      // A migração 20260908 ainda não foi aplicada, ou a rede caiu: o painel
      // explica em vez de sumir.
      setFalha(e instanceof Error ? e.message : 'Não foi possível carregar.')
      setDevices([])
    }
  }, [])

  useEffect(() => {
    void carregar()
    const id = window.setInterval(carregar, 60_000)
    return () => window.clearInterval(id)
  }, [carregar])

  const desvincular = async (d: api.LinkedDevice) => {
    if (!window.confirm(`Desvincular "${d.name}"? O aplicativo nesse computador voltará a pedir e-mail e senha.`)) return
    setOcupado(d.id)
    try {
      await api.revokeDevice(d.id)
      await carregar()
    } catch (e) {
      setFalha(e instanceof Error ? e.message : 'Não foi possível desvincular.')
    } finally {
      setOcupado(null)
    }
  }

  const ativos = (devices ?? []).filter((d) => !d.revokedAt)
  const antigos = (devices ?? []).filter((d) => d.revokedAt)

  return (
    <div className="panel devices">
      <div className="devices__head">
        <div>
          <h2 className="devices__title">Aplicativo e computadores</h2>
          <p className="devices__lead">
            O mesmo e-mail e senha desta conta abrem o aplicativo no computador e o app do cuidador
            no celular. O que o paciente escreve com os olhos chega ao celular; o que a família
            responde é falado na tela.
          </p>
        </div>
        {license && (
          <span className={`tag ${license.allowed ? 'tag--ok' : 'tag--wip'}`}>
            {license.allowed ? 'Aplicativo liberado' : 'Aplicativo bloqueado'}
          </span>
        )}
      </div>

      {license && (
        <p className="devices__license">
          {MOTIVO[license.reason] ?? 'Situação não reconhecida.'}
          {license.access_until && license.allowed && (
            <> Confirmado até <strong>{formatDate(license.access_until)}</strong>.</>
          )}
          {!license.features.multiplos_dispositivos && (
            <> No plano {license.plan_name ?? 'Essencial'}, um computador por vez: entrar em outro desvincula o anterior.</>
          )}
        </p>
      )}

      {falha && (
        <p className="field__error" role="alert">
          {falha}
        </p>
      )}

      {devices === null ? (
        <p className="devices__empty">Carregando…</p>
      ) : ativos.length === 0 ? (
        <p className="devices__empty">
          Nenhum computador vinculado ainda. Instale o aplicativo, abra-o e entre com o e-mail e a
          senha desta conta — o vínculo é automático.
        </p>
      ) : (
        <ul className="devices__list">
          {ativos.map((d) => (
            <li key={d.id} className="devices__item">
              <span className={`devices__dot ${d.online ? 'devices__dot--on' : ''}`} aria-hidden="true" />
              <div className="devices__info">
                <strong>{d.name}</strong>
                <span>
                  {OS_LABEL[d.os] ?? d.os}
                  {d.appVersion ? ` · IrisFlow ${d.appVersion}` : ''}
                  {' · '}
                  {d.online ? 'online agora' : `visto ${vistoHa(d.lastSeenAt)}`}
                  {' · '}
                  {d.calibrated ? 'calibrado' : 'sem calibração'}
                </span>
              </div>
              <Button
                variant="ghost"
                loading={ocupado === d.id}
                onClick={() => desvincular(d)}
              >
                Desvincular
              </Button>
            </li>
          ))}
        </ul>
      )}

      {antigos.length > 0 && (
        <p className="devices__old">
          Desvinculados: {antigos.map((d) => `${d.name} (${formatDate(d.revokedAt!)})`).join(', ')}.
        </p>
      )}
    </div>
  )
}
