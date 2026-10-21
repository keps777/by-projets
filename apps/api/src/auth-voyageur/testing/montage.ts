import { expect } from "vitest";
import { AuditService } from "../../socle/audit/audit.service";
import { configTest } from "../../socle/testing/app-test";
import { AuditMemoire, HorlogeFixe } from "../../socle/testing/memoire";
import { ConnexionVoyageurService } from "../connexion.service";
import { chargerConfigAuthVoyageur, type ConfigAuthVoyageur } from "../config";
import { Refus } from "../erreurs";
import {
  ComptesVoyageurMemoire,
  EmetteurSessionMemoire,
  EnvoiCodeSmsMemoire,
  EnvoiCodeWhatsAppAbsent,
  EnvoiCodeWhatsAppMemoire,
  FichesVoyageurMemoire,
  StockageConnexionMemoire,
} from "../memoire";
import type { EnvoiCodeWhatsApp } from "../ports";

export const TEL = "+237691221008";
export const AUTRE_TEL = "+237655012345";
export const MIN = 60_000;

export interface OptionsMontage {
  config?: Record<string, string>;
  /** `memoire` : WhatsApp branché sur une boîte simulée ; `absent` : pas branché (par défaut). */
  whatsapp?: "memoire" | "absent";
}

/**
 * Le service de connexion sur les adaptateurs en mémoire et une horloge qu'on fait avancer : aucun
 * test n'attend en vrai.
 */
export function monterConnexion(options: OptionsMontage = {}) {
  const appConfig = configTest();
  const config: ConfigAuthVoyageur = chargerConfigAuthVoyageur(options.config ?? {});
  const horloge = new HorlogeFixe(new Date("2027-01-05T08:00:00.000Z"));
  const stockage = new StockageConnexionMemoire();
  const sms = new EnvoiCodeSmsMemoire();
  const whatsappMemoire = new EnvoiCodeWhatsAppMemoire();
  const whatsapp: EnvoiCodeWhatsApp =
    options.whatsapp === "memoire" ? whatsappMemoire : new EnvoiCodeWhatsAppAbsent();
  const comptes = new ComptesVoyageurMemoire();
  const fiches = new FichesVoyageurMemoire();
  const sessions = new EmetteurSessionMemoire(() => horloge.maintenant());
  const auditRepo = new AuditMemoire();
  const audit = new AuditService(auditRepo, appConfig);
  const service = new ConnexionVoyageurService(
    appConfig,
    config,
    horloge,
    stockage,
    sms,
    whatsapp,
    comptes,
    fiches,
    sessions,
    audit,
  );
  return {
    service,
    config,
    horloge,
    stockage,
    sms,
    whatsapp: whatsappMemoire,
    comptes,
    fiches,
    auditRepo,
    /** Avance l'horloge de `ms`. */
    avancer: (ms: number) => horloge.avancer(ms),
    /** Demande un code par SMS et rend celui qui est « arrivé » sur le téléphone. */
    async demanderEtLire(telephone = TEL): Promise<string> {
      await service.demanderCode({ telephone });
      return sms.dernierCode();
    },
  };
}

export type Montage = ReturnType<typeof monterConnexion>;

/** Un code de 4 chiffres qui n'est pas `code`. */
export const autreCode = (code: string): string => (code === "0000" ? "0001" : "0000");

/** Attend un refus et le rend, pour en lire le statut, le code et les détails. */
export async function refus(promesse: Promise<unknown>): Promise<Refus> {
  try {
    await promesse;
  } catch (e) {
    expect(e).toBeInstanceOf(Refus);
    return e as Refus;
  }
  throw new Error("Un refus était attendu");
}
