import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { conflit, inconnu, invalide } from "../billetterie/erreurs";
import { VerrouillageMois } from "../comptable/verrouillage.service";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import {
  ErreurAgregateurDefinitive,
  ErreurAgregateurTemporaire,
  type NotificationAgregateur,
} from "./agregateur";
import { CONFIG_PAIEMENTS, type ConfigPaiements } from "./config";
import { GardeAgregateur } from "./garde-agregateur";
import {
  sommeMontants,
  type CauseRemboursement,
  type LigneRemboursement,
  type Paiement,
  type Remboursement,
} from "./modeles";
import { Paiements, Remboursements } from "./ports";
import { attenteRemboursementMs, partDe } from "./regles";
import { Verrous } from "./verrous";

export interface DemandeRemboursement {
  lignes: LigneRemboursement[];
  cause: CauseRemboursement;
  /** Idempotence : la même clé ne produit jamais deux remboursements. */
  cle: string;
  billetId?: string | null;
  /** Enregistre sans appeler l'agrégateur tout de suite : le prochain balayage l'envoie. */
  differe?: boolean;
  /** Raison donnée par la personne qui demande (remboursement manuel) ; conservée dans l'audit. */
  motif?: string;
}

/** Pause entre deux rappels d'un remboursement que l'agrégateur dit « en cours ». */
const RAPPEL_EN_COURS_MS = 10 * 60_000;

/**
 * Remboursements vers le moyen d'origine. Le montant est pris sur la part du bénéficiaire concerné :
 * le prix du billet revient de la compagnie, les frais d'AfriMove reviennent d'AfriMove. Jamais plus
 * que le paiement (plafond par bénéficiaire, vérifié par le port), jamais deux fois la même clé.
 * Un remboursement qui n'a pas pu partir (agrégateur en panne) reste « demandé » et est repris par
 * le balayage avec la même référence, que l'agrégateur dédoublonne.
 */
@Injectable()
export class RemboursementsService {
  private readonly journal = new Logger("Remboursements");

  constructor(
    private readonly remboursements: Remboursements,
    private readonly paiements: Paiements,
    private readonly garde: GardeAgregateur,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
    private readonly verrous: Verrous,
    @Inject(CONFIG_PAIEMENTS) private readonly config: ConfigPaiements,
    private readonly verrou: VerrouillageMois,
  ) {}

  /**
   * Demande un remboursement. Rejouer la même clé rend le remboursement d'origine. Lève 404
   * `PAIEMENT_INCONNU`, 409 `PAIEMENT_NON_REUSSI`, 409 `REMBOURSEMENT_HORS_AGREGATEUR` (paiement pris
   * à la gare : l'agence rend l'argent) ou 409 `REMBOURSEMENT_SUPERIEUR_AU_PAIEMENT`.
   */
  async demander(
    paiementId: string,
    demande: DemandeRemboursement,
    acteur: Utilisateur | null = null,
  ): Promise<Remboursement> {
    const paiement = await this.paiements.trouver(paiementId);
    if (!paiement) throw inconnu("PAIEMENT_INCONNU", "Paiement introuvable");
    if (paiement.statut !== "reussi") {
      throw conflit("PAIEMENT_NON_REUSSI", "Seul un paiement reçu peut être remboursé");
    }
    if (paiement.fournisseur === null || paiement.idFournisseur === null) {
      throw conflit(
        "REMBOURSEMENT_HORS_AGREGATEUR",
        "Ce paiement a été encaissé à la gare : l'agence rembourse le voyageur",
      );
    }
    const lignes = demande.lignes.filter((l) => l.montant > 0);
    if (
      lignes.length === 0 ||
      lignes.some((l) => !Number.isInteger(l.montant)) ||
      demande.lignes.some((l) => l.montant < 0)
    ) {
      throw invalide("MONTANT_INVALIDE", "Le montant à rembourser doit être un entier positif");
    }

    return this.verrous.executer(`paiement:${paiement.id}`, async () => {
      const existant = await this.remboursements.parCle(demande.cle);
      if (existant) return existant;

      const maintenant = this.horloge.maintenant();
      const remboursement: Remboursement = {
        id: randomUUID(),
        paiementId: paiement.id,
        cle: demande.cle,
        cause: demande.cause,
        billetId: demande.billetId ?? null,
        lignes,
        montant: sommeMontants(lignes),
        statut: "demande",
        idFournisseur: null,
        referenceOperateur: null,
        tentatives: 0,
        prochainEssaiA: maintenant,
        derniereErreur: null,
        creeA: maintenant,
        termineA: null,
      };
      const resultat = await this.remboursements.ajouter(remboursement, {
        compagnie: partDe(paiement.repartition, "compagnie"),
        afrimove: partDe(paiement.repartition, "afrimove"),
      });
      if (resultat === "cle_connue") {
        const deja = await this.remboursements.parCle(demande.cle);
        if (deja) return deja;
      }
      if (resultat !== "ok") {
        throw conflit(
          "REMBOURSEMENT_SUPERIEUR_AU_PAIEMENT",
          "Le remboursement dépasserait ce qui a été payé",
        );
      }
      await this.audit.enregistrer({
        acteur: acteur
          ? { id: acteur.id, role: acteur.role, compagnieId: acteur.compagnieId }
          : null,
        action: "paiement.remboursement_demande",
        resultat: "succes",
        cible: { type: "paiement", id: paiement.id },
        details: {
          remboursementId: remboursement.id,
          montant: remboursement.montant,
          cause: remboursement.cause,
          lignes: remboursement.lignes,
          ...(demande.motif ? { motif: demande.motif } : {}),
        },
        at: maintenant,
      });
      return demande.differe ? remboursement : this.envoyer(paiement, remboursement);
    });
  }

