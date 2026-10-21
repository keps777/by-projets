import type { agence as c } from "@afrimove/contrats";
import { PIED_BILLET, type DonneesBillet } from "./billet";
import { MENTION_ETIQUETTE, type DonneesEtiquette } from "./etiquette";

const ISO_DOUALA = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

function decomposer(iso: string) {
  const m = ISO_DOUALA.exec(iso);
  if (!m) throw new Error(`Heure illisible : ${iso}`);
  return {
    aa: (m[1] ?? "").slice(2),
    mm: m[2] ?? "",
    jj: m[3] ?? "",
    heure: m[4] ?? "",
    min: m[5] ?? "",
  };
}

/** « 08:15 » : l'heure de Douala telle qu'écrite dans l'ISO (le décalage est toujours +01:00). */
export function heureCourte(iso: string): string {
  const { heure, min } = decomposer(iso);
  return `${heure}:${min}`;
}

/** « 05:30 · 05.01.27 », la ligne d'horaire du billet. */
export function departBillet(iso: string): string {
  const { heure, min, jj, mm, aa } = decomposer(iso);
  return `${heure}:${min} · ${jj}.${mm}.${aa}`;
}

/** « 4 kg », « 2,5 kg » : le poids tel que l'écran l'écrit. */
export function poidsAffiche(kg: number): string {
  return `${String(kg).replace(".", ",")} kg`;
}

/** « DLA → YDE » : villes abrégées reliées par la flèche des maquettes (imprimée « -> »). */
export function trajetAffiche(origine: string, destination: string): string {
  return `${origine} → ${destination}`;
}

/** Billet du contrat d'API -> données du gabarit (même contenu que l'aperçu de la planche CadenceBillet). */
export function donneesBilletDepuisContrat(
  billet: c.BilletImprimable,
  options: { pied?: string } = {},
): DonneesBillet {
  return {
    compagnie: billet.compagnie.toUpperCase(),
    trajet: trajetAffiche(billet.trajet.origine, billet.trajet.destination),
    depart: departBillet(billet.heureDepart),
    siege: billet.siege === null ? null : String(billet.siege),
    classe: billet.classe.toUpperCase(),
    nom: billet.passager.nom,
    piece: billet.passager.pieceQuatreDerniers,
    qr: billet.qr,
    code: billet.codeBillet,
    numero: billet.numero,
    pied: options.pied ?? PIED_BILLET,
  };
}

/** Ce que l'écran sait en plus de l'étiquette du contrat pour imprimer le colis. */
export interface ComplementEtiquette {
  /** Numéro du colis, « C-ALP-DLA-270105-0042 ». */
  reference: string;
  /** Nom du destinataire, « Ngo Thérèse ». */
  destinataireNom: string;
  /** Compagnie en bas de l'étiquette, « Alpha Voyages ». */
  compagnie: string;
}

/** Étiquette du contrat d'API -> données du gabarit. Le code de retrait n'est ni lu ni transmis. */
export function donneesEtiquetteDepuisContrat(
  etiquette: {
    trajet: { origine: string; destination: string };
    destinataireMasque: string;
    poidsKg: number;
    heureDepart: string;
  },
  complement: ComplementEtiquette,
): DonneesEtiquette {
  return {
    trajet: trajetAffiche(etiquette.trajet.origine, etiquette.trajet.destination),
    destinataire: `${complement.destinataireNom} · ${etiquette.destinataireMasque}`,
    reference: complement.reference,
    poids: poidsAffiche(etiquette.poidsKg),
    heure: heureCourte(etiquette.heureDepart),
    mention: `${complement.compagnie} · ${MENTION_ETIQUETTE}`,
  };
}
