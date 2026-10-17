import { Injectable } from "@nestjs/common";
import type { Prisma, Role } from "../socle/db/generated/client";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { PrismaService } from "../socle/db/prisma.service";
import { Horloge } from "../socle/horloge";
import { ETATS_ANNULABLES, ETATS_REPORTABLES, type EtatBillet } from "../caisse/regles";
import { date, UUID } from "../caisse/sql";
import { debutJourDoualaMs, MS_PAR_HEURE, MS_PAR_JOUR, versIsoDouala } from "../caisse/temps";
import {
  DemandesAnnulation,
  EquipeGare,
  PinsEquipe,
  RegistreBillets,
  ROLES_EQUIPE,
  SourceGare,
  type BilletAnnulable,
  type DemandeAnnulationStockee,
  type DepartGareVue,
  type EtatPinStocke,
  type GareVue,
  type MembreEquipe,
  type ModePaiement,
  type RoleEquipe,
} from "./ports";

/**
 * Adaptateurs PostgreSQL (Prisma) des ports de la supervision (AM-164). Tables : `demande_annulation`
 * (créée pour ce module), `billet` et `siege_depart` (le billet et son siège), `personne` (équipe, PIN),
 * et en lecture `gare`, `guichet`, `depart`, `ligne`, `bus`, `appareil_sync`, `session_caisse`.
 *
 * Ce que la base garantit, sans compter sur le code :
 * - **une seule demande d'annulation en attente par billet** : index unique partiel
 *   `demande_annulation_une_en_attente_par_billet`. `creer` est un `INSERT … ON CONFLICT DO NOTHING` ;
 * - **une demande n'est décidée qu'une fois** : `decider` est un `UPDATE … WHERE statut = 'en_attente'`
 *   d'un seul tenant, et le CHECK `demande_annulation_coherence` interdit une décision sans auteur ni
 *   heure ;
 * - **un billet ne change d'état que depuis un état permis** : `appliquer` verrouille la ligne
 *   (`SELECT … FOR UPDATE`) puis écrit `UPDATE … WHERE id = $1 AND etat = $lu` ; le siège est libéré
 *   (ligne de `siege_depart` supprimée, `versionPlan` du départ incrémenté) dans la même transaction.
 *   Le numéro du billet n'est jamais modifié.
 */

/* ------------------------------------------------------------------ billets */

const CONTEXTE_PASSAGER = "billet.passager";
/** Texte affiché pour un billet dont le voyageur n'a pas (encore) de nom. */
const NOM_ABSENT = "Voyageur sans nom";

type LigneBillet = Prisma.BilletGetPayload<{
  include: {
    guichet: true;
    auteur: true;
    depart: { include: { ligne: { include: { destination: true } } } };
  };
}>;

const AVEC_BILLET = {
  guichet: true,
  auteur: true,
  depart: { include: { ligne: { include: { destination: true } } } },
} as const;

const MODES: readonly ModePaiement[] = ["cash", "momo", "orange_money"];

/**
 * Le mode de paiement du billet. Un billet sans paiement connu (réservation en ligne non réglée) n'a
 * rien encaissé au guichet : on le range avec le MoMo, c'est-à-dire hors de la caisse.
 */
function modeDe(paiement: unknown): ModePaiement {
  const mode = (paiement as { mode?: unknown } | null)?.mode;
  return MODES.find((m) => m === mode) ?? "momo";
}

