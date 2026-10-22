/**
 * O que gravar na voz guardada (pedido de 19/10/2026): uma lista CURTA de
 * frases úteis — as que mais fazem falta quando a voz vai embora, e as que
 * levam o jeito da pessoa (o "eu te amo" dela não é o de uma voz sintética).
 * O cuidador acrescenta as frases próprias (nomes, apelidos, bordões).
 *
 * Neutras de gênero de propósito: "Agradeço muito" em vez de "obrigado(a)",
 * "Preciso descansar" em vez de "estou cansado(a)" — a lista vale para
 * qualquer pessoa sem perguntar nada.
 */

export const FRASES_PARA_GUARDAR: readonly string[] = [
  'Sim.',
  'Não.',
  'Eu te amo.',
  'Bom dia!',
  'Boa noite, durma bem.',
  'Agradeço muito.',
  'Estou com dor.',
  'Por favor, me ajude.',
  'Espera um pouco.',
  'Preciso descansar.',
  'Pode mudar a minha posição?',
  'Tudo bem, não se preocupe.',
];

/**
 * Um trecho mais longo (~15 s lido com calma): a voz do computador precisa de
 * pelo menos 6 s de fala para pegar o timbre e fica melhor a partir de 15 s
 * (`classificarReferencia`). Uma frase curta sozinha daria uma base "fraca".
 */
export const TEXTO_PARA_A_VOZ_DO_COMPUTADOR =
  'Hoje eu quero contar uma coisa. Gosto de manhãs calmas, de café quente e de conversar com quem eu amo. ' +
  'Quando o dia está bonito, abro a janela e fico ouvindo os passarinhos. É assim que eu falo, e é assim que eu quero continuar falando.';

/**
 * O termo da voz guardada. Mesmo formato e mesmo registro do termo da voz
 * clonada (texto aceito, quando, por qual perfil, com o hash gravado pelo
 * processo principal) — escrito em primeira pessoa, porque aqui quem aceita
 * é quem vai gravar: a própria pessoa, enquanto ainda fala.
 */
export const TERMO_DA_VOZ_GUARDADA = [
  'Concordo em gravar a minha própria voz nesta tela.',
  'Sei que a voz é um dado pessoal sensível (LGPD, art. 5º, II e art. 11). As gravações ficam guardadas só neste computador, para tocar quando eu quiser. Nada vai para a internet, nem para a IrisFlow, nem para outras pessoas.',
  'Uma gravação só vira a base da voz do computador se alguém escolher isso depois, aceitando o termo da voz personalizada.',
  'Posso apagar as gravações quando quiser.',
].join('\n\n');

const CHAVE_DAS_FRASES_PROPRIAS = (perfilId: string | null) => `irisflow.vozGuardada.frasesProprias.${perfilId ?? 'sem-perfil'}`;
export const MAX_FRASES_PROPRIAS = 40;
export const MAX_CARACTERES_DA_FRASE = 160;

/** Frases que o cuidador digitou e ainda não foram gravadas (as gravadas vivem com a gravação). */
export function lerFrasesProprias(perfilId: string | null): string[] {
  try {
    const bruto = localStorage.getItem(CHAVE_DAS_FRASES_PROPRIAS(perfilId));
    const lista = bruto ? (JSON.parse(bruto) as unknown) : [];
    return Array.isArray(lista) ? lista.filter((f): f is string => typeof f === 'string' && f.trim().length > 0).slice(0, MAX_FRASES_PROPRIAS) : [];
  } catch {
    return [];
  }
}

/** Grava a lista; `false` quando o armazenamento recusou (a tela avisa). */
export function gravarFrasesProprias(perfilId: string | null, frases: readonly string[]): boolean {
  try {
    localStorage.setItem(CHAVE_DAS_FRASES_PROPRIAS(perfilId), JSON.stringify(frases.slice(0, MAX_FRASES_PROPRIAS)));
    return true;
  } catch {
    return false;
  }
}

export function normalizarFrase(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim().slice(0, MAX_CARACTERES_DA_FRASE);
}

const comparavel = (t: string) => normalizarFrase(t).toLocaleLowerCase('pt-BR').replace(/[.!?…]+$/u, '');
export const mesmaFrase = (a: string, b: string): boolean => comparavel(a) === comparavel(b);

/**
 * A lista da tela de gravar: as frases da lista, as próprias e as que já têm
 * gravação mas não estão em nenhuma das duas (gravadas em outra ocasião) —
 * sem repetir, na ordem: lista, próprias, demais, e o texto longo por último.
 */
export function montarListaDeFrases(proprias: readonly string[], gravadas: readonly string[]): string[] {
  const saida: string[] = [];
  const incluir = (t: string) => {
    const f = normalizarFrase(t);
    if (f && !saida.some((x) => mesmaFrase(x, f))) saida.push(f);
  };
  FRASES_PARA_GUARDAR.forEach(incluir);
  proprias.forEach(incluir);
  gravadas.filter((g) => !mesmaFrase(g, TEXTO_PARA_A_VOZ_DO_COMPUTADOR)).forEach(incluir);
  incluir(TEXTO_PARA_A_VOZ_DO_COMPUTADOR);
  return saida;
}
