import { randomBytes, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Horloge } from "../socle/horloge";
import { exigerAvantLeDepart, exigerVendable } from "./controles";
import { Refus, conflit, inconnu, interdit } from "./erreurs";
import type { Billet, Commande, DepartComplet, EntreeHistorique, Passager } from "./modeles";
import {
  AvisBillets,
  Billets,
  Catalogue,
  Commandes,
  Inventaire,
  NumerotationEnLigne,
  SignataireQr,
} from "./ports";
import { Passagers } from "./passagers";
import {
  billetPeut,
  decisionAnnulation,
  genererCodeBilletUnique,
  limiteAnnulationGratuite,
  numeroBillet,
  type ActionBillet,
  type DecisionAnnulation,
  type EtatBillet,
} from "./regles";
import { SiegesService } from "./sieges.service";
import { aammjjDouala } from "./temps";
import { billetVoyageur, capaciteDe, siegesLibres } from "./vues";

const alea = (): number => randomBytes(4).readUInt32BE() / 2 ** 32;

export function entreeHistorique(
  action: ActionBillet,
  de: EtatBillet,
  vers: EtatBillet,
  at: string,
  par?: string,
  motif?: string,
): EntreeHistorique<EtatBillet, ActionBillet> {
  return {
    action,
    de,
    vers,
    at,
    ...(par !== undefined ? { par } : {}),
    ...(motif !== undefined ? { motif } : {}),
  };
}

export interface OptionsAnnulation {
  dc: DepartComplet;
  /** Qui annule (le voyageur, le guichetier, le système). */
  par: string;
  /** Le superviseur qui a donné son PIN : obligatoire pour une vente faite par un agent. */
  validePar?: string;
  raison: "voyageur" | "agence" | "depart_annule";
  motif?: string;
  /** Départ annulé par la compagnie : remboursement intégral, quel que soit l'horaire. */
  remboursementIntegral?: boolean;
}

/**
 * Cycle de vie d'un billet : émission, lecture par le voyageur, annulation, report, embarquement,
 * non-présentation. Toutes les transitions passent par la machine d'états du domaine ; un billet
 * annulé garde son numéro, rien n'est effacé.
 */
@Injectable()
export class BilletsService {
  constructor(
    private readonly billets: Billets,
    private readonly inventaire: Inventaire,
    private readonly sieges: SiegesService,
    private readonly catalogue: Catalogue,
    private readonly commandes: Commandes,
    private readonly passagers: Passagers,
    private readonly signataire: SignataireQr,
    private readonly numerotation: NumerotationEnLigne,
    private readonly avis: AvisBillets,
    private readonly horloge: Horloge,
  ) {}

  /* -------------------------------------------------------------- émission */

  /**
   * Enregistre un billet : signe son QR, occupe son siège (atomique : le siège ne peut pas être
   * vendu deux fois), puis écrit le billet. Si l'écriture échoue, le siège est rendu.
   * `par` : le voyageur qui détient un blocage sur ce siège (vente en ligne), sinon `null`.
   */
  async enregistrer(billet: Billet, par: string | null): Promise<Billet> {
    const maintenant = this.sieges.maintenant();
    const qr = await this.signataire.signer({
      numero: billet.numero,
      code: billet.codeBillet,
      departId: billet.departId,
    });
    const complet: Billet = { ...billet, qr };
    let version: number | null = null;
    if (complet.siege !== null) {
      const r = await this.inventaire.occuper({
        departId: complet.departId,
        siege: complet.siege,
        billetId: complet.id,
        par,
        maintenant,
      });
      if (!r.ok) {
        throw conflit("SIEGE_PRIS", "Ce siège est déjà pris ou retenu par une commande", {
          siege: complet.siege,
          raison: r.raison,
        });
      }
      version = r.version;
    }
    const resultat = await this.billets.ajouter(complet);
    if (resultat !== "ok") {
      if (complet.siege !== null) {
        const levee = await this.inventaire.liberer(complet.departId, complet.siege, complet.id);
        if (levee)
          this.sieges.publier(
            complet.departId,
            complet.siege,
            "libre",
            null,
            undefined,
            levee.version,
          );
      }
      if (resultat === "numero_pris") {
        throw conflit("NUMERO_EN_DOUBLE", "Ce numéro de billet est déjà utilisé", {
          numero: complet.numero,
        });
      }
      if (resultat === "code_pris") {
        throw conflit("CODE_BILLET_PRIS", "Ce code de billet est déjà pris dans ce départ");
      }
      throw conflit("BILLET_EXISTANT", "Ce billet existe déjà");
    }
    if (complet.siege !== null && version !== null) {
      this.sieges.publier(complet.departId, complet.siege, "pris", null, undefined, version);
    }
    const p = this.passagers.dechiffrer(complet.passagerChiffre);
    await this.avis.publier({
      type: "billet.emis",
      billetId: complet.id,
      numero: complet.numero,
      departId: complet.departId,
      canal: complet.canal,
      telephone: p.telephone,
      acheteurId: complet.acheteurId,
    });
    return complet;
  }