@Injectable()
export class RegistreBilletsPrisma extends RegistreBillets {
  readonly durable = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chiffrement: ChiffrementService,
  ) {
    super();
  }

  private voyageur(l: LigneBillet): BilletAnnulable["voyageur"] {
    // Un billet de cadence est vendu sans nom, à compléter au quai : le contrat exige un nom lisible.
    if (l.passagerChiffre === null) return { nom: NOM_ABSENT, pieceQuatreDerniers: null };
    const p = this.chiffrement.dechiffrerJson<{
      nom: string | null;
      pieceQuatreDerniers: string | null;
    }>(l.passagerChiffre, CONTEXTE_PASSAGER);
    return {
      nom: p.nom && p.nom.trim() !== "" ? p.nom : NOM_ABSENT,
      pieceQuatreDerniers: p.pieceQuatreDerniers ?? null,
    };
  }

  async trouver(billetId: string): Promise<BilletAnnulable | null> {
    if (!UUID.test(billetId)) return null;
    const l = await this.prisma.billet.findUnique({
      where: { id: billetId },
      include: AVEC_BILLET,
    });
    if (!l) return null;
    // Scanné au quai : monté à bord (horodaté sur le billet) ou une ligne `scan_quai` « monté ».
    const scan =
      l.embarqueA !== null ||
      (await this.prisma.scanQuai.findFirst({
        where: { billetId: l.id, resultat: { in: ["monte", "deja_scanne"] } },
        select: { evenementId: true },
      })) !== null;
    return {
      billetId: l.id,
      numero: l.numero,
      sequence: l.sequence,
      prix: l.prix,
      classe: l.classe,
      etat: l.etat,
      gareId: l.gareId,
      compagnieId: l.compagnieId,
      depart: {
        departId: l.departId,
        heureDepart: versIsoDouala(l.depart.heureDepart),
        destination: l.depart.ligne.destination.ville,
        siege: l.siege ?? 0,
      },
      voyageur: this.voyageur(l),
      vendu: {
        at: versIsoDouala(l.creeA),
        guichetRang: l.guichet?.rang ?? 0,
        mode: modeDe(l.paiement),
        agentId: l.auteurId ?? "",
        agentNom: l.auteur?.nom ?? "",
      },
      scanne: scan,
    };
  }

  async appliquer(
    billetId: string,
    action: "annuler" | "reporter",
    meta: { at: string; parId: string; motif: string | null },
  ): Promise<{ etat: EtatBillet; siegeLibere: boolean } | null> {
    if (!UUID.test(billetId)) return null;
    const permis = action === "annuler" ? ETATS_ANNULABLES : ETATS_REPORTABLES;
    const etat: EtatBillet = action === "annuler" ? "annule" : "reporte";
    return this.prisma.$transaction(async (tx) => {
      // La ligne est verrouillée : un scan au quai ou une autre décision attend la fin de celle-ci.
      const lues = await tx.$queryRaw<
        { etat: EtatBillet; departId: string; siege: number | null; historique: unknown }[]
      >`SELECT "etat"::text AS "etat", "departId", "siege", "historique" FROM "billet" WHERE "id" = ${billetId}::uuid FOR UPDATE`;
      const lue = lues[0];
      if (!lue || !permis.includes(lue.etat)) return null;

      const entree = {
        action,
        de: lue.etat,
        vers: etat,
        at: meta.at,
        par: meta.parId,
        ...(meta.motif !== null ? { motif: meta.motif } : {}),
      };
      const historique = [
        ...(Array.isArray(lue.historique) ? (lue.historique as unknown[]) : []),
        entree,
      ] as Prisma.InputJsonValue;
      // Compare-et-échange sur l'état lu : la ligne verrouillée ne peut plus bouger, mais c'est la
      // condition de l'UPDATE qui garantit que rien n'est écrit depuis un autre état.
      const { count } = await tx.billet.updateMany({
        where: { id: billetId, etat: lue.etat },
        data: { etat, historique },
      });
      if (count !== 1) return null;

      // Un billet reporté a déjà rendu son siège au moment du report : il n'y a rien à libérer.
      let siegeLibere = false;
      if (lue.siege !== null && lue.etat !== "reporte") {
        const { count: libres } = await tx.siegeDepart.deleteMany({
          where: { departId: lue.departId, siege: lue.siege, billetId },
        });
        siegeLibere = true;
        if (libres > 0) {
          await tx.depart.update({
            where: { id: lue.departId },
            data: { versionPlan: { increment: 1 } },
          });
        }
      }
      return { etat, siegeLibere };
    });
  }
}

/* ------------------------------------------------------------------ demandes d'annulation */

type LigneDemande = Prisma.DemandeAnnulationGetPayload<object>;

