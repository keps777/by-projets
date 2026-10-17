import { expect } from "vitest";
import { GARE_BAF, GARE_DLA, demandeCreation, entete, type AppColisTest } from "./app-colis-test";

export interface Equipe {
  /** Aïcha, la voyageuse qui envoie le colis. */
  expediteur: { id: string; jeton: string; telephone: string; nom: string };
  /** Thérèse, la destinataire : un compte voyageur, elle aussi. */
  destinataire: { id: string; jeton: string; telephone: string; nom: string };
  inconnu: { id: string; jeton: string };
  guichetier: { id: string; jeton: string };
  guichetierBaf: { id: string; jeton: string };
  convoyeur: { id: string; jeton: string };
  superviseur: { id: string; jeton: string };
  patron: { id: string; jeton: string };
}

export async function creerEquipe(t: AppColisTest): Promise<Equipe> {
  return {
    expediteur: await t.compte("voyageur", { telephone: "+237691221008", nom: "Ngo Aïcha" }),
    destinataire: await t.compte("voyageur", { telephone: "+237699401822", nom: "Ngo Thérèse" }),
    inconnu: await t.compte("voyageur", { telephone: "+237677000111", nom: "Passant" }),
    guichetier: await t.compte("guichetier", { gareId: GARE_DLA.id }),
    guichetierBaf: await t.compte("guichetier", { gareId: GARE_BAF.id }),
    convoyeur: await t.compte("convoyeur", { gareId: GARE_DLA.id }),
    superviseur: await t.compte("superviseur", { gareId: GARE_DLA.id }),
    patron: await t.compte("patron", { gareId: null }),
  };
}

export interface ColisApp {
  colisId: string;
  numero: string;
  code: string;
  reponse: {
    colis: { id: string; numero: string; retrait: { code: string } };
    devis: { total: number };
    paiement: { reference: string; etat: string };
  };
}

/** Un colis créé dans l'app par Aïcha pour Thérèse (assuré 25 000 F, retrait en gare). */
export async function creerColisApp(
  t: AppColisTest,
  e: Equipe,
  over: Record<string, unknown> = {},
): Promise<ColisApp> {
  const rep = await t
    .http()
    .post("/colis")
    .set(entete(e.expediteur.jeton))
    .send(demandeCreation(over));
  expect(rep.status, JSON.stringify(rep.body)).toBe(201);
  return {
    colisId: rep.body.colis.id,
    numero: rep.body.colis.numero,
    code: rep.body.colis.retrait.code,
    reponse: rep.body,
  };
}

/** Pose un scan et renvoie la réponse HTTP. */
export function scanner(
  t: AppColisTest,
  jeton: string,
  corps: Record<string, unknown>,
): ReturnType<ReturnType<AppColisTest["http"]>["post"]> {
  return t.http().post("/agence/colis/scans").set(entete(jeton)).send(corps);
}

/** Dépôt au guichet de Douala puis chargement, départ, déchargement et mise à disposition à Bafoussam. */
export async function amenerJusquaDisponible(
  t: AppColisTest,
  e: Equipe,
  colisId: string,
): Promise<void> {
  for (const [jeton, action] of [
    [e.guichetier.jeton, "charger"],
    [e.convoyeur.jeton, "expedier"],
    [e.convoyeur.jeton, "decharger"],
    [e.guichetierBaf.jeton, "rendre_disponible"],
  ] as const) {
    const rep = await scanner(t, jeton, { colisId, action });
    expect(rep.status, `${action} : ${JSON.stringify(rep.body)}`).toBe(200);
  }
}