  /** Rembourse tout ce qui n'a pas encore été rendu (commande non honorée, doublon). */
  async rembourserSolde(
    paiement: Paiement,
    cause: CauseRemboursement,
    cle: string,
  ): Promise<Remboursement | null> {
    const vivants = (await this.remboursements.dePaiement(paiement.id)).filter(
      (r) => r.statut !== "echoue",
    );
    const reste = (b: "compagnie" | "afrimove"): number =>
      partDe(paiement.repartition, b) -
      sommeMontants(vivants.flatMap((r) => r.lignes).filter((l) => l.beneficiaire === b));
    const lignes: LigneRemboursement[] = [
      { beneficiaire: "compagnie", montant: reste("compagnie") },
      { beneficiaire: "afrimove", montant: reste("afrimove") },
    ];
    if (sommeMontants(lignes) <= 0) return this.remboursements.parCle(cle);
    return this.demander(paiement.id, { lignes, cause, cle });
  }

  async dePaiement(paiementId: string): Promise<Remboursement[]> {
    return this.remboursements.dePaiement(paiementId);
  }

  /* ------------------------------------------------------------------ envoi et reprise */

  /** Un essai auprès de l'agrégateur. Ne lève jamais : l'échec est consigné et repris plus tard. */
  private async envoyer(paiement: Paiement, r: Remboursement): Promise<Remboursement> {
    const maintenant = this.horloge.maintenant();
    const tentatives = r.tentatives + 1;
    try {
      const reponse = await this.garde.rembourser({
        reference: r.id,
        idFournisseurPaiement: paiement.idFournisseur ?? "",
        montantFcfa: r.montant,
        lignes: r.lignes.map((l) => ({ beneficiaire: l.beneficiaire, montantFcfa: l.montant })),
      });
      const commun = {
        idFournisseur: reponse.idFournisseur,
        referenceOperateur: reponse.referenceOperateur,
        tentatives,
        derniereErreur: null,
      };
      if (reponse.etat === "reussi") {
        return await this.terminer(paiement, r, {
          ...commun,
          statut: "reussi",
          prochainEssaiA: null,
        });
      }
      if (reponse.etat === "echoue") {
        return await this.terminer(paiement, r, {
          ...commun,
          statut: "echoue",
          prochainEssaiA: null,
          derniereErreur: reponse.code ?? "refuse",
        });
      }
      // Accepté, pas encore remboursé : la notification conclura ; un rappel idempotent la double.
      return (
        (await this.remboursements.transitionner(r.id, ["demande"], {
          ...commun,
          prochainEssaiA: new Date(maintenant.getTime() + RAPPEL_EN_COURS_MS),
        })) ?? r
      );
    } catch (e) {
      if (e instanceof ErreurAgregateurDefinitive) {
        return this.terminer(paiement, r, {
          statut: "echoue",
          tentatives,
          prochainEssaiA: null,
          derniereErreur: e.code,
        });
      }
      const code = e instanceof ErreurAgregateurTemporaire ? e.code : "erreur_inattendue";
      if (tentatives >= this.config.remboursementEssaisMax) {
        return this.terminer(paiement, r, {
          statut: "echoue",
          tentatives,
          prochainEssaiA: null,
          derniereErreur: "essais_epuises",
        });
      }
      this.journal.warn(
        `Remboursement ${r.id} : essai ${tentatives} échoué (${code}), repris plus tard`,
      );
      return (
        (await this.remboursements.transitionner(r.id, ["demande"], {
          tentatives,
          derniereErreur: code,
          prochainEssaiA: new Date(
            maintenant.getTime() +
              attenteRemboursementMs(tentatives, this.config.remboursementReprisePremiereMs),
          ),
        })) ?? r
      );
    }
  }

