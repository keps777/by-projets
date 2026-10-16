import { randomInt, randomUUID } from "node:crypto";
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { ComptesService } from "../comptes/comptes.service";
import type { PersonneEnregistree } from "../comptes/personnes.repository";
import { PersonnesRepository, TelephoneDejaUtilise } from "../comptes/personnes.repository";
import { ChiffrementService } from "../chiffrement/chiffrement.service";
import { TelephoneInvalide, normaliserTelephone } from "../comptes/telephone";
import { CONFIG, type AppConfig } from "../config/config";
import { Horloge } from "../horloge";
import { SmsGateway } from "../sms/sms.gateway";
import { DefisRepository, type Defi, type ObjetDefi } from "./defis.repository";
import { HachageService } from "./hachage.service";
import { ROLES_DIRECTION, ROLES_PIN, type Role } from "./roles";
import { TokensService, type JetonEmis } from "./tokens.service";

/** Règles de blocage (mêmes valeurs que ESSAIS_PIN_MAX et BLOCAGE_PIN_MINUTES de @afrimove/domain). */
export const ESSAIS_PIN_MAX = 3;
export const BLOCAGE_PIN_MINUTES = 15;

const CONTEXTE_DEFI_TELEPHONE = "defi.telephone";
const FENETRE_DEMANDES_MS = 15 * 60_000;
const MESSAGE_IDENTIFIANTS = "Identifiants invalides";
const MESSAGE_CODE = "Code invalide ou expiré";

export interface DefiEmis {
  defiId: string;
  /** Durée de validité du code, en secondes. */
  expireDans: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly comptes: ComptesService,
    private readonly personnes: PersonnesRepository,
    private readonly defis: DefisRepository,
    private readonly hachage: HachageService,
    private readonly chiffrement: ChiffrementService,
    private readonly tokens: TokensService,
    private readonly sms: SmsGateway,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  /* ------------------------------------------------------------------ voyageur : numéro + code SMS */

  async demanderCodeVoyageur(telephoneBrut: string): Promise<DefiEmis> {
    const telephone = this.telephone(telephoneBrut);
    const index = this.comptes.indexTelephone(telephone);
    await this.limiterDemandes("connexion_voyageur", index, null, "voyageur");

    // Même réponse que le numéro soit connu ou non : on n'envoie le SMS qu'aux voyageurs actifs.
    const personne = await this.personnes.trouverParTelephoneIndex(index);
    const eligible = personne === null || (personne.actif && personne.roles.includes("voyageur"));
    const defi = await this.creerDefi(
      "connexion_voyageur",
      index,
      eligible && personne === null
        ? this.chiffrement.chiffrer(telephone, CONTEXTE_DEFI_TELEPHONE)
        : null,
      null,
      null,
    );
    if (eligible) await this.envoyerCode(telephone, defi.code);
    await this.audit.enregistrer({
      action: "connexion.voyageur.code_demande",
      resultat: "succes",
      acteur: personne && eligible ? this.acteur(personne, "voyageur") : null,
      details: { empreinteTelephone: index.slice(0, 12), sms: eligible },
    });
    return { defiId: defi.id, expireDans: this.config.otp.ttlSeconds };
  }

  async verifierCodeVoyageur(defiId: string, code: string): Promise<JetonEmis> {
    const defi = await this.consommerDefi("connexion_voyageur", defiId, code);
    let personne = await this.personnes.trouverParTelephoneIndex(defi.telephoneIndex);
    if (personne === null) {
      // Première connexion : le compte voyageur naît ici. Le numéro vient du défi, déjà normalisé.
      personne = await this.creerVoyageur(defi);
    }
    if (!personne.actif || !personne.roles.includes("voyageur")) {
      return this.refuser("connexion.voyageur", personne, "voyageur", "compte_non_eligible");
    }
    await this.personnes.enregistrerSucces(personne.id, this.horloge.maintenant());
    await this.audit.enregistrer({
      action: "connexion.voyageur",
      resultat: "succes",
      acteur: this.acteur(personne, "voyageur"),
    });
    return this.emettre(personne, "voyageur");
  }

  /* ------------------------------------------------------------------ guichetier et rôles terrain : PIN */

  async connecterParPin(telephoneBrut: string, pin: string, role: Role): Promise<JetonEmis> {
    if (!ROLES_PIN.includes(role))
      throw new BadRequestException("Ce rôle ne se connecte pas par PIN");
    const personne = await this.personneConnectable(telephoneBrut, role);
    if (!personne || !personne.pinHache) {
      await this.hachage.verifierFactice(pin);
      await this.echecSansCompte("connexion.pin", role);
      throw new UnauthorizedException(MESSAGE_IDENTIFIANTS);
    }
    this.refuserSiBloque(personne);
    if (!(await this.hachage.verifier(personne.pinHache, pin))) {
      await this.compterEchec("connexion.pin", personne, role);
    }
    await this.personnes.enregistrerSucces(personne.id, this.horloge.maintenant());
    await this.audit.enregistrer({
      action: "connexion.pin",
      resultat: "succes",
      acteur: this.acteur(personne, role),
    });
    return this.emettre(personne, role);
  }

