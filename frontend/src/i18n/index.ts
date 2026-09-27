import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ptBR from './locales/pt-BR.json';

/**
 * Idiomas oferecidos ao usuário.
 *
 * Só o português, por enquanto (FE-24). O inglês (`locales/en.json`, mantido
 * com as mesmas chaves e conferido pelo teste de paridade) cobre apenas as
 * telas que já passavam pelo i18n: a Emergência, o teclado, os avisos do
 * rastreamento e dezenas de outras telas continuavam em português no meio de
 * um app em inglês — e o idioma vinha do Windows, sem ninguém escolher. Um
 * app assistivo com metade das telas num idioma e metade em outro confunde
 * justamente quem mais depende dele. O inglês volta ao seletor quando todas
 * as telas passarem pelo i18n; até lá o app é sempre em português, e os
 * seletores de idioma não aparecem (ver `LanguageSwitcher`).
 */
export const supportedLngs = ['pt-BR'] as const;
export type SupportedLng = (typeof supportedLngs)[number];

/** Há escolha de idioma a oferecer? */
export const haEscolhaDeIdioma = (supportedLngs as readonly string[]).length > 1;

i18n.use(initReactI18next).init({
  resources: {
    'pt-BR': { translation: ptBR },
  },
  // Fixo: sem detecção pelo sistema nem pelo que o detector antigo gravou em
  // `irisflow_lang` (instalações num Windows em inglês ficaram com 'en' ali
  // sem ninguém ter escolhido).
  lng: 'pt-BR',
  fallbackLng: 'pt-BR',
  supportedLngs: [...supportedLngs],
  interpolation: { escapeValue: false },
});

export default i18n;
