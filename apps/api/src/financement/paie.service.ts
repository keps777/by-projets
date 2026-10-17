import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import { agenceDe, EcrituresSignees, type AccuseSigne } from "./ecritures";
import { ErreurFinancement } from "./erreurs";
import type { LignePaie, LotPaie } from "./modele";
import { LotsPaie, SalairesAgence, VersementRefuse, VersementsPaie } from "./ports";
import { moisDePaieAutorise, moisValide } from "./regles";
import { versIsoDouala } from "./temps";
import { lireLancementPaie } from "./validation";

/** `PaieLancee` des contrats patron. */
export interface PaieLanceeVue {
  mois: string;
  nbSalaires: number;
  total: number;
  versementA: string;
}

export type PaieLancee = AccuseSigne & PaieLanceeVue;

/**
 * Paie des équipages par MoMo, en une touche. Les salaires sont calculés par le module équipe (trajets et
 * primes) puis **figés** dans un lot unique par agence et par mois : relancer la paie ne change aucun
 * montant. L'argent part du compte marchand de l'agence vers chaque salarié ; AfriMove ne le détient jamais.
 *
 * Aucun salaire n'est payé deux fois : chaque versement porte une clé stable (agence, mois, personne,
 * numéro d'essai) que l'opérateur dédoublonne. Une panne de l'opérateur laisse la ligne « en attente » ;
 * `TachesFinancement` la rejoue avec la même clé. Un refus définitif (numéro inconnu, solde insuffisant)
 * marque la ligne « refusée » ; relancer la paie la rejoue avec une nouvelle clé.
 */
@Injectable()
export class PaieService {
  private readonly logger = new Logger("PaieService");

  constructor(
    private readonly lots: LotsPaie,
    private readonly salaires: SalairesAgence,
    private readonly versements: VersementsPaie,
    private readonly ecritures: EcrituresSignees,
    private readonly horloge: Horloge,
  ) {}

  async lancer(utilisateur: Utilisateur, corps: unknown): Promise<PaieLancee> {
    const cmd = lireLancementPaie(corps);
    const agenceId = agenceDe(utilisateur);
    return this.ecritures.executer(
      utilisateur,
      "paie.lancer",
      { mois: cmd.mois },
      cmd.signature,
      async () => {
        const lot = await this.preparerEtVerser(utilisateur, agenceId, cmd.mois);
        const refusees = lot.lignes.filter((l) => l.etat === "refuse").length;
        const attente = lot.lignes.filter((l) => l.etat === "en_attente").length;
        return {
          reponse: {
            mois: lot.mois,
            nbSalaires: lot.lignes.length,
            total: lot.total,
            versementA: lot.lanceA,
          },
          cible: { type: "lot_paie", id: lot.id },
          details: { nbSalaires: lot.lignes.length, total: lot.total, refusees, attente },
        };
      },
    );
  }

  private async preparerEtVerser(
    utilisateur: Utilisateur,
    agenceId: string,
    mois: string,
  ): Promise<LotPaie> {
    if (!moisValide(mois) || !moisDePaieAutorise(mois, this.horloge.maintenant())) {
      throw new ErreurFinancement(
        422,
        "MOIS_INVALIDE",
        "La paie se lance pour le mois en cours ou le mois précédent",
      );
    }
    let lot = await this.lots.trouver(agenceId, mois);
    if (lot === null) {
      lot = await this.creerLot(utilisateur, agenceId, mois);
    } else {
      lot = await this.preparerRelance(lot);
    }
    await this.verserLot(lot);
    return (await this.lots.trouver(agenceId, mois)) ?? lot;
  }

  private async creerLot(
    utilisateur: Utilisateur,
    agenceId: string,
    mois: string,
  ): Promise<LotPaie> {
    const salaires = (await this.salaires.calculer(agenceId, mois)).filter((s) => s.montant > 0);
    if (salaires.length === 0) {
      throw new ErreurFinancement(422, "AUCUN_SALAIRE", "Aucun salaire à payer pour ce mois");
    }
    const lignes: LignePaie[] = salaires.map((s) => ({
      personneId: s.personneId,
      nom: s.nom,
      montant: s.montant,
      operateur: s.compte?.operateur ?? null,
      telephone: s.compte?.telephone ?? null,
      etat: "en_attente",
      tentative: 0,
      reference: null,
      motif: null,
    }));
    const lot: LotPaie = {
      id: randomUUID(),
      version: 1,
      agenceId,
      mois,
      lancePar: utilisateur.id,
      lanceA: versIsoDouala(this.horloge.maintenant()),
      total: lignes.reduce((somme, l) => somme + l.montant, 0),
      lignes,
    };
    if (await this.lots.creer(lot)) return lot;
    // Un autre lancement simultané a créé le lot : on reprend le sien, sans rien recalculer.
    const existant = await this.lots.trouver(agenceId, mois);
    if (!existant) throw new Error("Lot de paie introuvable après conflit");
    return this.preparerRelance(existant);
  }

