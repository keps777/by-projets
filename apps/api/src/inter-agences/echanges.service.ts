import { Injectable } from "@nestjs/common";
import { ColisRepository } from "../colis/ports";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import { AnnuairePatrons } from "./annuaire";
import { compagnieDe, erreur, modifier } from "./commun";
import { ConventionsService } from "./conventions.service";
import { SMS } from "./contenu";
import type {
  ColisInterAgencesStocke,
  CompagnieRef,
  DepartInterAgences,
  TransfertPlan,
  TronconPlan,
} from "./modele";
import { AnnuaireCompagnies, ColisInterAgences, DepartsInterAgences } from "./ports";
import {
  normaliserNom,
  memeVille,
  partsDesTroncons,
  repartir,
  responsable,
  totauxParCompagnie,
  transfertEnCours,
  type Responsabilite,
} from "./regles";
import { minutesEntre, versIsoDouala } from "./temps";
import type { ScanTransfertSaisi } from "./validation";

/** Les colis qui changent de bus (et de compagnie) en route : au plus deux tronçons, `colis.etat` ne change pas. */
const ETATS_ENREGISTRABLES = ["enregistre", "charge", "en_route"];
const TRONCONS_MAX = 2;

export function tronconDeDepart(
  rang: number,
  depart: DepartInterAgences,
  part: number,
): TronconPlan {
  return {
    rang,
    compagnieId: depart.compagnieId,
    departId: depart.id,
    origine: depart.origine,
    destination: depart.destination,
    heureDepart: depart.heureDepart,
    heureArrivee: depart.arriveePrevue,
    bus: depart.bus,
    part,
  };
}

export interface ResultatScan {
  plan: ColisInterAgencesStocke;
  sens: "remis_a" | "recu";
  /** La compagnie qui prend le colis en charge. */
  preneur: CompagnieRef;
  scanneLe: string;
  responsable: "cedant" | "preneur";
}

@Injectable()
export class EchangesService {
  constructor(
    readonly repo: ColisInterAgences,
    private readonly colis: ColisRepository,
    private readonly departs: DepartsInterAgences,
    private readonly annuaire: AnnuaireCompagnies,
    private readonly conventions: ConventionsService,
    private readonly patrons: AnnuairePatrons,
    private readonly horloge: Horloge,
    private readonly audit: AuditService,
  ) {}

  maintenant(): string {
    return versIsoDouala(this.horloge.maintenant());
  }

  private static horsInterAgences() {
    return erreur(404, "colis_hors_inter_agences", "Ce colis n'est pas en correspondance");
  }

