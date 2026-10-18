import { Injectable } from "@nestjs/common";
import { conflit, inconnu } from "../billetterie/erreurs";
import type { Billet, DepartComplet } from "../billetterie/modeles";
import { Passagers } from "../billetterie/passagers";
import { Billets, Catalogue, EvenementsTraites, Scans } from "../billetterie/ports";
import { plageGuichet } from "../billetterie/regles";
import { SiegesService } from "../billetterie/sieges.service";
import {
  MS_PAR_HEURE,
  MS_PAR_MINUTE,
  aammjjDouala,
  enMs,
  versIsoDouala,
} from "../billetterie/temps";
import { billetImprimable, departResume } from "../billetterie/vues";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { ImpressionsAgence } from "./ports";
import { PosteGuichetService } from "./poste.service";

/** Le type de l'événement qui crée un billet de cadence (`billet.vendu_cadence` du contrat). */
export const TYPE_VENTE_CADENCE = "billet.vendu_cadence";

/** Billets sans nom listés au quai (le total, lui, les compte tous). */
export const LISTE_SANS_NOM_MAX = 10;

const BILLETS_VIVANTS = (b: Billet) => b.etat !== "annule";

/**
 * Le mode cadence : ventes rapides au guichet (`SchemaCadenceEtat`, `SchemaCadenceBillet`) et complétion au quai
 * (`SchemaQuaiCadence`). Un billet de cadence est reconnu au type de l'événement qui l'a créé
 * (`billet.vendu_cadence`), conservé par la billetterie avec l'identifiant de l'événement.
 *
 * Règles provisoires, à confirmer (README du module) :
 * - **Départ de la cadence** : celui qu'on demande, sinon le premier départ de la gare en vente ou en embarquement
 *   (parti depuis moins de 30 minutes, dans les 24 heures) qui a un bus et des places libres, comme l'écran de vente.
 * - **Vendus en cadence / annulations** : les billets de cadence de ce guichet, aujourd'hui, vivants / annulés.
 * - **Durée de la vente** : le serveur ne la connaît pas (c'est le temps mesuré sur l'appareil) ; la relecture
 *   répond 0. **Reçu et rendu** : le billet ne garde que le mode de paiement ; la relecture suppose un cash exact.
 * - **Plage sans trou** : tous les numéros du début de la plage du guichet jusqu'à celui du billet existent ce jour-là.
 * - **Quai** : le billet à compléter est le dernier scanné « sans nom » dont le nom manque encore ; sans lui, 404.
 */
@Injectable()
export class CadenceService {
  constructor(
    private readonly poste: PosteGuichetService,
    private readonly catalogue: Catalogue,
    private readonly billets: Billets,
    private readonly traites: EvenementsTraites,
    private readonly scans: Scans,
    private readonly sieges: SiegesService,
    private readonly passagers: Passagers,
    private readonly impressions: ImpressionsAgence,
  ) {}

  private synchro() {
    return {
      etat: "sync" as const,
      derniereSyncA: this.poste.maintenant(),
      evenementsEnAttente: 0,
    };
  }

  /** Les billets de cadence parmi `billets` (reconnus au type de leur événement de vente). */
  private async deCadence(billets: readonly Billet[]): Promise<Billet[]> {
    const ids = billets.flatMap((b) => (b.evenementId ? [b.evenementId] : []));
    const types = await this.traites.typesDe(ids);
    return billets.filter((b) => b.evenementId && types.get(b.evenementId) === TYPE_VENTE_CADENCE);
  }

  /** Le départ de la cadence : celui demandé, sinon le premier ouvert à la vente avec des places libres. */
  private async departDeLaCadence(
    u: Utilisateur,
    gareId: string,
    departId: string | undefined,
  ): Promise<{ dc: DepartComplet; libres: number[] }> {
    if (departId) {
      const dc = await this.poste.departDeLAgence(u, departId);
      return { dc, libres: await this.sieges.libres(dc) };
    }
    const maintenant = enMs(this.poste.maintenant());
    const ouverts = (
      await this.catalogue.departs({
        gareOrigineId: gareId,
        etats: ["en_vente", "embarquement"],
        de: versIsoDouala(maintenant - 30 * MS_PAR_MINUTE),
        avant: versIsoDouala(maintenant + 24 * MS_PAR_HEURE),
      })
    ).filter((d) => d.bus !== null);
    for (const dc of ouverts) {
      const libres = await this.sieges.libres(dc);
      if (libres.length > 0) return { dc, libres };
    }
    throw conflit("AUCUN_DEPART", "Aucun départ n'est ouvert à la vente avec des places libres");
  }

