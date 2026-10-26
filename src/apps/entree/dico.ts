// Mini-dictionnaire de l'écran « Langue et région » : seuls les textes de cet écran basculent FR/EN, le reste de l'application reste en français.
export type Langue = 'fr' | 'en';
export const LANGUES: Langue[] = ['fr', 'en'];

export interface Textes {
  retour: string; groupeLangue: string; autresLangues: string;
  regionTitre: string; regionAide: string; regionLabel: string; regionDetectee: string;
  aeroportLabel: string; aeroportAide: string; continuer: string;
}
export const TEXTES: Record<Langue, Textes> = {
  fr: {
    retour: 'Retour', groupeLangue: 'Langue de l’application', autresLangues: 'D’autres langues bientôt. Vous pourrez changer de langue dans Compte.',
    regionTitre: 'Région et départs', regionAide: 'Pour afficher les prix dans votre devise et préremplir vos recherches.', regionLabel: 'Région et devise', regionDetectee: 'Détectée automatiquement · modifiable',
    aeroportLabel: 'Aéroport habituel', aeroportAide: 'Point de départ proposé par défaut. Facultatif.', continuer: 'Continuer'
  },
  en: {
    retour: 'Back', groupeLangue: 'App language', autresLangues: 'More languages soon. You can change language in Account.',
    regionTitre: 'Region and departures', regionAide: 'To show prices in your currency and prefill your searches.', regionLabel: 'Region and currency', regionDetectee: 'Detected automatically · editable',
    aeroportLabel: 'Usual airport', aeroportAide: 'Default departure point. Optional.', continuer: 'Continue'
  }
};
export const texte = (langue: string): Textes => TEXTES[langue === 'en' ? 'en' : 'fr'];
/** Valeur sûre : toute langue inconnue retombe sur le français. */
export const langueValide = (v: unknown): Langue => (v === 'en' ? 'en' : 'fr');

export interface Region { code: 'ca' | 'us' | 'fr'; libelle: Record<Langue, string>; /** Valeur écrite dans `Compte.region`. */ compte: string }
export const REGIONS: Region[] = [
  { code: 'ca', libelle: { fr: 'Canada · $ CA', en: 'Canada · $ CA' }, compte: 'Canada · CAD' },
  { code: 'us', libelle: { fr: 'États-Unis · $ US', en: 'United States · $ US' }, compte: 'États-Unis · USD' },
  { code: 'fr', libelle: { fr: 'France · €', en: 'France · €' }, compte: 'France · EUR' }
];
export const regionDe = (code: string): Region => REGIONS.find((r) => r.code === code) ?? REGIONS[0];

export const AEROPORT_DEFAUT = 'Montréal (YUL)';
/** « Montréal (YUL) » → « YUL » ; chaîne vide si aucun code entre parenthèses. */
export function codeAeroport(saisie: string): string { const m = /\(([A-Za-z]{3})\)/.exec(saisie); return m ? m[1].toUpperCase() : ''; }
