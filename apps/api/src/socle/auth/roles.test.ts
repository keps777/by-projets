import {
  BLOCAGE_PIN_MINUTES as DOMAINE_BLOCAGE_PIN_MINUTES,
  ESSAIS_PIN_MAX as DOMAINE_ESSAIS_PIN_MAX,
  ETATS_BILLET,
  ETATS_COLIS,
  ETATS_DEPART,
  ETATS_SESSION,
  type Role as RoleDomaine,
} from "@afrimove/domain";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  CanalVente,
  CibleEvenement,
  ClasseBillet,
  EtatBillet,
  EtatColis,
  EtatDepart,
  EtatSession,
  ModeColis,
  CanalColis,
  Role as RolePrisma,
  TypeAppareil,
} from "../db/generated/enums";
import { BLOCAGE_PIN_MINUTES, ESSAIS_PIN_MAX } from "./auth.service";
import {
  METHODE_PAR_ROLE,
  ROLES,
  ROLES_DIRECTION,
  ROLES_ESPACE_PATRON,
  ROLES_PIN,
  ROLES_VENTE,
  RolesInvalides,
  validerRoles,
  type Role,
} from "./roles";

/**
 * Le domaine (@afrimove/domain) n'est pas compilé : l'API en recopie les listes à l'exécution et
 * ces tests garantissent qu'elles ne divergent jamais, ni du domaine ni du schéma Prisma.
 */
describe("cohérence avec le domaine (AM-010)", () => {
  it("les rôles de l'API sont exactement ceux du domaine", () => {
    expectTypeOf<Role>().toEqualTypeOf<RoleDomaine>();
    const attendus: Record<RoleDomaine, true> = {
      voyageur: true,
      guichetier: true,
      convoyeur: true,
      chauffeur: true,
      vendeur: true,
      controleur: true,
      superviseur: true,
      patron: true,
      comptable: true,
      relais: true,
      livreur: true,
      afrimove: true,
    };
    expect([...ROLES].sort()).toEqual(Object.keys(attendus).sort());
  });

  it("les enums Prisma reprennent les valeurs du domaine", () => {
    const valeurs = (e: Record<string, string>) => Object.values(e).sort();
    expect(valeurs(RolePrisma)).toEqual([...ROLES].sort());
    expect(valeurs(EtatBillet)).toEqual([...ETATS_BILLET].sort());
    expect(valeurs(EtatColis)).toEqual([...ETATS_COLIS].sort());
    expect(valeurs(EtatDepart)).toEqual([...ETATS_DEPART].sort());
    expect(valeurs(EtatSession)).toEqual([...ETATS_SESSION].sort());
    expect(valeurs(ClasseBillet)).toEqual(["classique", "vip"]);
    expect(valeurs(CanalVente)).toEqual(["convoyeur", "en_ligne", "guichet", "vendeur"]);
    expect(valeurs(ModeColis)).toEqual(["gare", "moto", "relais"]);
    expect(valeurs(CanalColis)).toEqual(["agence", "app"]);
    expect(valeurs(TypeAppareil)).toEqual([
      "autre",
      "poste_controle",
      "telephone_guichet",
      "telephone_secours",
    ]);
    expect(valeurs(CibleEvenement)).toEqual(["billet", "colis", "depart", "session"]);
  });

  it("les règles de blocage du PIN sont celles du domaine", () => {
    expect(ESSAIS_PIN_MAX).toBe(DOMAINE_ESSAIS_PIN_MAX);
    expect(BLOCAGE_PIN_MINUTES).toBe(DOMAINE_BLOCAGE_PIN_MINUTES);
  });
});

describe("méthodes de connexion par rôle", () => {
  it("voyageur : numéro + OTP ; guichetier : PIN ; direction : mot de passe + SMS", () => {
    expect(METHODE_PAR_ROLE.voyageur).toBe("otp");
    expect(METHODE_PAR_ROLE.guichetier).toBe("pin");
    for (const r of ["superviseur", "patron", "comptable", "afrimove"] as const) {
      expect(METHODE_PAR_ROLE[r]).toBe("motdepasse_sms");
    }
  });

  it("chaque rôle a une méthode et une seule", () => {
    for (const r of ROLES) expect(METHODE_PAR_ROLE[r]).toBeDefined();
    const total = ROLES_PIN.length + ROLES_DIRECTION.length + 1; // + voyageur
    expect(total).toBe(ROLES.length);
  });
});

describe("rôles stricts", () => {
  it("AfriMove ne fait partie d'aucune liste de vente", () => {
    expect(ROLES_VENTE as readonly string[]).not.toContain("afrimove");
    expect(ROLES_ESPACE_PATRON as readonly string[]).not.toContain("afrimove");
  });

  it("le terrain n'appartient jamais à l'espace patron", () => {
    for (const r of [
      "guichetier",
      "convoyeur",
      "chauffeur",
      "vendeur",
      "controleur",
      "relais",
      "livreur",
      "voyageur",
      "superviseur",
    ]) {
      expect(ROLES_ESPACE_PATRON as readonly string[]).not.toContain(r);
    }
  });

  it("validerRoles : AfriMove ne se cumule avec aucun rôle de vente", () => {
    expect(validerRoles(["afrimove"])).toEqual(["afrimove"]);
    expect(validerRoles(["afrimove", "comptable"])).toEqual(["afrimove", "comptable"]);
    for (const vente of ROLES_VENTE) {
      expect(() => validerRoles(["afrimove", vente])).toThrow(RolesInvalides);
    }
  });

  it("validerRoles : liste vide ou rôle inconnu refusés, doublons fusionnés", () => {
    expect(() => validerRoles([])).toThrow(RolesInvalides);
    expect(() => validerRoles(["roi"])).toThrow(/inconnu/);
    expect(validerRoles(["patron", "patron", "guichetier"])).toEqual(["patron", "guichetier"]);
  });
});