  /** Billet d'une commande payée en ligne : numéro du serveur (4001–9999), code unique du départ. */
  async emettreEnLigne(a: {
    commande: Commande;
    dc: DepartComplet;
    siege: number;
    passager: Passager;
    at: string;
  }): Promise<Billet> {
    const { commande, dc } = a;
    const aammjj = aammjjDouala(a.at);
    for (let essai = 0; ; essai++) {
      const sequence = await this.numerotation.prochaine({
        compagnieId: dc.compagnie.id,
        gareId: dc.origine.id,
        aammjj,
      });
      const pris = new Set(
        (await this.billets.duDepart(dc.depart.id))
          .filter((b) => b.etat !== "annule")
          .map((b) => b.codeBillet),
      );
      const billet: Billet = {
        id: randomUUID(),
        numero: numeroBillet({
          agence: dc.compagnie.code,
          gare: dc.origine.code,
          aammjj,
          sequence,
        }),
        sequence,
        compagnieId: dc.compagnie.id,
        gareId: dc.origine.id,
        departId: dc.depart.id,
        siege: a.siege,
        classe: dc.depart.classe,
        prix: dc.ligne.tarifs[dc.depart.classe],
        bagage: 0,
        canal: "en_ligne",
        guichetId: null,
        acheteurId: commande.voyageurId,
        commandeId: commande.id,
        passagerChiffre: this.passagers.chiffrer(a.passager),
        passagerTelephoneIndex: this.passagers.indexTelephone(a.passager.telephone),
        codeBillet: genererCodeBilletUnique(alea, pris),
        qr: "",
        creeA: a.at,
        etat: "paye",
        historique: [entreeHistorique("payer", "reserve", "paye", a.at, commande.voyageurId)],
        evenementId: null,
        appareilId: null,
        auteurId: commande.voyageurId,
        paiement: null,
        aCompleterAuQuai: false,
        smsEnvoye: false,
        retardPrevenu: false,
        embarqueA: null,
        reporteDe: null,
      };
      try {
        return await this.enregistrer(billet, commande.voyageurId);
      } catch (e) {
        // Deux émissions simultanées ont tiré le même code : on recommence avec un autre.
        const codePris = e instanceof Refus && e.code === "CODE_BILLET_PRIS";
        if (!codePris || essai >= 4) throw e;
      }
    }
  }

  /* -------------------------------------------------------------- lecture par le voyageur */

  async passager(billet: Billet): Promise<Passager> {
    return this.passagers.dechiffrer(billet.passagerChiffre);
  }

  /** Le billet d'un voyageur : un billet qui n'est pas le sien n'existe pas pour lui. */
  async duVoyageur(
    billetId: string,
    voyageurId: string,
  ): Promise<{ billet: Billet; dc: DepartComplet }> {
    const billet = await this.billets.trouver(billetId);
    if (!billet || billet.acheteurId !== voyageurId) {
      throw inconnu("BILLET_INCONNU", "Billet introuvable");
    }
    const dc = await this.catalogue.depart(billet.departId);
    if (!dc) throw inconnu("DEPART_INCONNU", "Départ introuvable");
    return { billet, dc };
  }