function versDemande(l: LigneDemande): DemandeAnnulationStockee {
  return {
    demandeId: l.demandeId,
    billetId: l.billetId,
    gareId: l.gareId,
    compagnieId: l.compagnieId,
    demandeurId: l.demandeurId,
    guichetRang: l.guichetRang,
    motif: l.motif,
    demandeA: versIsoDouala(l.demandeA),
    statut: l.statut as DemandeAnnulationStockee["statut"],
    decision: l.decision as DemandeAnnulationStockee["decision"],
    montant: l.montant,
    decideeA: l.decideeA ? versIsoDouala(l.decideeA) : null,
    decideeParId: l.decideeParId,
    evenementDemandeId: l.evenementDemandeId,
    evenementDecisionId: l.evenementDecisionId,
  };
}

@Injectable()
export class DemandesAnnulationPrisma extends DemandesAnnulation {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async creer(
    d: DemandeAnnulationStockee,
  ): Promise<"ok" | "deja_en_attente" | "identifiant_pris" | "identifiant_invalide"> {
    const ids = [d.demandeId, d.billetId, d.gareId, d.demandeurId, d.evenementDemandeId];
    if (!ids.every((x) => UUID.test(x)) || (d.compagnieId !== null && !UUID.test(d.compagnieId))) {
      return "identifiant_invalide";
    }
    for (let tentative = 0; tentative < 3; tentative++) {
      // INSERT … ON CONFLICT DO NOTHING : la clé primaire (la demande) et l'index unique partiel
      // (une seule demande en attente par billet) départagent deux demandes simultanées.
      const { count } = await this.prisma.demandeAnnulation.createMany({
        data: [
          {
            demandeId: d.demandeId,
            billetId: d.billetId,
            gareId: d.gareId,
            compagnieId: d.compagnieId,
            demandeurId: d.demandeurId,
            guichetRang: d.guichetRang,
            motif: d.motif,
            demandeA: new Date(d.demandeA),
            statut: d.statut,
            decision: d.decision,
            montant: d.montant,
            decideeA: date(d.decideeA),
            decideeParId: d.decideeParId,
            evenementDemandeId: d.evenementDemandeId,
            evenementDecisionId: d.evenementDecisionId,
          },
        ],
        skipDuplicates: true,
      });
      if (count === 1) return "ok";
      if (
        await this.prisma.demandeAnnulation.findUnique({
          where: { demandeId: d.demandeId },
          select: { demandeId: true },
        })
      ) {
        return "identifiant_pris";
      }
      if (
        await this.prisma.demandeAnnulation.findFirst({
          where: { billetId: d.billetId, statut: "en_attente" },
          select: { demandeId: true },
        })
      ) {
        return "deja_en_attente";
      }
      // Ce qui bloquait vient d'être décidé entre-temps : on réessaie.
    }
    return "deja_en_attente";
  }

  async trouver(demandeId: string): Promise<DemandeAnnulationStockee | null> {
    if (!UUID.test(demandeId)) return null;
    const l = await this.prisma.demandeAnnulation.findUnique({ where: { demandeId } });
    return l ? versDemande(l) : null;
  }

  async enAttenteDuBillet(billetId: string): Promise<DemandeAnnulationStockee | null> {
    if (!UUID.test(billetId)) return null;
    const l = await this.prisma.demandeAnnulation.findFirst({
      where: { billetId, statut: "en_attente" },
    });
    return l ? versDemande(l) : null;
  }

  async enAttenteDeGare(gareId: string): Promise<DemandeAnnulationStockee[]> {
    if (!UUID.test(gareId)) return [];
    const lignes = await this.prisma.demandeAnnulation.findMany({
      where: { gareId, statut: "en_attente" },
      orderBy: [{ demandeA: "asc" }, { demandeId: "asc" }],
    });
    return lignes.map(versDemande);
  }

