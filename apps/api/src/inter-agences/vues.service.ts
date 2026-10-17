import { Injectable } from "@nestjs/common";
import { ColisService } from "../colis/colis.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { AnnuairePatrons } from "./annuaire";
import { compagnieDe } from "./commun";
import { ConventionsService } from "./conventions.service";
import { EchangesService, type ResultatScan } from "./echanges.service";
import { BilletsService } from "./billets.service";
import {
  AIDE_PARTS_TYPE,
  ENTETE_TRONCON,
  JOUR_REGLEMENT,
  MOYEN_REGLEMENT,
  PIED_CONVENTION,
  SOUS_TITRE_INTER_AGENCES,
  TITRE_INTER_AGENCES,
  TITRE_PARTS,
  TITRE_REGLEMENT,
  TITRE_REGLES,
  TITRE_VOYAGEURS,
  VOYAGEURS_AUCUN,
  libelleConvention,
  libelleTotal,
  regleDuTransfert,
  renouvellementEnTexte,
  reglesDe,
  texteVoyageurs,
} from "./contenu";
import type {
  BilletCorrespondanceStocke,
  ColisInterAgencesStocke,
  ContestationStockee,
  ConventionStockee,
  TronconPlan,
} from "./modele";
import { AnnuaireCompagnies } from "./ports";
import {
  ATTENTE_SECOND_BUS_MINUTES,
  FRAIS_AFRIMOVE_COLIS_FCFA,
  GARANTIE_CORRESPONDANCE_MINUTES,
  PLAFOND_REMBOURSEMENT_FCFA,
  autreCompagnie,
  enVigueur,
  periodeAffichee,
  totauxParCompagnie,
} from "./regles";
import { ReglementsService, type Releve } from "./reglements.service";
import { heureCourte } from "./temps";

/** Combien de colis en correspondance la planche « Entre compagnies » liste au plus. */
const COLIS_AFFICHES = 20;

/**
 * Les réponses de l'API, une méthode par contrat de `@afrimove/contrats` (`colis` : `SchemaInterAgences`,
 * `SchemaReglementHebdo`, `SchemaConvention`, `SchemaTransfertEnregistre`… ; `patron` : `InterAgencesSchema`).
 * Les tests de bout en bout valident chaque réponse avec les schémas zod de ces contrats.
 *
 * Règle d'étanchéité : une réponse ne porte que ce que la compagnie connectée a le droit de voir, le colis
 * partenaire, ses tronçons et leurs parts, le relevé de ses propres créances. Jamais une vente de l'autre.
 */
@Injectable()
export class VuesService {
  constructor(
    private readonly conventions: ConventionsService,
    private readonly echanges: EchangesService,
    private readonly billets: BilletsService,
    private readonly reglements: ReglementsService,
    private readonly annuaire: AnnuaireCompagnies,
    private readonly patrons: AnnuairePatrons,
    private readonly colis: ColisService,
  ) {}

  /** Nom court d'une compagnie (« Alpha »), avec un cache le temps d'une réponse. */
  private noms() {
    const cache = new Map<string, string>();
    return async (id: string): Promise<string> => {
      const connu = cache.get(id);
      if (connu !== undefined) return connu;
      const nom = (await this.annuaire.trouver(id))?.nom ?? "Compagnie inconnue";
      cache.set(id, nom);
      return nom;
    };
  }

  /* -------------------------------------------------------------- colis */

  private async troncons(troncons: readonly TronconPlan[], nom: (id: string) => Promise<string>) {
    return Promise.all(
      troncons.map(async (t) => ({
        rang: t.rang,
        compagnie: await nom(t.compagnieId),
        trajet: `${t.origine} → ${t.destination}`,
        depart: t.heureDepart,
        bus: t.bus,
        arrivee: t.heureArrivee,
        part: t.part,
      })),
    );
  }

  private async regleDuPlan(plan: ColisInterAgencesStocke, nom: (id: string) => Promise<string>) {
    const t = plan.transferts[0];
    const ville = plan.troncons[0]?.destination ?? "";
    return regleDuTransfert(await nom(t?.cedantId ?? ""), await nom(t?.preneurId ?? ""), ville);
  }

