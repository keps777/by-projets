import { TARIFS, arrondirAuMultiple, primeAssurance } from "@afrimove/domain";

/** Formats et calculs du dépôt prépayé (Depot.dc.html). Aucun accès réseau : tout se teste seul. */

/** `+237691221008` -> `6 91 22 10 08` (le format de la planche). */
export function formaterTelephone(telephone: string): string {
  const chiffres = telephone.replace(/\D/g, "");
  const local = chiffres.startsWith("237") && chiffres.length === 12 ? chiffres.slice(3) : chiffres;
  if (local.length !== 9) return telephone;
  return `${local.slice(0, 1)} ${local.slice(1, 3)} ${local.slice(3, 5)} ${local.slice(5, 7)} ${local.slice(7, 9)}`;
}

/** `2200` -> `2 200` (espace simple, comme la planche). */
export function formaterMontant(montant: number): string {
  return String(Math.trunc(montant)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** `2.1` -> `2,1`, `2` -> `2` : virgule décimale, pas de zéro inutile. */
export function formaterKilos(kg: number): string {
  return String(Math.round(kg * 100) / 100).replace(".", ",");
}

/** `2027-01-05T07:40:00.000+01:00` -> `07:40` : les heures de l'API portent déjà le décalage de Douala. */
export function heureDouala(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}

/** Poids tapé au clavier (`2,1`, `2.1`, ` 3 `) -> nombre, ou `null` s'il n'est pas utilisable. */
export function lirePoids(saisie: string): number | null {
  const texte = saisie.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(texte)) return null;
  const valeur = Number(texte);
  return valeur > 0 ? valeur : null;
}

/** Le code tel que la recherche le veut : sans espaces autour, en capitales. */
export function normaliserCode(saisie: string): string {
  return saisie.trim().toUpperCase();
}

export interface ControlePoids {
  /** Poids relevé moins poids déclaré, en kg (négatif si plus léger). */
  ecartKg: number;
  /** Au-delà du seuil (1 kg) : le client paie un complément. */
  complementRequis: boolean;
}

export function controlerPoids(
  poidsReleveKg: number,
  poidsDeclareKg: number,
  seuilKg: number,
): ControlePoids {
  const ecartKg = Math.round((poidsReleveKg - poidsDeclareKg) * 1000) / 1000;
  return { ecartKg, complementRequis: ecartKg > seuilKg };
}

export interface ParamsComplement {
  /** Montant payé dans l'app (port + frais AfriMove + assurance). */
  payeDansApp: number;
  assure: boolean;
  valeurDeclaree: number;
  poidsDeclareKg: number;
  ecartKg: number;
}

/**
 * Complément de poids, en FCFA : le port payé (total moins les 200 F de frais AfriMove et la prime d'assurance)
 * ramené au kilo déclaré, multiplié par le poids en trop, arrondi à 50 F au-dessus.
 *
 * Le domaine ne fixe aucun tarif au kilo : cette règle proportionnelle est un choix du dépôt (à valider par Luther).
 */
export function calculerComplement(p: ParamsComplement): number {
  if (p.ecartKg <= 0 || p.poidsDeclareKg <= 0) return 0;
  const prime = p.assure && p.valeurDeclaree > 0 ? primeAssurance(p.valeurDeclaree).prime : 0;
  const port = Math.max(0, p.payeDansApp - TARIFS.fraisColisApp - prime);
  const brut = Math.ceil((port / p.poidsDeclareKg) * p.ecartKg);
  return arrondirAuMultiple(brut, 50, "plafond");
}

/** « C-ALP-DLA-270105-0017 » -> `DLA` : la gare est le dernier code de lettres avant la date. */
export function gareDuNumero(numero: string): string {
  return /([A-Z]{3})-\d{6}-\d{4}$/.exec(numero)?.[1] ?? "";
}

/** `Bafoussam` -> `BAF` : trois premières lettres, sans accent. */
export function codeVille(ville: string): string {
  return ville
    .normalize("NFD")
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 3)
    .toUpperCase();
}
