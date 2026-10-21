import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import { BilletsService, entreeHistorique } from "./billets.service";
import { exigerSiegeExistant, exigerVendable } from "./controles";
import { DepartsService } from "./departs.service";
import { Refus, conflit, inconnu, interdit, invalide } from "./erreurs";
import type { Billet, DepartComplet, Passager, ResultatScan, ScanStocke } from "./modeles";
import {
  Billets,
  Catalogue,
  ColisDuDepart,
  DiffusionTempsReel,
  EvenementsTraites,
  Scans,
  SignataireQr,
} from "./ports";
import { Passagers } from "./passagers";
import {
  genererCodeBilletUnique,
  plageGuichet,
  numeroBillet,
  type ClasseBillet,
  type Plage,
} from "./regles";
import type { EvenementRecu, PaiementRecu } from "./schemas";
import type {
  lireBilletComplete,
  lireBilletVendu,
  lireBilletVenduCadence,
  lireQuaiCodeSaisi,
  lireQuaiLibere,
  lireQuaiListeEnvoyee,
  lireQuaiScanne,
  lireTelephoneAjoute,
} from "./schemas";
import { Serialiseur } from "./serialiser";
import { SiegesService } from "./sieges.service";
import { MS_PAR_HEURE, MS_PAR_MINUTE, aammjjDouala, enMs, versIsoDouala } from "./temps";
import { billetImprimable, capaciteDe, departResume, scanQuai } from "./vues";

/** Départs listés sur l'écran de vente (les autres sont comptés dans « + N »). */
export const LIMITE_DEPARTS_VENTE = 3;

/** À l'approche du départ, les voyageurs payés qui ne sont pas montés sont « absents ». */
export const ABSENTS_DES_MINUTES = 15;

export const canalQuai = (departId: string): string => `quai:${departId}`;

type Evt<F> = F extends (v: unknown, c: string) => infer R ? R : never;
export type EvenementVente = Evt<typeof lireBilletVendu>;
export type EvenementVenteCadence = Evt<typeof lireBilletVenduCadence>;
export type EvenementTelephone = Evt<typeof lireTelephoneAjoute>;
export type EvenementComplete = Evt<typeof lireBilletComplete>;
export type EvenementScan = Evt<typeof lireQuaiScanne>;
export type EvenementCode = Evt<typeof lireQuaiCodeSaisi>;
export type EvenementLibere = Evt<typeof lireQuaiLibere>;
export type EvenementListe = Evt<typeof lireQuaiListeEnvoyee>;

type Enveloppe = Pick<EvenementRecu<string, unknown>, "id" | "type" | "auteurId" | "at">;
type Accuse = { evenementId: string; statut: "accepte" | "deja_recu"; recuA: string };

/** Message du canal temps réel du quai (contrat `SchemaMessageQuai`). */
export interface MessageQuaiDirect {
  departId: string;
  at: string;
  scan: ReturnType<typeof scanQuai> | null;
  embarques: number;
  capacite: number;
}

const roleDeCanal = (role: string): Billet["canal"] =>
  role === "convoyeur" ? "convoyeur" : role === "vendeur" ? "vendeur" : "guichet";

/**
 * Ce que font les agents de l'agence : vendre un billet au guichet, scanner au quai, saisir un code,
 * libérer le siège d'un absent, envoyer la liste au chauffeur. Chaque écriture est un événement
 * créé sur l'appareil ; son UUID est la clé d'idempotence : le rejouer ne refait rien et renvoie la
 * même réponse avec `statut: "deja_recu"`.
 */
@Injectable()
export class AgenceService {
  private readonly serie = new Serialiseur();

  constructor(
    private readonly catalogue: Catalogue,
    private readonly billets: Billets,
    private readonly billetsService: BilletsService,
    private readonly departs: DepartsService,
    private readonly sieges: SiegesService,
    private readonly scans: Scans,
    private readonly traites: EvenementsTraites,
    private readonly passagers: Passagers,
    private readonly signataire: SignataireQr,
    private readonly colis: ColisDuDepart,
    private readonly diffusion: DiffusionTempsReel,
    private readonly horloge: Horloge,
  ) {}

  /* -------------------------------------------------------------- idempotence */

