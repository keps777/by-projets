import { Injectable } from "@nestjs/common";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { compagnieDe, conflit, introuvable } from "./commande";
import type { BusAdmin } from "./modeles";
import { ParcBus, Programme } from "./ports";
import type { creerBus, modifierBus } from "./schemas";

export const ACTION_BUS_CREER = "bus.creer";
export const ACTION_BUS_MODIFIER = "bus.modifier";

/** `AAA 123 BB` : majuscules, espaces simples. */
export function normaliserImmatriculation(brut: string): string {
  return brut.trim().replace(/\s+/g, " ").toLocaleUpperCase("fr");
}

/** Les bus d'une compagnie : fiche (immatriculation, places, soute, classe, modèle, année). */
@Injectable()
export class BusService {
  constructor(
    private readonly parc: ParcBus,
    private readonly programme: Programme,
    private readonly audit: AuditService,
  ) {}

  lister(u: Utilisateur): Promise<BusAdmin[]> {
    return this.parc.lister(compagnieDe(u));
  }

  async creer(u: Utilisateur, demande: ReturnType<typeof creerBus>): Promise<BusAdmin> {
    const compagnieId = compagnieDe(u);
    const immatriculation = normaliserImmatriculation(demande.immatriculation);
    const cree = await this.parc.creer({
      compagnieId,
      immatriculation,
      capacite: demande.capacite,
      capaciteSoute: demande.capaciteSoute ?? 0,
      classe: demande.classe,
      modele: demande.modele ?? "",
      annee: demande.annee ?? 0,
    });
    if (!cree) {
      throw conflit("BUS_EXISTANT", `Un bus « ${immatriculation} » existe déjà dans votre agence`);
    }
    await this.audit.enregistrer({
      acteur: { id: u.id, role: u.role, compagnieId: u.compagnieId },
      action: ACTION_BUS_CREER,
      resultat: "succes",
      cible: { type: "bus", id: cree.id },
      details: { immatriculation, capacite: cree.capacite, classe: cree.classe },
    });
    return cree;
  }

  async modifier(
    u: Utilisateur,
    id: string,
    demande: ReturnType<typeof modifierBus>,
  ): Promise<BusAdmin> {
    const compagnieId = compagnieDe(u);
    const bus = await this.parc.trouver(id);
    if (!bus || bus.compagnieId !== compagnieId) {
      throw introuvable("BUS_INCONNU", `Bus « ${id} » inconnu`);
    }
    // Les places d'un bus qui a des départs à venir ne changent pas : le plan de sièges en dépend.
    if (
      demande.capacite !== undefined &&
      demande.capacite !== bus.capacite &&
      (await this.programme.departsAVenirDuBus(id)) > 0
    ) {
      throw conflit(
        "BUS_AFFECTE",
        "Ce bus a des départs à venir : retirez-le de ces départs avant de changer son nombre de places",
      );
    }
    const changement: Parameters<ParcBus["modifier"]>[1] = {
      ...(demande.immatriculation !== undefined
        ? { immatriculation: normaliserImmatriculation(demande.immatriculation) }
        : {}),
      ...(demande.capacite !== undefined ? { capacite: demande.capacite } : {}),
      ...(demande.capaciteSoute !== undefined ? { capaciteSoute: demande.capaciteSoute } : {}),
      ...(demande.classe !== undefined ? { classe: demande.classe } : {}),
      ...(demande.modele !== undefined ? { modele: demande.modele } : {}),
      ...(demande.annee !== undefined ? { annee: demande.annee } : {}),
    };
    const resultat = await this.parc.modifier(id, changement);
    if (resultat === "immatriculation_prise") {
      throw conflit(
        "BUS_EXISTANT",
        `Un bus « ${changement.immatriculation ?? ""} » existe déjà dans votre agence`,
      );
    }
    if (resultat === null) throw introuvable("BUS_INCONNU", `Bus « ${id} » inconnu`);
    await this.audit.enregistrer({
      acteur: { id: u.id, role: u.role, compagnieId: u.compagnieId },
      action: ACTION_BUS_MODIFIER,
      resultat: "succes",
      cible: { type: "bus", id },
      details: { champs: Object.keys(changement) },
    });
    return resultat;
  }
}
