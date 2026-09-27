import { LICENSE_KEY } from '../../context/LicenseContext';
import type { Plan } from '../license/types';

/**
 * O plano inclui Lazer e bem-estar (jogos pelo olhar, fotos, leituras e
 * meditação)? Na tabela de preços o módulo é dos planos Completo e Voz — e da
 * beta, que libera tudo. O servidor diz isso em `features.lazer`
 * (`license_for_profile()`, migração de 27/09/2026).
 *
 * Mesma regra da voz clonada e do assistente: sem licença gravada ou sem o
 * campo (mock, cache de antes da chave existir) trata como liberado — é o
 * cache de uma licença válida, e negar um recurso por falta de metadado
 * puniria o paciente por um detalhe de servidor.
 */
export function lazerLiberadoPelaLicenca(): boolean {
  try {
    const raw = localStorage.getItem(LICENSE_KEY);
    if (!raw) return true;
    const plan = (JSON.parse(raw) as { plan?: Plan }).plan;
    const lazer = plan?.features?.lazer;
    return lazer === undefined ? true : lazer === true;
  } catch {
    return true;
  }
}
