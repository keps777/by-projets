import { DiffusionMemoire, ProchesMemoire } from "../../billetterie/memoire";
import { ClotureMemoire } from "../../comptable/memoire";
import { VerrouillageMois } from "../../comptable/verrouillage.service";
import { AuditService } from "../../socle/audit/audit.service";
import type { Utilisateur } from "../../socle/auth/decorateurs";
import { ChiffrementService } from "../../socle/chiffrement/chiffrement.service";
import { configTest } from "../../socle/testing/app-test";
import { AuditMemoire, HorlogeFixe } from "../../socle/testing/memoire";
import { AgregateurSimule } from "../agregateur-simule";
import type { EtatTransaction } from "../agregateur";
import { chargerConfigPaiements } from "../config";
import { DisjoncteurPaiements } from "../disjoncteur";
import { EncaissementsService } from "../encaissements.service";
import { GardeAgregateur } from "../garde-agregateur";
import { LiensService } from "../liens.service";
import {
  AnnuaireMemoire,
  CommandesAPayerMemoire,
  ComptesReversementMemoire,
  LiensPaiementMemoire,
  NotifieurMemoire,
  NotificationsTraiteesMemoire,
  PaiementsMemoire,
  ReglagesPaiementsMemoire,
  RemboursementsMemoire,
} from "../memoire";
import { ModeDegradeService } from "../mode-degrade.service";
import { PaiementsService } from "../paiements.service";
import type { CommandeAPayer } from "../ports";
import { RemboursementsService } from "../remboursements.service";
import { Verrous } from "../verrous";

/** Mardi 5 janvier 2027, 08:00 à Douala. */
export const DEBUT = new Date("2027-01-05T07:00:00.000Z");

export const COMPAGNIE = "00000000-0000-4000-8000-0000000000c1";
export const AUTRE_COMPAGNIE = "00000000-0000-4000-8000-0000000000c2";
export const COMPTE_COMPAGNIE = "compte-alpha";

export const VOYAGEUR: Utilisateur = {
  id: "voyageur-1",
  role: "voyageur",
  compagnieId: null,
  gareId: null,
};
export const AUTRE_VOYAGEUR: Utilisateur = { ...VOYAGEUR, id: "voyageur-2" };
export const GUICHETIER: Utilisateur = {
  id: "guichetier-1",
  role: "guichetier",
  compagnieId: COMPAGNIE,
  gareId: "gare-1",
};
export const AFRIMOVE: Utilisateur = {
  id: "afrimove-1",
  role: "afrimove",
  compagnieId: null,
  gareId: null,
};

export const TEL_MTN = "+237677012345";
export const TEL_ORANGE = "+237691221008";

export interface OptionsMontage {
  /** Variables d'environnement `PAIEMENTS_*` en plus des valeurs de test. */
  env?: Record<string, string>;
  /** Issue d'un encaissement sans scénario (en attente de confirmation par défaut). */
  issue?: EtatTransaction;
  /** Compte de la première compagnie chez l'agrégateur (défini par défaut). */
  sansCompte?: boolean;
}

/** Une commande en ligne de 4 000 F + 250 F de frais de service, valable 15 minutes. */
export function commandeType(surcharge: Partial<CommandeAPayer> = {}): CommandeAPayer {
  return {
    id: "commande-1",
    voyageurId: VOYAGEUR.id,
    compagnieId: COMPAGNIE,
    libelle: "Alpha Voyages · Douala → Yaoundé · 14:00",
    lignes: [
      { code: "billet", libelle: "Billet", montant: 4000 },
      { code: "frais_voyageur", libelle: "Frais de service", montant: 250 },
    ],
    total: 4250,
    conversion: null,
    statut: "en_attente_paiement",
    expireA: new Date(DEBUT.getTime() + 15 * 60_000),
    nombreSieges: 1,
    billetIds: [],
    ...surcharge,
  };
}

/**
 * Assemble les paiements sans Nest ni HTTP : horloge réglable, ports en mémoire, agrégateur simulé,
 * commandes de la billetterie remplacées par une version programmable.
 */
export function monterPaiements(options: OptionsMontage = {}) {
  const horloge = new HorlogeFixe(DEBUT);
  const configApi = configTest();
  const config = chargerConfigPaiements({
    PAIEMENTS_FOURNISSEUR: "simule",
    PAIEMENTS_BALAYAGE_MS: "0",
    PAIEMENTS_URL_LIEN_PROCHE: "https://afrimove.app/payer",
    ...options.env,
  });
  const maintenant = () => horloge.maintenant();

  const agregateur = new AgregateurSimule({
    nom: "simule",
    ...(options.issue ? { issue: options.issue } : {}),
    maintenant,
  });
  const disjoncteur = new DisjoncteurPaiements(maintenant, config.disjoncteur);
  const garde = new GardeAgregateur(agregateur, disjoncteur);

  const auditRepo = new AuditMemoire();
  const audit = new AuditService(auditRepo, configApi);
  const chiffrement = new ChiffrementService(configApi);
  const verrous = new Verrous();
  const diffusion = new DiffusionMemoire();

  const paiements = new PaiementsMemoire();
  const remboursements = new RemboursementsMemoire();
  const traitees = new NotificationsTraiteesMemoire();
  const liens = new LiensPaiementMemoire();
  const comptes = new ComptesReversementMemoire();
  const reglages = new ReglagesPaiementsMemoire();
  const commandes = new CommandesAPayerMemoire();
  const notifieur = new NotifieurMemoire();
  const annuaire = new AnnuaireMemoire();
  const proches = new ProchesMemoire();
  if (!options.sansCompte) void comptes.definir(COMPAGNIE, COMPTE_COMPAGNIE);
  annuaire.ajouter(VOYAGEUR.id, TEL_ORANGE, "Aïcha");
  annuaire.ajouter(AUTRE_VOYAGEUR.id, TEL_MTN, "Paul");

  const clotures = new ClotureMemoire();
  const verrou = new VerrouillageMois(clotures);
  const mode = new ModeDegradeService(reglages, garde, audit, horloge, config);
  const remb = new RemboursementsService(
    remboursements,
    paiements,
    garde,
    audit,
    horloge,
    verrous,
    config,
    verrou,
  );
  const encaissements = new EncaissementsService(
    paiements,
    traitees,
    commandes,
    remb,
    garde,
    agregateur,
    audit,
    diffusion,
    horloge,
    verrous,
    config,
  );
  const service = new PaiementsService(
    paiements,
    remboursements,
    commandes,
    comptes,
    annuaire,
    garde,
    mode,
    encaissements,
    chiffrement,
    audit,
    horloge,
    verrous,
    config,
  );
  const liensService = new LiensService(
    liens,
    commandes,
    proches,
    annuaire,
    comptes,
    notifieur,
    mode,
    service,
    audit,
    horloge,
    config,
  );

  commandes.ajouter(commandeType());

  return {
    config,
    horloge,
    agregateur,
    disjoncteur,
    garde,
    auditRepo,
    audit,
    chiffrement,
    diffusion,
    paiements,
    remboursements,
    traitees,
    liens,
    comptes,
    reglages,
    commandes,
    notifieur,
    annuaire,
    proches,
    /** Les mois clôturés (vide au départ) : `clotures.verrouiller({ compagnieId, mois } as Cloture)`. */
    clotures,
    mode,
    remb,
    encaissements,
    service,
    liensService,
    /** Les actions d'audit enregistrées, dans l'ordre. */
    actions: () => auditRepo.lignes.map((l) => l.action),
  };
}

export type Montage = ReturnType<typeof monterPaiements>;
