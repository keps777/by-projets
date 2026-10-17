import { versIsoDouala } from "../../billetterie/temps";
import { Verrous } from "../../paiements/verrous";
import { AuditService } from "../../socle/audit/audit.service";
import type { Utilisateur } from "../../socle/auth/decorateurs";
import { ChiffrementService } from "../../socle/chiffrement/chiffrement.service";
import { configTest } from "../../socle/testing/app-test";
import { AuditMemoire, HorlogeFixe } from "../../socle/testing/memoire";
import { BalayageCovoiturage } from "../balayage";
import { chargerConfigCovoiturage } from "../config";
import { ConducteurService } from "../conducteur.service";
import { DemandesService } from "../demandes.service";
import { ExploitationCovoiturageService } from "../exploitation.service";
import { LiberationService } from "../liberation.service";
import {
  AnnuaireMemoire,
  DemandesMemoire,
  DossiersMemoire,
  NotesMemoire,
  NotifieurMemoire,
  PasserelleVersementsSimulee,
  ReferentielMemoire,
  RemboursementsMemoire,
  ReservationsMemoire,
  TrajetsMemoire,
  TrajetsReguliersMemoire,
  VersementsMemoire,
} from "../memoire";
import type { TypePiece } from "../modeles";
import { ProfilsService } from "../profils.service";
import { RechercheService } from "../recherche.service";
import { ReservationsService } from "../reservations.service";
import { ReputationService } from "../reputation.service";
import { TrajetRegulierService } from "../trajet-regulier.service";
import { TrajetsService, type PublicationTrajet } from "../trajets.service";
import { VerificationService } from "../verification.service";

/** Mardi 5 janvier 2027, 08:00 à Douala. */
export const DEBUT = new Date("2027-01-05T07:00:00.000Z");

export const MINUTE = 60_000;
export const HEURE = 60 * MINUTE;
export const JOUR = 24 * HEURE;

export const AFRIMOVE: Utilisateur = {
  id: "afrimove-1",
  role: "afrimove",
  compagnieId: null,
  gareId: null,
};

export const voyageurDe = (id: string): Utilisateur => ({
  id,
  role: "voyageur",
  compagnieId: null,
  gareId: null,
});

/** Instant `minutes` minutes après le début du test, en ISO Douala. */
export const dans = (minutes: number): string =>
  versIsoDouala(new Date(DEBUT.getTime() + minutes * MINUTE));

export interface OptionsMontageCovoiturage {
  /** Variables `COVOITURAGE_*` en plus de celles du test. */
  env?: Record<string, string>;
}

/**
 * Assemble le covoiturage sans Nest ni HTTP : horloge réglable, ports en mémoire, SMS et
 * remboursements enregistrés pour les vérifier.
 */