  /**
   * Enregistre le plan de transport d'un colis qui changera de compagnie en route : le colis est celui de la
   * compagnie connectée, le premier tronçon est le sien, le second part de la ville d'arrivée du premier chez
   * une compagnie liée par une convention en vigueur. La part de chaque tronçon se calcule sur le port payé par
   * le client, comme la convention partage le colis type.
   */
  async enregistrer(
    utilisateur: Utilisateur,
    saisie: { colisId: string; departIds: string[] },
  ): Promise<ColisInterAgencesStocke> {
    const moi = compagnieDe(utilisateur);
    const colis = await this.colis.trouver(saisie.colisId);
    if (!colis || colis.compagnieId !== moi) {
      throw erreur(404, "colis_introuvable", "Colis introuvable");
    }
    if (!ETATS_ENREGISTRABLES.includes(colis.etat)) {
      throw erreur(409, "etat_incompatible", "Ce colis est déjà arrivé ou clos");
    }
    if (saisie.departIds.length > TRONCONS_MAX) {
      throw erreur(
        422,
        "troncons_non_pris_en_charge",
        `Deux tronçons au plus (deux compagnies, une convention) : ${saisie.departIds.length} demandés`,
      );
    }
    const departs: DepartInterAgences[] = [];
    for (const id of saisie.departIds) {
      const d = await this.departs.trouver(id);
      if (!d) throw erreur(404, "depart_introuvable", "Départ introuvable");
      departs.push(d);
    }
    const [premier, second] = departs as [DepartInterAgences, DepartInterAgences];
    if (premier.compagnieId !== moi) {
      throw erreur(
        422,
        "premier_troncon_autre_compagnie",
        "Le premier tronçon doit être celui de votre compagnie",
      );
    }
    if (second.compagnieId === moi) {
      throw erreur(422, "meme_compagnie", "Les deux tronçons sont à la même compagnie");
    }
    if (!memeVille(premier.destination, second.origine)) {
      throw erreur(
        422,
        "correspondance_impossible",
        "Le second tronçon ne part pas de la ville d'arrivée du premier",
      );
    }
    if (minutesEntre(premier.arriveePrevue, second.heureDepart) < 0) {
      throw erreur(
        422,
        "correspondance_impossible",
        "Le second bus part avant l'arrivée du premier",
      );
    }
    const convention = await this.conventions.activeEntre(moi, second.compagnieId);
    if (!convention) {
      throw erreur(422, "pas_de_convention", "Aucune convention en vigueur avec cette compagnie");
    }
    if (colis.port <= 0) {
      throw erreur(422, "port_inconnu", "Le port du colis est inconnu : le partage est impossible");
    }

    const compagnies = departs.map((d) => d.compagnieId);
    const parCompagnie = repartir(colis.port, totauxParCompagnie(convention.parts), compagnies);
    const parts = partsDesTroncons(compagnies, parCompagnie);
    const maintenant = this.maintenant();
    const plan: ColisInterAgencesStocke = {
      colisId: colis.id,
      version: 1,
      numero: colis.numero,
      conventionId: convention.id,
      emettriceId: moi,
      prix: colis.port,
      troncons: departs.map((d, i) => tronconDeDepart(i + 1, d, parts[i] ?? 0)),
      transferts: [
        {
          rang: 1,
          cedantId: premier.compagnieId,
          preneurId: second.compagnieId,
          remis: null,
          recu: null,
        },
      ],
      creeLe: maintenant,
      creePar: utilisateur.id,
    };
    if (!(await this.repo.ajouter(plan))) {
      throw erreur(409, "deja_enregistre", "Ce colis est déjà en correspondance");
    }
    await this.audit.enregistrer({
      acteur: { id: utilisateur.id, role: utilisateur.role, compagnieId: moi },
      action: "inter_agences.colis_enregistre",
      resultat: "succes",
      cible: { type: "colis", id: colis.id },
      details: { colis: colis.numero, convention: convention.id },
    });
    return plan;
  }

  /** Le plan d'un colis, pour une compagnie qui y a un tronçon ; inconnu pour toute autre. */
  async plan(utilisateur: Utilisateur, colisId: string): Promise<ColisInterAgencesStocke> {
    const moi = compagnieDe(utilisateur);
    const plan = await this.repo.trouver(colisId);
    if (!plan || !plan.troncons.some((t) => t.compagnieId === moi)) {
      throw EchangesService.horsInterAgences();
    }
    return plan;
  }

  /** À qui est le colis : à celui dont le dernier scan « reçu » est enregistré. */
  async responsable(
    utilisateur: Utilisateur,
    colisId: string,
  ): Promise<{
    plan: ColisInterAgencesStocke;
    responsabilite: Responsabilite;
    compagnie: CompagnieRef;
  }> {
    const plan = await this.plan(utilisateur, colisId);
    const responsabilite = responsable(plan);
    const compagnie = await this.annuaire.trouver(responsabilite.compagnieId);
    if (!compagnie) throw erreur(404, "compagnie_introuvable", "Compagnie introuvable");
    return { plan, responsabilite, compagnie };
  }

  /** Les plans où la compagnie a un tronçon, du plus récent au plus ancien. */
  async liste(compagnieId: string): Promise<ColisInterAgencesStocke[]> {
    const plans = await this.repo.lister({ compagnieId });
    return plans.sort((a, b) => Date.parse(b.creeLe) - Date.parse(a.creeLe));
  }

  /**
   * Le passage de témoin que ce scan concerne, ou l'erreur qui l'interdit. `rejeu` : le scan est déjà enregistré.
   * « remis à » : seul le porteur du colis le cède ; « reçu » : seule la compagnie qui le prend, une fois la
   * remise scannée.
   */
  private cibler(
    plan: ColisInterAgencesStocke,
    sens: "remis_a" | "recu",
    moi: string,
  ): { t: TransfertPlan; rejeu: boolean } {
    if (sens === "remis_a") {
      const t = transfertEnCours(plan);
      if (!t) throw erreur(409, "colis_arrive", "Tous les passages de témoin sont faits");
      if (t.cedantId !== moi) {
        throw erreur(403, "pas_le_porteur", "Ce colis n'est pas encore à votre compagnie");
      }
      return { t, rejeu: t.remis !== null };
    }
    const t =
      plan.transferts.find((x) => x.preneurId === moi && x.recu === null) ??
      [...plan.transferts].reverse().find((x) => x.preneurId === moi);
    if (!t) {
      throw erreur(
        403,
        "pas_le_preneur",
        "Ce colis ne doit pas être pris en charge par votre compagnie",
      );
    }
    if (t.recu) return { t, rejeu: true };
    if (!t.remis) {
      throw erreur(
        409,
        "remise_non_scannee",
        "La compagnie qui cède le colis n'a pas encore scanné « remis à »",
      );
    }
    return { t, rejeu: false };
  }

