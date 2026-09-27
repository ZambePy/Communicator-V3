import { EmergencyContact } from '@/data/types';

/**
 * A lista sem UM contato igual a `c` (mesmo nome e telefone) — o primeiro, se
 * houver dois iguais. Aplicada sobre a lista do servidor na hora de gravar, e
 * não por índice na lista da tela (que podia estar velha).
 */
export function semOContato(lista: EmergencyContact[], c: EmergencyContact): EmergencyContact[] {
  const i = lista.findIndex((x) => x.name === c.name && x.phone === c.phone);
  return i < 0 ? lista : [...lista.slice(0, i), ...lista.slice(i + 1)];
}