  /**
   * Exécute `produire` une seule fois par identifiant d'événement. L'auteur doit être le compte
   * connecté : un appareil ne signe pas pour un autre. Un événement refusé n'est pas mémorisé (il
   * peut être renvoyé après correction) ; un événement accepté est mémorisé avec sa réponse.
   */
  private evenement<R extends object>(
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
      const recuA = this.sieges.maintenant();
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

  /* -------------------------------------------------------------- contrôles communs */

  private async departDeLAgence(u: Utilisateur, departId: string): Promise<DepartComplet> {
    const dc = await this.catalogue.depart(departId);
    if (!dc || dc.compagnie.id !== u.compagnieId) {
      throw inconnu("DEPART_INCONNU", "Départ introuvable");
    }
    return dc;
  }

  private async billetDeLAgence(u: Utilisateur, billetId: string): Promise<Billet> {
    const b = await this.billets.trouver(billetId);
    if (!b || b.compagnieId !== u.compagnieId) {
      throw inconnu("BILLET_INCONNU", "Billet introuvable");
    }
    return b;
  }

  /** Plage de numéros du guichet de l'agent : 0001–0999, 1001–1999, 2001–2999. */
  private async plageDe(
    u: Utilisateur,
  ): Promise<{ guichetId: string | null; plage: Plage | null }> {
    const guichet = await this.catalogue.guichetDe(u.id);
    if (!guichet) return { guichetId: null, plage: null };
    try {
      return { guichetId: guichet.id, plage: plageGuichet(guichet.rang) };
    } catch {
      return { guichetId: guichet.id, plage: null };
    }
  }

  private verifierPaiement(paiement: PaiementRecu, du: number): void {
    if (paiement.mode === "cash") {
      if (paiement.recu < du || paiement.rendu !== paiement.recu - du) {
        throw invalide(
          "PAIEMENT_INVALIDE",
          "Le montant reçu et la monnaie rendue ne correspondent pas au prix",
          {
            du,
            recu: paiement.recu,
            rendu: paiement.rendu,
          },
        );
      }
    } else if (paiement.rendu !== 0 || (paiement.recu !== 0 && paiement.recu !== du)) {
      // Le contrat dit « `recu` et `rendu` ne servent qu'au cash (0 sinon) » et l'écran de vente envoie 0 pour un
      // paiement mobile : l'API refusait ces ventes (422), constat de la recette AM-181. Un mobile se règle du montant
      // exact : `recu` vaut donc 0 (contrat) ou le montant dû (les écrans du convoyeur et du contrôleur l'envoient).
      throw invalide("PAIEMENT_INVALIDE", "Un paiement mobile doit être du montant exact", { du });
    }
  }

  private async creerBilletDeLAgence(
    u: Utilisateur,
    evt: Pick<EvenementVente, "id" | "at" | "appareilId" | "numeroPlage">,
    a: {
      dc: DepartComplet;
      billetId: string;
      siege: number | null;
      classe: ClasseBillet;
      prix: number;
      bagage: number;
      passager: Passager;
      paiement: PaiementRecu;
      codeBillet: string;
      aCompleterAuQuai: boolean;
    },
    /** Faux pour une vente hors ligne rejouée : le numéro est déjà imprimé, la plage n'est qu'un signalement. */
    controlerPlage = true,
  ): Promise<Billet> {
    if (!u.gareId) throw interdit("GARE_REQUISE", "Ce compte n'est rattaché à aucune gare");
    const gare = await this.catalogue.gare(u.gareId);
    if (!gare || gare.compagnieId !== a.dc.compagnie.id) {
      throw interdit("AUTRE_GARE", "Ta gare n'appartient pas à la compagnie de ce départ");
    }
    const sequence = evt.numeroPlage as number;
    const { guichetId, plage } = await this.plageDe(u);
    if (controlerPlage && plage && (sequence < plage.debut || sequence > plage.fin)) {
      throw invalide("NUMERO_HORS_PLAGE", "Ce numéro n'est pas dans la plage de ton guichet", {
        plage,
        numero: sequence,
      });
    }
    const at = evt.at;
    return {
      id: a.billetId,
      numero: numeroBillet({
        agence: a.dc.compagnie.code,
        gare: gare.code,
        aammjj: aammjjDouala(at),
        sequence,
      }),
      sequence,
      compagnieId: a.dc.compagnie.id,
      gareId: gare.id,
      departId: a.dc.depart.id,
      siege: a.siege,
      classe: a.classe,
      prix: a.prix,
      bagage: a.bagage,
      canal: roleDeCanal(u.role),
      guichetId,
      acheteurId: null,
      commandeId: null,
      passagerChiffre: this.passagers.chiffrer(a.passager),
      passagerTelephoneIndex: this.passagers.indexTelephone(a.passager.telephone),
      codeBillet: a.codeBillet,
      qr: "",
      creeA: at,
      etat: "paye",
      historique: [entreeHistorique("payer", "reserve", "paye", at, u.id)],
      evenementId: evt.id,
      appareilId: evt.appareilId,
      auteurId: u.id,
      paiement: { mode: a.paiement.mode, reference: a.paiement.reference },
      aCompleterAuQuai: a.aCompleterAuQuai,
      smsEnvoye: false,
      retardPrevenu: false,
      embarqueA: null,
      reporteDe: null,
    };
  }

  /* -------------------------------------------------------------- vente au guichet */

  /** `billet.vendu` : un billet nominatif, vendu au guichet, payé, siège choisi. */
  vendre(u: Utilisateur, evt: EvenementVente) {
    return this.evenement(u, evt, async () => {
      const d = evt.donnees;
      const dc = await this.departDeLAgence(u, d.departId);
      exigerVendable(dc);
      if (d.siege !== null) exigerSiegeExistant(dc, d.siege);
      const tarifs = dc.ligne.tarifs;
      if (d.prix !== tarifs[d.classe] || (d.bagage !== 0 && d.bagage !== tarifs.bagage)) {
        throw invalide("PRIX_INCOHERENT", "Le prix ne correspond pas au tarif de la ligne", {
          attendu: { prix: tarifs[d.classe], bagage: tarifs.bagage },
        });
      }
      this.verifierPaiement(d.paiement, d.prix + d.bagage);
      const billet = await this.creerBilletDeLAgence(u, evt, {
        dc,
        billetId: d.billetId,
        siege: d.siege,
        classe: d.classe,
        prix: d.prix,
        bagage: d.bagage,
        passager: {
          nom: d.passager.nom,
          telephone: d.passager.telephone,
          pieceQuatreDerniers: d.passager.pieceQuatreDerniers,
        },
        paiement: d.paiement,
        codeBillet: d.codeBillet,
        aCompleterAuQuai: false,
      });
      const enregistre = await this.billetsService.enregistrer(billet, null);
      return {
        billet: billetImprimable(
          enregistre,
          this.passagers.dechiffrer(enregistre.passagerChiffre),
          dc,
        ),
      };
    });
  }

  /**
   * Une vente faite hors ligne, rejouée par la synchronisation (`POST /sync/evenements`) : la **même** création
   * de billet que `vendre` / `vendreCadence`, avec la même clé d'idempotence (`evenement_traite`) : si la vente est
   * déjà passée par `/agence/billets`, ou si la synchronisation est rejouée, rien n'est refait.
   *
   * La vente est déjà faite : le billet est imprimé, l'argent encaissé. Elle n'est donc **jamais refusée pour un
   * motif métier** (départ fermé depuis, prix ou paiement qui ne collent pas au tarif d'aujourd'hui, numéro hors
   * plage) : l'anomalie est rendue dans `synchro.anomalies` et la synchronisation la signale. Seuls les cas où aucun
   * billet ne peut exister lèvent un refus : départ inconnu ou d'une autre compagnie, numéro déjà porté par un
   * autre billet.
   *
   * Conflits :
   * - siège déjà pris (`SIEGE_PRIS`) ou perdu au jugement de la synchronisation (`siegePerdu`) : le billet est créé
   *   **sans siège** (« à replacer »), `synchro.siege = "a_replacer"`, avec le billet qui tient le siège s'il est connu ;
   * - code de billet déjà pris dans le départ (deux téléphones ont tiré le même) : un code libre est attribué et
   *   l'anomalie `code_billet_change` est rendue (le papier porte l'ancien code : à réimprimer).
   */
  venteSynchronisee(
    u: Utilisateur,
    evt: EvenementVente | EvenementVenteCadence,
    options: { siegePerdu: boolean },
  ) {
    return this.evenement(u, evt, async () => {
      const d = evt.donnees;
      const cadence = evt.type === "billet.vendu_cadence";
      const dc = await this.departDeLAgence(u, d.departId);
      const anomalies: string[] = [];
      const tarifs = dc.ligne.tarifs;

      try {
        exigerVendable(dc);
      } catch {
        anomalies.push("depart_non_ouvert");
      }
      const bagage = "bagage" in d ? d.bagage : 0;
      const classe: ClasseBillet = "classe" in d ? d.classe : dc.depart.classe;
      if (d.prix !== tarifs[classe] || (bagage !== 0 && bagage !== tarifs.bagage)) {
        anomalies.push("prix_hors_tarif");
      }
      try {
        this.verifierPaiement(d.paiement, d.prix + bagage);
      } catch {
        anomalies.push("paiement_incoherent");
      }
      let siegeVoulu: number | null = d.siege;
      if (siegeVoulu !== null) {
        try {
          exigerSiegeExistant(dc, siegeVoulu);
        } catch {
          anomalies.push("siege_inexistant");
          siegeVoulu = null;
        }
      }
      let siegeIssue: "garde" | "aucun" | "a_replacer" = siegeVoulu === null ? "aucun" : "garde";
      if (siegeVoulu !== null && options.siegePerdu) siegeIssue = "a_replacer";

      const passager: Passager =
        "passager" in d
          ? {
              nom: d.passager.nom,
              telephone: d.passager.telephone,
              pieceQuatreDerniers: d.passager.pieceQuatreDerniers,
            }
          : { nom: null, telephone: d.telephone, pieceQuatreDerniers: null };
      let billet = await this.creerBilletDeLAgence(
        u,
        evt,
        {
          dc,
          billetId: d.billetId,
          siege: siegeIssue === "a_replacer" ? null : siegeVoulu,
          classe,
          prix: d.prix,
          bagage,
          passager,
          paiement: d.paiement,
          codeBillet: d.codeBillet,
          aCompleterAuQuai: cadence,
        },
        false,
      );

      let occupantBilletId: string | null = null;
      let enregistre: Billet | null = null;
      for (let essai = 0; essai < 4 && !enregistre; essai++) {
        try {
          enregistre = await this.billetsService.enregistrer(billet, null);
        } catch (e) {
          if (!(e instanceof Refus)) throw e;
          if (e.code === "SIEGE_PRIS" && billet.siege !== null) {
            occupantBilletId = await this.sieges.occupant(billet.departId, billet.siege);
            siegeIssue = "a_replacer";
            billet = { ...billet, siege: null };
          } else if (e.code === "CODE_BILLET_PRIS") {
            const pris = new Set(
              (await this.billets.duDepart(billet.departId))
                .filter((b) => b.etat !== "annule")
                .map((b) => b.codeBillet),
            );
            anomalies.push("code_billet_change");
            billet = {
              ...billet,
              codeBillet: genererCodeBilletUnique(
                () => randomBytes(4).readUInt32BE() / 2 ** 32,
                pris,
              ),
            };
          } else if (e.code === "NUMERO_EN_DOUBLE" || e.code === "BILLET_EXISTANT") {
            // Reprise après une coupure entre l'écriture du billet et celle de la réponse mémorisée.
            const dejaFait = await this.billets.parEvenement(evt.id);
            if (!dejaFait) throw e;
            enregistre = dejaFait;
          } else {
            throw e;
          }
        }
      }
      if (!enregistre) {
        throw conflit("BILLET_NON_ENREGISTRE", "Le billet n'a pas pu être enregistré");
      }

      const resultat = {
        billet: billetImprimable(
          enregistre,
          this.passagers.dechiffrer(enregistre.passagerChiffre),
          dc,
        ),
        synchro: { siege: siegeIssue, occupantBilletId, anomalies },
      };
      return cadence
        ? { ...resultat, placesRestantes: await this.sieges.placesLibres(dc) }
        : resultat;
    });
  }

  /**
   * Un billet vendu hors ligne perd son siège au jugement de la synchronisation (un autre billet l'avait avant
   * lui, à l'heure du geste) : il passe « à replacer » (sans siège) et le siège revient au plan. Un voyageur déjà
   * monté garde le sien (`false`).
   */
  async retirerSiegeSynchronise(
    billetId: string,
    departId: string,
    siege: number,
  ): Promise<boolean> {
    const b = await this.billets.trouver(billetId);
    if (!b || b.departId !== departId || b.siege !== siege) return false;
    if (b.etat !== "paye" && b.etat !== "reserve") return false;
    const maj = await this.billets.transitionner(b.id, ["paye", "reserve"], { siege: null });
    if (!maj) return false;
    await this.sieges.rendreALaVente(departId, siege, billetId);
    return true;
  }

  /** Le conflit est levé (une libération datée d'avant est arrivée en retard) : le billet « à replacer » reprend son siège s'il est libre. */
  async rendreSiegeSynchronise(
    billetId: string,
    departId: string,
    siege: number,
  ): Promise<boolean> {
    const b = await this.billets.trouver(billetId);
    if (!b || b.departId !== departId || b.siege !== null) return false;
    if (b.etat !== "paye" && b.etat !== "reserve") return false;
    if (!(await this.sieges.occuperPour(departId, siege, billetId))) return false;
    const maj = await this.billets.transitionner(b.id, [b.etat], { siege });
    if (!maj) {
      await this.sieges.rendreALaVente(departId, siege, billetId);
      return false;
    }
    return true;
  }

  /** `billet.vendu_cadence` : le billet part sans nom ni pièce, à compléter au quai. */
  vendreCadence(u: Utilisateur, evt: EvenementVenteCadence) {
    return this.evenement(u, evt, async () => {
      const d = evt.donnees;
      const dc = await this.departDeLAgence(u, d.departId);
      exigerVendable(dc);
      exigerSiegeExistant(dc, d.siege);
      const prix = dc.ligne.tarifs[dc.depart.classe];
      if (d.prix !== prix) {
        throw invalide("PRIX_INCOHERENT", "Le prix ne correspond pas au tarif de la ligne", {
          attendu: { prix },
        });
      }
      this.verifierPaiement(d.paiement, d.prix);
      const billet = await this.creerBilletDeLAgence(u, evt, {
        dc,
        billetId: d.billetId,
        siege: d.siege,
        classe: dc.depart.classe,
        prix: d.prix,
        bagage: 0,
        passager: { nom: null, telephone: d.telephone, pieceQuatreDerniers: null },
        paiement: d.paiement,
        codeBillet: d.codeBillet,
        aCompleterAuQuai: true,
      });
      const enregistre = await this.billetsService.enregistrer(billet, null);
      return {
        billet: billetImprimable(
          enregistre,
          this.passagers.dechiffrer(enregistre.passagerChiffre),
          dc,
        ),
        placesRestantes: await this.sieges.placesLibres(dc),
      };
    });
  }

  /** `billet.telephone_ajoute` : le numéro d'un billet déjà vendu, pour lui envoyer le SMS. */
  ajouterTelephone(u: Utilisateur, evt: EvenementTelephone) {
    return this.evenement(u, evt, async () => {
      const billet = await this.billetDeLAgence(u, evt.donnees.billetId);
      if (billet.etat === "annule") {
        throw conflit("TRANSITION_INTERDITE", "Ce billet est annulé");
      }
      const passager = this.passagers.dechiffrer(billet.passagerChiffre);
      const maj: Passager = { ...passager, telephone: evt.donnees.telephone };
      await this.billets.transitionner(billet.id, [billet.etat], {
        passagerChiffre: this.passagers.chiffrer(maj),
        passagerTelephoneIndex: this.passagers.indexTelephone(maj.telephone),
      });
      return {};
    });
  }

  /** `billet.complete` : au quai, le nom et la pièce d'un billet de cadence ; le numéro ne change pas. */
  completer(u: Utilisateur, evt: EvenementComplete) {
    return this.evenement(u, evt, async () => {
      const d = evt.donnees;
      const dc = await this.departDeLAgence(u, d.departId);
      const billet = await this.billetDeLAgence(u, d.billetId);
      if (billet.departId !== dc.depart.id) {
        throw conflit("AUTRE_DEPART", "Ce billet n'est pas pour ce départ");
      }
      if (!billet.aCompleterAuQuai) {
        throw conflit("DEJA_COMPLETE", "Ce billet porte déjà le nom du voyageur");
      }
      if (billet.etat !== "paye") {
        throw conflit("TRANSITION_INTERDITE", "Ce billet ne peut plus être complété", {
          etat: billet.etat,
        });
      }
      const passager = this.passagers.dechiffrer(billet.passagerChiffre);
      const maj: Passager = {
        nom: d.nom,
        telephone: d.telephone ?? passager.telephone,
        pieceQuatreDerniers: d.pieceQuatreDerniers,
      };
      let courant = await this.billets.transitionner(billet.id, ["paye"], {
        passagerChiffre: this.passagers.chiffrer(maj),
        passagerTelephoneIndex: this.passagers.indexTelephone(maj.telephone),
        aCompleterAuQuai: false,
      });
      if (!courant) throw conflit("TRANSITION_INTERDITE", "Ce billet vient de changer d'état");
      let embarque = false;
      if (d.embarquer) {
        const monte = await this.billetsService.embarquer(courant, evt.at, u.id);
        if (monte) {
          courant = monte;
          embarque = true;
          await this.ouvrirEmbarquementSiBesoin(dc, u.id);
        }
      }
      const compte = await this.compter(dc);
      this.diffuserQuai(dc, null, compte.embarques, evt.at);
      return {
        billet: { billetId: courant.id, numero: courant.numero, nom: d.nom, embarque },
        embarques: compte.embarques,
        sansNomRestants: compte.sansNom,
      };
    });
  }

  /* -------------------------------------------------------------- quai */

  private async compter(dc: DepartComplet) {
    const billets = await this.billets.duDepart(dc.depart.id);
    return {
      embarques: billets.filter((b) => b.etat === "embarque" || b.etat === "voyage").length,
      attendus: billets.filter((b) => b.etat === "paye").length,
      nonPresentes: billets.filter((b) => b.etat === "non_presente").length,
      sansNom: billets.filter((b) => b.etat === "paye" && b.aCompleterAuQuai).length,
      billets,
    };
  }

  private diffuserQuai(
    dc: DepartComplet,
    scan: ReturnType<typeof scanQuai> | null,
    embarques: number,
    at: string,
  ): void {
    const message: MessageQuaiDirect = {
      departId: dc.depart.id,
      at,
      scan,
      embarques,
      capacite: capaciteDe(dc),
    };
    this.diffusion.publier(canalQuai(dc.depart.id), message);
  }

  /** Le premier voyageur scanné ouvre l'embarquement du départ. */
  private async ouvrirEmbarquementSiBesoin(dc: DepartComplet, par: string): Promise<void> {
    if (dc.depart.etat !== "en_vente" && dc.depart.etat !== "retarde") return;
    const frais = await this.catalogue.depart(dc.depart.id);
    if (!frais || (frais.depart.etat !== "en_vente" && frais.depart.etat !== "retarde")) return;
    await this.departs.appliquer(frais, par, { action: "ouvrir_embarquement" });
  }

  private async identiteDuScan(scan: ScanStocke): Promise<ReturnType<typeof scanQuai>> {
    const billet = scan.billetId ? await this.billets.trouver(scan.billetId) : null;
    const passager = billet ? this.passagers.dechiffrer(billet.passagerChiffre) : null;
    return scanQuai(scan, passager);
  }

  /** `quai.scanne` : le QR du voyageur, vérifié hors ligne par la signature. */
  scanner(u: Utilisateur, evt: EvenementScan) {
    return this.traiterScan(u, evt, evt.donnees.departId, { qr: evt.donnees.qr });
  }

  /** `quai.code_saisi` : le voyageur dicte son code à 4 chiffres. */
  saisirCode(u: Utilisateur, evt: EvenementCode) {
    return this.traiterScan(u, evt, evt.donnees.departId, { code: evt.donnees.codeBillet });
  }

  private traiterScan(
    u: Utilisateur,
    evt: Enveloppe,
    departId: string,
    entree: { qr: string } | { code: string },
  ) {
    return this.evenement(u, evt, async () => {
      const dc = await this.departDeLAgence(u, departId);
      const rejoue = await this.scans.parEvenement(evt.id);
      let scan = rejoue;
      if (!scan) {
        if (!["en_vente", "embarquement", "retarde"].includes(dc.depart.etat)) {
          throw conflit("DEPART_FERME", "L'embarquement de ce départ n'est pas ouvert", {
            etat: dc.depart.etat,
          });
        }
        scan = await this.decider(u, evt, dc, entree);
        await this.scans.ajouter(scan);
        if (scan.resultat === "monte") await this.ouvrirEmbarquementSiBesoin(dc, u.id);
      }
      const compte = await this.compter(dc);
      const vue = await this.identiteDuScan(scan);
      if (!rejoue) this.diffuserQuai(dc, vue, compte.embarques, scan.at);
      return { scan: vue, embarques: compte.embarques, capacite: capaciteDe(dc) };
    });
  }

  /** Cherche le billet, décide du résultat et, si le voyageur monte, le fait **atomiquement**. */
  private async decider(
    u: Utilisateur,
    evt: Enveloppe,
    dc: DepartComplet,
    entree: { qr: string } | { code: string },
  ): Promise<ScanStocke> {
    const base = {
      evenementId: evt.id,
      departId: dc.depart.id,
      at: evt.at,
      appareilId: (evt as { appareilId?: string }).appareilId ?? "",
      auteurId: u.id,
    };
    const introuvable = (): ScanStocke => ({
      ...base,
      billetId: null,
      numero: null,
      resultat: "introuvable",
      siege: null,
      classe: null,
      bagagesSoute: 0,
      premierScanA: null,
    });

    let billet: Billet | null = null;
    if ("qr" in entree) {
      // Un QR modifié ou fabriqué n'a pas de signature valide : il est refusé sans autre indice.
      const contenu = await this.signataire.verifier(entree.qr);
      if (contenu) {
        const b = await this.billets.parNumero(contenu.numero);
        if (b && b.codeBillet === contenu.code && b.compagnieId === dc.compagnie.id) billet = b;
      }
    } else {
      billet = await this.billets.parCode(dc.depart.id, entree.code);
      if (billet && billet.compagnieId !== dc.compagnie.id) billet = null;
    }
    if (!billet) return introuvable();

    const du = (resultat: ResultatScan, premierScanA: string | null = null): ScanStocke => ({
      ...base,
      billetId: billet.id,
      numero: billet.numero,
      resultat,
      siege: billet.siege,
      classe: billet.classe,
      bagagesSoute: billet.bagage > 0 ? 1 : 0,
      premierScanA,
    });

    if (billet.departId !== dc.depart.id || billet.etat === "reporte") return du("autre_depart");
    switch (billet.etat) {
      case "annule":
      case "non_presente":
      case "reserve":
        return du("annule");
      case "embarque":
      case "voyage":
        return du("deja_scanne", billet.embarqueA);
      case "paye": {
        const passager = this.passagers.dechiffrer(billet.passagerChiffre);
        if (billet.aCompleterAuQuai || !passager.nom) return du("sans_nom");
        const monte = await this.billetsService.embarquer(billet, evt.at, u.id);
        if (monte) return du("monte");
        // Un autre appareil vient de scanner ce billet : refusé comme un double scan.
        const frais = await this.billets.trouver(billet.id);
        return du("deja_scanne", frais?.embarqueA ?? null);
      }
    }
  }

  /** `quai.libere` : le siège d'un absent revient à la vente ; le billet devient « non présenté ». */
  libererSiege(u: Utilisateur, evt: EvenementLibere) {
    return this.evenement(u, evt, async () => {
      const d = evt.donnees;
      const dc = await this.departDeLAgence(u, d.departId);
      const billet = await this.billetDeLAgence(u, d.billetId);
      if (billet.departId !== dc.depart.id) throw inconnu("BILLET_INCONNU", "Billet introuvable");
      if (billet.siege !== d.siege) {
        throw invalide("SIEGE_INCOHERENT", "Ce n'est pas le siège de ce billet", {
          siege: billet.siege,
        });
      }
      const apres = await this.billetsService.marquerNonPresent(billet, evt.at, u.id, d.motif);
      if (!apres) {
        throw conflit("TRANSITION_INTERDITE", "Ce voyageur n'est plus en attente d'embarquement", {
          etat: billet.etat,
        });
      }
      const compte = await this.compter(dc);
      this.diffuserQuai(dc, null, compte.embarques, evt.at);
      return { siegesLibres: await this.sieges.placesLibres(dc) };
    });
  }

  /**
   * `quai.liste_envoyee` : la liste nominative des embarqués part au chauffeur, le bus part.
   * Le départ passe à « parti » et les voyageurs payés qui ne sont pas montés à « non présenté ».
   */
  envoyerListe(u: Utilisateur, evt: EvenementListe) {
    return this.evenement(u, evt, async () => {
      const dc = await this.departDeLAgence(u, evt.donnees.departId);
      const chauffeur = dc.depart.chauffeur;
      if (!chauffeur) {
        throw conflit("EQUIPAGE_INCOMPLET", "Aucun chauffeur n'est affecté à ce départ", {
          manque: ["chauffeur"],
        });
      }
      if (["programme", "annule", "fusionne", "arrive"].includes(dc.depart.etat)) {
        throw conflit("DEPART_FERME", "Ce départ ne peut pas partir", { etat: dc.depart.etat });
      }
      let courant = dc;
      if (courant.depart.etat === "en_vente" || courant.depart.etat === "retarde") {
        await this.departs.appliquer(courant, u.id, { action: "ouvrir_embarquement" });
        courant = (await this.catalogue.depart(dc.depart.id)) ?? courant;
      }
      if (courant.depart.etat === "embarquement") {
        await this.departs.appliquer(courant, u.id, { action: "partir" });
      }
      const compte = await this.compter(dc);
      this.diffuserQuai(dc, null, compte.embarques, evt.at);
      return { chauffeur: { id: chauffeur.id, nom: chauffeur.nom }, embarques: compte.embarques };
    });
  }

  /* -------------------------------------------------------------- lectures */

  /** Le départ du quai : celui demandé, sinon l'embarquement en cours, sinon le prochain de la gare. */
  private async departDuQuai(u: Utilisateur, departId: string | undefined): Promise<DepartComplet> {
    if (departId) return this.departDeLAgence(u, departId);
    if (!u.gareId) throw interdit("GARE_REQUISE", "Ce compte n'est rattaché à aucune gare");
    const maintenant = this.horloge.maintenant().getTime();
    const candidats = await this.catalogue.departs({
      gareOrigineId: u.gareId,
      etats: ["embarquement", "en_vente", "retarde"],
      de: versIsoDouala(maintenant - 2 * MS_PAR_HEURE),
    });
    const choix =
      candidats.find((c) => c.depart.etat === "embarquement") ??
      candidats.find((c) => c.bus !== null);
    if (!choix || choix.depart.etat === "retarde") {
      throw inconnu("AUCUN_DEPART", "Aucun départ à embarquer pour le moment");
    }
    return choix;
  }

  /** `GET /agence/quai/embarquement` : scan, comptage, soute, absents. */
  async quai(u: Utilisateur, departId: string | undefined) {
    const dc = await this.departDuQuai(u, departId);
    const manque: string[] = [];
    if (!dc.bus) manque.push("bus");
    if (!dc.depart.chauffeur) manque.push("chauffeur");
    if (!dc.depart.convoyeur) manque.push("convoyeur");
    if (dc.depart.quai === null) manque.push("quai");
    if (manque.length > 0 || !dc.bus || !dc.depart.chauffeur || !dc.depart.convoyeur) {
      throw conflit("EQUIPAGE_INCOMPLET", "L'équipage ou le quai de ce départ n'est pas affecté", {
        manque,
      });
    }
    const maintenant = this.sieges.maintenant();
    const [compte, scans, soute, libres] = await Promise.all([
      this.compter(dc),
      this.scans.duDepart(dc.depart.id),
      this.colis.etat(dc.depart.id),
      this.sieges.placesLibres(dc),
    ]);

    const refus = scans.filter((s) => s.resultat !== "monte" && s.resultat !== "sans_nom");
    const dernierRefus = refus[refus.length - 1];
    const motif = (dernierRefus ? dernierRefus.resultat : "deja_scanne") as
      | "deja_scanne"
      | "autre_depart"
      | "annule"
      | "introuvable";

    const proche =
      dc.depart.etat === "embarquement" ||
      enMs(dc.depart.heureDepart) - enMs(maintenant) <= ABSENTS_DES_MINUTES * MS_PAR_MINUTE;
    const absents = proche
      ? compte.billets
          .filter((b) => b.etat === "paye" && b.siege !== null && !b.aCompleterAuQuai)
          .sort((a, b) => (a.siege ?? 0) - (b.siege ?? 0))
          .map((b) => ({
            billetId: b.id,
            voyageur: this.passagers.dechiffrer(b.passagerChiffre).nom ?? "",
            siege: b.siege as number,
            venduA: b.creeA,
            retardPrevenu: b.retardPrevenu,
            actionSuggeree: b.retardPrevenu ? ("code_billet" as const) : ("liberer" as const),
          }))
          .filter((a) => a.voyageur !== "")
      : [];

    const dernier = scans[scans.length - 1];
    const enRoute = compte.billets.filter(
      (b) => (b.canal === "convoyeur" || b.canal === "vendeur") && b.etat !== "annule",
    );
    const arret =
      [...dc.ligne.arrets].sort((a, b) => a.ordre - b.ordre).find((a) => a.ordre > 0 && a.montee)
        ?.nom ?? dc.destination.nom;
    return {
      quai: dc.depart.quai as number,
      depart: departResume(dc, libres),
      equipage: {
        bus: { id: dc.bus.id, immatriculation: dc.bus.immatriculation },
        chauffeur: { id: dc.depart.chauffeur.id, nom: dc.depart.chauffeur.nom },
        convoyeur: { id: dc.depart.convoyeur.id, nom: dc.depart.convoyeur.nom },
      },
      mode: "scan" as const,
      dernierScan: dernier ? await this.identiteDuScan(dernier) : null,
      embarquement: {
        embarques: compte.embarques,
        capacite: dc.bus.capacite,
        attendus: compte.attendus,
        nonPresentes: compte.nonPresentes,
      },
      soute: {
        charges: soute.charges,
        capacite: dc.bus.capaciteSoute,
        colisACharger: soute.colisACharger,
      },
      refuses: {
        nombre: refus.length,
        motif,
        premierScanA: dernierRefus?.resultat === "deja_scanne" ? dernierRefus.premierScanA : null,
      },
      enRoute: { nombre: enRoute.length, arret },
      absents,
      placesAVendre: ["en_vente", "embarquement"].includes(dc.depart.etat) ? libres : 0,
    };
  }

  /** `GET /agence/vente/contexte` : tout ce qu'il faut pour vendre un billet en un écran. */
  async venteContexte(u: Utilisateur, guichetId: string | undefined) {
    const guichet = guichetId
      ? await this.catalogue.guichet(guichetId)
      : await this.catalogue.guichetDe(u.id);
    if (!guichet) throw inconnu("GUICHET_INCONNU", "Guichet introuvable");
    const gare = await this.catalogue.gare(guichet.gareId);
    if (!gare || gare.compagnieId !== u.compagnieId) {
      throw inconnu("GUICHET_INCONNU", "Guichet introuvable");
    }
    if (u.gareId && u.gareId !== gare.id) {
      throw interdit("AUTRE_GARE", "Ce guichet n'est pas celui de ta gare");
    }
    const maintenant = this.sieges.maintenant();
    const ouverts = (
      await this.catalogue.departs({
        gareOrigineId: gare.id,
        etats: ["en_vente", "embarquement"],
        de: versIsoDouala(enMs(maintenant) - 30 * MS_PAR_MINUTE),
        avant: versIsoDouala(enMs(maintenant) + 24 * MS_PAR_HEURE),
      })
    ).filter((d) => d.bus !== null);

    const avecPlaces: { dc: DepartComplet; libres: number[] }[] = [];
    for (const dc of ouverts) {
      const libres = await this.sieges.libres(dc);
      if (libres.length > 0) avecPlaces.push({ dc, libres });
    }
    const choisi = avecPlaces[0];
    if (!choisi)
      throw conflit("AUCUN_DEPART", "Aucun départ n'est ouvert à la vente avec des places libres");

    const plan = await this.sieges.vue(choisi.dc, null);
    const propose = choisi.libres[0] as number;
    const jour = aammjjDouala(maintenant);
    const dejaVendus = await this.billets.duGuichetEtJour(guichet.id, jour);
    const rang = guichet.rang;
    let plageGuichetCourante: Plage | null = null;
    try {
      plageGuichetCourante = plageGuichet(rang);
    } catch {
      plageGuichetCourante = null;
    }
    const plageDuGuichet = plageGuichetCourante;
    const derniere = dejaVendus.reduce((m, b) => Math.max(m, b.sequence), 0);
    const sequence = plageDuGuichet ? Math.max(plageDuGuichet.debut, derniere + 1) : derniere + 1;
    if (plageDuGuichet && sequence > plageDuGuichet.fin) {
      throw conflit(
        "PLAGE_EPUISEE",
        "La plage de numéros de ce guichet est épuisée pour aujourd'hui",
      );
    }
    const t = choisi.dc.ligne.tarifs;
    return {
      guichet: { id: guichet.id, rang },
      prochainNumero: {
        sequence,
        numero: numeroBillet({
          agence: choisi.dc.compagnie.code,
          gare: gare.code,
          aammjj: jour,
          sequence,
        }),
      },
      departs: avecPlaces
        .slice(0, LIMITE_DEPARTS_VENTE)
        .map((x) => departResume(x.dc, x.libres.length)),
      autresDeparts: Math.max(0, avecPlaces.length - LIMITE_DEPARTS_VENTE),
      departChoisiId: choisi.dc.depart.id,
      siege: {
        propose,
        libres: choisi.libres.length,
        plan: {
          colonnes: 4,
          cases: plan.sieges.map((s) => ({
            numero: s.numero,
            etat:
              s.numero === propose
                ? ("attribue" as const)
                : s.etat === "libre"
                  ? ("libre" as const)
                  : ("pris" as const),
          })),
        },
      },
      tarifs: { classique: t.classique, vip: t.vip, bagage: t.bagage },
      brouillon: null,
    };
  }
}
