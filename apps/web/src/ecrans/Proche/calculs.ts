import type { voyageur as contrats } from "@afrimove/contrats";

/** « 5500 » -> « 5 500 » (espace de groupement, comme dans la planche). */
export function formaterMontant(montant: number): string {
  const signe = montant < 0 ? "− " : "";
  return signe + String(Math.abs(Math.trunc(montant))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/**
 * « +237699401822 » -> « +237 6 99 40 18 22 » : numéro camerounais écrit comme dans la planche (indicatif, un
 * chiffre, puis quatre paires). Un autre indicatif ou une autre longueur reste tel que l'API le donne.
 */
export function formaterTelephone(telephone: string): string {
  const n = /^\+237(\d{9})$/.exec(telephone)?.[1];
  if (!n) return telephone;
  return `+237 ${n.slice(0, 1)} ${n.slice(1, 3)} ${n.slice(3, 5)} ${n.slice(5, 7)} ${n.slice(7, 9)}`;
}

/**
 * Numéro saisi pour un nouveau proche -> format international attendu par l'API (`+237…`), ou `null` si ce n'est
 * pas un mobile camerounais (neuf chiffres commençant par 6, avec ou sans espaces, points, tirets ou « +237 »).
 */
export function normaliserTelephone(saisie: string): string | null {
  const chiffres = saisie.replace(/[\s.-]/g, "").replace(/^(\+|00)?237/, "");
  return /^6\d{8}$/.test(chiffres) ? `+237${chiffres}` : null;
}

/** `2027-01-05T08:00:00.000+01:00` -> `08:00` : les heures de l'API portent déjà le décalage de Douala. */
export function heureDouala(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}

/** Jour `AAAA-MM-JJ` -> date UTC à midi (le calendrier ne dépend alors d'aucun fuseau). */
function dateDuJour(jour: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(jour);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
}

function formatJour(jour: string, langue: string, options: Intl.DateTimeFormatOptions): string {
  const date = dateDuJour(jour);
  if (!date) return jour;
  return new Intl.DateTimeFormat(langue === "en" ? "en-GB" : "fr-FR", {
    ...options,
    timeZone: "UTC",
  }).format(date);
}

/** `2027-01-10` -> « dim. 10 janv. » (jour de la semaine calculé sur la date, pas recopié). */
export function jourCourt(jour: string, langue = "fr"): string {
  return formatJour(jour, langue, { weekday: "short", day: "numeric", month: "short" });
}

/** `2027-01-10` -> « dimanche » (titre de la liste des départs). */
export function jourSemaine(jour: string, langue = "fr"): string {
  return formatJour(jour, langue, { weekday: "long" });
}

const SYMBOLES_DEVISE: Readonly<Record<string, string>> = {
  CAD: "$ CA",
  USD: "$ US",
  EUR: "€",
  GBP: "£",
  CHF: "CHF",
};

/** 1290 centimes de CAD -> « 12,90 $ CA » (montant indicatif : l'écran ajoute « ≈ »). */
export function formaterConversion(conversion: contrats.Conversion): string {
  const entier = Math.floor(conversion.montantMineur / 100);
  const centimes = String(conversion.montantMineur % 100).padStart(2, "0");
  const symbole = SYMBOLES_DEVISE[conversion.devise] ?? conversion.devise;
  return `${formaterMontant(entier)},${centimes} ${symbole}`;
}

/** Devise du paiement : trois lettres majuscules, sinon la devise du voyageur à l'étranger par défaut. */
export function deviseDemandee(valeur: string | null, parDefaut: string): string {
  return valeur && /^[A-Za-z]{3}$/.test(valeur) ? valeur.toUpperCase() : parDefaut;
}

/** Jour demandé dans l'adresse (`AAAA-MM-JJ`), sinon `undefined` : l'API cherche alors aujourd'hui. */
export function jourDemande(valeur: string | null): string | undefined {
  return valeur && dateDuJour(valeur) ? valeur : undefined;
}

/** « Thérèse Ngo » -> « TN », « Maman » -> « MA » : initiales d'un nouveau proche, à défaut de celles de l'API. */
export function initialesDe(nom: string): string {
  const mots = nom
    .replace(/[^\p{L}\s-]/gu, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
  const [premier, dernier] = [mots[0], mots[mots.length - 1]];
  if (!premier) return "";
  return mots.length > 1 && dernier
    ? (premier.charAt(0) + dernier.charAt(0)).toUpperCase()
    : premier.slice(0, 2).toUpperCase();
}

const TERMES_FEMININS = new Set([
  "maman",
  "mama",
  "mamie",
  "mere",
  "tata",
  "tante",
  "tantine",
  "soeur",
  "sœur",
  "cousine",
  "fille",
  "epouse",
  "femme",
  "niece",
]);

/**
 * L'API ne donne pas le genre d'un proche. La planche écrit « elle » pour « Maman » : on n'accorde au féminin que
 * pour un terme de parenté sans ambiguïté ; sinon les textes restent neutres (« ton proche »).
 */
export function estFeminin(nom: string): boolean {
  const premier = nom
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[\s-]+/)[0];
  return premier !== undefined && TERMES_FEMININS.has(premier);
}

/** Siège à réserver pour le proche : celui que je tiens déjà (bloqué 15 min), sinon la première place libre. */
export function siegeAReserver(
  plan: contrats.PlanSiegesVue,
): { numero: number; emplacement?: string; choisi: boolean } | undefined {
  const vue = (numero: number) => plan.sieges.find((s) => s.numero === numero);
  if (plan.mon) {
    const emplacement = cote(vue(plan.mon.siege)?.emplacement);
    return { numero: plan.mon.siege, ...(emplacement ? { emplacement } : {}), choisi: true };
  }
  const libre = plan.sieges.find((s) => s.etat === "libre");
  if (!libre) return undefined;
  const emplacement = cote(libre.emplacement);
  return {
    numero: libre.numero,
    ...(emplacement ? { emplacement } : {}),
    choisi: false,
  };
}

/** « côté fenêtre · près de la porte » -> « côté fenêtre » : la ligne du départ ne garde que le côté du siège. */
function cote(emplacement: string | undefined): string | undefined {
  const premier = emplacement?.split("·")[0]?.trim();
  return premier ? premier : undefined;
}

/** Vrai quand l'instant `limite` (ISO) est atteint à `maintenant`. */
export function delaiDepasse(limite: string, maintenant: Date): boolean {
  const fin = Date.parse(limite);
  return !Number.isNaN(fin) && maintenant.getTime() >= fin;
}

export type EtatPaiement = "attente" | "reussi" | "echoue" | "expire";

/**
 * Issue d'un paiement par carte à partir de ce que disent le temps réel et la relève : un statut définitif
 * l'emporte sur « en attente », et l'échéance de la commande (15 min) clôt l'attente si le serveur ne l'a pas fait.
 */
export function issuePaiement(
  statuts: ReadonlyArray<contrats.StatutPaiement | undefined>,
  commandeExpiree: boolean,
): EtatPaiement {
  if (statuts.includes("reussi")) return "reussi";
  if (statuts.includes("echoue")) return "echoue";
  if (statuts.includes("expire") || commandeExpiree) return "expire";
  return "attente";
}

/** Adresse d'authentification 3-D Secure : https seulement, jamais une adresse d'un autre type. */
export function urlAuthentificationSure(url: string | undefined): string | undefined {
  return url !== undefined && /^https:\/\//i.test(url) ? url : undefined;
}

/**
 * Carte affichée sous « Tu paies par carte » : le détail du moyen « carte » quand il désigne une carte enregistrée
 * (il se termine par ses quatre derniers chiffres, « Visa ···· 4471 »). Un détail générique n'est pas une carte.
 */
export function resumeCarte(moyens: readonly contrats.MoyenPaiementVue[]): string | undefined {
  const detail = moyens.find((m) => m.code === "carte")?.detail?.trim();
  return detail !== undefined && /\d{4}$/.test(detail) ? detail : undefined;
}

/** Les lignes d'un devis : le billet, et les frais de service quand ils ne sont pas offerts. */
export function decomposerDevis(devis: contrats.Devis): { billet: number; frais: number } {
  const frais = devis.lignes.find((l) => l.code === "frais_voyageur")?.montant ?? 0;
  return { billet: devis.total - frais, frais };
}