  /**
   * Relance d'un lot existant : refusé s'il n'y a plus rien à payer ; sinon les lignes refusées sont
   * remises en attente avec un nouvel essai (nouvelle clé), les lignes en attente gardent leur clé.
   */
  private async preparerRelance(lot: LotPaie): Promise<LotPaie> {
    if (!lot.lignes.some((l) => l.etat !== "verse")) {
      throw new ErreurFinancement(409, "PAIE_DEJA_LANCEE", "La paie de ce mois est déjà versée");
    }
    const recents = await this.salaires.calculer(lot.agenceId, lot.mois);
    for (const ligne of lot.lignes.filter((l) => l.etat === "refuse")) {
      // Le compte MoMo a pu être renseigné depuis : on le reprend, sans toucher au montant figé.
      const compte = recents.find((s) => s.personneId === ligne.personneId)?.compte ?? null;
      const reprise = compte && ligne.operateur === null ? compte : null;
      const remise = await this.lots.marquerLigne(
        lot.id,
        ligne.personneId,
        {
          etat: "en_attente",
          tentative: ligne.tentative + 1,
          motif: null,
          ...(reprise ? { operateur: reprise.operateur, telephone: reprise.telephone } : {}),
        },
        "refuse",
      );
      if (!remise) continue;
      ligne.etat = "en_attente";
      ligne.tentative += 1;
      if (reprise) {
        ligne.operateur = reprise.operateur;
        ligne.telephone = reprise.telephone;
      }
    }
    return lot;
  }

  /** Verse chaque ligne en attente (clé stable : un rejeu ne paie jamais deux fois). */
  async verserLot(lot: LotPaie): Promise<void> {
    for (const ligne of lot.lignes) {
      if (ligne.etat === "en_attente") await this.verserLigne(lot, ligne);
    }
  }

  private async verserLigne(lot: LotPaie, ligne: LignePaie): Promise<void> {
    if (ligne.operateur === null || ligne.telephone === null) {
      await this.lots.marquerLigne(
        lot.id,
        ligne.personneId,
        { etat: "refuse", motif: "compte MoMo absent" },
        "en_attente",
      );
      return;
    }
    try {
      const { reference } = await this.versements.verser({
        cle: `paie:${lot.agenceId}:${lot.mois}:${ligne.personneId}:${ligne.tentative}`,
        agenceId: lot.agenceId,
        operateur: ligne.operateur,
        telephone: ligne.telephone,
        montant: ligne.montant,
        libelle: `Salaire ${lot.mois}`,
      });
      await this.lots.marquerLigne(
        lot.id,
        ligne.personneId,
        { etat: "verse", reference },
        "en_attente",
      );
    } catch (e) {
      if (e instanceof VersementRefuse) {
        await this.lots.marquerLigne(
          lot.id,
          ligne.personneId,
          { etat: "refuse", motif: "refusé par l'opérateur" },
          "en_attente",
        );
        return;
      }
      // Résultat inconnu : la ligne reste en attente, la tâche de fond rejoue avec la même clé.
      this.logger.warn(
        `Salaire du lot ${lot.id} sans réponse de l'opérateur (${(e as Error).name})`,
      );
    }
  }

  /** Rejoue les lignes restées en attente (tâche de fond). Renvoie le nombre de lignes versées. */
  async rattraper(): Promise<number> {
    let verses = 0;
    for (const lot of await this.lots.incomplets()) {
      const avant = lot.lignes.filter((l) => l.etat === "en_attente").length;
      await this.verserLot(lot);
      const apres = (await this.lots.trouver(lot.agenceId, lot.mois))?.lignes.filter(
        (l) => l.etat === "en_attente",
      ).length;
      verses += avant - (apres ?? avant);
    }
    return verses;
  }

  /** Le lot d'un mois (tests, administration) ; jamais exposé tel quel : il porte des numéros MoMo. */
  lot(agenceId: string, mois: string): Promise<LotPaie | null> {
    return this.lots.trouver(agenceId, mois);
  }
}