  /** `colis.inter-agences.lire` : la planche « Entre compagnies » telle que la lit le contrat colis. */
  async interAgences(utilisateur: Utilisateur) {
    const moi = compagnieDe(utilisateur);
    const nom = this.noms();
    const plans = (await this.echanges.liste(moi)).slice(0, COLIS_AFFICHES);
    const colis = [];
    for (const plan of plans) {
      const troncons = await this.troncons(plan.troncons, nom);
      colis.push({
        colis: await this.colis.lirePartenaire({ id: plan.colisId }),
        trajet: `${plan.troncons[0]?.origine ?? ""} → ${plan.troncons.at(-1)?.destination ?? ""}`,
        troncons,
        regle: await this.regleDuPlan(plan, nom),
      });
    }
    const mesConventions = (await this.conventions.mesConventions(moi)).filter(
      (c) => c.statut !== "resiliee",
    );
    const conventions = await Promise.all(
      mesConventions.map(async (c) => {
        const partenaire = await nom(autreCompagnie(c, moi));
        return { id: c.id, partenaire, libelle: `Convention ${partenaire}` };
      }),
    );
    return {
      titre: TITRE_INTER_AGENCES,
      sousTitre: SOUS_TITRE_INTER_AGENCES,
      colis,
      conventions,
      voyageurs: await this.voyageurs(mesConventions.filter(enVigueur), nom),
    };
  }

  private async voyageurs(actives: ConventionStockee[], nom: (id: string) => Promise<string>) {
    const source = actives.find((c) => c.voyageurs.lignes.length > 0) ?? actives[0];
    const garantie = source?.voyageurs.garantieMinutes ?? GARANTIE_CORRESPONDANCE_MINUTES;
    const attente = source?.voyageurs.attenteMinutes ?? ATTENTE_SECOND_BUS_MINUTES;
    const ligne = source?.voyageurs.lignes[0];
    let texte = VOYAGEURS_AUCUN;
    if (source && ligne) {
      const seconde =
        [source.compagnieA, source.compagnieB].find((c) => c !== ligne.premiere) ?? "";
      texte = texteVoyageurs(
        ligne,
        await nom(ligne.premiere),
        await nom(seconde),
        garantie,
        attente,
      );
    }
    return {
      titre: TITRE_VOYAGEURS,
      texte,
      correspondanceMinutes: garantie,
      attenteSecondBusMinutes: attente,
    };
  }

  /** Les trajets en correspondance que les conventions en vigueur proposent aux voyageurs (hors contrat). */
  async correspondances(utilisateur: Utilisateur) {
    const moi = compagnieDe(utilisateur);
    const nom = this.noms();
    const lignes = [];
    for (const c of (await this.conventions.mesConventions(moi)).filter(enVigueur)) {
      const { garantieMinutes, attenteMinutes } = c.voyageurs;
      for (const ligne of c.voyageurs.lignes) {
        const seconde = [c.compagnieA, c.compagnieB].find((x) => x !== ligne.premiere) ?? "";
        const [premiere, suite] = [await nom(ligne.premiere), await nom(seconde)];
        lignes.push({
          conventionId: c.id,
          origine: ligne.origine,
          via: ligne.via,
          destination: ligne.destination,
          premiere,
          seconde: suite,
          garantieMinutes,
          attenteMinutes,
          texte: texteVoyageurs(ligne, premiere, suite, garantieMinutes, attenteMinutes),
        });
      }
    }
    return { lignes };
  }

  /** `colis.inter-agences.transfert` : `SchemaTransfertEnregistre`. */
  async transfert(resultat: ResultatScan) {
    return {
      colis: await this.colis.lirePartenaire({ id: resultat.plan.colisId }),
      sens: resultat.sens,
      compagnie: resultat.preneur.nom,
      scanneLe: resultat.scanneLe,
      responsable: resultat.responsable,
    };
  }

  /** Le plan d'un colis en correspondance et à qui il est (route ajoutée). */
  async plan(utilisateur: Utilisateur, colisId: string) {
    const { plan, responsabilite, compagnie } = await this.echanges.responsable(
      utilisateur,
      colisId,
    );
    const nom = this.noms();
    return {
      colisId: plan.colisId,
      numero: plan.numero,
      conventionId: plan.conventionId,
      troncons: await this.troncons(plan.troncons, nom),
      responsable: {
        compagnieId: compagnie.id,
        compagnie: compagnie.nom,
        enTransfert: responsabilite.enTransfert,
      },
      remboursementMax: PLAFOND_REMBOURSEMENT_FCFA,
      regle: await this.regleDuPlan(plan, nom),
    };
  }

  /* -------------------------------------------------------------- billets */

  async billet(billet: BilletCorrespondanceStocke) {
    const noms = await this.billets.noms(billet);
    return {
      id: billet.id,
      numero: billet.numero,
      conventionId: billet.conventionId,
      voyageur: billet.voyageur.nom,
      troncons: billet.troncons.map((t) => ({
        rang: t.rang,
        compagnie: noms.get(t.compagnieId) ?? "Compagnie inconnue",
        trajet: `${t.origine} → ${t.destination}`,
        depart: t.heureDepart,
        bus: t.bus,
        arrivee: t.heureArrivee,
        part: t.part,
        etat: t.etat,
        embarqueLe: t.embarqueLe,
      })),
      arriveePremierBus: billet.arriveePremierBus,
      replacement: billet.replacement
        ? {
            decideLe: billet.replacement.decideLe,
            heureDepart: billet.replacement.heureDepart,
            bus: billet.replacement.bus,
            retardataire: noms.get(billet.replacement.retardataireId) ?? "Compagnie inconnue",
          }
        : null,
    };
  }

