import { ErreurColis } from "../colis/erreurs";

/**
 * Erreurs métier des vendeurs. Le corps est `{ code, message, details? }` (celui du module colis),
 * que lit le client d'API (`ErreurHttp.code`). Codes en minuscules, comme les routes voyageur.
 */

export const vendeurIntrouvable = (): ErreurColis =>
  new ErreurColis(404, "vendeur_introuvable", "Vous n'êtes pas encore agréé comme vendeur");

export const vendeurSuspendu = (): ErreurColis =>
  new ErreurColis(403, "vendeur_suspendu", "Votre compte vendeur est suspendu");

export const aucunAgrement = (): ErreurColis =>
  new ErreurColis(403, "aucun_agrement", "Aucune agence ne vous a agréé pour le moment");

export const compagnieNonAgreee = (): ErreurColis =>
  new ErreurColis(403, "compagnie_non_agreee", "Cette agence ne vous a pas agréé : vente refusée");

export const departIntrouvable = (): ErreurColis =>
  new ErreurColis(404, "depart_introuvable", "Départ introuvable");

export const departFerme = (): ErreurColis =>
  new ErreurColis(409, "depart_ferme", "Ce départ n'est plus ouvert à la vente");

export const departComplet = (): ErreurColis =>
  new ErreurColis(409, "depart_complet", "Départ complet");

export const moyenIndisponible = (): ErreurColis =>
  new ErreurColis(
    422,
    "moyen_indisponible",
    "Le règlement de l'agence se fait par MTN MoMo ou Orange Money",
  );

export const venteEnCours = (): ErreurColis =>
  new ErreurColis(
    409,
    "vente_en_cours",
    "Une vente attend encore son règlement : terminez-la avant d'en faire une autre",
  );

export const reglementRefuse = (cause: string): ErreurColis =>
  new ErreurColis(
    402,
    "reglement_refuse",
    "Le paiement de l'agence n'a pas abouti. Rends son argent au voisin : aucun billet n'est émis",
    { cause },
  );

export const reglementEnAttente = (): ErreurColis =>
  new ErreurColis(
    409,
    "reglement_en_attente",
    "Le paiement n'est pas encore confirmé. Le billet part par SMS dès que l'agence est payée",
  );

export const demandeInvalide = (code: string, message: string, statut = 422): ErreurColis =>
  new ErreurColis(statut, code, message);

export const agrementInconnu = (): ErreurColis =>
  new ErreurColis(404, "agrement_introuvable", "Ce vendeur n'est pas agréé par votre agence");
