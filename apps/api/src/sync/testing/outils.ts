import { genererCleAppareil, signer, type CleAppareil } from "@afrimove/sync";
import { DEPART, GUICHET_1, GUICHET_2 } from "../../billetterie/testing/app-billetterie-test";
import type { AppareilSync } from "../ports";
import { versIsoDouala } from "../temps";
import type { AppSyncTest } from "./app-sync-test";

let compteurId = 0;
/** Codes de billet à 4 chiffres, tous différents dans un test (ils sont uniques dans un départ). */
let compteurCode = 0;

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

  /**
   * Une vente telle que le téléphone l'écrirait : des données complètes du contrat (`billet.vendu`,
   * `billet.vendu_cadence`), sur un départ du réseau de test (`DEPART`, 40 places, 4 000 F), pour que la
   * synchronisation en fasse un vrai billet. `route.billet_vendu` reste minimal (le serveur ne le rejoue pas en billet).
   */
  vente(o: OptionsVente): EvenementBrut {
    const billetId = o.billetId ?? uuid();
    const type = o.type ?? "billet.vendu";
    const siege = o.siege === undefined ? 7 : o.siege;
    const departId = o.departId ?? DEPART;
    const code = String(1000 + (compteurCode++ % 9000));
    const paiement = { mode: "cash", recu: 4000, rendu: 0, reference: null };
    const donnees: Record<string, unknown> =
      type === "billet.vendu"
        ? {
            billetId,
            departId,
            siege,
            classe: "classique",
            prix: 4000,
            bagage: 0,
            passager: { nom: "Voyageur de test", telephone: null, pieceQuatreDerniers: null },
            paiement,
            codeBillet: code,
            sms: false,
          }
        : type === "billet.vendu_cadence"
          ? { billetId, departId, siege, prix: 4000, paiement, codeBillet: code, telephone: null }
          : { billetId, departId, siege, prix: 4000 };
    return {
      id: o.id ?? uuid(),
      type,
      at: versIsoDouala(o.at),
      appareilId: this.id,
      auteurId: this.auteurId,
      cible: { type: "billet", id: billetId },
      numeroPlage: o.numeroPlage,
      donnees,
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
  // Un guichetier est affecté au guichet de son rang (les billets de ses ventes portent ce guichet).
  const rang = fiche.rang ?? 2;
  if (role === "guichetier" && (rang === 1 || rang === 2)) {
    t.catalogue.affecterGuichet(compte.id, rang === 1 ? GUICHET_1 : GUICHET_2);
  }
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
