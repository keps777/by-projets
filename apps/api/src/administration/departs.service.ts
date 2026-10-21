import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { jourDouala, versIsoDouala } from "../billetterie/temps";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { PersonnesRepository } from "../socle/comptes/personnes.repository";
import { Horloge } from "../socle/horloge";
import { compagnieDe, conflit, introuvable, invalide, refuse } from "./commande";
import { LignesService } from "./lignes.service";
import type {
  ChangementEquipage,
  ClasseDepart,
  DepartListe,
  HoraireModifie,
  LigneAdmin,
  NouveauDepart,
} from "./modeles";
import { AnnuaireAdmin, ParcBus, Programme, type ResultatCreationDepart } from "./ports";
import {
  JOURS_GENERES_MAX,
  ajouterJours,
  circuleLe,
  heureDepartIso,
  jourValide,
  joursEntre,
  numeroDepart,
} from "./regles";
import type { changerEquipage, creerDepart, genererDeparts } from "./schemas";

export const ACTION_DEPART_CREER = "depart.creer";
export const ACTION_DEPART_GENERER = "depart.generer";
export const ACTION_DEPART_EQUIPER = "depart.equiper";

/** Au plus ce nombre de départs créés par une génération (un mois de dix lignes à dix horaires en fait trois mille). */
export const DEPARTS_GENERES_MAX = 5000;

export interface DepartReponse {
  id: string;
  numero: string;
  ligneId: string;
  ligneCode: string;
  classe: ClasseDepart;
  heureDepart: string;
  etat: string;
  busId: string | null;
  chauffeurId: string | null;
  convoyeurId: string | null;
  quai: number | null;
  billetsVendus: number;
}

export interface GenerationReponse {
  crees: DepartReponse[];
  /** Départs que la génération aurait créés et qui existaient déjà (génération rejouée). */
  dejaPresents: number;
  /** Horaires du jour dont l'heure est déjà passée. */
  passes: number;
  lignes: number;
}

const versReponse = (d: DepartListe): DepartReponse => ({
  id: d.id,
  numero: d.numero,
  ligneId: d.ligneId,
  ligneCode: d.ligneCode,
  classe: d.classe,
  heureDepart: d.heureDepart,
  etat: d.etat,
  busId: d.busId,
  chauffeurId: d.chauffeurId,
  convoyeurId: d.convoyeurId,
  quai: d.quai,
  billetsVendus: d.billetsVendus,
});

/**
 * Départs : création à l'unité, génération récurrente d'après les horaires des lignes, bus, chauffeur,
 * convoyeur et quai. Un superviseur n'agit que sur les lignes qui partent de sa gare.
 */
@Injectable()
export class DepartsService {
  constructor(
    private readonly annuaire: AnnuaireAdmin,
    private readonly lignes: LignesService,
    private readonly programme: Programme,
    private readonly parc: ParcBus,
    private readonly personnes: PersonnesRepository,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
  ) {}

  /* ------------------------------------------------------------------ lecture */

  async lister(
    u: Utilisateur,
    filtre: { jour?: string; ligneId?: string },
  ): Promise<DepartReponse[]> {
    const compagnieId = compagnieDe(u);
    const jour = filtre.jour ?? jourDouala(this.horloge.maintenant());
    const departs = await this.programme.lister({
      compagnieId,
      ...(filtre.ligneId ? { ligneId: filtre.ligneId } : {}),
      ...(u.role === "superviseur" && u.gareId ? { origineGareId: u.gareId } : {}),
      du: heureDepartIso(jour, "00:00"),
      au: heureDepartIso(ajouterJours(jour, 1), "00:00"),
    });
    return departs.map(versReponse);
  }

  /* ------------------------------------------------------------------ création à l'unité */

  async creer(u: Utilisateur, demande: ReturnType<typeof creerDepart>): Promise<DepartReponse> {
    const compagnieId = compagnieDe(u);
    const ligne = await this.ligneDuPerimetre(u, demande.ligneId);
    const maintenant = this.horloge.maintenant();
    if (Date.parse(demande.heureDepart) <= maintenant.getTime()) {
      throw invalide("HEURE_PASSEE", "Ce départ est déjà passé : choisissez une heure à venir");
    }
    const equipage = await this.verifierEquipage(compagnieId, {
      ...(demande.busId !== undefined ? { busId: demande.busId } : {}),
      ...(demande.chauffeurId !== undefined ? { chauffeurId: demande.chauffeurId } : {}),
      ...(demande.convoyeurId !== undefined ? { convoyeurId: demande.convoyeurId } : {}),
    });
    const compagnie = await this.annuaire.compagnie(compagnieId);
    if (!compagnie) throw introuvable("AGENCE_INCONNUE", "Agence inconnue");
    const heureDepart = versIsoDouala(demande.heureDepart);
    const depart = this.nouveauDepart(
      compagnie.code,
      ligne,
      heureDepart,
      demande.classe ?? "classique",
      demande.ouvrirVente ?? true,
      u.id,
      maintenant,
    );
    depart.busId = equipage.busId ?? null;
    depart.chauffeurId = equipage.chauffeurId ?? null;
    depart.convoyeurId = equipage.convoyeurId ?? null;
    depart.quai = demande.quai ?? null;

    this.refuserSiImpossible(await this.programme.creer(depart, compagnieId), depart.numero);
    await this.audit.enregistrer({
      acteur: { id: u.id, role: u.role, compagnieId: u.compagnieId },
      action: ACTION_DEPART_CREER,
      resultat: "succes",
      cible: { type: "depart", id: depart.id },
      details: { numero: depart.numero, ligne: ligne.code, etat: depart.etat },
    });
    const cree = await this.programme.trouver(depart.id);
    return versReponse(cree!);
  }

