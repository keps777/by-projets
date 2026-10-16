import type { Arret, CanalColis, ModeColis } from "./entites";
import type { EtatBillet } from "./etats/billet";
import type { Fcfa } from "./money";
import { arrondirAuMultiple, diviser, fcfa, pourcentage } from "./money";

/**
 * Tarifs AfriMove du document projet. Tous les montants sont des entiers en FCFA.
 */
export const TARIFS = {
  /** Facturé à l'agence par AfriMove, par billet vendu non annulé. */
  fraisAgenceBillet: 75,
  /** Facturé à l'agence par AfriMove, par colis. */
  fraisAgenceColis: 150,
  /** Payé par le voyageur en plus du billet quand il achète en ligne. */
  fraisVoyageurEnLigne: 250,
  /** Frais payés par l'expéditeur d'un colis créé dans l'app. */
  fraisColisApp: 200,
  assurance: { tauxPct: 2, minimum: 500, plafondValeur: 500_000 },
  /** Supplément pour un retrait en point relais, dont la part reversée au relais. */
  relais: { supplement: 300, partRelais: 200 },
  /** Livraison moto : prix minimum, dont la part du livreur. */
  livraison: { minimum: 1000, partLivreurPct: 70 },
  covoitParPlace: 250,
} as const;

export interface LigneDevis {
  code: string;
  libelle: string;
  montant: Fcfa;
}

export interface Devis {
  lignes: LigneDevis[];
  total: Fcfa;
}

function devis(lignes: LigneDevis[]): Devis {
  return { lignes, total: lignes.reduce((somme, l) => somme + l.montant, 0) };
}

/** Prime d'assurance : 2 % de la valeur assurée, minimum 500 F, valeur assurée plafonnée à 500 000 F. */
export function primeAssurance(valeurDeclaree: Fcfa): { valeurAssuree: Fcfa; prime: Fcfa } {
  fcfa(valeurDeclaree);
  if (valeurDeclaree <= 0) throw new RangeError("La valeur à assurer doit être positive");
  const valeurAssuree = Math.min(valeurDeclaree, TARIFS.assurance.plafondValeur);
  const prime = Math.max(
    TARIFS.assurance.minimum,
    pourcentage(valeurAssuree, TARIFS.assurance.tauxPct, "plafond"),
  );
  return { valeurAssuree, prime };
}

export interface ParamsDevisColis {
  /** Port : prix du transport du colis en gare, fixé par la ligne. */
  port: Fcfa;
  canal: CanalColis;
  mode: ModeColis;
  /** Valeur à assurer ; absent ou 0 = pas d'assurance. */
  valeurAssuree?: Fcfa;
  /** Prix de la livraison moto (mode `moto`), au minimum 1 000 F. */
  prixLivraison?: Fcfa;
}

/**
 * Prix total d'un colis, chaque ligne détaillée : port + frais app (200 F) + assurance + option
 * (relais +300 F, moto dès 1 000 F). En agence, les 150 F de frais sont à la charge de l'agence
 * (voir `factureAgence`), pas de l'expéditeur.
 */
export function devisColis(p: ParamsDevisColis): Devis {
  fcfa(p.port);
  if (p.port < 0) throw new RangeError("Port négatif");
  const lignes: LigneDevis[] = [{ code: "port", libelle: "Port", montant: p.port }];
  if (p.canal === "app") {
    lignes.push({ code: "frais_app", libelle: "Frais AfriMove", montant: TARIFS.fraisColisApp });
  }
  if (p.valeurAssuree !== undefined && p.valeurAssuree > 0) {
    lignes.push({
      code: "assurance",
      libelle: "Assurance",
      montant: primeAssurance(p.valeurAssuree).prime,
    });
  }
  if (p.mode === "relais") {
    lignes.push({
      code: "relais",
      libelle: "Retrait en point relais",
      montant: TARIFS.relais.supplement,
    });
  } else if (p.mode === "moto") {
    const livraison = p.prixLivraison ?? TARIFS.livraison.minimum;
    fcfa(livraison);
    if (livraison < TARIFS.livraison.minimum) {
      throw new RangeError(`Livraison moto : minimum ${TARIFS.livraison.minimum} F`);
    }
    lignes.push({ code: "livraison", libelle: "Livraison moto", montant: livraison });
  }
  return devis(lignes);
}

/** Répartition des 300 F du relais : 200 F au relais, le reste à AfriMove. */
export function repartitionRelais(): { voyageur: Fcfa; relais: Fcfa; afrimove: Fcfa } {
  const { supplement, partRelais } = TARIFS.relais;
  return { voyageur: supplement, relais: partRelais, afrimove: supplement - partRelais };
}

