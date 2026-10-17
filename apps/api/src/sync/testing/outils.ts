import { genererCleAppareil, signer, type CleAppareil } from "@afrimove/sync";
import type { AppareilSync } from "../ports";
import { versIsoDouala } from "../temps";
import type { AppSyncTest } from "./app-sync-test";

let compteurId = 0;

/** UUID v4 lisible, déterministe dans un test (le serveur n'exige que la forme). */
export function uuid(): string {
  compteurId += 1;
  return `00000000-0000-4000-8000-${String(compteurId).padStart(12, "0")}`;
}

export interface EvenementBrut {
  id: string;
  type: string;
  at: string;
  appareilId: string;
  auteurId: string;
  cible: { type: string; id: string };
  numeroPlage: number | null;
  donnees: Record<string, unknown>;
}

export interface OptionsVente {
  id?: string;
  at: Date | number | string;
  numeroPlage: number;
  billetId?: string;
  departId?: string;
  siege?: number | null;
  type?: "billet.vendu" | "billet.vendu_cadence" | "route.billet_vendu";
}

/** Un appareil de terrain simulé : sa clé, et de quoi fabriquer des lots signés. */
export class AppareilTest {
  constructor(
    readonly id: string,
    readonly auteurId: string,
    readonly jeton: string,
    readonly cle: CleAppareil,
  ) {}

  vente(o: OptionsVente): EvenementBrut {
    const billetId = o.billetId ?? uuid();
    return {
      id: o.id ?? uuid(),
      type: o.type ?? "billet.vendu",
      at: versIsoDouala(o.at),
      appareilId: this.id,
      auteurId: this.auteurId,
      cible: { type: "billet", id: billetId },
      numeroPlage: o.numeroPlage,
      donnees: {
        billetId,
        departId: o.departId ?? "depart-1",
        siege: o.siege === undefined ? 7 : o.siege,
        prix: 4000,
      },
    };
  }

  /** Un événement sans numéro (caisse, quai, supervision…). */
  autre(
    type: string,
    at: Date | number | string,
    donnees: Record<string, unknown> = {},
    cible: { type: string; id: string } = { type: "session", id: "session-1" },
  ): EvenementBrut {
    return {
      id: uuid(),
      type,
      at: versIsoDouala(at),
      appareilId: this.id,
      auteurId: this.auteurId,
      cible,
      numeroPlage: null,
      donnees,
    };
  }

  /** Signe un événement et le place à son rang dans la file. */
  async ligne(evenement: EvenementBrut, ordre: number) {
    return { ordre, evenement, signature: await signer(this.cle.privee, evenement) };
  }

  /** Un lot : les événements sont numérotés à partir de `depuis` (rang de file de l'appareil). */
  async lot(
    evenements: EvenementBrut[],
    options: { depuis?: number; envoyeA?: Date | number } = {},
  ) {
    const depuis = options.depuis ?? 1;
    return {
      appareilId: this.id,
      envoyeA: versIsoDouala(options.envoyeA ?? Date.now()),
      evenements: await Promise.all(evenements.map((e, i) => this.ligne(e, depuis + i))),
    };
  }
}

/**
 * Déclare un appareil côté serveur (administration), crée son compte, fabrique sa clé et — sauf
 * demande contraire — enregistre sa clé publique par la route de l'API.
 */
export async function installerAppareil(
  t: AppSyncTest,
  id: string,
  options: Partial<Omit<AppareilSync, "id" | "cle">> & {
    role?: "guichetier" | "convoyeur" | "vendeur" | "chauffeur" | "controleur" | "superviseur";
    sansCle?: boolean;
    compagnieId?: string | null;
    gareId?: string | null;
  } = {},
): Promise<AppareilTest> {
  const { role = "guichetier", sansCle = false, ...fiche } = options;
  const compte = await t.compte(role, {
    ...(options.compagnieId !== undefined ? { compagnieId: options.compagnieId } : {}),
    ...(options.gareId !== undefined ? { gareId: options.gareId } : {}),
  });
  await t.declarer({ id, genre: "guichet", rang: 2, ...fiche });
  const cle = await genererCleAppareil();
  const appareil = new AppareilTest(id, compte.id, compte.jeton, cle);
  if (!sansCle) {
    const rep = await t
      .http()
      .put(`/sync/appareils/${id}/cle`)
      .set("Authorization", `Bearer ${compte.jeton}`)
      .send({ cle: cle.publique });
    if (rep.status !== 204)
      throw new Error(`Enrôlement refusé : ${rep.status} ${JSON.stringify(rep.body)}`);
  }
  return appareil;
}
