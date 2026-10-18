import type { agence as contrats } from "@afrimove/contrats";
import type { EntreeFile, EvenementFile, MoteurSync } from "@afrimove/sync";

/**
 * Les ventes faites sur cet appareil que le serveur ne connaît pas encore : celles de la file de synchronisation
 * (statut « en attente »). L'écran de vente, l'accueil et la cadence s'en servent pour ne pas proposer deux fois le
 * même siège et pour compter ce qui vient d'être vendu, avant même que le serveur l'ait reçu.
 */

type Donnees = contrats.EvenementDe<typeof contrats.EVENEMENT_BILLET_VENDU>["donnees"];
type DonneesCadence = contrats.EvenementDe<
  typeof contrats.EVENEMENT_BILLET_VENDU_CADENCE
>["donnees"];

export interface VenteEnFile {
  evenementId: string;
  type: "billet.vendu" | "billet.vendu_cadence";
  /** Rang de la vente dans la plage de l'appareil. */
  numeroPlage: number | null;
  at: string;
  billetId: string;
  departId: string;
  siege: number | null;
  classe: "classique" | "vip";
  prix: number;
  bagage: number;
  paiement: Donnees["paiement"];
  codeBillet: string;
  telephone: string | null;
  nom: string | null;
  pieceQuatreDerniers: string | null;
}

/** La vente que décrit cet événement, ou `null` si ce n'est pas une vente de billet. */
export function venteDeEvenement(e: EvenementFile): VenteEnFile | null {
  if (e.type === "billet.vendu") {
    const d = e.donnees as Donnees;
    return {
      evenementId: e.id,
      type: "billet.vendu",
      numeroPlage: e.numeroPlage,
      at: e.at,
      billetId: d.billetId,
      departId: d.departId,
      siege: d.siege,
      classe: d.classe,
      prix: d.prix,
      bagage: d.bagage,
      paiement: d.paiement,
      codeBillet: d.codeBillet,
      telephone: d.passager.telephone,
      nom: d.passager.nom,
      pieceQuatreDerniers: d.passager.pieceQuatreDerniers,
    };
  }
  if (e.type === "billet.vendu_cadence") {
    const d = e.donnees as DonneesCadence;
    return {
      evenementId: e.id,
      type: "billet.vendu_cadence",
      numeroPlage: e.numeroPlage,
      at: e.at,
      billetId: d.billetId,
      departId: d.departId,
      siege: d.siege,
      classe: "classique",
      prix: d.prix,
      bagage: 0,
      paiement: d.paiement,
      codeBillet: d.codeBillet,
      telephone: d.telephone,
      nom: null,
      pieceQuatreDerniers: null,
    };
  }
  return null;
}

export function venteDe(entree: EntreeFile): VenteEnFile | null {
  return venteDeEvenement(entree.evenement);
}

/** Les ventes en attente d'envoi, dans l'ordre de la file. */
export async function ventesEnAttente(moteur: MoteurSync): Promise<VenteEnFile[]> {
  const file = await moteur.lireFile({ statut: "en_attente" });
  return file.flatMap((entree) => {
    const vente = venteDe(entree);
    return vente ? [vente] : [];
  });
}

/** Espèces réellement gardées en caisse par une vente : ce que le voyageur doit, hors monnaie rendue. */
export function cashDeLaVente(v: Pick<VenteEnFile, "prix" | "bagage" | "paiement">): number {
  return v.paiement.mode === "cash" ? v.prix + v.bagage : 0;
}

/**
 * QR d'un billet imprimé sans réseau. Le vrai QR est **signé par le serveur** (clé privée qui ne quitte pas le
 * serveur) : un téléphone ne peut pas le fabriquer. Ce contenu porte le numéro et le code du billet, sans signature
 * (préfixe `AM0`, « non signé ») : le contrôle au quai ne l'accepte pas comme un QR signé, le voyageur est embarqué
 * par son code à 4 chiffres, qui est sur le billet.
 */
export function qrHorsLigne(numero: string, codeBillet: string, departId: string): string {
  return `AM0:${numero}:${codeBillet}:${departId}`;
}

export interface DepartConnu {
  destination: string;
  heureDepart: string;
}

export interface IdentiteAgence {
  compagnie: string;
  gare: string;
}

/** Le billet imprimable d'une vente faite sans réseau, avec ce que l'appareil sait de l'agence et du départ. */
export function billetLocal(
  vente: VenteEnFile,
  numero: string,
  identite: IdentiteAgence,
  depart: DepartConnu | null,
): contrats.BilletImprimable {
  return {
    billetId: vente.billetId,
    numero,
    sequence: vente.numeroPlage ?? 1,
    compagnie: identite.compagnie,
    trajet: { origine: identite.gare, destination: depart?.destination ?? "—" },
    heureDepart: depart?.heureDepart ?? vente.at,
    siege: vente.siege,
    classe: vente.classe,
    passager: { nom: vente.nom, pieceQuatreDerniers: vente.pieceQuatreDerniers },
    codeBillet: vente.codeBillet,
    qr: qrHorsLigne(numero, vente.codeBillet, vente.departId),
    prix: vente.prix,
    aCompleterAuQuai: vente.type === "billet.vendu_cadence",
  };
}