  /* ------------------------------------------------------------------ superviseur, patron, comptable, AfriMove : mot de passe + SMS */

  async connecterDirection(
    telephoneBrut: string,
    motDePasse: string,
    role: Role,
  ): Promise<DefiEmis> {
    if (!ROLES_DIRECTION.includes(role)) {
      throw new BadRequestException("Ce rôle ne se connecte pas par mot de passe");
    }
    const personne = await this.personneConnectable(telephoneBrut, role);
    if (!personne || !personne.motDePasseHache) {
      await this.hachage.verifierFactice(motDePasse);
      await this.echecSansCompte("connexion.motdepasse", role);
      throw new UnauthorizedException(MESSAGE_IDENTIFIANTS);
    }
    this.refuserSiBloque(personne);
    if (!(await this.hachage.verifier(personne.motDePasseHache, motDePasse))) {
      await this.compterEchec("connexion.motdepasse", personne, role);
    }
    // Premier facteur validé : le second est le code reçu par SMS.
    await this.limiterDemandes("connexion_direction", personne.telephoneIndex, personne, role);
    const defi = await this.creerDefi(
      "connexion_direction",
      personne.telephoneIndex,
      null,
      personne.id,
      role,
    );
    await this.envoyerCode(this.comptes.telephoneEnClair(personne), defi.code);
    await this.audit.enregistrer({
      action: "connexion.motdepasse",
      resultat: "succes",
      acteur: this.acteur(personne, role),
      details: { etape: "mot_de_passe_valide_code_envoye" },
    });
    return { defiId: defi.id, expireDans: this.config.otp.ttlSeconds };
  }

  async verifierCodeDirection(defiId: string, code: string): Promise<JetonEmis> {
    const defi = await this.consommerDefi("connexion_direction", defiId, code);
    const personne = defi.personneId ? await this.personnes.trouverParId(defi.personneId) : null;
    const role = defi.role;
    if (!personne || !role || !personne.actif || !personne.roles.includes(role)) {
      return this.refuser("connexion.direction", personne, role, "compte_non_eligible");
    }
    await this.personnes.enregistrerSucces(personne.id, this.horloge.maintenant());
    await this.audit.enregistrer({
      action: "connexion.direction",
      resultat: "succes",
      acteur: this.acteur(personne, role),
    });
    return this.emettre(personne, role);
  }

  /* ------------------------------------------------------------------ internes */

  private telephone(brut: string): string {
    try {
      return normaliserTelephone(brut);
    } catch (e) {
      if (e instanceof TelephoneInvalide)
        throw new BadRequestException("Numéro de téléphone invalide");
      throw e;
    }
  }

  private acteur(p: PersonneEnregistree, role: Role) {
    return { id: p.id, role, compagnieId: p.compagnieId };
  }

  private async emettre(p: PersonneEnregistree, role: Role): Promise<JetonEmis> {
    return this.tokens.emettre({ sub: p.id, role, cid: p.compagnieId, gid: p.gareId });
  }

  /** Personne active qui possède ce rôle, ou `null` (sans dire pourquoi). */
  private async personneConnectable(telephoneBrut: string, role: Role) {
    const telephone = this.telephone(telephoneBrut);
    const p = await this.personnes.trouverParTelephoneIndex(this.comptes.indexTelephone(telephone));
    if (!p || !p.actif || !p.roles.includes(role)) return null;
    return p;
  }

  private async echecSansCompte(action: string, role: Role): Promise<void> {
    await this.audit.enregistrer({
      action,
      resultat: "echec",
      details: { role, cause: "compte_inconnu" },
    });
  }

  private refuserSiBloque(p: PersonneEnregistree): void {
    const maintenant = this.horloge.maintenant();
    if (p.bloqueJusqua && p.bloqueJusqua > maintenant) {
      throw new HttpException(
        {
          statusCode: HttpStatus.LOCKED,
          message: "Compte bloqué après trop d'essais. Réessayez plus tard.",
          reessayerApres: p.bloqueJusqua.toISOString(),
        },
        HttpStatus.LOCKED,
      );
    }
  }

