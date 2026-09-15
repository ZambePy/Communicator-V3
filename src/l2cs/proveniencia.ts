// Ficha de proveniência do modelo: validação da meta e resumo legível.
//
// Existe por uma razão de produto, não de engenharia: os pesos do L2CS-Net
// empacotados na beta foram treinados no Gaze360, cuja licença proíbe uso
// comercial e diz isso nominalmente de "models trained on dataset". O V2
// substitui esses pesos, e a única forma de provar que substituiu é o próprio
// software dizer, em cada relatório, com que dado o modelo carregado foi
// treinado, sob que licença, e se o arquivo é mesmo o que a ficha descreve.
//
// Nada aqui toca o pipeline de olhar. É metadado — mas é o metadado que uma
// due diligence pede primeiro.

import type { L2CSModelMeta, ProvenienciaDoModelo, VerificacaoDoModelo } from './types';

/**
 * Defeito estrutural na meta, ou `null` quando ela está coerente.
 *
 * O worker recusa iniciar com meta incoerente: uma grade de bins impossível
 * decodificaria ângulos errados em silêncio, e é melhor não ter olhar do que
 * ter olhar inventado.
 */
export function validarMeta(meta: Partial<L2CSModelMeta> | null | undefined): string | null {
  if (!meta || typeof meta !== 'object') return 'meta ausente';
  const { outputBins, binWidth, binOffset, inputTensorName, outputTensorNames } = meta;
  if (!Number.isInteger(outputBins) || (outputBins as number) < 2) {
    return `outputBins deve ser inteiro ≥ 2 (veio ${String(outputBins)})`;
  }
  if (!(typeof binWidth === 'number' && Number.isFinite(binWidth) && binWidth > 0)) {
    return `binWidth deve ser positivo (veio ${String(binWidth)})`;
  }
  if (!(typeof binOffset === 'number' && Number.isFinite(binOffset))) {
    return `binOffset deve ser numérico (veio ${String(binOffset)})`;
  }
  const cobertura = (outputBins as number) * binWidth;
  if (cobertura > 360 + 1e-9) {
    return `${outputBins} bins × ${binWidth}° cobrem ${cobertura}°, mais que uma volta`;
  }
  if (meta.decoding != null && meta.decoding !== 'circular' && meta.decoding !== 'linear') {
    return `decoding deve ser 'circular' ou 'linear' (veio ${String(meta.decoding)})`;
  }
  if (meta.decoding === 'circular' && cobertura < 360 - 1e-9) {
    return `decoding 'circular' com bins que cobrem só ${cobertura}° — a volta não fecha`;
  }
  if (typeof inputTensorName !== 'string' || inputTensorName.length === 0) {
    return 'inputTensorName ausente';
  }
  if (
    !outputTensorNames ||
    typeof outputTensorNames.yaw !== 'string' ||
    typeof outputTensorNames.pitch !== 'string'
  ) {
    return 'outputTensorNames.yaw/pitch ausentes';
  }
  if (meta.sha256 != null && !/^[0-9a-fA-F]{64}$/.test(meta.sha256)) {
    return 'sha256 não é um hex de 64 caracteres';
  }
  if (meta.proveniencia != null) {
    const p = meta.proveniencia;
    if (!['permitido', 'proibido', 'desconhecido'].includes(p.usoComercial)) {
      return `proveniencia.usoComercial inválido (${String(p.usoComercial)})`;
    }
    if (!p.treino || !Array.isArray(p.treino.bases)) return 'proveniencia.treino.bases ausente';
    if (p.usoComercial === 'permitido' && !p.contrato) {
      // Uma licença permissiva de verdade (MIT, dado próprio) também dispensa
      // contrato — mas aí a ficha precisa dizer isso nas bases, e a regra
      // simples é: "permitido" sem contrato exige que TODAS as bases declarem
      // licença que não seja não-comercial.
      const naoComercial = p.treino.bases.some((b) => /nc|non-?commercial|research/i.test(b.licenca));
      if (naoComercial) {
        return "usoComercial 'permitido' sem contrato, com base de licença não-comercial";
      }
    }
  }
  return null;
}

/** Ficha achatada para relatório e tela — o que o operador precisa ler. */
export interface FichaDoModelo {
  arquivo: string | null;
  dataset: string;
  bins: { n: number; larguraGraus: number; offsetGraus: number; decodificacao: 'circular' | 'linear' };
  sha256Declarado: string | null;
  sha256Calculado: string | null;
  /** `confere` / `nao-confere` / `nao-declarado` / `nao-calculado`. */
  integridade: 'confere' | 'nao-confere' | 'nao-declarado' | 'nao-calculado';
  usoComercial: ProvenienciaDoModelo['usoComercial'];
  bases: string[];
  contrato: string | null;
}

export function fichaDoModelo(
  meta: L2CSModelMeta,
  verificacao: VerificacaoDoModelo | null,
): FichaDoModelo {
  const declarado = meta.sha256 ?? null;
  const calculado = verificacao?.sha256Calculado ?? null;
  let integridade: FichaDoModelo['integridade'];
  if (!calculado) integridade = 'nao-calculado';
  else if (!declarado) integridade = 'nao-declarado';
  else integridade = verificacao?.hashConfere ? 'confere' : 'nao-confere';

  const cobertura = meta.outputBins * meta.binWidth;
  const decodificacao =
    meta.decoding === 'linear' || meta.decoding === 'circular'
      ? meta.decoding
      : cobertura >= 360 - 1e-9 ? 'circular' : 'linear';

  const p = meta.proveniencia ?? null;
  return {
    arquivo: meta.file ?? null,
    dataset: meta.dataset,
    bins: { n: meta.outputBins, larguraGraus: meta.binWidth, offsetGraus: meta.binOffset, decodificacao },
    sha256Declarado: declarado,
    sha256Calculado: calculado,
    integridade,
    usoComercial: p?.usoComercial ?? 'desconhecido',
    bases: p ? p.treino.bases.map((b) => `${b.nome} (${b.licenca})`) : [],
    contrato: p?.contrato ? `${p.contrato.com}, ${p.contrato.data}` : null,
  };
}

/** Uma linha para a tela de diagnóstico. */
export function resumoDaFicha(f: FichaDoModelo): string {
  const uso =
    f.usoComercial === 'permitido' ? 'uso comercial autorizado'
    : f.usoComercial === 'proibido' ? 'USO COMERCIAL PROIBIDO'
    : 'uso comercial não declarado';
  const integridade =
    f.integridade === 'confere' ? 'hash confere'
    : f.integridade === 'nao-confere' ? 'HASH NÃO CONFERE'
    : f.integridade === 'nao-declarado' ? 'hash não declarado'
    : 'hash não calculado';
  const bases = f.bases.length > 0 ? f.bases.join(', ') : 'bases não declaradas';
  return `${f.arquivo ?? 'modelo'} · ${bases} · ${uso} · ${integridade}`;
}
