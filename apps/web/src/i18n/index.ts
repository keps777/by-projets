import { createInstance, type i18n as I18n, type Resource, type ResourceKey } from "i18next";
import { initReactI18next } from "react-i18next";
import { CLES, ecrire, lire } from "@/coquille/stockage";
import en from "./en.json";
import fr from "./fr.json";
import pcm from "./pcm.json";

/**
 * Langues de l'application : français (rempli), anglais et pidgin (clés présentes, textes à traduire).
 * Une clé vide se replie sur le français : aucun écran n'affiche une clé brute ni un trou.
 */
export const LANGUES = ["fr", "en", "pcm"] as const;
export type Langue = (typeof LANGUES)[number];
export const LANGUE_PAR_DEFAUT: Langue = "fr";

export function estLangue(valeur: unknown): valeur is Langue {
  return typeof valeur === "string" && (LANGUES as readonly string[]).includes(valeur);
}

/** Textes propres à un écran : `src/ecrans/<Planche>/i18n.fr.json` (et `.en`, `.pcm`), espace de noms `<Planche>`. */
const textesDesEcrans = import.meta.glob<Record<string, unknown>>(
  "../ecrans/*/i18n.{fr,en,pcm}.json",
  { eager: true, import: "default" },
);

function ressources(): Resource {
  const base: Record<Langue, Record<string, ResourceKey>> = {
    fr: { translation: fr },
    en: { translation: en },
    pcm: { translation: pcm },
  };
  for (const [chemin, contenu] of Object.entries(textesDesEcrans)) {
    const correspondance = chemin.match(/\/ecrans\/([^/]+)\/i18n\.(fr|en|pcm)\.json$/);
    if (!correspondance) continue;
    const [, planche, langue] = correspondance as unknown as [string, string, Langue];
    base[langue][planche] = contenu;
  }
  return base;
}

export function langueEnregistree(): Langue {
  const stockee = lire(CLES.langue);
  return estLangue(stockee) ? stockee : LANGUE_PAR_DEFAUT;
}

/** Crée une instance i18next indépendante (une par application, une par test). */
export function creerI18n(langue: Langue = langueEnregistree()): I18n {
  const instance = createInstance();
  void instance.use(initReactI18next).init({
    resources: ressources(),
    lng: langue,
    fallbackLng: LANGUE_PAR_DEFAUT,
    defaultNS: "translation",
    initAsync: false,
    returnEmptyString: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  return instance;
}

/** Change la langue, la mémorise et met à jour l'attribut `lang` du document. */
export async function changerLangue(instance: I18n, langue: Langue): Promise<void> {
  await instance.changeLanguage(langue);
  ecrire(CLES.langue, langue);
  if (typeof document !== "undefined") document.documentElement.lang = langue;
}