  /**
   * Le scan de transfert à la gare de correspondance. « remis à » : le convoyeur qui cède le colis (il en
   * reste responsable). « reçu » : le convoyeur qui le prend en charge, une fois la remise scannée ; la
   * responsabilité passe alors à sa compagnie. Rejouer un scan ne change rien.
   */
  async scanner(utilisateur: Utilisateur, saisie: ScanTransfertSaisi): Promise<ResultatScan> {
    const moi = compagnieDe(utilisateur);
    const lu = await this.repo.trouver(saisie.colisId);
    if (!lu || !lu.troncons.some((t) => t.compagnieId === moi)) {
      throw EchangesService.horsInterAgences();
    }
    const cible = this.cibler(lu, saisie.sens, moi);
    const preneur = await this.preneurDuScan(saisie, cible.t);
    const scan = { a: this.maintenant(), par: utilisateur.id, lieu: saisie.lieu ?? null };
    const champ = saisie.sens === "recu" ? "recu" : "remis";

    let ecrit = false;
    const plan = await modifier(
      () => this.repo.trouver(saisie.colisId),
      (p, v) => this.repo.remplacer(p, v),
      (p) => {
        const c = this.cibler(p, saisie.sens, moi);
        if (c.rejeu) return p;
        ecrit = true;
        return this.avecTransfert(p, { ...c.t, [champ]: scan });
      },
      () => EchangesService.horsInterAgences(),
    );
    const transfert = plan.transferts.find((x) => x.rang === cible.t.rang) ?? cible.t;
    if (ecrit) {
      await this.audit.enregistrer({
        acteur: { id: utilisateur.id, role: utilisateur.role, compagnieId: moi },
        action: saisie.sens === "recu" ? "inter_agences.colis_recu" : "inter_agences.colis_remis",
        resultat: "succes",
        cible: { type: "colis", id: plan.colisId },
        details: { colis: plan.numero, preneur: preneur.id },
      });
      if (saisie.sens === "recu") await this.prevenirExpediteur(plan, preneur, transfert);
    }
    return {
      plan,
      sens: saisie.sens,
      preneur,
      scanneLe: transfert[champ]?.a ?? scan.a,
      responsable: transfert.recu ? "preneur" : "cedant",
    };
  }

  private avecTransfert(plan: ColisInterAgencesStocke, t: TransfertPlan): ColisInterAgencesStocke {
    return { ...plan, transferts: plan.transferts.map((x) => (x.rang === t.rang ? t : x)) };
  }

  /** La compagnie annoncée dans le scan (nom ou identifiant) doit être celle qui prend le colis en charge. */
  private async preneurDuScan(saisie: ScanTransfertSaisi, t: TransfertPlan): Promise<CompagnieRef> {
    const preneur = await this.annuaire.trouver(t.preneurId);
    if (!preneur) throw erreur(404, "compagnie_introuvable", "Compagnie introuvable");
    if (
      saisie.compagnie !== preneur.id &&
      normaliserNom(saisie.compagnie) !== normaliserNom(preneur.nom)
    ) {
      throw erreur(
        422,
        "mauvais_preneur",
        "La compagnie indiquée n'est pas celle qui prend le colis en charge",
      );
    }
    return preneur;
  }

  /** Un SMS par étape pour le client : il suit un seul numéro, même quand le colis change de compagnie. */
  private async prevenirExpediteur(
    plan: ColisInterAgencesStocke,
    preneur: CompagnieRef,
    t: TransfertPlan,
  ): Promise<void> {
    const colis = await this.colis.trouver(plan.colisId);
    if (!colis) return;
    const lieu =
      t.recu?.lieu ?? plan.troncons[t.rang - 1]?.destination ?? "la ville de correspondance";
    await this.patrons.prevenir(
      colis.expediteur.telephone,
      SMS.colisPris(plan.numero, preneur.nom, lieu),
    );
  }
}