  async vueVoyageur(billetId: string, voyageurId: string) {
    const { billet, dc } = await this.duVoyageur(billetId, voyageurId);
    return billetVoyageur(billet, await this.passager(billet), dc);
  }

  private decision(billet: Billet, dc: DepartComplet): DecisionAnnulation {
    return decisionAnnulation({
      etat: billet.etat,
      prix: billet.prix + billet.bagage,
      classe: billet.classe,
      heureDepart: dc.depart.heureDepart,
      maintenant: this.horloge.maintenant(),
    });
  }

  async apercuAnnulation(billetId: string, voyageurId: string) {
    const { billet, dc } = await this.duVoyageur(billetId, voyageurId);
    const d = this.decision(billet, dc);
    return {
      billetId: billet.id,
      autorise: d.autorise,
      gratuite: d.gratuite,
      retenue: d.retenue,
      remboursement: d.remboursement,
      gratuiteJusqua: limiteAnnulationGratuite(dc.depart.heureDepart),
    };
  }

  async annulerParVoyageur(billetId: string, voyageurId: string, motif?: string) {
    const { billet, dc } = await this.duVoyageur(billetId, voyageurId);
    // Seule une vente en ligne s'annule seule : une vente d'agent exige le PIN d'un superviseur.
    if (billet.canal !== "en_ligne") {
      throw conflit("SUPERVISEUR_REQUIS", "Ce billet a été vendu en agence : voir le guichet");
    }
    const { billet: annule, decision } = await this.annuler(billet, {
      dc,
      par: voyageurId,
      raison: "voyageur",
      ...(motif ? { motif } : {}),
    });
    const commande = annule.commandeId ? await this.commandes.trouver(annule.commandeId) : null;
    const moyen = commande?.moyenPaiement ?? null;
    const rembourseSur =
      decision.remboursement > 0 &&
      (moyen === "mtn_momo" || moyen === "orange_money" || moyen === "carte" || moyen === "proche")
        ? moyen
        : undefined;
    return {
      billetId: annule.id,
      etat: "annule" as const,
      retenue: decision.retenue,
      remboursement: decision.remboursement,
      ...(rembourseSur ? { rembourseSur } : {}),
    };
  }

  /* -------------------------------------------------------------- annulation */

  /**
   * Annule un billet : la machine d'états le permet (jamais après l'embarquement), le siège revient
   * à la vente, le numéro reste. Sert aussi à la supervision (annulation validée par PIN) et à
   * l'annulation d'un départ (remboursement intégral).
   */
  async annuler(
    billet: Billet,
    o: OptionsAnnulation,
  ): Promise<{ billet: Billet; decision: DecisionAnnulation }> {
    const parAgent = billet.canal !== "en_ligne";
    if (parAgent && o.raison === "agence" && !o.validePar) {
      throw interdit("SUPERVISEUR_REQUIS", "Aucune annulation sans le PIN d'un superviseur");
    }
    const total = billet.prix + billet.bagage;
    const decision: DecisionAnnulation = o.remboursementIntegral
      ? {
          autorise: billetPeut(billet.etat, "annuler"),
          gratuite: true,
          retenue: 0,
          remboursement: total,
        }
      : this.decision(billet, o.dc);
    if (!decision.autorise) {
      throw conflit(
        "TRANSITION_INTERDITE",
        "Ce billet ne peut plus être annulé (embarqué, voyagé ou déjà annulé)",
        { etat: billet.etat },
      );
    }
    const at = this.sieges.maintenant();
    const apres = await this.billets.transitionner(billet.id, ["reserve", "paye", "reporte"], {
      etat: "annule",
      historique: [
        ...billet.historique,
        entreeHistorique("annuler", billet.etat, "annule", at, o.validePar ?? o.par, o.motif),
      ],
    });
    if (!apres) {
      throw conflit("TRANSITION_INTERDITE", "Ce billet vient de changer d'état");
    }
    if (billet.siege !== null && billet.etat !== "reporte") {
      await this.libererSiege(billet);
    }
    await this.avis.publier({
      type: "billet.annule",
      billetId: apres.id,
      numero: apres.numero,
      departId: apres.departId,
      raison: o.raison,
      retenue: decision.retenue,
      remboursement: decision.remboursement,
      acheteurId: apres.acheteurId,
    });
    return { billet: apres, decision };
  }