export function monterCovoiturage(options: OptionsMontageCovoiturage = {}) {
  const horloge = new HorlogeFixe(DEBUT);
  const configApi = configTest();
  const config = chargerConfigCovoiturage({ COVOITURAGE_BALAYAGE_MS: "0", ...options.env });

  const audit = new AuditService(new AuditMemoire(), configApi);
  const chiffrement = new ChiffrementService(configApi);
  const verrous = new Verrous();

  const trajets = new TrajetsMemoire();
  const reservations = new ReservationsMemoire();
  const dossiers = new DossiersMemoire();
  const versements = new VersementsMemoire();
  const passerelle = new PasserelleVersementsSimulee();
  const demandes = new DemandesMemoire();
  const notes = new NotesMemoire();
  const reguliers = new TrajetsReguliersMemoire();
  const referentiel = new ReferentielMemoire();
  const annuaire = new AnnuaireMemoire();
  const notifieur = new NotifieurMemoire();
  const remboursements = new RemboursementsMemoire();

  const verification = new VerificationService(
    dossiers,
    chiffrement,
    annuaire,
    notifieur,
    audit,
    horloge,
    verrous,
  );
  const reputation = new ReputationService(notes, reservations, horloge);
  const profils = new ProfilsService(annuaire, verification, reputation);
  const trajetsSvc = new TrajetsService(
    trajets,
    verification,
    reputation,
    referentiel,
    annuaire,
    audit,
    horloge,
    verrous,
    config,
  );
  const demandesSvc = new DemandesService(
    demandes,
    trajets,
    reservations,
    referentiel,
    annuaire,
    notifieur,
    reputation,
    profils,
    horloge,
    config,
  );
  const liberation = new LiberationService(
    reservations,
    trajets,
    versements,
    passerelle,
    verification,
    notifieur,
    audit,
    horloge,
    verrous,
    config,
  );
  const reservationsSvc = new ReservationsService(
    trajets,
    reservations,
    verification,
    liberation,
    remboursements,
    notifieur,
    annuaire,
    profils,
    reputation,
    demandesSvc,
    audit,
    horloge,
    verrous,
    config,
  );
  const regulier = new TrajetRegulierService(
    reguliers,
    reservations,
    trajets,
    annuaire,
    referentiel,
    horloge,
  );
  const recherche = new RechercheService(
    trajets,
    reservations,
    referentiel,
    profils,
    regulier,
    horloge,
    config,
  );
  const conducteurSvc = new ConducteurService(
    trajets,
    reservations,
    versements,
    verification,
    profils,
    demandesSvc,
    horloge,
  );
  const exploitation = new ExploitationCovoiturageService(
    verification,
    annuaire,
    versements,
    horloge,
  );
  const balayage = new BalayageCovoiturage(
    reservationsSvc,
    liberation,
    trajetsSvc,
    demandesSvc,
    config,
  );

  let compteur = 0;
  /** Un voyageur avec un compte (nom, téléphone MTN). */
  function voyageur(nom: string, telephone?: string): Utilisateur {
    compteur += 1;
    const id = `voyageur-${compteur}`;
    annuaire.ajouter(id, nom, telephone ?? `+23767700${String(1000 + compteur)}`);
    return voyageurDe(id);
  }

  /** Dépose et valide les quatre pièces d'un conducteur : son dossier est « vérifié ». */
  async function verifier(
    c: Utilisateur,
    surcharge: { immatriculation?: string; places?: number; grandBagage?: boolean } = {},
  ): Promise<void> {
    await verification.declarerVehicule(c.id, {
      marque: "Toyota",
      modele: "Corolla",
      couleur: "grise",
      immatriculation: surcharge.immatriculation ?? "LT 882 CE",
      places: surcharge.places ?? 3,
      grandBagage: surcharge.grandBagage ?? false,
    });
    const pieces: [TypePiece, { numero?: string; expireLe?: string }][] = [
      ["identite", { numero: "123456789" }],
      ["permis", { numero: "CM-445566", expireLe: "2030-06-30" }],
      ["carte_grise", { numero: "CG-778899" }],
      ["voiture", {}],
    ];
    for (const [type, extra] of pieces) {
      await verification.deposerPiece(c.id, type, {
        fichierId: `fichier:${c.id}:${type}`,
        ...extra,
      });
      await verification.decider(AFRIMOVE, c.id, type, "validee", undefined);
    }
  }

  /** Un conducteur vérifié. */
  async function conducteur(nom = "Samuel Ekambi", telephone?: string): Promise<Utilisateur> {
    const c = voyageur(nom, telephone);
    await verifier(c);
    return c;
  }

  /** Publie Douala → Kribi, 2 places à 4 000 F, demain à 08:30 (sauf surcharge). */
  function publication(surcharge: Partial<PublicationTrajet> = {}): PublicationTrajet {
    return {
      depart: { ville: "Douala", point: "Bonapriso, pharmacie du Rond-point" },
      arrivee: { ville: "Kribi", point: "Kribi centre" },
      departA: dans(24 * 60 + 30),
      places: 2,
      prixParPlace: 4000,
      options: ["clim"],
      ...surcharge,
    };
  }

  return {
    horloge,
    config,
    audit,
    chiffrement,
    ports: {
      trajets,
      reservations,
      dossiers,
      versements,
      passerelle,
      demandes,
      notes,
      reguliers,
      referentiel,
      annuaire,
      notifieur,
      remboursements,
    },
    services: {
      verification,
      reputation,
      profils,
      trajets: trajetsSvc,
      demandes: demandesSvc,
      liberation,
      reservations: reservationsSvc,
      regulier,
      recherche,
      conducteur: conducteurSvc,
      exploitation,
      balayage,
    },
    voyageur,
    verifier,
    conducteur,
    publication,
    avancer: (ms: number) => horloge.avancer(ms),
    /** Avance l'horloge jusqu'à `minutes` minutes après le début du test. */
    allerA: (minutes: number) => {
      const cible = DEBUT.getTime() + minutes * MINUTE;
      horloge.avancer(cible - horloge.maintenant().getTime());
    },
  };
}

export type MontageCovoiturage = ReturnType<typeof monterCovoiturage>;
