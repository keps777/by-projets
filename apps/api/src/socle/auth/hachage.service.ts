import { createHmac, timingSafeEqual } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { hash, verify } from "@node-rs/argon2";
import { CONFIG, type AppConfig } from "../config/config";

/**
 * Hachage des secrets d'authentification.
 *
 * PIN et mots de passe : argon2id (paramètres OWASP : 19 Mio, 2 passes) avec un POIVRE serveur
 * (option `secret` d'argon2, AUTH_PEPPER). Un PIN à 6 chiffres n'a que 10^6 valeurs : sans poivre,
 * une base volée se casserait en quelques secondes ; avec lui, il faut aussi la clé du serveur.
 *
 * Codes SMS : HMAC-SHA-256 lié à l'identifiant du défi (le code vit 5 minutes et n'est essayable
 * que 5 fois, un hachage lent n'apporterait rien).
 */
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class HachageService {
  private readonly poivre: Buffer;

  constructor(@Inject(CONFIG) config: AppConfig) {
    this.poivre = config.poivre;
  }

  hacher(secret: string): Promise<string> {
    return hash(secret, { ...OPTIONS, secret: this.poivre });
  }

  async verifier(hache: string, secret: string): Promise<boolean> {
    try {
      return await verify(hache, secret, { secret: this.poivre });
    } catch {
      return false;
    }
  }

  /**
   * Dépense le même temps qu'une vraie vérification : à appeler quand le compte n'existe pas, pour
   * ne pas révéler par le temps de réponse qu'un numéro est inconnu.
   */
  async verifierFactice(secret: string): Promise<void> {
    this.factice ??= await this.hacher("facticeFacticeFactice");
    await this.verifier(this.factice, secret);
  }
  private factice: string | undefined;

  hacherCodeSms(defiId: string, code: string): string {
    return createHmac("sha256", this.poivre)
      .update(`sms\u0000${defiId}\u0000${code}`)
      .digest("hex");
  }

  codeSmsCorrespond(hache: string, defiId: string, code: string): boolean {
    const attendu = Buffer.from(this.hacherCodeSms(defiId, code), "hex");
    const recu = Buffer.from(hache, "hex");
    return attendu.length === recu.length && timingSafeEqual(attendu, recu);
  }
}