  /* -------------------------------------------------------------- règlement */

  /** `colis.inter-agences.reglement` : `SchemaReglementHebdo`, toutes les conventions de la compagnie. */
  async reglementHebdo(utilisateur: Utilisateur) {
    const moi = compagnieDe(utilisateur);
    const nom = this.noms();
    const releves = await this.reglements.relevesDe(moi);
    const periode = releves[0]?.periode ?? periodeAffichee(this.reglements.maintenant());
    const creances: {
      compagnie: string;
      sens: "nous_doivent" | "nous_devons";
      colis: number;
      montant: number;
    }[] = [];
    let soldeNet = 0;
    for (const releve of releves) {
      const solde = this.reglements.soldeDe(moi, releve);
      const compagnie = await nom(autreCompagnie(releve.convention, moi));
      if (solde.recoit > 0) {
        creances.push({
          compagnie,
          sens: "nous_doivent",
          colis: solde.nbRecoit,
          montant: solde.recoit,
        });
      }
      if (solde.doit > 0) {
        creances.push({ compagnie, sens: "nous_devons", colis: solde.nbDoit, montant: solde.doit });
      }
      soldeNet += solde.net;
    }
    return {
      titre: TITRE_REGLEMENT,
      jour: JOUR_REGLEMENT,
      creances,
      soldeNet,
      moyen: MOYEN_REGLEMENT,
      reglementLe: periode.paiementLe,
      contestationJusqua: periode.gelLe,
    };
  }

  /** `colis.inter-agences.contester` : `SchemaContestationEnregistree`. */
  contestation(c: ContestationStockee) {
    return { reference: c.reference, deposeeLe: c.deposeeLe, recevable: c.recevable };
  }

  /* -------------------------------------------------------------- convention */

  /** `colis.inter-agences.convention` : `SchemaConvention`, le contrat complet que lit l'écran. */
  async convention(utilisateur: Utilisateur, id: string) {
    const moi = compagnieDe(utilisateur);
    const c = await this.conventions.lire(utilisateur, id);
    return this.vueConvention(c, moi, utilisateur.id);
  }

  async vueConvention(c: ConventionStockee, moi: string, personneId: string) {
    const nom = this.noms();
    const [nomA, nomB] = [await nom(c.compagnieA), await nom(c.compagnieB)];
    const noms: Record<string, string> = { [c.compagnieA]: nomA, [c.compagnieB]: nomB };
    const totaux = totauxParCompagnie(c.parts);
    const parNom = (parts: Record<string, number | null>) => ({
      [nomA]: parts[c.compagnieA] ?? null,
      [nomB]: parts[c.compagnieB] ?? null,
    });
    const bilan = await this.reglements.bilan(c, moi);
    const signatures = await Promise.all(
      c.signatures.map(async (s) => ({
        compagnie: noms[s.compagnieId] ?? (await nom(s.compagnieId)),
        signataire: (await this.patrons.nom(s.personneId)) ?? "Patron",
        moi: s.personneId === personneId,
        signeLe: s.signeLe,
        parPin: true as const,
      })),
    );
    return {
      id: c.id,
      titre: libelleConvention(nomA, nomB),
      signeLe: c.activeLe ?? c.proposeeLe,
      renouvellement: renouvellementEnTexte(c.renouvellement),
      statut: statutContrat(c),
      parts: {
        titre: TITRE_PARTS,
        aide: AIDE_PARTS_TYPE(c.parts.colisType.poidsKg),
        entetes: [ENTETE_TRONCON, nomA, nomB],
        lignes: c.parts.lignes.map((l) => ({ troncon: l.troncon, parts: parNom(l.parts) })),
        total: {
          libelle: libelleTotal(c.parts.colisType.prix),
          prixClient: c.parts.colisType.prix,
          fraisAfrimove: FRAIS_AFRIMOVE_COLIS_FCFA,
          parts: {
            [nomA]: totaux[c.compagnieA] ?? 0,
            [nomB]: totaux[c.compagnieB] ?? 0,
          },
        },
      },
      regles: { titre: TITRE_REGLES, liste: reglesDe(c) },
      signatures,
      trimestre: bilan,
      pied: PIED_CONVENTION,
    };
  }

