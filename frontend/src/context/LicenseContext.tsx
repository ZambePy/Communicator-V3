import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { cofre, CHAVES } from '../cloud/armazenamento';
import { cloudConfig } from '../cloud/config';
import {
  licenseService as servicoPadrao,
  getDeviceBinding,
  getDeviceId,
} from '../services/license';
import type {
  Account,
  ActiveLicense,
  DeviceBinding,
  LicenseService,
  LoginResult,
  Plan,
} from '../services/license';

/**
 * Estado da conta e da licença desta instalação.
 *
 * Separado do `AuthContext` de propósito: aqui vive o que é **remoto** (conta,
 * plano, vínculo da máquina); lá vive o que é **local** (perfil do paciente,
 * acesso do cuidador). Misturar os dois faria dados que nunca saem do PC
 * viajarem no mesmo objeto dos que vão ao servidor.
 */

/**
 * Onde a licença mora:
 *
 *   `irisflow_license` (localStorage)  conta, plano e datas — nada secreto. Os
 *                                      serviços de voz e do assistente leem o
 *                                      plano daqui, de forma síncrona.
 *   `irisflow.licenca` (cofre)         o `token`, que é a chave do computador
 *                                      (`pair_device()`) e autentica tudo o que
 *                                      o desktop manda à nuvem. No Electron, o
 *                                      cofre é o safeStorage do sistema.
 *
 * Versões anteriores gravavam o token junto, no localStorage; a primeira
 * leitura o passa para o cofre. Se o cofre recusar a gravação, o token fica
 * onde estava — perder a licença por isso seria pior.
 */
export const LICENSE_KEY = 'irisflow_license';

/**
 * Quanto tempo uma licença em cache vale sem conseguir falar com o servidor.
 *
 * Sete dias (o padrão) é uma escolha de produto, não técnica: quem usa este
 * app tem ELA e muitas vezes está sozinho. Perder a comunicação porque o
 * Wi-Fi caiu é pior do que uma semana de uso não verificado. O build pode
 * trocar o número por `VITE_LICENSE_OFFLINE_DAYS` (`cloudConfig`) — a
 * variável existia no `.env.example` e era lida, mas este prazo ignorava.
 */
export const GRACE_PERIOD_MS = cloudConfig.carenciaOfflineDias * 24 * 60 * 60 * 1000;

export type LicenseStatus = 'checking' | 'active' | 'grace' | 'none' | 'blocked';

/** Motivo do bloqueio, para a tela poder explicar o que fazer. */
export type BlockedReason =
  'expired' | 'revoked' | 'device-unbound' | 'invalid-token' | 'grace-expired';

interface LicenceGravada {
  account: Account;
  plan: Plan;
  token: string;
  deviceId: string;
  boundAt: string;
  lastVerifiedAt: number;
}

export interface LicenseContextData {
  status: LicenseStatus;
  license: ActiveLicense | null;
  blockedReason: BlockedReason | null;
  /** Instante da última verificação bem-sucedida; alimenta o aviso de "grace". */
  lastVerifiedAt: number | null;
  entrar: (email: string, senha: string) => Promise<LoginResult>;
  transferir: (transferToken: string) => Promise<LoginResult>;
  sair: () => Promise<void>;
  reverificar: () => Promise<void>;
}

const LicenseContext = createContext<LicenseContextData>({} as LicenseContextData);

