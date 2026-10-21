import { AuditService } from "../../socle/audit/audit.service";
import { ChiffrementService } from "../../socle/chiffrement/chiffrement.service";
import { configTest } from "../../socle/testing/app-test";
import { AuditMemoire, HorlogeFixe } from "../../socle/testing/memoire";
import { CompteWhatsAppService } from "../compte.service";
import { chargerConfigWhatsApp, type ConfigWhatsApp } from "../config";
import { DisjoncteurWhatsApp } from "../disjoncteur";
import { FileEnvoiMemoire } from "../file-memoire";
import { FournisseurWhatsAppSimule } from "../fournisseur-simule";
import { JournalWhatsAppMemoire } from "../journal-memoire";
import {
  AnnuaireRapportMemoire,
  GestionnaireEntrantsMemoire,
  SecoursSmsMemoire,
  SourceRapportMemoire,
} from "../memoire";
import { PasserelleWhatsAppService } from "../passerelle.service";
import { SecoursSmsAucun, type SecoursSms } from "../ports";
import { PlanificateurRapportSoir, RapportSoirWhatsAppService } from "../rapport-soir.service";
import type { RapportSoirEntree } from "../rapport";
import { ReceptionWhatsAppService } from "../reception.service";
import { SecoursWhatsAppService } from "../secours.service";

/** Mardi 5 janvier 2027, 08:00 à Douala (07:00 UTC). */
export const DEBUT = new Date("2027-01-05T07:00:00.000Z");
/** Le même jour à 21:00 à Douala (20:00 UTC). */
export const VINGT_ET_UNE_HEURES = new Date("2027-01-05T20:00:00.000Z");

export const COMPAGNIE_ALPHA = "00000000-0000-4000-8000-0000000000c1";

export const VARIABLES_BILLET = {
  compagnie: "Alpha Voyages",
  origine: "Douala",
  destination: "Yaoundé",
  departA: new Date("2027-01-05T07:30:00.000Z"),
  siege: "14",
  code: "7341",
  lien: "https://afrimove.app/b/Xk3pQ9",
};

export const VARIABLES_COLIS = {
  compagnie: "Alpha Voyages",
  numeroColis: "COL-4821",
  lieu: "gare de Yaoundé",
  code: "482915",
};

/** Le rapport de la planche RapportSoir, chiffres de la maquette. */
export function rapportMaquette(jour = "2027-01-05"): RapportSoirEntree {
  return {
    jour,
    titre: "Rapport du mardi 5 janvier · 3 gares",
    chiffres: {
      billets: 1004,
      variationBilletsPct: 6,
      colis: 312,
      litiges: 0,
      recette: 4_410_000,
      cash: 2_900_000,
      momo: 1_500_000,
    },
    gares: [
      {
        nom: "Akwa",
        billets: 491,
        ecart: -1000,
        remarques: ["3 guichets clôturés", "guichet 2, validé par Essono"],
      },
      { nom: "Mvan", billets: 338, ecart: 0, remarques: ["1 départ fusionné (16:00 + 16:30)"] },
      { nom: "Bafoussam", billets: 175, ecart: 0, remarques: ["soute pleine à 10:00"] },
    ],
    enRoute: {
      texte:
        "23 billets vendus par les convoyeurs, tous enregistrés · 1 contrôle : 1 régularisation à Edéa",
    },
    remplissage: { moyenPct: 84, remarque: "le 09:30 Oméga part à 55 %" },
    annulations: { nombre: 5, montant: 20_000, toutesAvecPin: true },
    enLigne: { billets: 61, partPct: 6 },
    signatures: [
      { nom: "Essono", gare: "Akwa" },
      { nom: "Tchinda", gare: "Mvan" },
      { nom: "Fosso", gare: "Baf." },
    ],
  };
}

export const PATRON = {
  personneId: "p-patron",
  nom: "Joseph Nkoulou",
  role: "patron" as const,
  telephone: "+237655010001",
};
export const SUPERVISEUR_AKWA = {
  personneId: "p-sup-akwa",
  nom: "Essono",
  role: "superviseur" as const,
  telephone: "+237655010002",
};
export const SUPERVISEUR_MVAN = {
  personneId: "p-sup-mvan",
  nom: "Tchinda",
  role: "superviseur" as const,
  telephone: "+237655010003",
};

