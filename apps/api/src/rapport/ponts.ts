import { Injectable } from "@nestjs/common";
import { Billets, Catalogue, ColisDuDepart } from "../billetterie/ports";
import { SessionsCaisse } from "../caisse/ports";
import { ControleJourneeService } from "../numerotation/controle-journee.service";
import type { CaisseDuJour, DepartDuJour, EtatDepartRapport, TrouNumerotation } from "./modele";
import { CaissesDuJour, DepartsDuJour, ReferentielRapport, TrousNumerotation } from "./ports";
import { aammjj, bornesDuJour, estDansLeJour, heureDouala } from "./temps";

/**
 * Ponts : des adaptateurs du rapport construits sur les ports des modules existants. Ils ne
 * stockent rien : ils lisent, par les ports de la caisse, de la billetterie et de la numérotation,
 * ce que ces modules ont déjà écrit. Leur durabilité est celle de ces modules, qui refusent déjà de
 * démarrer en production sur la mémoire : ils se déclarent donc `durable`.
 *
 * Branchement : `RapportModule.avecModulesExistants()`.
 *
 * Ce qui n'a pas de pont (aucun port de lecture « du jour » dans le module concerné) est décrit en
 * requête SQL dans le README : ventes de billets, colis, annulations, contrôles en route.
 */

/* ------------------------------------------------------------------ caisses */

/**
 * Les sessions de caisse du jour, lues par `SessionsCaisse.deGare` pour chaque gare de la
 * compagnie. L'écart et la validation sont ceux que la caisse et la supervision ont écrits : le
 * rapport ne recalcule pas le cash, il rend compte de ce que le superviseur a vu et signé.
 */
@Injectable()
export class CaissesDuJourSessions extends CaissesDuJour {
  readonly durable = true;

  constructor(
    private readonly sessions: SessionsCaisse,
    private readonly referentiel: ReferentielRapport,
  ) {
    super();
  }

  async duJour(compagnieId: string, jour: string): Promise<CaisseDuJour[]> {
    const { debut } = bornesDuJour(jour);
    const sortie: CaisseDuJour[] = [];
    for (const gare of await this.referentiel.gares(compagnieId)) {
      for (const s of await this.sessions.deGare(gare.id, debut)) {
        // La session appartient au jour où elle a été ouverte.
        if (!estDansLeJour(s.ouverteA, jour)) continue;
        sortie.push({
          sessionId: s.id,
          numero: s.numero,
          gareId: s.gareId,
          guichetRang: s.guichetRang,
          etat: s.etat,
          ecart: s.etat === "ouverte" ? null : (s.cloture?.ecart ?? null),
          comptageAbsent: s.etat !== "ouverte" && (s.cloture?.comptageAbsent ?? false),
          validation:
            s.etat === "validee" && s.validation
              ? {
                  superviseurId: s.validation.superviseurId,
                  superviseurNom: s.validation.superviseurNom,
                  at: s.validation.at,
                }
              : null,
        });
      }
    }
    return sortie;
  }
}

/* ------------------------------------------------------------------ numérotation */

/**
 * Les trous de numérotation du jour : le contrôle de fin de journée de la numérotation est lancé
 * pour la compagnie (il est rejouable, un trou comblé par une synchronisation tardive referme son
 * alerte) et ses alertes ouvertes, nominatives, sont reprises mot pour mot.
 */
@Injectable()
export class TrousNumerotationControle extends TrousNumerotation {
  readonly durable = true;

  constructor(private readonly controle: ControleJourneeService) {
    super();
  }

  async duJour(compagnieId: string, jour: string): Promise<TrouNumerotation[]> {
    const alertes = await this.controle.controler(aammjj(jour), { compagnieId });
    return alertes
      .filter((a) => a.type === "trou_dans_la_plage" && a.resolueA === null)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((a) => ({
        gareId: a.gareId,
        message:
          typeof a.details["message"] === "string" ? a.details["message"] : "Trou de numérotation",
      }));
  }
}

/* ------------------------------------------------------------------ départs */

const ETATS_PLACE_PRISE = ["paye", "embarque", "voyage", "non_presente"] as const;

/**
 * Les départs du jour : le catalogue donne les départs (heure, bus, gare, fusion), la billetterie
 * leurs billets, la soute les colis chargés.
 *
 * - `vendus` = billets payés, embarqués, voyagés ou non présentés (les places prises) ;
 * - `soutePleine` = autant de colis chargés que de places de soute du bus (un colis, une place :
 *   à confirmer avec le module colis).
 */
@Injectable()
export class DepartsDuJourBilletterie extends DepartsDuJour {
  readonly durable = true;

  constructor(
    private readonly catalogue: Catalogue,
    private readonly billets: Billets,
    private readonly soute: ColisDuDepart,
  ) {
    super();
  }

  async duJour(compagnieId: string, jour: string): Promise<DepartDuJour[]> {
    const { debut, fin } = bornesDuJour(jour);
    const departs = await this.catalogue.departs({ compagnieId, de: debut, avant: fin });
    const sortie: DepartDuJour[] = [];
    for (const { depart, bus, origine } of departs) {
      const billets = await this.billets.duDepart(depart.id);
      const vendus = billets.filter((b) =>
        (ETATS_PLACE_PRISE as readonly string[]).includes(b.etat),
      ).length;

      let fusionneAvec: string | null = null;
      if (depart.fusionneDansId) {
        const cible = await this.catalogue.depart(depart.fusionneDansId);
        fusionneAvec = cible ? heureDouala(cible.depart.heureDepart) : null;
      }

      let soutePleine = false;
      if (bus && bus.capaciteSoute > 0) {
        const { charges } = await this.soute.etat(depart.id);
        soutePleine = charges >= bus.capaciteSoute;
      }

      sortie.push({
        departId: depart.id,
        gareId: origine.id,
        heure: heureDouala(depart.heureDepart),
        etat: depart.etat as EtatDepartRapport,
        capacite: bus?.capacite ?? 0,
        vendus,
        fusionneAvec,
        soutePleine,
      });
    }
    return sortie;
  }
}