/** Répartition d'une livraison moto : 70 % au livreur (arrondi à l'inférieur), le reste à AfriMove. */
export function repartitionLivraison(prixLivraison: Fcfa): { livreur: Fcfa; afrimove: Fcfa } {
  fcfa(prixLivraison);
  if (prixLivraison < TARIFS.livraison.minimum) {
    throw new RangeError(`Livraison moto : minimum ${TARIFS.livraison.minimum} F`);
  }
  const livreur = pourcentage(prixLivraison, TARIFS.livraison.partLivreurPct, "plancher");
  return { livreur, afrimove: prixLivraison - livreur };
}

/** Billet acheté en ligne : prix du billet + 250 F de frais voyageur. */
export function devisBillet(prixBillet: Fcfa, enLigne: boolean): Devis {
  fcfa(prixBillet);
  if (prixBillet < 0) throw new RangeError("Prix de billet négatif");
  const lignes: LigneDevis[] = [{ code: "billet", libelle: "Billet", montant: prixBillet }];
  if (enLigne) {
    lignes.push({
      code: "frais_voyageur",
      libelle: "Frais de service",
      montant: TARIFS.fraisVoyageurEnLigne,
    });
  }
  return devis(lignes);
}

/** Covoiturage : prix par place fixé par le conducteur + 250 F de frais par place. */
export function devisCovoit(prixParPlace: Fcfa, places: number): Devis {
  fcfa(prixParPlace);
  if (!Number.isInteger(places) || places < 1) throw new RangeError("Nombre de places invalide");
  return devis([
    { code: "places", libelle: `${places} place(s)`, montant: prixParPlace * places },
    { code: "frais", libelle: "Frais AfriMove", montant: TARIFS.covoitParPlace * places },
  ]);
}

export interface Facture {
  billets: number;
  colis: number;
  montantBillets: Fcfa;
  montantColis: Fcfa;
  total: Fcfa;
}

/**
 * Facture hebdomadaire d'une agence : 75 F par billet et 150 F par colis. Un billet annulé n'est pas
 * facturé (il garde son numéro mais ne coûte rien), un billet seulement réservé non plus.
 */
export function factureAgence(billets: readonly { etat: EtatBillet }[], nbColis: number): Facture {
  if (!Number.isInteger(nbColis) || nbColis < 0) throw new RangeError("Nombre de colis invalide");
  const nbBillets = billets.filter((b) => b.etat !== "annule" && b.etat !== "reserve").length;
  const montantBillets = nbBillets * TARIFS.fraisAgenceBillet;
  const montantColis = nbColis * TARIFS.fraisAgenceColis;
  return {
    billets: nbBillets,
    colis: nbColis,
    montantBillets,
    montantColis,
    total: montantBillets + montantColis,
  };
}

export const ARRONDI_PRORATA = 100;

export interface ParamsProrata {
  /** Arrêts de la ligne dans l'ordre, origine et terminus compris. */
  arrets: readonly Arret[];
  /** Prix du trajet complet (origine → terminus). */
  prixTrajetComplet: Fcfa;
  depuisArretId: string;
  versArretId: string;
  /** Arrondi du prix au multiple de ce pas (100 F par défaut). */
  arrondi?: number;
  /** Prix fixés à la main par l'agence, clé `depuisId>versId` : ils l'emportent sur le calcul. */
  prixFixes?: Readonly<Record<string, Fcfa>>;
}

/**
 * Prix d'un trajet partiel au prorata des kilomètres entre arrêts, arrondi au multiple de 100 F le
 * plus proche, jamais au-dessus du prix du trajet complet.
 */
export function prixProrata(p: ParamsProrata): Fcfa {
  const depuis = p.arrets.findIndex((a) => a.id === p.depuisArretId);
  const vers = p.arrets.findIndex((a) => a.id === p.versArretId);
  if (depuis < 0 || vers < 0) throw new RangeError("Arrêt inconnu sur cette ligne");
  if (depuis >= vers) throw new RangeError("L'arrêt de montée doit précéder l'arrêt de descente");
  const fixe = p.prixFixes?.[`${p.depuisArretId}>${p.versArretId}`];
  if (fixe !== undefined) return fcfa(fixe);
  const a = p.arrets[depuis]!;
  const b = p.arrets[vers]!;
  const premier = p.arrets[0]!;
  const dernier = p.arrets[p.arrets.length - 1]!;
  const kmTotal = dernier.kmDepuisOrigine - premier.kmDepuisOrigine;
  if (kmTotal <= 0) throw new RangeError("Distance de ligne invalide");
  const km = b.kmDepuisOrigine - a.kmDepuisOrigine;
  fcfa(p.prixTrajetComplet);
  const brut = diviser(p.prixTrajetComplet * km, kmTotal, "proche");
  const arrondi = arrondirAuMultiple(brut, p.arrondi ?? ARRONDI_PRORATA, "proche");
  return Math.min(arrondi, p.prixTrajetComplet);
}