  /** Une convention proposée, vue par l'une des deux compagnies (route ajoutée). */
  async proposition(c: ConventionStockee) {
    const nom = this.noms();
    return {
      id: c.id,
      statut: c.statut,
      proposeePar: await nom(c.compagnieA),
      avec: await nom(c.compagnieB),
      renouvellement: renouvellementEnTexte(c.renouvellement),
      proposeeLe: c.proposeeLe,
      signatures: c.signatures.length,
    };
  }

  /* -------------------------------------------------------------- patron */

  /**
   * `patron.interAgences.vue` : la planche « Entre compagnies » telle que la lit l'écran patron. Une seule
   * compagnie partenaire à la fois (`conventionId` pour choisir, sinon la première convention en vigueur) ; le
   * contrat ne peut pas montrer deux règlements.
   */
  async vuePatron(utilisateur: Utilisateur, conventionId?: string) {
    const moi = compagnieDe(utilisateur);
    const nom = this.noms();
    const toutes = await this.conventions.mesConventions(moi);
    const choisie =
      (conventionId ? toutes.find((c) => c.id === conventionId) : undefined) ??
      toutes.find(enVigueur) ??
      toutes[0];
    const plan = choisie
      ? (await this.echanges.liste(moi)).find((p) => p.conventionId === choisie.id)
      : undefined;
    const releve: Releve | null = choisie ? await this.reglements.releve(choisie) : null;
    const solde = releve ? this.reglements.soldeDe(moi, releve) : null;
    const periode = releve?.periode ?? periodeAffichee(this.reglements.maintenant());

    // Le colis est facultatif au contrat : sans échange en cours (ou sans convention), la clé est absente.
    const colisEnCorrespondance = plan ? await this.colisDuPatron(plan, nom) : undefined;
    // L'origine du billet voyageur : la première ligne voyageurs de la convention (celle de `/correspondances`).
    const ligne = choisie?.voyageurs.lignes[0];
    const trajet =
      choisie && ligne
        ? {
            origine: ligne.origine,
            via: ligne.via,
            destination: ligne.destination,
            premiere: await nom(ligne.premiere),
            seconde: await nom(
              [choisie.compagnieA, choisie.compagnieB].find((x) => x !== ligne.premiere) ?? "",
            ),
          }
        : undefined;
    return {
      ...(colisEnCorrespondance ? { colisEnCorrespondance } : {}),
      reglement: {
        autreCompagnie: choisie ? await nom(autreCompagnie(choisie, moi)) : "",
        nousDoit: solde?.recoit ?? 0,
        nbColisTransportesPourEux: solde?.nbRecoit ?? 0,
        nousLeDevons: solde?.doit ?? 0,
        nbColisEnCorrespondance: solde?.nbDoit ?? 0,
        soldeNet: solde?.net ?? 0,
        reglementA: periode.paiementLe,
      },
      correspondanceVoyageurs: {
        minutesGaranties: choisie?.voyageurs.garantieMinutes ?? GARANTIE_CORRESPONDANCE_MINUTES,
        attenteDuSecondBusMinutes: choisie?.voyageurs.attenteMinutes ?? ATTENTE_SECOND_BUS_MINUTES,
        ...(trajet ? { trajet } : {}),
      },
      conventions: await Promise.all(
        toutes.map(async (c) => ({
          id: c.id,
          avec: await nom(autreCompagnie(c, moi)),
          statut: statutPatron(c),
        })),
      ),
    };
  }

  private async colisDuPatron(plan: ColisInterAgencesStocke, nom: (id: string) => Promise<string>) {
    const partenaire = await this.colis.lirePartenaire({ id: plan.colisId });
    return {
      colisId: plan.colisId,
      numero: plan.numero,
      origine: plan.troncons[0]?.origine ?? "",
      destination: plan.troncons.at(-1)?.destination ?? "",
      poidsKg: partenaire.poidsKg,
      troncons: await Promise.all(
        plan.troncons.map(async (t) => ({
          rang: t.rang,
          compagnie: await nom(t.compagnieId),
          origine: t.origine,
          destination: t.destination,
          heureDepart: heureCourte(t.heureDepart),
          bus: t.bus,
          heureArrivee: heureCourte(t.heureArrivee),
          part: t.part,
        })),
      ),
      regle: await this.regleDuPlan(plan, nom),
    };
  }
}

/** Le statut du contrat colis : une sortie demandée ne change rien tant que le préavis court. */
function statutContrat(c: ConventionStockee): "active" | "suspendue" | "resiliee" {
  if (c.statut === "resiliee") return "resiliee";
  return c.statut === "suspendue" ? "suspendue" : "active";
}

/** Le statut du contrat patron (« active », « expirée », « dénoncée »). */
function statutPatron(c: ConventionStockee): "active" | "expiree" | "denoncee" {
  if (c.denonciation || c.statut === "resiliee") return "denoncee";
  return c.statut === "active" ? "active" : "expiree";
}