  /** Compte un échec d'identifiants (3 essais, puis 15 minutes de blocage) et répond 401. */
  private async compterEchec(action: string, p: PersonneEnregistree, role: Role): Promise<never> {
    const maintenant = this.horloge.maintenant();
    const echecs = p.echecsConnexion + 1;
    const bloque = echecs >= ESSAIS_PIN_MAX;
    await this.personnes.enregistrerEchec(
      p.id,
      bloque ? 0 : echecs,
      bloque ? new Date(maintenant.getTime() + BLOCAGE_PIN_MINUTES * 60_000) : null,
    );
    await this.audit.enregistrer({
      action,
      resultat: "echec",
      acteur: this.acteur(p, role),
      details: { echecs, bloque },
    });
    throw new UnauthorizedException(MESSAGE_IDENTIFIANTS);
  }

  private async refuser(
    action: string,
    p: PersonneEnregistree | null,
    role: Role | null,
    cause: string,
  ): Promise<never> {
    await this.audit.enregistrer({
      action,
      resultat: "refus",
      acteur: p && role ? this.acteur(p, role) : null,
      details: { cause },
    });
    throw new UnauthorizedException(MESSAGE_CODE);
  }

  private async limiterDemandes(
    objet: ObjetDefi,
    index: string,
    p: PersonneEnregistree | null,
    role: Role,
  ): Promise<void> {
    const depuis = new Date(this.horloge.maintenant().getTime() - FENETRE_DEMANDES_MS);
    const n = await this.defis.compterDepuis(objet, index, depuis);
    if (n >= this.config.otp.demandesParQuartHeure) {
      await this.audit.enregistrer({
        action: `${objet.replace("_", ".")}.limite`,
        resultat: "refus",
        acteur: p ? this.acteur(p, role) : null,
        details: { empreinteTelephone: index.slice(0, 12) },
      });
      throw new HttpException(
        "Trop de demandes de code. Réessayez dans quelques minutes.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async creerDefi(
    objet: ObjetDefi,
    telephoneIndex: string,
    telephoneChiffre: string | null,
    personneId: string | null,
    role: Role | null,
  ): Promise<Defi & { code: string }> {
    const id = randomUUID();
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const maintenant = this.horloge.maintenant();
    const defi = await this.defis.creer({
      id,
      objet,
      telephoneIndex,
      telephoneChiffre,
      personneId,
      role,
      codeHache: this.hachage.hacherCodeSms(id, code),
      expireA: new Date(maintenant.getTime() + this.config.otp.ttlSeconds * 1000),
      creeA: maintenant,
    });
    return { ...defi, code };
  }

  private async envoyerCode(telephone: string, code: string): Promise<void> {
    const minutes = Math.ceil(this.config.otp.ttlSeconds / 60);
    await this.sms.envoyer(
      telephone,
      `AfriMove : votre code est ${code}. Il est valable ${minutes} min. Ne le donnez à personne.`,
    );
  }

  /** Vérifie le code d'un défi et le consomme (usage unique). Lève 401 sinon, sans détailler pourquoi. */
  private async consommerDefi(objet: ObjetDefi, defiId: string, code: string): Promise<Defi> {
    const defi = await this.defis.trouver(defiId);
    const maintenant = this.horloge.maintenant();
    if (
      !defi ||
      defi.objet !== objet ||
      defi.consommeA !== null ||
      defi.expireA <= maintenant ||
      defi.essais >= this.config.otp.essaisMax
    ) {
      await this.audit.enregistrer({
        action: `${objet.replace("_", ".")}.code`,
        resultat: "echec",
        details: { cause: "defi_inutilisable" },
      });
      throw new UnauthorizedException(MESSAGE_CODE);
    }
    if (!this.hachage.codeSmsCorrespond(defi.codeHache, defi.id, code)) {
      const essais = await this.defis.incrementerEssais(defi.id);
      await this.audit.enregistrer({
        action: `${objet.replace("_", ".")}.code`,
        resultat: "echec",
        acteur: null,
        cible: { type: "defi", id: defi.id },
        details: { essais },
      });
      throw new UnauthorizedException(MESSAGE_CODE);
    }
    if (!(await this.defis.consommer(defi.id, maintenant)))
      throw new UnauthorizedException(MESSAGE_CODE);
    return defi;
  }

  private async creerVoyageur(defi: Defi): Promise<PersonneEnregistree> {
    if (!defi.telephoneChiffre) throw new UnauthorizedException(MESSAGE_CODE);
    const telephone = this.chiffrement.dechiffrer(defi.telephoneChiffre, CONTEXTE_DEFI_TELEPHONE);
    try {
      return await this.comptes.creer({ nom: "", telephone, roles: ["voyageur"] });
    } catch (e) {
      // Deux vérifications simultanées : l'autre a créé le compte, on le relit.
      if (e instanceof TelephoneDejaUtilise) {
        const existant = await this.personnes.trouverParTelephoneIndex(defi.telephoneIndex);
        if (existant) return existant;
      }
      throw e;
    }
  }
}