  /** `GET /agence/cadence` : l'état du mode cadence au guichet. */
  async etat(u: Utilisateur, departId: string | undefined) {
    const { guichet, gare } = await this.poste.de(u);
    const { dc, libres } = await this.departDeLaCadence(u, gare.id, departId);
    const premier = libres[0];
    if (premier === undefined) throw conflit("DEPART_COMPLET", "Ce départ n'a plus de place libre");

    const duJour = await this.billets.duGuichetEtJour(
      guichet.id,
      aammjjDouala(this.poste.maintenant()),
    );
    const cadence = await this.deCadence(duJour);
    const derniere = cadence
      .filter(BILLETS_VIVANTS)
      .sort((a, b) => enMs(a.creeA) - enMs(b.creeA) || a.sequence - b.sequence)
      .at(-1);
    let dernierBillet = null;
    if (derniere) {
      const passager = this.passagers.dechiffrer(derniere.passagerChiffre);
      dernierBillet = {
        billetId: derniere.id,
        sequence: derniere.sequence,
        siege: derniere.siege ?? 1,
        nom: derniere.aCompleterAuQuai ? null : passager.nom,
        venduA: derniere.creeA,
      };
    }
    return {
      depart: { ...departResume(dc, libres.length), placesRestantes: libres.length },
      dernierBillet,
      prochain: { prix: dc.ligne.tarifs[dc.depart.classe], siege: premier },
      modesPaiement: ["cash" as const, "momo" as const],
      vendusEnCadence: cadence.filter(BILLETS_VIVANTS).length,
      annulations: cadence.filter((b) => b.etat === "annule").length,
      synchro: this.synchro(),
    };
  }

  /** `GET /agence/cadence/billets/{billetId}` : la suite d'une vente de cadence, relue. */
  async billet(u: Utilisateur, billetId: string) {
    const billet = await this.billets.trouver(billetId);
    if (!billet || billet.compagnieId !== u.compagnieId) {
      throw inconnu("BILLET_INCONNU", "Billet introuvable");
    }
    const [cadence] = await this.deCadence([billet]);
    if (!cadence) throw inconnu("BILLET_INCONNU", "Ce billet n'a pas été vendu en cadence");
    const dc = await this.catalogue.depart(billet.departId);
    if (!dc) throw inconnu("DEPART_INCONNU", "Départ introuvable");

    const passager = this.passagers.dechiffrer(billet.passagerChiffre);
    const libres = await this.sieges.libres(dc);
    const prix = billet.prix + billet.bagage;
    const cash = billet.paiement?.mode === "cash";
    return {
      billet: billetImprimable(billet, passager, dc),
      vente: {
        dureeMs: 0,
        paiement: {
          mode: billet.paiement?.mode ?? ("cash" as const),
          recu: cash ? prix : 0,
          rendu: 0,
          reference: billet.paiement?.reference ?? null,
        },
        placesRestantes: libres.length,
      },
      recapitulatif: {
        plageSansTrou: await this.plageSansTrou(billet),
        siegeBloque: billet.siege ?? 1,
        imprime: ((await this.impressions.copiesDe("billet", [billet.id])).get(billet.id) ?? 0) > 0,
        caisseCash: cash ? prix : 0,
        sms: passager.telephone ? ("envoye" as const) : ("pas_de_numero" as const),
        synchro: "faite" as const,
      },
      suivant: { siege: libres[0] ?? billet.siege ?? 1, prix: dc.ligne.tarifs[dc.depart.classe] },
    };
  }

