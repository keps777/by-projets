import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { HachageService } from "../socle/auth/hachage.service";
import { verifierPin, SecretFaible } from "../socle/comptes/comptes.service";
import { PersonnesRepository } from "../socle/comptes/personnes.repository";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { Horloge } from "../socle/horloge";
import { canonique } from "../caisse/journal/journal.service";
import { AlertesPatron } from "../caisse/ports";
import { conflit, interdit, invalide, nonAuthentifie, verrouille } from "../caisse/erreurs";
import { BLOCAGE_PIN_MINUTES, ESSAIS_PIN_MAX, LONGUEUR_PIN } from "../caisse/regles";
import { MS_PAR_MINUTE, versIsoDouala } from "../caisse/temps";
import type { ValidationSuperviseurLue } from "../caisse/validation";
import { PinsEquipe } from "./ports";

/** Une preuve de PIN est valable dix minutes : le temps de remplir l'écran, pas de la rejouer demain. */
export const VALIDITE_PREUVE_PIN_MS = 10 * MS_PAR_MINUTE;
/** Tolérance sur l'horloge entre deux instances du serveur. */
const AVANCE_ADMISE_MS = MS_PAR_MINUTE;

type Brut = Record<string, unknown>;
const estObjet = (v: unknown): v is Brut =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Ce que la preuve signe : l'événement tel que l'appareil va l'envoyer, moins la signature de la
 * preuve elle-même. Changer le montant, la décision, la personne visée ou l'identifiant de
 * l'événement après avoir mis son PIN invalide donc la preuve.
 */
export function contenuAProuver(evenement: Brut): Brut | null {
  const donnees = evenement["donnees"];
  if (!estObjet(donnees) || !estObjet(donnees["validePar"])) return null;
  const { superviseurId, methode } = donnees["validePar"];
  return {
    ...evenement,
    donnees: { ...donnees, validePar: { superviseurId, methode } },
  };
}

/**
 * La preuve qu'un superviseur a mis son PIN pour CET événement : un jeton signé par le serveur
 * (HMAC-SHA-256 avec le poivre du serveur), valable dix minutes, qui voyage dans
 * `validePar.signature` (hexadécimal : 8 caractères pour l'heure d'émission, 64 pour la signature).
 *
 * Le PIN, lui, ne voyage qu'une fois, vers `POST /agence/superviseur/pin`, et n'est jamais écrit
 * nulle part. L'événement qui exécute l'action ne porte que la preuve.
 */
@Injectable()
export class PreuvesPinService {
  private readonly cle: Buffer;

  constructor(
    @Inject(CONFIG) config: AppConfig,
    private readonly horloge: Horloge,
  ) {
    this.cle = createHmac("sha256", config.poivre).update("preuve.pin.v1").digest();
  }

  private calculer(secondes: number, superviseurId: string, contenu: Brut): string {
    return createHmac("sha256", this.cle)
      .update(`${secondes}\n${superviseurId}\n${canonique(contenu)}`)
      .digest("hex");
  }

  emettre(superviseurId: string, evenement: Brut): { signature: string; expireA: string } {
    const contenu = contenuAProuver(evenement);
    if (!contenu) throw new RangeError("Événement sans validePar");
    const maintenant = this.horloge.maintenant().getTime();
    const secondes = Math.floor(maintenant / 1000);
    const signature =
      secondes.toString(16).padStart(8, "0") + this.calculer(secondes, superviseurId, contenu);
    return { signature, expireA: versIsoDouala(maintenant + VALIDITE_PREUVE_PIN_MS) };
  }

  verifier(validePar: ValidationSuperviseurLue, evenement: Brut): boolean {
    if (validePar.methode !== "pin" || validePar.signature.length !== 72) return false;
    const contenu = contenuAProuver(evenement);
    if (!contenu) return false;
    const secondes = parseInt(validePar.signature.slice(0, 8), 16);
    const age = this.horloge.maintenant().getTime() - secondes * 1000;
    if (!Number.isFinite(age) || age > VALIDITE_PREUVE_PIN_MS || age < -AVANCE_ADMISE_MS) {
      return false;
    }
    const attendue = Buffer.from(this.calculer(secondes, validePar.superviseurId, contenu));
    const recue = Buffer.from(validePar.signature.slice(8));
    return attendue.length === recue.length && timingSafeEqual(attendue, recue);
  }
}