  async decider(
    demandeId: string,
    d: {
      decision: NonNullable<DemandeAnnulationStockee["decision"]>;
      montant: number;
      decideeA: string;
      decideeParId: string;
      evenementDecisionId: string;
    },
  ): Promise<boolean> {
    if (!UUID.test(demandeId) || !UUID.test(d.decideeParId) || !UUID.test(d.evenementDecisionId)) {
      return false;
    }
    // Compare-et-échange : la demande n'est réservée que si elle attend encore une décision.
    const { count } = await this.prisma.demandeAnnulation.updateMany({
      where: { demandeId, statut: "en_attente" },
      data: {
        statut: "decidee",
        decision: d.decision,
        montant: d.montant,
        decideeA: new Date(d.decideeA),
        decideeParId: d.decideeParId,
        evenementDecisionId: d.evenementDecisionId,
      },
    });
    return count === 1;
  }

  async rouvrir(demandeId: string): Promise<void> {
    if (!UUID.test(demandeId)) return;
    await this.prisma.demandeAnnulation.updateMany({
      where: { demandeId, statut: "decidee" },
      data: {
        statut: "en_attente",
        decision: null,
        montant: null,
        decideeA: null,
        decideeParId: null,
        evenementDecisionId: null,
      },
    });
  }
}

/* ------------------------------------------------------------------ vue de la gare */

/** Un appareil qui s'est annoncé depuis moins de ce délai est « synchronisé ». */
export const SYNCHRO_RECENTE_MINUTES = 15;
/** Début de « l'après-midi » (heure de Douala). */
const HEURE_APRES_MIDI = 12;
const JOURS_ANNULATIONS = 10;
const ETATS_VIVANTS = ["reserve", "paye", "embarque", "voyage"] as const;

@Injectable()
export class SourceGarePrisma extends SourceGare {
  readonly durable = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly horloge: Horloge,
  ) {
    super();
  }

  async gare(gareId: string): Promise<GareVue | null> {
    if (!UUID.test(gareId)) return null;
    const gare = await this.prisma.gare.findUnique({
      where: { id: gareId },
      include: { guichets: { orderBy: { rang: "asc" } } },
    });
    if (!gare) return null;
    const maintenant = this.horloge.maintenant();
    const debutJour = new Date(debutJourDoualaMs(maintenant));
    const finJour = new Date(debutJour.getTime() + MS_PAR_JOUR);

    const ventes = await this.prisma.billet.groupBy({
      by: ["guichetId"],
      where: { gareId, canal: "guichet", creeA: { gte: debutJour, lt: finJour } },
      _count: { _all: true },
    });
    const appareils = await this.prisma.appareilSync.findMany({
      where: { gareId, retire: false },
      select: { derniereSyncA: true },
    });
    const recent = maintenant.getTime() - SYNCHRO_RECENTE_MINUTES * 60_000;
    const quais = await this.prisma.depart.aggregate({
      _max: { quai: true },
      where: { ligne: { origineGareId: gareId } },
    });

    const departs = await this.prisma.depart.findMany({
      where: {
        ligne: { origineGareId: gareId },
        heureDepart: {
          gte: new Date(debutJour.getTime() + HEURE_APRES_MIDI * MS_PAR_HEURE),
          lt: finJour,
        },
        etat: { notIn: ["annule", "arrive"] },
      },
      include: { bus: true, ligne: { include: { destination: true } } },
      orderBy: [{ heureDepart: "asc" }, { numero: "asc" }],
    });
    const vendus = await this.prisma.billet.groupBy({
      by: ["departId"],
      where: { departId: { in: departs.map((d) => d.id) }, etat: { in: [...ETATS_VIVANTS] } },
      _count: { _all: true },
    });
    const nombreVendus = new Map(vendus.map((v) => [v.departId, v._count._all]));

    return {
      id: gare.id,
      nom: gare.nom,
      quais: quais._max.quai ?? 0,
      synchro: {
        synchronises: appareils.filter(
          (a) => a.derniereSyncA !== null && a.derniereSyncA.getTime() >= recent,
        ).length,
        total: appareils.length,
      },
      guichets: gare.guichets.map((g) => ({
        rang: g.rang,
        billets: ventes.find((v) => v.guichetId === g.id)?._count._all ?? 0,
      })),
      departsApresMidi: departs.map((d): DepartGareVue => {
        const vendu = nombreVendus.get(d.id) ?? 0;
        return {
          departId: d.id,
          heureDepart: versIsoDouala(d.heureDepart),
          destination: d.ligne.destination.ville,
          // Le contrat veut un quai (≥ 1) et une capacité (≥ 1) : à défaut, le premier quai, et
          // au moins les places déjà vendues.
          quai: d.quai ?? 1,
          bus: d.bus?.immatriculation ?? null,
          vendus: vendu,
          capacite: Math.max(d.bus?.capacite ?? 0, vendu, 1),
          // Aucune règle de proposition de fusion n'existe encore côté serveur.
          fusionProposeeAvec: null,
        };
      }),
    };
  }

  async cadenceSansNom(gareId: string, aammjj: string): Promise<number> {
    if (!UUID.test(gareId) || !/^\d{6}$/.test(aammjj)) return 0;
    // Les billets de cadence se complètent au quai (`aCompleterAuQuai`) ; AAMMJJ = jour de Douala.
    const debut = new Date(
      `20${aammjj.slice(0, 2)}-${aammjj.slice(2, 4)}-${aammjj.slice(4, 6)}T00:00:00.000+01:00`,
    );
    if (Number.isNaN(debut.getTime())) return 0;
    return this.prisma.billet.count({
      where: {
        gareId,
        aCompleterAuQuai: true,
        creeA: { gte: debut, lt: new Date(debut.getTime() + MS_PAR_JOUR) },
      },
    });
  }

  async annulationsAgent(
    agentId: string,
    gareId: string,
    maintenant: string,
  ): Promise<{ aujourdhui: number; dixJours: number; moyenneGuichets: number }> {
    if (!UUID.test(agentId) || !UUID.test(gareId)) {
      return { aujourdhui: 0, dixJours: 0, moyenneGuichets: 0 };
    }
    // Les demandes faites (quelle qu'en soit l'issue) : c'est leur fréquence qui alerte le superviseur.
    const debutJour = debutJourDoualaMs(maintenant);
    const debutPeriode = new Date(debutJour - (JOURS_ANNULATIONS - 1) * MS_PAR_JOUR);
    const aujourdhui = await this.prisma.demandeAnnulation.count({
      where: { demandeurId: agentId, demandeA: { gte: new Date(debutJour) } },
    });
    const dixJours = await this.prisma.demandeAnnulation.count({
      where: { demandeurId: agentId, demandeA: { gte: debutPeriode } },
    });
    const gare = await this.prisma.demandeAnnulation.count({
      where: { gareId, demandeA: { gte: debutPeriode } },
    });
    const guichets = await this.prisma.guichet.count({ where: { gareId } });
    return {
      aujourdhui,
      dixJours,
      moyenneGuichets: guichets === 0 ? 0 : Math.round(gare / guichets),
    };
  }
}

