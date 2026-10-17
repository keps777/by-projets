import { AuditService } from "../../socle/audit/audit.service";
import { ChiffrementService } from "../../socle/chiffrement/chiffrement.service";
import { configTest } from "../../socle/testing/app-test";
import { AuditMemoire, HorlogeFixe } from "../../socle/testing/memoire";
import { chargerConfigSms, type ConfigSms } from "../config";
import { Disjoncteur } from "../disjoncteur";
import { FileEnvoiMemoire } from "../file-memoire";
import { FournisseurSimule } from "../fournisseur-simule";
import { JournalMemoire } from "../journal-memoire";
import { PasserelleSmsService } from "../passerelle.service";
import { ReceptionRecusService } from "../reception.service";
import { RegistreFournisseurs } from "../registre";
import { StatistiquesSmsService } from "../statistiques.service";

/** Mardi 5 janvier 2027, 08:00 à Douala (l'horloge figée des fixtures est 07:38). */
export const DEBUT = new Date("2027-01-05T07:00:00.000Z");

export const VARIABLES_BILLET = {
  compagnie: "Alpha Voyages",
  origine: "Douala",
  destination: "Yaoundé",
  departA: new Date("2027-01-05T07:30:00.000Z"),
  siege: "14",
  code: "7341",
  lien: "https://afrimove.app/b/Xk3pQ9",
};

export interface OptionsMontage {
  /** Variables d'environnement `SMS_*` en plus des valeurs de test. */
  env?: Record<string, string>;
  avecSecours?: boolean;
  /** Durée simulée d'un appel au fournisseur principal. */
  latenceMs?: number;
}

/**
 * Assemble la passerelle sans Nest ni HTTP : horloge réglable, journal et file en mémoire,
 * fournisseurs simulés. `vider()` fait avancer l'horloge d'échéance en échéance jusqu'à ce que la
 * file n'ait plus rien à faire.
 */
export function monterSms(options: OptionsMontage = {}) {
  const horloge = new HorlogeFixe(DEBUT);
  const config: ConfigSms = chargerConfigSms({ SMS_SONDAGE_MS: "0", ...options.env });
  const configApi = configTest();
  const chiffrement = new ChiffrementService(configApi);
  const auditRepo = new AuditMemoire();
  const audit = new AuditService(auditRepo, configApi);
  const journal = new JournalMemoire();
  const file = new FileEnvoiMemoire(horloge, 0);

  const outils = {
    dormir: (ms: number) => horloge.avancer(ms),
    maintenant: () => horloge.maintenant(),
  };
  const principal = new FournisseurSimule({ nom: "principal", ...outils });
  principal.latenceMs = options.latenceMs ?? 0;
  const secours = options.avecSecours ? new FournisseurSimule({ nom: "secours", ...outils }) : null;
  const registre = new RegistreFournisseurs(principal, secours);
  const disjoncteur = new Disjoncteur(horloge, config);
  const passerelle = new PasserelleSmsService(
    journal,
    file,
    registre,
    disjoncteur,
    chiffrement,
    audit,
    horloge,
    config,
  );
  file.traiter((travail) => passerelle.traiter(travail), { concurrence: config.concurrence });

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
    principal,
    secours,
    registre,
    disjoncteur,
    passerelle,
    reception: new ReceptionRecusService(journal, registre, horloge),
    statistiques: new StatistiquesSmsService(journal, config),
    vider,
  };
}

export type MontageSms = ReturnType<typeof monterSms>;