  /** Rend le siège d'un billet à la vente et le diffuse. */
  async libererSiege(billet: Billet): Promise<void> {
    if (billet.siege === null) return;
    const levee = await this.inventaire.liberer(billet.departId, billet.siege, billet.id);
    if (levee) {
      this.sieges.publier(billet.departId, billet.siege, "libre", null, undefined, levee.version);
    }
  }

  /* -------------------------------------------------------------- embarquement */

  /**
   * Embarque un billet payé. Atomique : si deux appareils scannent le même billet au même instant,
   * un seul passe de « payé » à « embarqué » ; l'autre reçoit `null` (déjà scanné).
   */
  async embarquer(billet: Billet, at: string, par: string): Promise<Billet | null> {
    const apres = await this.billets.transitionner(billet.id, ["paye"], {
      etat: "embarque",
      embarqueA: at,
      historique: [
        ...billet.historique,
        entreeHistorique("embarquer", "paye", "embarque", at, par),
      ],
    });
    if (apres) {
      await this.avis.publier({
        type: "billet.embarque",
        billetId: apres.id,
        numero: apres.numero,
        departId: apres.departId,
        at,
      });
    }
    return apres;
  }

  /** Non présenté : le siège d'un absent revient à la vente, le billet garde son numéro. */
  async marquerNonPresent(
    billet: Billet,
    at: string,
    par: string,
    motif?: string,
  ): Promise<Billet | null> {
    const apres = await this.billets.transitionner(billet.id, ["paye"], {
      etat: "non_presente",
      historique: [
        ...billet.historique,
        entreeHistorique("marquer_non_presente", "paye", "non_presente", at, par, motif),
      ],
    });
    if (!apres) return null;
    await this.libererSiege(billet);
    await this.avis.publier({
      type: "billet.non_presente",
      billetId: apres.id,
      numero: apres.numero,
      departId: apres.departId,
    });
    return apres;
  }

  /** Le voyageur prévient qu'il est en retard : le quai attendra son code plutôt que de libérer. */
  async prevenirRetard(billetId: string, voyageurId: string): Promise<void> {
    const { billet } = await this.duVoyageur(billetId, voyageurId);
    if (billet.etat !== "paye") {
      throw conflit("TRANSITION_INTERDITE", "Ce billet n'est plus en attente d'embarquement");
    }
    await this.billets.transitionner(billet.id, ["paye"], { retardPrevenu: true });
  }

  /** Posé par la passerelle SMS (AM-166) une fois le SMS parti. */
  async marquerSmsEnvoye(billetId: string): Promise<void> {
    const billet = await this.billets.trouver(billetId);
    if (!billet) throw inconnu("BILLET_INCONNU", "Billet introuvable");
    await this.billets.transitionner(billet.id, [billet.etat], { smsEnvoye: true });
  }

  /* -------------------------------------------------------------- report */