/* ------------------------------------------------------------------ équipe */

type LignePersonne = Prisma.PersonneGetPayload<{ include: { guichet: true } }>;

const ROLES_EQUIPE_BASE = ROLES_EQUIPE as readonly string[];

const roleEquipe = (roles: readonly Role[]): RoleEquipe | null =>
  ROLES_EQUIPE.find((r) => roles.includes(r as Role)) ?? null;

@Injectable()
export class EquipeGarePrisma extends EquipeGare {
  readonly durable = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly horloge: Horloge,
  ) {
    super();
  }

  async lister(gareId: string): Promise<MembreEquipe[]> {
    if (!UUID.test(gareId)) return [];
    const lignes = await this.prisma.personne.findMany({
      where: { gareId, actif: true, roles: { hasSome: ROLES_EQUIPE as unknown as Role[] } },
      include: { guichet: true },
      orderBy: [{ creeA: "asc" }, { id: "asc" }],
    });
    return Promise.all(lignes.map((l) => this.versMembre(l)));
  }

  async trouver(personneId: string): Promise<MembreEquipe | null> {
    if (!UUID.test(personneId)) return null;
    const l = await this.prisma.personne.findUnique({
      where: { id: personneId },
      include: { guichet: true },
    });
    if (!l || l.gareId === null || roleEquipe(l.roles) === null) return null;
    return this.versMembre(l);
  }

  private async versMembre(l: LignePersonne): Promise<MembreEquipe> {
    const role = roleEquipe(l.roles)!;
    const maintenant = this.horloge.maintenant();
    const debutJour = new Date(debutJourDoualaMs(maintenant));
    const finJour = new Date(debutJour.getTime() + MS_PAR_JOUR);
    const billets = await this.prisma.billet.count({
      where: { auteurId: l.id, creeA: { gte: new Date(maintenant.getTime() - 90 * MS_PAR_JOUR) } },
    });

    let affectation: string | null = l.guichet ? `guichet ${l.guichet.rang}` : null;
    let situationDuJour: MembreEquipe["situationDuJour"] = "hors_service";
    let situation: string | null = null;

    if (role === "chauffeur" || role === "convoyeur") {
      // Le départ du jour de la personne : à bord s'il est parti, au quai tant qu'il n'est pas arrivé.
      const depart = await this.prisma.depart.findFirst({
        where: {
          ...(role === "chauffeur" ? { chauffeurId: l.id } : { convoyeurId: l.id }),
          heureDepart: { gte: debutJour, lt: finJour },
          etat: { notIn: ["annule", "arrive"] },
        },
        include: { bus: true, ligne: { include: { destination: true } } },
        orderBy: { heureDepart: "asc" },
      });
      if (depart) {
        affectation = depart.bus?.immatriculation ?? affectation;
        situationDuJour = depart.etat === "parti" ? "a_bord" : "en_service";
        situation =
          depart.etat === "parti" ? `en route vers ${depart.ligne.destination.ville}` : null;
      }
    } else if (role === "guichetier") {
      const ouverte = await this.prisma.sessionCaisse.findFirst({
        where: { agentId: l.id, etat: "ouverte" },
        select: { id: true },
      });
      if (ouverte) situationDuJour = "en_service";
    } else if (l.derniereConnexionA !== null && l.derniereConnexionA >= debutJour) {
      // Contrôleur, superviseur : présents quand ils se sont connectés aujourd'hui.
      situationDuJour = "en_service";
    }

    return {
      personneId: l.id,
      role,
      gareId: l.gareId!,
      compagnieId: l.compagnieId,
      guichetId: l.guichetId,
      affectation,
      situationDuJour,
      situation,
      billets,
      depuis: versIsoDouala(l.creeA),
      actif: l.actif,
    };
  }

  async changerAffectation(
    personneId: string,
    changement: { guichetId: string | null; role: RoleEquipe | null },
  ): Promise<void> {
    if (!UUID.test(personneId)) return;
    const l = await this.prisma.personne.findUnique({
      where: { id: personneId },
      select: { roles: true },
    });
    if (!l) return;
    const data: Prisma.PersonneUncheckedUpdateInput = {};
    if (changement.guichetId !== null) data.guichetId = changement.guichetId;
    if (changement.role !== null) {
      // Le rôle d'équipe est remplacé ; les autres rôles de la personne sont conservés.
      data.roles = [
        ...l.roles.filter((r) => !ROLES_EQUIPE_BASE.includes(r)),
        changement.role as Role,
      ];
    }
    await this.prisma.personne.update({ where: { id: personneId }, data });
  }

  async desactiver(personneId: string): Promise<void> {
    if (!UUID.test(personneId)) return;
    await this.prisma.personne.updateMany({ where: { id: personneId }, data: { actif: false } });
  }
}

/* ------------------------------------------------------------------ PIN */

@Injectable()
export class PinsEquipePrisma extends PinsEquipe {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lire(personneId: string): Promise<EtatPinStocke> {
    if (!UUID.test(personneId)) return { provisoireJusqua: null };
    const l = await this.prisma.personne.findUnique({
      where: { id: personneId },
      select: { pinProvisoireJusqua: true },
    });
    return { provisoireJusqua: l?.pinProvisoireJusqua ?? null };
  }

  async definirProvisoire(personneId: string, pinHache: string, jusqua: Date): Promise<void> {
    if (!UUID.test(personneId)) return;
    // Le haché et l'échéance s'écrivent ensemble : jamais un PIN provisoire sans échéance.
    await this.prisma.personne.updateMany({
      where: { id: personneId },
      data: { pinHache, pinProvisoireJusqua: jusqua },
    });
  }
}
