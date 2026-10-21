import { Injectable } from "@nestjs/common";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { BLOCAGE_PIN_MINUTES, ESSAIS_PIN_MAX } from "../socle/auth/auth.service";
import { HachageService } from "../socle/auth/hachage.service";
import { PersonnesRepository } from "../socle/comptes/personnes.repository";
import { Horloge } from "../socle/horloge";
import { erreurApi, type SignaturePin } from "./commande";

/** Écart toléré entre l'heure de l'appareil (`signeA`) et celle du serveur. */
export const TOLERANCE_SIGNATURE_MS = 10 * 60_000;

/**
 * Vérifie la signature PIN d'une écriture du patron : le PIN est celui du compte connecté, il se
 * compte comme un essai de connexion (3 essais, puis 15 minutes de blocage : mêmes compteurs que
 * `AuthService`), et la date de l'appareil doit être proche de celle du serveur (une signature
 * capturée ne se rejoue pas plus tard). Le PIN n'est ni conservé ni journalisé.
 *
 * Erreurs : 401 `COMPTE_INACTIF`, 423 `PIN_BLOQUE`, 409 `PIN_NON_DEFINI`, 422 `SIGNATURE_PERIMEE`,
 * 403 `PIN_INCORRECT`.
 */
@Injectable()
export class VerificateurSignature {
  constructor(
    private readonly personnes: PersonnesRepository,
    private readonly hachage: HachageService,
    private readonly horloge: Horloge,
  ) {}

  async verifier(utilisateur: Utilisateur, signature: SignaturePin): Promise<void> {
    const maintenant = this.horloge.maintenant();
    const personne = await this.personnes.trouverParId(utilisateur.id);
    if (!personne || !personne.actif) {
      throw erreurApi(401, "COMPTE_INACTIF", "Compte inactif");
    }
    if (personne.bloqueJusqua && personne.bloqueJusqua > maintenant) {
      throw erreurApi(423, "PIN_BLOQUE", "Trop d'essais. Réessayez plus tard.");
    }
    if (!personne.pinHache) {
      throw erreurApi(409, "PIN_NON_DEFINI", "Aucun PIN n'est défini pour ce compte");
    }
    const ecart = Math.abs(Date.parse(signature.signeA) - maintenant.getTime());
    if (ecart > TOLERANCE_SIGNATURE_MS) {
      throw erreurApi(
        422,
        "SIGNATURE_PERIMEE",
        "L'heure de l'appareil est trop éloignée de celle du serveur",
      );
    }
    if (!(await this.hachage.verifier(personne.pinHache, signature.pin))) {
      const echecs = personne.echecsConnexion + 1;
      const bloque = echecs >= ESSAIS_PIN_MAX;
      await this.personnes.enregistrerEchec(
        personne.id,
        bloque ? 0 : echecs,
        bloque ? new Date(maintenant.getTime() + BLOCAGE_PIN_MINUTES * 60_000) : null,
      );
      throw erreurApi(403, "PIN_INCORRECT", "PIN incorrect");
    }
    // Un PIN juste remet le compteur à zéro (sans toucher à la date de dernière connexion).
    if (personne.echecsConnexion > 0) await this.personnes.enregistrerEchec(personne.id, 0, null);
  }
}