  private async terminer(
    paiement: Paiement,
    r: Remboursement,
    changement: Partial<Omit<Remboursement, "id">>,
  ): Promise<Remboursement> {
    const at = this.horloge.maintenant();
    const apres =
      (await this.remboursements.transitionner(r.id, ["demande"], {
        ...changement,
        termineA: at,
      })) ??
      (await this.remboursements.trouver(r.id)) ??
      r;
    const reussi = apres.statut === "reussi";
    if (!reussi) {
      this.journal.error(
        `Remboursement ${r.id} du paiement ${paiement.id} échoué (${apres.derniereErreur ?? "?"}) : à traiter à la main`,
      );
    }
    await this.audit.enregistrer({
      action: reussi ? "paiement.rembourse" : "paiement.remboursement_echec",
      resultat: reussi ? "succes" : "echec",
      cible: { type: "paiement", id: paiement.id },
      details: {
        remboursementId: r.id,
        montant: r.montant,
        cause: r.cause,
        raison: apres.derniereErreur,
      },
      at,
    });
    return apres;
  }

  /** Balayage : réessaie les remboursements dont l'attente est écoulée. Rend le nombre repris. */
  async reprendre(): Promise<number> {
    const dus = await this.remboursements.aReprendre(this.horloge.maintenant(), 50);
    let n = 0;
    for (const r of dus) {
      const paiement = await this.paiements.trouver(r.paiementId);
      if (!paiement) continue;
      await this.verrous.executer(`paiement:${paiement.id}`, async () => {
        const courant = await this.remboursements.trouver(r.id);
        if (courant?.statut === "demande") {
          await this.envoyer(paiement, courant);
          n += 1;
        }
      });
    }
    return n;
  }

  private async dateDansUnMoisOuvert(compagnieId: string, instant: Date): Promise<Date> {
    if (!(await this.verrou.estVerrouille(compagnieId, instant))) return instant;
    return new Date(await this.verrou.premierInstantOuvert(compagnieId, instant));
  }

  /** Notification de l'agrégateur sur un remboursement. */
  async appliquerNotification(
    n: NotificationAgregateur,
  ): Promise<"applique" | "ignore" | "inconnu"> {
    const r =
      (n.reference ? await this.remboursements.trouver(n.reference) : null) ??
      (await this.remboursements.parIdFournisseur(n.idFournisseur));
    if (!r) return "inconnu";
    const paiement = await this.paiements.trouver(r.paiementId);
    if (!paiement) return "inconnu";
    return this.verrous.executer(`paiement:${paiement.id}`, async () => {
      // La date de fin du remboursement est celle de l'agrégateur. Une notification qui arrive après la
      // clôture du mois où elle est datée n'est jamais refusée (l'argent est parti) : elle s'inscrit au
      // début du premier mois ouvert. L'audit garde la vraie heure.
      const termineA = await this.dateDansUnMoisOuvert(paiement.compagnieId, n.at);
      const commun = {
        idFournisseur: n.idFournisseur,
        referenceOperateur: n.referenceOperateur ?? r.referenceOperateur,
        prochainEssaiA: null,
      };
      const apres =
        n.etat === "reussi"
          ? await this.remboursements.transitionner(r.id, ["demande", "echoue"], {
              ...commun,
              statut: "reussi",
              derniereErreur: null,
              termineA,
            })
          : await this.remboursements.transitionner(r.id, ["demande"], {
              ...commun,
              statut: "echoue",
              derniereErreur: n.code ?? "refuse",
              termineA,
            });
      if (!apres) return "ignore";
      await this.audit.enregistrer({
        action: n.etat === "reussi" ? "paiement.rembourse" : "paiement.remboursement_echec",
        resultat: n.etat === "reussi" ? "succes" : "echec",
        cible: { type: "paiement", id: paiement.id },
        details: { remboursementId: r.id, montant: r.montant, cause: r.cause },
        at: n.at,
      });
      return "applique";
    });
  }
}