  /* ------------------------------------------------------------------ génération récurrente */

  /**
   * Crée les départs de chaque jour de `du` à `au` d'après les horaires actifs des lignes (jours de circulation
   * compris). Rejouable : un départ déjà créé (même numéro) est compté, pas dupliqué. Les modifications d'une
   * ligne programmées « dès » un jour s'appliquent à partir de ce jour-là.
   */
  async generer(
    u: Utilisateur,
    demande: ReturnType<typeof genererDeparts>,
  ): Promise<GenerationReponse> {
    const compagnieId = compagnieDe(u);
    if (!jourValide(demande.du) || !jourValide(demande.au)) {
      throw invalide("JOUR_INVALIDE", "Les jours s'écrivent AAAA-MM-JJ et doivent exister");
    }
    const maintenant = this.horloge.maintenant();
    const aujourdHui = jourDouala(maintenant);
    if (demande.du < aujourdHui) {
      throw invalide("JOUR_PASSE", "On ne génère pas de départs pour un jour passé");
    }
    if (demande.au < demande.du) {
      throw invalide("PERIODE_INVALIDE", "La fin de la période précède son début");
    }
    const jours = joursEntre(demande.du, demande.au);
    if (jours.length > JOURS_GENERES_MAX) {
      throw invalide("PERIODE_TROP_LONGUE", `Au plus ${JOURS_GENERES_MAX} jours à la fois`);
    }
    const compagnie = await this.annuaire.compagnie(compagnieId);
    if (!compagnie) throw introuvable("AGENCE_INCONNUE", "Agence inconnue");

    const lignes = demande.ligneId
      ? [await this.ligneDuPerimetre(u, demande.ligneId)]
      : (await this.lignes.lignesDe(compagnieId)).filter(
          (l) => u.role !== "superviseur" || l.origineGareId === u.gareId,
        );

    const aCreer: NouveauDepart[] = [];
    let passes = 0;
    for (const ligne of lignes) {
      await this.lignes.appliquerSiEchu(ligne);
      const { publie, travail, reglage } = await this.lignes.relire(ligne);
      for (const jour of jours) {
        const horaires: HoraireModifie[] =
          reglage?.effetDu && reglage.brouillon && jour >= reglage.effetDu
            ? travail.horaires
            : publie.horaires;
        for (const h of [...horaires].sort((a, b) => a.heure.localeCompare(b.heure))) {
          if (!h.actif || !circuleLe(h.jours, jour)) continue;
          const heureDepart = heureDepartIso(jour, h.heure);
          if (Date.parse(heureDepart) <= maintenant.getTime()) {
            passes += 1;
            continue;
          }
          aCreer.push(
            this.nouveauDepart(
              compagnie.code,
              ligne,
              heureDepart,
              h.classe,
              demande.ouvrirVente ?? true,
              u.id,
              maintenant,
            ),
          );
        }
      }
    }
    if (aCreer.length > DEPARTS_GENERES_MAX) {
      throw invalide(
        "TROP_DE_DEPARTS",
        `Cette période ferait ${aCreer.length} départs (au plus ${DEPARTS_GENERES_MAX}) : réduisez-la`,
      );
    }

    const crees: DepartReponse[] = [];
    let dejaPresents = 0;
    for (const depart of aCreer) {
      const r = await this.programme.creer(depart, compagnieId);
      if (r.ok) {
        const ligne = lignes.find((l) => l.id === depart.ligneId);
        crees.push(
          versReponse({
            ...depart,
            ligneCode: ligne?.code ?? "",
            origineGareId: ligne?.origineGareId ?? "",
            billetsVendus: 0,
          }),
        );
      } else if (r.raison === "numero_pris") dejaPresents += 1;
    }
    await this.audit.enregistrer({
      acteur: { id: u.id, role: u.role, compagnieId: u.compagnieId },
      action: ACTION_DEPART_GENERER,
      resultat: "succes",
      cible: demande.ligneId ? { type: "ligne", id: demande.ligneId } : null,
      details: {
        du: demande.du,
        au: demande.au,
        lignes: lignes.length,
        crees: crees.length,
        dejaPresents,
        passes,
      },
    });
    return { crees, dejaPresents, passes, lignes: lignes.length };
  }

  /* ------------------------------------------------------------------ équipage */

