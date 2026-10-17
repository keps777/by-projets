/** Calculs purs de la planche « Vente » : montants, téléphone, pièce, libellés des départs. */

/** « 4000 » -> « 4 000 » (espace entre les milliers, comme dans la planche). */
export function formaterMontant(montant: number): string {
  return String(Math.abs(Math.trunc(montant))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Chiffres d'une saisie : « 5 000 » -> 5000 ; vide -> 0. */
export function lireMontant(saisie: string): number {
  const chiffres = saisie.replace(/\D/g, "");
  return chiffres === "" ? 0 : Number(chiffres);
}

/** Tarif de la classe + bagage éventuel : ce que le voyageur paie. */
export function totalAPayer(tarif: number, bagage: number, avecBagage: boolean): number {
  return tarif + (avecBagage ? bagage : 0);
}

/** Rendu du cash : reçu − dû, ou null quand le voyageur n'a pas donné assez. */
export function renduCash(recu: number, du: number): number | null {
  return recu >= du ? recu - du : null;
}

const INDICATIF = "+237";

/** « +237677301145 » -> « 6 77 30 11 45 » (la planche affiche le numéro national, un chiffre puis des paires). */
export function afficherTelephone(telephone: string | null): string {
  if (!telephone) return "";
  const national = telephone.startsWith(INDICATIF) ? telephone.slice(INDICATIF.length) : telephone;
  const chiffres = national.replace(/\D/g, "");
  const reste = chiffres.slice(1).match(/\d{1,2}/g) ?? [];
  return [chiffres.slice(0, 1), ...reste].join(" ");
}

export type TelephoneLu = { ok: true; valeur: string | null } | { ok: false };

/** Saisie -> format du contrat (+237…). Vide : pas de numéro (donc pas de SMS) ; 9 chiffres commençant par 6 : valide. */
export function lireTelephone(saisie: string): TelephoneLu {
  const chiffres = saisie.replace(/\D/g, "");
  if (chiffres === "") return { ok: true, valeur: null };
  const national =
    chiffres.startsWith("237") && chiffres.length === 12 ? chiffres.slice(3) : chiffres;
  return /^6\d{8}$/.test(national) ? { ok: true, valeur: INDICATIF + national } : { ok: false };
}

export type PieceLue = { ok: true; valeur: string | null } | { ok: false };

/** Pièce : quatre chiffres, ou vide. */
export function lirePiece(saisie: string): PieceLue {
  const texte = saisie.trim();
  if (texte === "") return { ok: true, valeur: null };
  return /^\d{4}$/.test(texte) ? { ok: true, valeur: texte } : { ok: false };
}

/** « 2027-01-05T08:30:00.000+01:00 » -> « 08:30 » (les heures du contrat sont déjà à l'heure de Douala). */
export function heureDouala(iso: string): string {
  return iso.slice(11, 16);
}

/**
 * La planche écrit « Yaoundé · 9 pl. » pour le départ qui se remplit et « Bafoussam · 28 » pour les autres :
 * on ajoute « pl. » sous dix places (là où le bouton a la place de l'écrire).
 */
export function placesCourtes(nombre: number): boolean {
  return nombre < 10;
}

/** Ligne de cases du plan où se place l'allée : au milieu du bus. */
export function rangeeAvantAllee(nombreCases: number, colonnes: number): number {
  return Math.floor(Math.ceil(nombreCases / colonnes) / 2);
}
