import { randomUUID } from "node:crypto";
import {
  creerAppRelaisTest,
  type OptionsAppRelaisTest,
} from "../../relais/testing/app-relais-test";
import { InscriptionLivreurService } from "../inscription.service";
import { LivraisonModule } from "../livraison.module";
import { LivraisonService } from "../livraison.service";
import { LivreursService } from "../livreurs.service";
import {
  DemandesLivreurMemoire,
  DiffusionLivraisonMemoire,
  InvitationsMemoire,
  LivreursMemoire,
  MissionsMemoire,
  PartagesSuiviMemoire,
} from "../memoire";
import { MissionsService } from "../missions.service";
import {
  DemandesLivreurRepository,
  DiffusionLivraison,
  Invitations,
  LivreursRepository,
  MissionsRepository,
  PartagesSuivi,
} from "../ports";
import type { LivreurStocke } from "../modele";
import { TachesLivraison } from "../taches.service";

export * from "../../relais/testing/app-relais-test";

/** L'API complète avec les colis, les points relais et la livraison moto, tous en mémoire. */
export async function creerAppLivraisonTest(options: OptionsAppRelaisTest = {}) {
  const base = await creerAppRelaisTest({
    ...options,
    modules: [LivraisonModule, ...(options.modules ?? [])],
  });
  const { app } = base;
  const livreursRepo = app.get(LivreursRepository) as LivreursMemoire;

  /** Un livreur actif et en ligne (zone : toute la ville de Bafoussam, toute la journée, 10 kg), avec son compte. */
  async function creerLivreur(over: Partial<LivreurStocke> = {}) {
    const numero = over.numero ?? livreursRepo.lignes.size + 1;
    const proprietaire = await base.compte("livreur", { nom: over.nom ?? `Livreur ${numero}` });
    const livreur: LivreurStocke = {
      id: randomUUID(),
      version: 1,
      badge: `L-BAF-${String(numero).padStart(4, "0")}`,
      numero,
      personneId: proprietaire.id,
      nom: proprietaire.nom,
      ville: "Bafoussam",
      deplacement: "moto",
      zone: "Bafoussam · toute la ville",
      heures: "Toute la journée",
      chargeMax: "10 kg · colis courants",
      momo: { telephone: "+237670000222", operateur: "mtn" },
      pieces: {
        permisRef: "photos/permis.jpg",
        assuranceRef: "photos/assurance.jpg",
        permisValideJusqua: "2030-01-31",
        assuranceExpireLe: "2027-12-31",
      },
      moto: "OU 517 MT",
      disponible: true,
      actif: true,
      note: 5,
      creeA: "2026-10-01T10:00:00.000+01:00",
      ...over,
    };
    if (!(await livreursRepo.ajouter(livreur))) throw new Error("Livreur non ajouté");
    return { livreur, compte: proprietaire };
  }

  return {
    ...base,
    creerLivreur,
    livreursRepo,
    demandesLivreur: app.get(DemandesLivreurRepository) as DemandesLivreurMemoire,
    missionsRepo: app.get(MissionsRepository) as MissionsMemoire,
    partages: app.get(PartagesSuivi) as PartagesSuiviMemoire,
    invitations: app.get(Invitations) as InvitationsMemoire,
    diffusionLivraison: app.get(DiffusionLivraison) as DiffusionLivraisonMemoire,
    missions: app.get(MissionsService),
    livreurs: app.get(LivreursService),
    livraison: app.get(LivraisonService),
    inscriptionLivreur: app.get(InscriptionLivreurService),
    tachesLivraison: app.get(TachesLivraison),
  };
}

export type AppLivraisonTest = Awaited<ReturnType<typeof creerAppLivraisonTest>>;
