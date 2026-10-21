import { Injectable } from "@nestjs/common";
import { HachageService } from "../auth/hachage.service";
import { METHODE_PAR_ROLE, validerRoles, type Role } from "../auth/roles";
import { ChiffrementService } from "../chiffrement/chiffrement.service";
import { PersonnesRepository, type PersonneEnregistree } from "./personnes.repository";
import { normaliserTelephone } from "./telephone";

export const CONTEXTE_TELEPHONE = "personne.telephone";
export const CONTEXTE_INDEX_TELEPHONE = "telephone";

export class SecretFaible extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretFaible";
  }
}

/** PIN : exactement 6 chiffres, ni répétés (000000) ni en suite (123456, 654321). */
export function verifierPin(pin: string): void {
  if (!/^\d{6}$/.test(pin)) throw new SecretFaible("Le PIN comporte exactement 6 chiffres");
  if (/^(\d)\1{5}$/.test(pin)) throw new SecretFaible("PIN trop simple : chiffres identiques");
  const suite = "01234567890";
  if (suite.includes(pin) || [...suite].reverse().join("").includes(pin)) {
    throw new SecretFaible("PIN trop simple : suite de chiffres");
  }
}

export function verifierMotDePasse(motDePasse: string): void {
  if (motDePasse.length < 12 || motDePasse.length > 128) {
    throw new SecretFaible("Le mot de passe comporte entre 12 et 128 caractères");
  }
  if (new Set(motDePasse).size < 5) throw new SecretFaible("Mot de passe trop répétitif");
}

export interface DemandeCompte {
  nom: string;
  telephone: string;
  roles: readonly Role[];
  compagnieId?: string | null;
  gareId?: string | null;
  /** Requis si un rôle se connecte par PIN. */
  pin?: string;
  /** Requis si un rôle se connecte par mot de passe + SMS. */
  motDePasse?: string;
}

/** Création et lecture des comptes : seul endroit qui chiffre le téléphone et hache les secrets. */
@Injectable()
export class ComptesService {
  constructor(
    private readonly repo: PersonnesRepository,
    private readonly chiffrement: ChiffrementService,
    private readonly hachage: HachageService,
  ) {}

  indexTelephone(telephoneNormalise: string): string {
    return this.chiffrement.indexAveugle(telephoneNormalise, CONTEXTE_INDEX_TELEPHONE);
  }

  trouverParTelephone(telephone: string): Promise<PersonneEnregistree | null> {
    return this.repo.trouverParTelephoneIndex(this.indexTelephone(normaliserTelephone(telephone)));
  }

  telephoneEnClair(personne: Pick<PersonneEnregistree, "telephoneChiffre">): string {
    return this.chiffrement.dechiffrer(personne.telephoneChiffre, CONTEXTE_TELEPHONE);
  }

  /**
   * Le haché (argon2id avec poivre) d'un PIN, pour un compte qui se connecte par mot de passe mais signe avec un PIN
   * (le superviseur valide une caisse ou une annulation avec `POST /agence/superviseur/pin`).
   */
  async hacherPin(pin: string): Promise<string> {
    verifierPin(pin);
    return this.hachage.hacher(pin);
  }

  async creer(demande: DemandeCompte): Promise<PersonneEnregistree> {
    const roles = validerRoles(demande.roles);
    const methodes = new Set(roles.map((r) => METHODE_PAR_ROLE[r]));
    let pinHache: string | null = null;
    let motDePasseHache: string | null = null;
    if (methodes.has("pin")) {
      if (demande.pin === undefined) throw new SecretFaible("Un PIN est requis pour ce rôle");
      verifierPin(demande.pin);
      pinHache = await this.hachage.hacher(demande.pin);
    }
    if (methodes.has("motdepasse_sms")) {
      if (demande.motDePasse === undefined) {
        throw new SecretFaible("Un mot de passe est requis pour ce rôle");
      }
      verifierMotDePasse(demande.motDePasse);
      motDePasseHache = await this.hachage.hacher(demande.motDePasse);
    }
    const telephone = normaliserTelephone(demande.telephone);
    return this.repo.creer({
      nom: demande.nom,
      telephoneChiffre: this.chiffrement.chiffrer(telephone, CONTEXTE_TELEPHONE),
      telephoneIndex: this.indexTelephone(telephone),
      roles,
      compagnieId: demande.compagnieId ?? null,
      gareId: demande.gareId ?? null,
      actif: true,
      pinHache,
      motDePasseHache,
    });
  }
}