function lerMetadados(): Partial<LicenceGravada> | null {
  try {
    const raw = localStorage.getItem(LICENSE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<LicenceGravada> | null;
    return p && typeof p === 'object' ? p : null;
  } catch {
    // JSON truncado por quota estourada já derrubou o boot deste app uma vez,
    // pelo `SettingsContext`. Aqui o pior caso é pedir login de novo.
    return null;
  }
}

function gravarMetadados(l: Partial<LicenceGravada>): void {
  try {
    localStorage.setItem(LICENSE_KEY, JSON.stringify(l));
  } catch {
    // Sem persistência a licença vale só para esta execução.
  }
}

/**
 * Sobe a cada `gravar()` e `apagar()`. Gravar o token no cofre é assíncrono;
 * uma gravação que termina depois de um `apagar()` (sair logo após entrar)
 * não pode regravar os metadados da licença que acabou de ser apagada.
 */
let ultimaEscrita = 0;

/** Grava o token no cofre; falso quando o cofre recusou. */
async function guardarToken(token: string): Promise<boolean> {
  try {
    return await cofre.gravar(CHAVES.licenca, token);
  } catch {
    return false;
  }
}

/** Há uma licença gravada (conta, plano e máquina)? Síncrono: não abre o cofre. */
function temLicencaGravada(p: Partial<LicenceGravada> | null): p is Partial<LicenceGravada> & Pick<LicenceGravada, 'account' | 'plan' | 'deviceId'> {
  return !!p && !!p.account && !!p.plan && !!p.deviceId;
}

async function ler(): Promise<LicenceGravada | null> {
  const p = lerMetadados();
  if (!temLicencaGravada(p)) return null;
  let token = typeof p.token === 'string' && p.token ? p.token : null;
  if (token) {
    // Formato antigo (token no localStorage): passa para o cofre.
    const antes = ultimaEscrita;
    if ((await guardarToken(token)) && antes === ultimaEscrita) {
      const semToken = { ...p };
      delete semToken.token;
      gravarMetadados(semToken);
    }
  } else {
    try {
      token = await cofre.ler(CHAVES.licenca);
    } catch {
      token = null;
    }
  }
  if (!token) return null;
  return {
    account: p.account,
    plan: p.plan,
    token,
    deviceId: p.deviceId,
    boundAt: p.boundAt ?? new Date(0).toISOString(),
    lastVerifiedAt: typeof p.lastVerifiedAt === 'number' ? p.lastVerifiedAt : 0,
  };
}

async function gravar(l: LicenceGravada): Promise<void> {
  const minha = ++ultimaEscrita;
  const noCofre = await guardarToken(l.token);
  // Um apagar() (ou gravação mais nova) veio depois: ele é quem vale.
  if (minha !== ultimaEscrita) return;
  const semToken: Partial<LicenceGravada> = { ...l };
  delete semToken.token;
  gravarMetadados(noCofre ? semToken : l);
}

function apagar(): void {
  ultimaEscrita++;
  try {
    localStorage.removeItem(LICENSE_KEY);
  } catch {
    /* idem */
  }
  void cofre.remover(CHAVES.licenca).catch(() => undefined);
}

const paraGravada = (l: ActiveLicense, verificadaEm: number): LicenceGravada => ({
  account: l.account,
  plan: l.plan,
  token: l.token,
  deviceId: l.thisDevice.deviceId,
  boundAt: l.thisDevice.boundAt,
  lastVerifiedAt: verificadaEm,
});

const paraAtiva = (g: LicenceGravada, device: DeviceBinding): ActiveLicense => ({
  account: g.account,
  plan: g.plan,
  token: g.token,
  devicesUsed: 1,
  thisDevice: { deviceId: g.deviceId, deviceName: device.deviceName, boundAt: g.boundAt },
});

export const LicenseProvider: React.FC<{
  children: React.ReactNode;
  /** Injetável para teste; em produção usa o serviço real do módulo. */
  service?: LicenseService;
}> = ({ children, service = servicoPadrao }) => {
  const [status, setStatus] = useState<LicenseStatus>('checking');
  const [license, setLicense] = useState<ActiveLicense | null>(null);
  const [blockedReason, setBlockedReason] = useState<BlockedReason | null>(null);
  const [lastVerifiedAt, setLastVerifiedAt] = useState<number | null>(null);

  /**
   * Geração do estado da licença.
   *
   * Sobe a cada mutação (verificar, entrar, transferir, sair). `verificar`
   * fala com a rede e aplica a resposta depois do `await`; sem esta marca, uma
   * verificação lenta sobrescreve o que aconteceu no meio do caminho.
   *
   * O caso concreto: o cuidador desvincula o aparelho → o `CloudContext` chama
   * `reverificar()`, cuja resposta será `revoked` → o usuário é mandado para o
   * login e entra de novo, com licença válida → a verificação atrasada chega e
   * roda `apagar()` + `blocked`. O app apaga uma licença que a pessoa acabou de
   * pagar e a tranca do lado de fora. O espelho é igual de ruim: uma
   * verificação em voo durante o `sair()` regrava a licença e deixa o usuário
   * `'active'` depois de um logout explícito.
   */
  const geracao = useRef(0);

  const verificar = useCallback(async () => {
    const minhaGeracao = ++geracao.current;
    /** Nada mudou desde que esta verificação começou? */
    const vigente = () => geracao.current === minhaGeracao;
    // Sem licença gravada, a resposta sai na hora — sem esperar o cofre —, e a
    // tela de login não pisca um "Carregando…" à toa.
    const gravada = temLicencaGravada(lerMetadados()) ? await ler() : null;
    // Ler o token do cofre é assíncrono: um login no meio do caminho vale mais.
    if (!vigente()) return;
    if (!gravada) {
      setStatus('none');
      setLicense(null);
      return;
    }

    const device = getDeviceBinding();
    const r = await service.verify(gravada.token, getDeviceId());
    // Houve login, transferência ou logout enquanto a rede respondia: a
    // resposta é sobre um estado que já não existe. Descarta em silêncio.
    if (!vigente()) return;

    if (r.ok) {
      const agora = Date.now();
      void gravar(paraGravada(r.license, agora));
      setLicense(r.license);
      setLastVerifiedAt(agora);
      setBlockedReason(null);
      setStatus('active');
      return;
    }

    // Silêncio da rede: a licença em cache ainda pode valer.
    if (r.reason === 'unreachable') {
      const idade = Date.now() - gravada.lastVerifiedAt;
      if (idade < GRACE_PERIOD_MS) {
        setLicense(paraAtiva(gravada, device));
        setLastVerifiedAt(gravada.lastVerifiedAt);
        setBlockedReason(null);
        setStatus('grace');
      } else {
        setLicense(null);
        setBlockedReason('grace-expired');
        setStatus('blocked');
      }
      return;
    }

    // Houve conversa e a resposta foi não. Insistir contornaria uma revogação.
    apagar();
    setLicense(null);
    setBlockedReason(r.reason);
    setStatus('blocked');
  }, [service]);

  useEffect(() => {
    void verificar();
  }, [verificar]);

  const aplicarLogin = useCallback((r: LoginResult): LoginResult => {
    geracao.current++;
    if (r.ok) {
      const agora = Date.now();
      void gravar(paraGravada(r.license, agora));
      setLicense(r.license);
      setLastVerifiedAt(agora);
      setBlockedReason(null);
      setStatus('active');
    }
    return r;
  }, []);

  const entrar = useCallback(
    async (email: string, senha: string) =>
      aplicarLogin(await service.login(email, senha, getDeviceBinding())),
    [service, aplicarLogin]
  );

  const transferir = useCallback(
    async (transferToken: string) =>
      aplicarLogin(await service.transferDevice(transferToken, getDeviceBinding())),
    [service, aplicarLogin]
  );

  const sair = useCallback(async () => {
    // Antes do `await`: a decisão de sair já foi tomada, e uma verificação em
    // voo não pode ressuscitar a sessão quando responder.
    geracao.current++;
    const gravada = await ler();
    if (gravada) {
      try {
        await service.logout(gravada.token);
      } catch {
        // Servidor fora não pode impedir alguém de sair da própria máquina.
      }
    }
    apagar();
    setLicense(null);
    setLastVerifiedAt(null);
    setBlockedReason(null);
    setStatus('none');
  }, [service]);

  const value = useMemo<LicenseContextData>(
    () => ({
      status,
      license,
      blockedReason,
      lastVerifiedAt,
      entrar,
      transferir,
      sair,
      reverificar: verificar,
    }),
    [status, license, blockedReason, lastVerifiedAt, entrar, transferir, sair, verificar]
  );

  return <LicenseContext.Provider value={value}>{children}</LicenseContext.Provider>;
};

export const useLicense = () => useContext(LicenseContext);
