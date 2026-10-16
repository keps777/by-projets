import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { CONFIG, type AppConfig } from "../config/config";

/**
 * Chiffrement au repos des champs sensibles (téléphones, identité des passagers et des clients colis).
 *
 * - AES-256-GCM, nonce aléatoire de 96 bits par valeur, étiquette d'authentification de 128 bits.
 * - Le « contexte » (ex. `personne.telephone`) est lié au chiffré comme donnée authentifiée : un
 *   chiffré copié d'une colonne vers une autre est refusé au déchiffrement.
 * - Format : `enc:v1:<idCle>:<nonce>:<étiquette>:<chiffré>` (base64url). L'identifiant de clé
 *   permet la rotation : on ajoute la nouvelle clé (ENCRYPTION_KEY), l'ancienne passe dans
 *   ENCRYPTION_PREVIOUS_KEYS, puis `rechiffrer` migre les lignes au fil de l'eau.
 * - Index aveugle : HMAC-SHA-256 (clé distincte) pour retrouver une ligne par téléphone sans
 *   déchiffrer toute la table. Il ne révèle pas la valeur mais est déterministe.
 */

const PREFIXE = "enc:v1:";

export class ChiffrementInvalide extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChiffrementInvalide";
  }
}

@Injectable()
export class ChiffrementService {
  private readonly cles = new Map<string, Buffer>();
  private readonly idActif: string;
  private readonly cleIndex: Buffer;

  constructor(@Inject(CONFIG) config: AppConfig) {
    this.idActif = config.chiffrement.active.id;
    this.cles.set(this.idActif, config.chiffrement.active.cle);
    for (const ancienne of config.chiffrement.anciennes) this.cles.set(ancienne.id, ancienne.cle);
    this.cleIndex = config.cleIndexAveugle;
  }

  estChiffre(valeur: string): boolean {
    return valeur.startsWith(PREFIXE);
  }

  chiffrer(texte: string, contexte: string): string {
    const cle = this.cles.get(this.idActif);
    if (!cle) throw new ChiffrementInvalide("Clé de chiffrement active absente");
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", cle, nonce);
    cipher.setAAD(Buffer.from(contexte, "utf8"));
    const chiffre = Buffer.concat([cipher.update(texte, "utf8"), cipher.final()]);
    const etiquette = cipher.getAuthTag();
    return `${PREFIXE}${this.idActif}:${nonce.toString("base64url")}:${etiquette.toString("base64url")}:${chiffre.toString("base64url")}`;
  }

  dechiffrer(valeur: string, contexte: string): string {
    if (!this.estChiffre(valeur)) throw new ChiffrementInvalide("Valeur non chiffrée");
    const [idCle, nonce, etiquette, chiffre] = valeur.slice(PREFIXE.length).split(":");
    if (!idCle || !nonce || !etiquette || chiffre === undefined) {
      throw new ChiffrementInvalide("Format de chiffré invalide");
    }
    const cle = this.cles.get(idCle);
    if (!cle) throw new ChiffrementInvalide(`Clé de chiffrement inconnue : ${idCle}`);
    try {
      const decipher = createDecipheriv("aes-256-gcm", cle, Buffer.from(nonce, "base64url"));
      decipher.setAAD(Buffer.from(contexte, "utf8"));
      decipher.setAuthTag(Buffer.from(etiquette, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(chiffre, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      // Message volontairement muet : ne dit pas si c'est la clé, le contexte ou le contenu.
      throw new ChiffrementInvalide(
        "Déchiffrement impossible (donnée altérée ou mauvais contexte)",
      );
    }
  }

  chiffrerJson(valeur: unknown, contexte: string): string {
    return this.chiffrer(JSON.stringify(valeur), contexte);
  }

  dechiffrerJson<T>(valeur: string, contexte: string): T {
    return JSON.parse(this.dechiffrer(valeur, contexte)) as T;
  }

  /** Vrai si la valeur n'est pas chiffrée avec la clé active (à migrer). */
  doitEtreRechiffre(valeur: string): boolean {
    return !valeur.startsWith(`${PREFIXE}${this.idActif}:`);
  }

  rechiffrer(valeur: string, contexte: string): string {
    return this.chiffrer(this.dechiffrer(valeur, contexte), contexte);
  }

  /** Index aveugle d'une valeur dans un contexte (ex. `telephone`). */
  indexAveugle(valeur: string, contexte: string): string {
    return createHmac("sha256", this.cleIndex).update(`${contexte}\u0000${valeur}`).digest("hex");
  }
}