  /**
   * Reporte un billet payé (ou non présenté) sur un autre départ de la même ligne et de la même
   * classe, sans frais : un nouveau billet est émis (nouveau numéro, siège du même numéro si libre),
   * l'ancien passe à « reporté » et garde son numéro.
   */
  async reporter(
    billetId: string,
    departCibleId: string,
    voyageurId: string,
  ): Promise<{ ancien: Billet; nouveau: Billet; dc: DepartComplet }> {
    const { billet, dc: source } = await this.duVoyageur(billetId, voyageurId);
    if (!billetPeut(billet.etat, "reporter")) {
      throw conflit("TRANSITION_INTERDITE", "Ce billet ne peut plus être reporté", {
        etat: billet.etat,
      });
    }
    const cible = await this.catalogue.depart(departCibleId);
    if (!cible || cible.compagnie.id !== source.compagnie.id) {
      throw inconnu("DEPART_INCONNU", "Départ introuvable");
    }
    if (cible.depart.id === source.depart.id) {
      throw conflit("REPORT_IMPOSSIBLE", "Choisis un autre départ que celui du billet");
    }
    if (cible.ligne.id !== source.ligne.id || cible.depart.classe !== billet.classe) {
      throw conflit(
        "REPORT_IMPOSSIBLE",
        "Le report se fait sur un départ de la même ligne et de la même classe",
      );
    }
    exigerVendable(cible);
    exigerAvantLeDepart(cible, this.horloge.maintenant());

    const at = this.sieges.maintenant();
    const plan = await this.inventaire.plan(cible.depart.id);
    const libres = siegesLibres(plan, capaciteDe(cible), at);
    if (libres.length === 0) {
      throw conflit("DEPART_COMPLET", "Il ne reste aucune place sur ce départ");
    }
    // Le même numéro de siège s'il est libre, sinon le premier siège libre.
    const siege =
      billet.siege !== null && libres.includes(billet.siege) ? billet.siege : libres[0]!;

    const aammjj = aammjjDouala(at);
    const sequence = await this.numerotation.prochaine({
      compagnieId: cible.compagnie.id,
      gareId: cible.origine.id,
      aammjj,
    });
    const pris = new Set(
      (await this.billets.duDepart(cible.depart.id))
        .filter((b) => b.etat !== "annule")
        .map((b) => b.codeBillet),
    );
    const nouveau: Billet = {
      ...billet,
      id: randomUUID(),
      numero: numeroBillet({
        agence: cible.compagnie.code,
        gare: cible.origine.code,
        aammjj,
        sequence,
      }),
      sequence,
      gareId: cible.origine.id,
      departId: cible.depart.id,
      siege,
      prix: billet.prix,
      codeBillet: genererCodeBilletUnique(alea, pris),
      qr: "",
      creeA: at,
      etat: "paye",
      historique: [
        entreeHistorique(
          "reprogrammer",
          "reporte",
          "paye",
          at,
          voyageurId,
          `report depuis ${billet.numero}`,
        ),
      ],
      evenementId: null,
      smsEnvoye: false,
      retardPrevenu: false,
      embarqueA: null,
      reporteDe: billet.id,
    };
    const enregistre = await this.enregistrer(nouveau, voyageurId);
    const ancien = await this.billets.transitionner(billet.id, ["paye", "non_presente"], {
      etat: "reporte",
      historique: [
        ...billet.historique,
        entreeHistorique(
          "reporter",
          billet.etat,
          "reporte",
          at,
          voyageurId,
          `vers ${enregistre.numero}`,
        ),
      ],
    });
    if (!ancien) {
      // Le billet a changé d'état entre-temps (scanné, annulé) : on défait la nouvelle émission.
      await this.billets.transitionner(enregistre.id, ["paye"], {
        etat: "annule",
        historique: [
          ...enregistre.historique,
          entreeHistorique("annuler", "paye", "annule", at, "systeme", "report refusé"),
        ],
      });
      await this.libererSiege(enregistre);
      throw conflit("TRANSITION_INTERDITE", "Ce billet vient de changer d'état");
    }
    if (billet.etat === "paye") await this.libererSiege(billet);
    await this.avis.publier({
      type: "billet.reporte",
      ancienBilletId: billet.id,
      billetId: enregistre.id,
      departId: cible.depart.id,
    });
    return { ancien, nouveau: enregistre, dc: cible };
  }
}
