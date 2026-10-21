import { Injectable } from "@nestjs/common";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import { BilletsService, entreeHistorique } from "../billetterie/billets.service";
import { exigerSiegeExistant } from "../billetterie/controles";
import { conflit, inconnu, interdit, invalide } from "../billetterie/erreurs";
import type { Billet, DepartComplet, Passager } from "../billetterie/modeles";
import { Passagers } from "../billetterie/passagers";
import { Billets, Catalogue, EvenementsTraites } from "../billetterie/ports";
import { numeroBillet, type EtatDepart } from "../billetterie/regles";
import type { EvenementRecu, PaiementRecu } from "../billetterie/schemas";
import { Serialiseur } from "../billetterie/serialiser";
import { SiegesService } from "../billetterie/sieges.service";
import { MS_PAR_HEURE, aammjjDouala, versIsoDouala } from "../billetterie/temps";
import { dansLaPlageBord, paiementCoherent } from "./regles";

type Enveloppe = Pick<EvenementRecu<string, unknown>, "id" | "type" | "auteurId" | "at">;
export type Accuse = { evenementId: string; statut: "accepte" | "deja_recu"; recuA: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un identifiant que la base range dans une colonne UUID : un autre format est refusé net (422). */
export function exigerUuid(valeur: string, champ: string): void {
  if (!UUID.test(valeur)) {
    throw invalide("IDENTIFIANT_INVALIDE", `${champ} : un UUID est attendu`, { champ });
  }
}

/**
 * Idempotence des événements du bord : l'UUID de l'événement est la clé. Rejouer un événement ne refait rien
 * et renvoie la même réponse avec `statut: "deja_recu"`. Même mécanique que la billetterie
 * (`AgenceService.evenement`) et mêmes tables (`EvenementsTraites` : la réponse est mémorisée chiffrée).
 * L'auteur doit être le compte connecté : un appareil ne signe pas pour un autre. Un événement refusé n'est
 * pas mémorisé (il peut être renvoyé après correction).
 */
@Injectable()
export class EvenementsBord {
  private readonly serie = new Serialiseur();

  constructor(
    private readonly traites: EvenementsTraites,
    private readonly passagers: Passagers,
    private readonly sieges: SiegesService,
  ) {}

  maintenant(): string {
    return this.sieges.maintenant();
  }

  executer<R extends object>(
    u: Utilisateur,
    evt: Enveloppe,
    produire: () => Promise<R>,
  ): Promise<R & { accuse: Accuse }> {
    if (evt.auteurId !== u.id) {
      throw interdit("AUTEUR_INCOHERENT", "L'auteur de l'événement n'est pas le compte connecté");
    }
    return this.serie.executer(`evenement:${evt.id}`, async () => {
      const deja = await this.traites.trouver(evt.id);
      if (deja) {
        const reponse = this.passagers.dechiffrerReponse<R & { accuse: Accuse }>(
          deja.reponseChiffree,
        );
        return { ...reponse, accuse: { ...reponse.accuse, statut: "deja_recu" as const } };
      }
      const recuA = this.maintenant();
      const resultat = await produire();
      const reponse = {
        ...resultat,
        accuse: { evenementId: evt.id, statut: "accepte" as const, recuA },
      };
      await this.traites.memoriser({
        id: evt.id,
        type: evt.type,
        recuA,
        reponseChiffree: this.passagers.chiffrerReponse(reponse),
      });
      return reponse;
    });
  }
}

export type RoleEquipage = "convoyeur" | "chauffeur";

const LIBELLE_ROLE: Readonly<Record<RoleEquipage, string>> = {
  convoyeur: "convoyeur",
  chauffeur: "chauffeur",
};

/** Retrouve le départ d'un équipage et vérifie qu'il en fait partie. */
@Injectable()
export class DepartsBord {
  constructor(
    private readonly catalogue: Catalogue,
    private readonly horloge: Horloge,
  ) {}

  /** Un départ de la compagnie de l'agent. */
  async deLAgence(u: Utilisateur, departId: string): Promise<DepartComplet> {
    const dc = await this.catalogue.depart(departId);
    if (!dc || dc.compagnie.id !== u.compagnieId) {
      throw inconnu("DEPART_INCONNU", "Départ introuvable");
    }
    return dc;
  }

  /** L'agent est bien le convoyeur (ou le chauffeur) de ce départ. */
  exigerEquipage(dc: DepartComplet, role: RoleEquipage, u: Utilisateur): void {
    const membre = role === "convoyeur" ? dc.depart.convoyeur : dc.depart.chauffeur;
    if (!membre || membre.id !== u.id) {
      throw interdit("AUTRE_EQUIPAGE", `Tu n'es pas le ${LIBELLE_ROLE[role]} de ce départ`);
    }
  }

  exigerEtat(dc: DepartComplet, etats: readonly EtatDepart[], message: string): void {
    if (!etats.includes(dc.depart.etat)) {
      throw conflit("DEPART_HORS_ROUTE", message, { etat: dc.depart.etat });
    }
  }

  /** Le départ de l'équipage : celui demandé, sinon le bus en route, sinon l'embarquement, sinon le prochain. */
  async deLEquipage(
    u: Utilisateur,
    role: RoleEquipage,
    departId: string | undefined,
  ): Promise<DepartComplet> {
    if (departId) {
      const dc = await this.deLAgence(u, departId);
      this.exigerEquipage(dc, role, u);
      return dc;
    }
    if (!u.compagnieId)
      throw interdit("COMPAGNIE_REQUISE", "Ce compte n'est rattaché à aucune compagnie");
    const maintenant = this.horloge.maintenant().getTime();
    const candidats = (
      await this.catalogue.departs({
        compagnieId: u.compagnieId,
        etats: ["en_vente", "embarquement", "retarde", "parti"],
        de: versIsoDouala(maintenant - 24 * MS_PAR_HEURE),
        avant: versIsoDouala(maintenant + 12 * MS_PAR_HEURE),
      })
    ).filter((c) => {
      const membre = role === "convoyeur" ? c.depart.convoyeur : c.depart.chauffeur;
      return membre?.id === u.id && c.bus !== null;
    });
    const parti = candidats.filter((c) => c.depart.etat === "parti").reverse()[0];
    const choix =
      parti ??
      candidats.find((c) => c.depart.etat === "embarquement") ??
      candidats.find((c) => c.depart.etat !== "retarde") ??
      candidats[0];
    if (!choix) throw inconnu("AUCUN_DEPART", "Aucun départ à bord pour le moment");
    return choix;
  }
}

export interface EnveloppeVente {
  id: string;
  at: string;
  appareilId: string;
  numeroPlage: number;
}

/**
 * Un billet vendu à bord : par le convoyeur en route, ou par le contrôleur qui régularise un voyageur sans
 * billet. Numéroté dans la plage du bord (3001–3999), payé, au siège du voyageur, et le voyageur est déjà
 * dans le bus : le billet passe tout de suite à « embarqué ».
 */
@Injectable()
export class VentesBord {
  constructor(
    private readonly catalogue: Catalogue,
    private readonly billets: Billets,
    private readonly billetsService: BilletsService,
    private readonly passagers: Passagers,
  ) {}

  async vendre(
    u: Utilisateur,
    evt: EnveloppeVente,
    a: {
      dc: DepartComplet;
      billetId: string;
      siege: number;
      prix: number;
      passager: Passager;
      paiement: PaiementRecu;
      codeBillet: string;
    },
  ): Promise<Billet> {
    // Un événement qui a déjà créé son billet (réponse perdue avant la mémorisation) le retrouve ici.
    const deja = await this.billets.parEvenement(evt.id);
    if (deja) return deja;

    if (!dansLaPlageBord(evt.numeroPlage)) {
      throw invalide(
        "NUMERO_HORS_PLAGE",
        "Ce numéro n'est pas dans la plage du bord (3001 à 3999)",
        {
          numero: evt.numeroPlage,
        },
      );
    }
    exigerSiegeExistant(a.dc, a.siege);
    if (!paiementCoherent(a.paiement, a.prix)) {
      throw invalide(
        "PAIEMENT_INVALIDE",
        "Le montant reçu et la monnaie rendue ne correspondent pas au prix",
        { du: a.prix, recu: a.paiement.recu, rendu: a.paiement.rendu },
      );
    }
    if (!u.gareId) throw interdit("GARE_REQUISE", "Ce compte n'est rattaché à aucune gare");
    const gare = await this.catalogue.gare(u.gareId);
    if (!gare || gare.compagnieId !== a.dc.compagnie.id) {
      throw interdit("AUTRE_GARE", "Ta gare n'appartient pas à la compagnie de ce départ");
    }
    const billet: Billet = {
      id: a.billetId,
      numero: numeroBillet({
        agence: a.dc.compagnie.code,
        gare: gare.code,
        aammjj: aammjjDouala(evt.at),
        sequence: evt.numeroPlage,
      }),
      sequence: evt.numeroPlage,
      compagnieId: a.dc.compagnie.id,
      gareId: gare.id,
      departId: a.dc.depart.id,
      siege: a.siege,
      classe: a.dc.depart.classe,
      prix: a.prix,
      bagage: 0,
      canal: "convoyeur",
      guichetId: null,
      acheteurId: null,
      commandeId: null,
      passagerChiffre: this.passagers.chiffrer(a.passager),
      passagerTelephoneIndex: this.passagers.indexTelephone(a.passager.telephone),
      codeBillet: a.codeBillet,
      qr: "",
      creeA: evt.at,
      etat: "paye",
      historique: [entreeHistorique("payer", "reserve", "paye", evt.at, u.id)],
      evenementId: evt.id,
      appareilId: evt.appareilId,
      auteurId: u.id,
      paiement: { mode: a.paiement.mode, reference: a.paiement.reference },
      aCompleterAuQuai: false,
      smsEnvoye: false,
      retardPrevenu: false,
      embarqueA: null,
      reporteDe: null,
    };
    const enregistre = await this.billetsService.enregistrer(billet, null);
    // Le voyageur est déjà à bord : le billet n'attend pas d'être scanné.
    return (await this.billetsService.embarquer(enregistre, evt.at, u.id)) ?? enregistre;
  }
}
