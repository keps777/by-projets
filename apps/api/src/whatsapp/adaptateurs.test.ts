import { describe, expect, it, vi } from "vitest";
import type { PasserelleSmsService } from "../sms/passerelle.service";
import type { ComptesService } from "../socle/comptes/comptes.service";
import type { PersonnesRepository } from "../socle/comptes/personnes.repository";
import { AnnuaireRapportPersonnes, SecoursSmsPasserelle } from "./adaptateurs";
import { SecoursIndisponible } from "./erreurs";
import type { DemandeSecoursSms } from "./ports";

const demande = (extra: Partial<DemandeSecoursSms> = {}): DemandeSecoursSms =>
  ({
    type: "colis",
    destinataire: "+237690000001",
    cle: "cle-1",
    compagnieId: "c1",
    texte: "ligne de repli",
    variables: {},
    ...extra,
  }) as unknown as DemandeSecoursSms;

describe("SecoursSmsPasserelle", () => {
  it("envoie le repli par la passerelle SMS, en urgent, avec la même clé d'idempotence", async () => {
    const envoyer = vi.fn(async () => ({ message: { id: "sms-1" } }));
    const secours = new SecoursSmsPasserelle({ envoyer } as unknown as PasserelleSmsService);

    const rep = await secours.envoyer(demande({ type: "billet" }));

    expect(rep).toEqual({ messageId: "sms-1" });
    expect(envoyer).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "billet",
        cle: "cle-1",
        destinataire: "+237690000001",
        compagnieId: "c1",
        urgent: true,
      }),
    );
  });

  it("le rapport du soir part en texte système (pas de gabarit SMS dédié)", async () => {
    const envoyer = vi.fn(async () => ({ message: { id: "sms-2" } }));
    const secours = new SecoursSmsPasserelle({ envoyer } as unknown as PasserelleSmsService);

    await secours.envoyer(demande({ type: "rapport_soir", texte: "Rapport : 12 billets" }));

    expect(envoyer).toHaveBeenCalledWith(
      expect.objectContaining({ type: "systeme", variables: { texte: "Rapport : 12 billets" } }),
    );
  });

  it("un SMS refusé devient une erreur de secours que WhatsApp sait noter", async () => {
    const envoyer = vi.fn(async () => {
      throw new Error("quota");
    });
    const secours = new SecoursSmsPasserelle({ envoyer } as unknown as PasserelleSmsService);

    await expect(secours.envoyer(demande())).rejects.toBeInstanceOf(SecoursIndisponible);
  });

  it("se déclare branché (le garde-fou de production l'accepte)", () => {
    expect(new SecoursSmsPasserelle({} as PasserelleSmsService).branche).toBe(true);
  });
});

describe("AnnuaireRapportPersonnes", () => {
  const personne = (id: string, nom: string, roles: string[]) => ({ id, nom, roles });

  it("sert le patron d'abord, puis les superviseurs ; un double rôle n'est servi qu'une fois, comme patron", async () => {
    const listerActifsParRoles = vi.fn(async () => [
      personne("p1", "Superviseur Un", ["superviseur"]),
      personne("p2", "Patron Deux", ["patron", "superviseur"]),
      personne("p3", "Superviseur Trois", ["superviseur"]),
    ]);
    const annuaire = new AnnuaireRapportPersonnes(
      { listerActifsParRoles } as unknown as PersonnesRepository,
      {
        telephoneEnClair: (p: { id: string }) => `+2376000000${p.id.slice(1)}`,
      } as unknown as ComptesService,
    );

    const liste = await annuaire.destinataires("c1");

    expect(listerActifsParRoles).toHaveBeenCalledWith("c1", ["patron", "superviseur"]);
    expect(liste.map((d) => [d.personneId, d.role])).toEqual([
      ["p2", "patron"],
      ["p1", "superviseur"],
      ["p3", "superviseur"],
    ]);
    expect(liste[0]?.telephone).toBe("+23760000002");
  });
});
