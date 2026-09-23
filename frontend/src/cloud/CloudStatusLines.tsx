import React, { useEffect, useState } from 'react';
import { Smartphone, ShieldAlert, ShieldCheck, CloudOff } from 'lucide-react';
import { useCloud } from './CloudContext';
import { cofre, type ProtecaoDoCofre } from './armazenamento';
import { licenseBackend } from '../services/license';

/** O que a tela diz sobre onde as credenciais da nuvem ficam, por estado real do cofre. */
export const TEXTO_DA_PROTECAO: Record<ProtecaoDoCofre, string> = {
  cifrado: 'credenciais da nuvem guardadas cifradas pelo sistema (safeStorage)',
  'sem-cifra': 'credenciais da nuvem guardadas SEM cifra: este sistema não ofereceu um cofre de senhas (no Linux, um chaveiro como o GNOME Keyring ou o KWallet)',
  navegador: 'credenciais da nuvem guardadas no navegador (modo de desenvolvimento)',
  desconhecida: 'não foi possível confirmar se as credenciais da nuvem estão cifradas',
};

/**
 * Linhas da página **Conta e assinatura** sobre a ligação com o celular do
 * cuidador. Só aparecem quando a nuvem está configurada: em modo local (mock
 * de licença) não há o que dizer.
 *
 * Não tem botão: entrar e sair são do `LicenseContext`, que já vive nessa
 * página. Aqui é só o estado — o que o cuidador precisa saber quando uma
 * mensagem "não chegou".
 */
export const CloudStatusLines: React.FC<{ Linha: React.FC<{ icone: React.ReactNode; children: React.ReactNode }> }> = ({ Linha }) => {
  const cloud = useCloud();
  // Perguntado ao processo principal (assíncrono); até a resposta, a linha
  // não afirma nada sobre cifra.
  const [protecao, setProtecao] = useState<ProtecaoDoCofre | null>(null);
  useEffect(() => {
    let vivo = true;
    void cofre.protecao().then((p) => { if (vivo) setProtecao(p); });
    return () => { vivo = false; };
  }, []);
  if (!cloud.configurada || licenseBackend !== 'supabase') return null;

  const celular = !cloud.vinculo
    ? 'celular do cuidador: sem vínculo neste computador'
    : !cloud.online
      ? 'celular do cuidador: sem internet — mensagens e alertas ficam na fila'
      : cloud.realtime === 'conectado'
        ? 'celular do cuidador: conectado em tempo real'
        : 'celular do cuidador: sincronizando por consulta periódica';

  return (
    <>
      <Linha icone={cloud.online && cloud.vinculo ? <Smartphone size={17} aria-hidden="true" /> : <CloudOff size={17} aria-hidden="true" />}>
        {celular}
        {cloud.filaPendente > 0 ? ` · ${cloud.filaPendente} envio(s) aguardando` : ''}
        {cloud.naoFaladas > 0 ? ` · ${cloud.naoFaladas} mensagem(ns) não falada(s)` : ''}
      </Linha>
      <Linha icone={protecao === 'cifrado' ? <ShieldCheck size={17} aria-hidden="true" /> : <ShieldAlert size={17} aria-hidden="true" />}>
        {protecao ? `${TEXTO_DA_PROTECAO[protecao]} — ` : ''}
        {'sai deste computador só o texto que o paciente escolheu falar, alertas e o resumo numérico da calibração'}
      </Linha>
    </>
  );
};