export interface OptionsMontage {
  /** Variables d'environnement `WHATSAPP_*` en plus des valeurs de test. */
  env?: Record<string, string>;
  /** `false` : le canal de repli par SMS n'est pas branché. */
  secoursBranche?: boolean;
  /** Durée simulée d'un appel à WhatsApp. */
  latenceMs?: number;
  /** Compagnie Alpha avec son rapport du jour et ses destinataires (patron + 2 superviseurs). */
  avecRapport?: boolean;
}

/**
 * Assemble la passerelle sans Nest ni HTTP : horloge réglable, journal, file et ports en mémoire,
 * fournisseur simulé. `vider()` fait avancer l'horloge d'échéance en échéance jusqu'à ce que la file
 * n'ait plus rien à faire.
 */
export function monterWhatsApp(options: OptionsMontage = {}) {
  const horloge = new HorlogeFixe(DEBUT);
  const config: ConfigWhatsApp = chargerConfigWhatsApp({
    WHATSAPP_SONDAGE_MS: "0",
    WHATSAPP_PLANIFICATEUR_MS: "0",
    ...options.env,
  });
  const configApi = configTest();
  const chiffrement = new ChiffrementService(configApi);
  const auditRepo = new AuditMemoire();
  const audit = new AuditService(auditRepo, configApi);
  const journal = new JournalWhatsAppMemoire();
  const file = new FileEnvoiMemoire(horloge, 0);

  const fournisseur = new FournisseurWhatsAppSimule({
    dormir: (ms) => horloge.avancer(ms),
    maintenant: () => horloge.maintenant(),
  });
  fournisseur.latenceMs = options.latenceMs ?? 0;
  const secoursSms = new SecoursSmsMemoire();
  const portSecours: SecoursSms =
    options.secoursBranche === false ? new SecoursSmsAucun() : secoursSms;
  const source = new SourceRapportMemoire();
  const annuaire = new AnnuaireRapportMemoire();
  const gestionnaire = new GestionnaireEntrantsMemoire();
  if (options.avecRapport) {
    source.ajouter({ id: COMPAGNIE_ALPHA, nom: "Alpha Voyages" }, rapportMaquette());
    annuaire.definir(COMPAGNIE_ALPHA, [PATRON, SUPERVISEUR_AKWA, SUPERVISEUR_MVAN]);
  }

  const disjoncteur = new DisjoncteurWhatsApp(horloge, config);
  const secours = new SecoursWhatsAppService(journal, portSecours, chiffrement, audit, config);
  const passerelle = new PasserelleWhatsAppService(
    journal,
    file,
    fournisseur,
    disjoncteur,
    chiffrement,
    audit,
    horloge,
    secours,
    config,
  );
  file.traiter((travail) => passerelle.traiter(travail), { concurrence: config.concurrence });
  const rapports = new RapportSoirWhatsAppService(passerelle, source, annuaire, journal);

  /** Traite la file, avance jusqu'à la prochaine échéance, recommence ; rend le nombre d'essais. */
  async function vider(maxEtapes = 100): Promise<number> {
    let essais = 0;
    for (let i = 0; i < maxEtapes; i++) {
      essais += await file.traiterPrets();
      const prochaine = file.prochaineEcheance();
      if (!prochaine) return essais;
      const attente = prochaine.getTime() - horloge.maintenant().getTime();
      if (attente > 0) horloge.avancer(attente);
    }
    throw new Error("La file ne se vide pas");
  }

  return {
    horloge,
    config,
    chiffrement,
    audit,
    auditRepo,
    journal,
    file,
    fournisseur,
    secoursSms,
    source,
    annuaire,
    gestionnaire,
    disjoncteur,
    secours,
    passerelle,
    rapports,
    planificateur: new PlanificateurRapportSoir(rapports, source, journal, audit, horloge, config),
    reception: new ReceptionWhatsAppService(
      journal,
      fournisseur,
      chiffrement,
      secours,
      gestionnaire,
    ),
    compte: new CompteWhatsAppService(fournisseur, journal, passerelle, source, horloge, config),
    vider,
  };
}

export type MontageWhatsApp = ReturnType<typeof monterWhatsApp>;