/**
 * Contrôle du PIN d'un superviseur, avec les comptes du socle : le haché argon2id (avec poivre) de
 * `personne.pinHache`, le compteur d'échecs et le blocage de `PersonnesRepository`. Mêmes règles que
 * la connexion : 3 essais faux, puis 15 minutes de blocage, et le patron est alerté.
 */
@Injectable()
export class PinSuperviseurService {
  constructor(
    private readonly personnes: PersonnesRepository,
    private readonly hachage: HachageService,
    private readonly pins: PinsEquipe,
    private readonly alertes: AlertesPatron,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
  ) {}

  /** Lève une erreur HTTP si le PIN n'est pas celui du superviseur connecté. */
  async verifier(u: Utilisateur, pin: unknown): Promise<void> {
    if (typeof pin !== "string" || !new RegExp(`^\\d{${LONGUEUR_PIN}}$`).test(pin)) {
      throw invalide("PIN_FORMAT", `Le PIN comporte exactement ${LONGUEUR_PIN} chiffres`);
    }
    const maintenant = this.horloge.maintenant();
    const p = await this.personnes.trouverParId(u.id);
    const acteur = { id: u.id, role: u.role, compagnieId: u.compagnieId };
    if (!p || !p.actif || !p.roles.includes("superviseur")) {
      throw interdit("SUPERVISEUR_REQUIS", "Seul un superviseur peut valider avec son PIN");
    }
    if (p.bloqueJusqua && p.bloqueJusqua > maintenant) {
      await this.audit.enregistrer({
        acteur,
        action: "superviseur.pin.verification",
        resultat: "refus",
        details: { cause: "compte_bloque" },
      });
      throw verrouille("PIN_BLOQUE", "PIN bloqué après trop d'essais. Réessayez plus tard.", {
        reessayerApres: versIsoDouala(p.bloqueJusqua),
      });
    }
    if (!p.pinHache) {
      throw conflit(
        "PIN_NON_DEFINI",
        "Aucun PIN n'est défini pour ce compte : demandez un PIN provisoire à votre responsable",
      );
    }
    const etat = await this.pins.lire(p.id);
    if (etat.provisoireJusqua && etat.provisoireJusqua <= maintenant) {
      throw conflit(
        "PIN_PROVISOIRE_EXPIRE",
        "Votre PIN provisoire a expiré : demandez-en un nouveau",
      );
    }

    if (await this.hachage.verifier(p.pinHache, pin)) {
      if (p.echecsConnexion > 0) await this.personnes.enregistrerEchec(p.id, 0, null);
      await this.audit.enregistrer({
        acteur,
        action: "superviseur.pin.verification",
        resultat: "succes",
      });
      return;
    }

    const echecs = p.echecsConnexion + 1;
    const bloque = echecs >= ESSAIS_PIN_MAX;
    const jusqua = new Date(maintenant.getTime() + BLOCAGE_PIN_MINUTES * MS_PAR_MINUTE);
    await this.personnes.enregistrerEchec(p.id, bloque ? 0 : echecs, bloque ? jusqua : null);
    await this.audit.enregistrer({
      acteur,
      action: "superviseur.pin.verification",
      resultat: "echec",
      details: { echecs, bloque },
    });
    if (bloque) {
      await this.alertes.alerter({
        type: "pin_bloque",
        compagnieId: p.compagnieId,
        gareId: p.gareId,
        message: `${p.nom || "Un superviseur"} est bloqué après ${ESSAIS_PIN_MAX} PIN faux (${BLOCAGE_PIN_MINUTES} minutes).`,
        details: { personneId: p.id, role: "superviseur", bloqueJusqua: versIsoDouala(jusqua) },
      });
      throw verrouille("PIN_BLOQUE", "PIN bloqué après trop d'essais. Réessayez plus tard.", {
        reessayerApres: versIsoDouala(jusqua),
      });
    }
    throw nonAuthentifie("PIN_INCORRECT", "PIN incorrect", {
      essaisRestants: ESSAIS_PIN_MAX - echecs,
    });
  }
}

/**
 * Un PIN provisoire de 6 chiffres qui respecte la politique du socle (ni suite ni chiffres
 * identiques), tiré avec le générateur cryptographique de Node.
 */
export function genererPinProvisoire(): string {
  for (;;) {
    const pin = String(randomInt(0, 10 ** LONGUEUR_PIN)).padStart(LONGUEUR_PIN, "0");
    try {
      verifierPin(pin);
      return pin;
    } catch (e) {
      if (!(e instanceof SecretFaible)) throw e;
    }
  }
}