  /** Vrai quand tous les numéros du début de la plage du guichet jusqu'à celui du billet existent ce jour-là. */
  private async plageSansTrou(billet: Billet): Promise<boolean> {
    if (!billet.guichetId) return false;
    const guichet = await this.catalogue.guichet(billet.guichetId);
    if (!guichet) return false;
    let plage;
    try {
      plage = plageGuichet(guichet.rang);
    } catch {
      return false;
    }
    if (billet.sequence < plage.debut || billet.sequence > plage.fin) return false;
    const jour = billet.numero.split("-")[2] ?? aammjjDouala(billet.creeA);
    const pris = new Set(
      (await this.billets.duGuichetEtJour(guichet.id, jour)).map((b) => b.sequence),
    );
    for (let n = plage.debut; n <= billet.sequence; n++) if (!pris.has(n)) return false;
    return true;
  }

  /** `GET /agence/quai/cadence` : le billet de cadence scanné au quai, à compléter, et le comptage. */
  async quai(u: Utilisateur, departId: string | undefined) {
    const dc = await this.poste.departDuQuai(u, departId);
    const manque: string[] = [];
    if (!dc.bus) manque.push("bus");
    if (!dc.depart.convoyeur) manque.push("convoyeur");
    if (dc.depart.quai === null) manque.push("quai");
    if (manque.length > 0 || !dc.bus || !dc.depart.convoyeur || dc.depart.quai === null) {
      throw conflit("EQUIPAGE_INCOMPLET", "L'équipage ou le quai de ce départ n'est pas affecté", {
        manque,
      });
    }
    const duDepart = await this.billets.duDepart(dc.depart.id);
    const cadence = await this.deCadence(duDepart);
    const idsCadence = new Set(cadence.map((b) => b.id));
    const sansNom = cadence
      .filter((b) => b.etat === "paye" && b.aCompleterAuQuai)
      .sort((a, b) => (a.siege ?? 0) - (b.siege ?? 0) || a.sequence - b.sequence);

    // Le dernier scan « sans nom » dont le billet attend encore son nom.
    const aCompleter = new Set(sansNom.map((b) => b.id));
    const scans = (await this.scans.duDepart(dc.depart.id)).filter(
      (s) => s.resultat === "sans_nom" && s.billetId !== null && aCompleter.has(s.billetId),
    );
    const dernier = scans.at(-1);
    const billet = dernier ? sansNom.find((b) => b.id === dernier.billetId) : undefined;
    if (!dernier || !billet) {
      throw inconnu("AUCUN_BILLET_CADENCE", "Aucun billet de cadence n'attend son nom sur ce quai");
    }
    const passager = this.passagers.dechiffrer(billet.passagerChiffre);
    const embarques = duDepart.filter((b) => b.etat === "embarque" || b.etat === "voyage");
    const guichet = billet.guichetId ? await this.catalogue.guichet(billet.guichetId) : null;
    const libres = await this.sieges.placesLibres(dc);

    return {
      quai: dc.depart.quai,
      depart: departResume(dc, libres),
      convoyeur: { id: dc.depart.convoyeur.id, nom: dc.depart.convoyeur.nom },
      scan: {
        at: dernier.at,
        billetId: billet.id,
        numero: billet.numero,
        siege: billet.siege ?? 1,
        venduA: billet.creeA,
        guichetRang: guichet?.rang ?? 1,
        paiement: billet.paiement?.mode ?? ("cash" as const),
        montant: billet.prix + billet.bagage,
        validePourCeDepart: billet.departId === dc.depart.id,
      },
      // La saisie en cours est sur l'appareil du convoyeur, pas sur le serveur.
      saisie: { nom: "", pieceQuatreDerniers: "", telephone: passager.telephone },
      embarquement: {
        embarques: embarques.length,
        capacite: dc.bus.capacite,
        nominatifs: embarques.filter((b) => !idsCadence.has(b.id)).length,
        cadenceCompletes: embarques.filter((b) => idsCadence.has(b.id)).length,
      },
      sansNom: {
        total: sansNom.length,
        liste: sansNom.slice(0, LISTE_SANS_NOM_MAX).map((b) => ({
          billetId: b.id,
          sequence: b.sequence,
          siege: b.siege ?? 1,
          venduA: b.creeA,
          paiement: b.paiement?.mode ?? ("cash" as const),
          smsEnvoye: b.smsEnvoye,
        })),
      },
    };
  }
}