  async equiper(
    u: Utilisateur,
    departId: string,
    demande: ReturnType<typeof changerEquipage>,
  ): Promise<DepartReponse> {
    const compagnieId = compagnieDe(u);
    const depart = await this.programme.trouver(departId);
    if (!depart || depart.compagnieId !== compagnieId) {
      throw introuvable("DEPART_INCONNU", `Départ « ${departId} » inconnu`);
    }
    if (u.role === "superviseur" && depart.origineGareId !== u.gareId) {
      throw refuse("Ce départ ne part pas de votre gare");
    }
    const changement: ChangementEquipage = {
      ...(demande.busId !== undefined ? { busId: demande.busId } : {}),
      ...(demande.chauffeurId !== undefined ? { chauffeurId: demande.chauffeurId } : {}),
      ...(demande.convoyeurId !== undefined ? { convoyeurId: demande.convoyeurId } : {}),
      ...(demande.quai !== undefined ? { quai: demande.quai } : {}),
    };
    await this.verifierEquipage(compagnieId, changement);
    const r = await this.programme.equiper(departId, changement);
    if (!r.ok) {
      if (r.raison === "inconnu")
        throw introuvable("DEPART_INCONNU", `Départ « ${departId} » inconnu`);
      if (r.raison === "etat") {
        throw conflit("DEPART_CLOS", `Ce départ est « ${r.etat} » : son équipage ne change plus`);
      }
      if (r.raison === "billets_vendus") {
        throw conflit(
          "BILLETS_VENDUS",
          `${r.billets} billet(s) sont déjà vendus pour ce départ : on ne change plus son bus`,
        );
      }
      throw conflit(
        "RESSOURCE_OCCUPEE",
        `Le ${r.ressource} est déjà sur le départ ${r.departNumero}, qui chevauche celui-ci`,
      );
    }
    await this.audit.enregistrer({
      acteur: { id: u.id, role: u.role, compagnieId: u.compagnieId },
      action: ACTION_DEPART_EQUIPER,
      resultat: "succes",
      cible: { type: "depart", id: departId },
      details: { numero: r.depart.numero, champs: Object.keys(changement) },
    });
    return versReponse(r.depart);
  }

  /* ------------------------------------------------------------------ internes */

  private async ligneDuPerimetre(u: Utilisateur, ligneId: string): Promise<LigneAdmin> {
    const ligne = await this.lignes.chargerLigne(u, ligneId);
    if (u.role === "superviseur" && ligne.origineGareId !== u.gareId) {
      throw refuse("Cette ligne ne part pas de votre gare");
    }
    return ligne;
  }

  private nouveauDepart(
    agence: string,
    ligne: LigneAdmin,
    heureDepart: string,
    classe: ClasseDepart,
    ouvrirVente: boolean,
    par: string,
    maintenant: Date,
  ): NouveauDepart {
    return {
      id: randomUUID(),
      numero: numeroDepart(agence, ligne.code, heureDepart),
      ligneId: ligne.id,
      busId: null,
      classe,
      heureDepart,
      etat: ouvrirVente ? "en_vente" : "programme",
      quai: null,
      chauffeurId: null,
      convoyeurId: null,
      historique: ouvrirVente
        ? [
            {
              action: "ouvrir_vente",
              de: "programme",
              vers: "en_vente",
              at: versIsoDouala(maintenant),
              par,
            },
          ]
        : [],
    };
  }

  /** Le bus, le chauffeur et le convoyeur existent, sont de la compagnie et ont le bon rôle. */
  private async verifierEquipage(
    compagnieId: string,
    changement: ChangementEquipage,
  ): Promise<ChangementEquipage> {
    if (changement.busId) {
      const bus = await this.parc.trouver(changement.busId);
      if (!bus || bus.compagnieId !== compagnieId) {
        throw introuvable("BUS_INCONNU", `Bus « ${changement.busId} » inconnu`);
      }
    }
    for (const [cle, role] of [
      ["chauffeurId", "chauffeur"],
      ["convoyeurId", "convoyeur"],
    ] as const) {
      const id = changement[cle];
      if (!id) continue;
      const personne = await this.personnes.trouverParId(id);
      if (!personne || personne.compagnieId !== compagnieId) {
        throw introuvable("PERSONNE_INCONNUE", `Personne « ${id} » inconnue dans votre agence`);
      }
      if (!personne.actif || !personne.roles.includes(role)) {
        throw invalide("ROLE_INCOMPATIBLE", `Cette personne n'est pas un ${role} en activité`);
      }
    }
    return changement;
  }

  private refuserSiImpossible(r: ResultatCreationDepart, numero: string): void {
    if (r.ok) return;
    if (r.raison === "numero_pris") {
      throw conflit("DEPART_EXISTANT", `Le départ ${numero} existe déjà`);
    }
    throw conflit(
      "RESSOURCE_OCCUPEE",
      `Le ${r.ressource} est déjà sur le départ ${r.departNumero}, qui chevauche celui-ci`,
    );
  }
}
