// Campo de visão calibrado POR CÂMERA.
//
// O FOV horizontal é a única constante que converte tamanho de rosto em
// centímetros, e ele é medido uma vez com fita métrica ("Calibrar campo de
// visão"). Até aqui era um número só nas configurações — o que significa que
// trocar a webcam (a integrada por uma USB, ou o notebook por outro) mantinha
// o FOV da câmera anterior, e toda distância passava a sair errada em
// silêncio: a compensação de distância e o medidor de pré-calibração seguiam
// funcionando, com o número de outra lente.
//
// Aqui o valor medido fica guardado pela identidade da câmera. Quando a
// câmera aberta é uma que já foi medida, o FOV dela volta sozinho; quando é
// uma nunca vista, o app volta ao default e AVISA — porque um default
// declarado é melhor que uma medição de outro aparelho parecendo medição.

export interface RegistroDeFov {
  fovDeg: number;
  /** Nome legível da câmera, para a tela. */
  rotulo: string;
  /** ISO 8601 de quando foi medido. */
  medidoEm: string;
}

export type MapaDeFov = Record<string, RegistroDeFov>;

/** FOV horizontal de uma webcam de notebook típica; é o default de produção. */
export const FOV_PADRAO_DEG = 69.7;

/**
 * Identidade estável de uma câmera a partir do que o browser expõe.
 *
 * `deviceId` é o melhor identificador, mas em alguns contextos vem vazio
 * (permissão ainda não concedida, `file://`). O rótulo é o fallback — menos
 * único (duas câmeras iguais têm o mesmo nome), mas melhor que nada.
 */
export function chaveDaCamera(track: { deviceId?: string; label?: string } | null | undefined): string | null {
  if (!track) return null;
  const id = typeof track.deviceId === 'string' ? track.deviceId.trim() : '';
  if (id) return `id:${id}`;
  const rotulo = typeof track.label === 'string' ? track.label.trim() : '';
  return rotulo ? `rotulo:${rotulo}` : null;
}

export interface ResolucaoDeFov {
  fovDeg: number;
  origem: 'medido' | 'padrao';
  /** Mensagem para a tela quando o FOV mudou por causa da câmera; `null` se
   *  nada mudou do ponto de vista de quem usa. */
  aviso: string | null;
}

/**
 * Decide o FOV ativo para a câmera que acabou de abrir.
 *
 * - Câmera conhecida → o FOV medido dela.
 * - Câmera nova, e a anterior era outra com FOV medido → volta ao padrão e
 *   avisa: o valor antigo pertencia a outra lente.
 * - Câmera nova, sem histórico → padrão, sem alarde (é o primeiro boot).
 * - Sem identidade (`chave` nula) → mantém o que está, porque não há como
 *   saber se é a mesma câmera.
 */
export function resolverFovParaCamera(
  mapa: MapaDeFov,
  chave: string | null,
  ultimaChave: string | null,
  fovAtivo: number | null,
  padrao: number = FOV_PADRAO_DEG,
): ResolucaoDeFov {
  if (chave === null) {
    return { fovDeg: fovAtivo ?? padrao, origem: fovAtivo === null ? 'padrao' : 'medido', aviso: null };
  }
  const conhecido = mapa[chave];
  if (conhecido && Number.isFinite(conhecido.fovDeg) && conhecido.fovDeg > 0) {
    const mudou = fovAtivo === null || Math.abs(fovAtivo - conhecido.fovDeg) > 1e-6;
    return {
      fovDeg: conhecido.fovDeg,
      origem: 'medido',
      aviso: mudou && ultimaChave !== null && ultimaChave !== chave
        ? `Câmera reconhecida (${conhecido.rotulo || 'sem nome'}): campo de visão medido de ${conhecido.fovDeg.toFixed(1)}° restaurado.`
        : null,
    };
  }
  const anteriorEraOutra = ultimaChave !== null && ultimaChave !== chave;
  const ativoNaoEraPadrao = fovAtivo !== null && Math.abs(fovAtivo - padrao) > 1e-6;
  return {
    fovDeg: padrao,
    origem: 'padrao',
    aviso: anteriorEraOutra && ativoNaoEraPadrao
      ? 'Câmera diferente da última vez: o campo de visão voltou ao padrão. ' +
        'Meça a distância com fita e use "Calibrar campo de visão" para esta câmera.'
      : null,
  };
}

/** Novo mapa com o FOV desta câmera registrado (não muta o original). */
export function registrarFov(
  mapa: MapaDeFov,
  chave: string,
  fovDeg: number,
  rotulo: string,
  agora: Date = new Date(),
): MapaDeFov {
  if (!Number.isFinite(fovDeg) || fovDeg <= 0 || fovDeg >= 180) {
    throw new RangeError(`[fov] campo de visão implausível: ${fovDeg}`);
  }
  return { ...mapa, [chave]: { fovDeg, rotulo, medidoEm: agora.toISOString() } };
}

/** Sanitiza o que veio do disco: só entradas com FOV plausível sobrevivem. */
export function sanitizarMapaDeFov(bruto: unknown): MapaDeFov {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return {};
  const out: MapaDeFov = {};
  for (const [k, v] of Object.entries(bruto as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const r = v as Partial<RegistroDeFov>;
    if (typeof r.fovDeg !== 'number' || !Number.isFinite(r.fovDeg) || r.fovDeg <= 0 || r.fovDeg >= 180) continue;
    out[k] = {
      fovDeg: r.fovDeg,
      rotulo: typeof r.rotulo === 'string' ? r.rotulo : '',
      medidoEm: typeof r.medidoEm === 'string' ? r.medidoEm : '',
    };
  }
  return out;
}
