import { ecrire, lire } from "@/coquille/stockage";

/**
 * Les clients que ce guichet a déjà servis, gardés sur l'appareil. Aucun contrat d'API ne liste les clients d'un
 * guichet : la feuille « Client connu » s'appuie sur ce carnet local, alimenté à chaque billet vendu
 * (`memoriserClient`). Le jour où l'API les fournira, seul ce fichier change.
 */
export interface ClientConnu {
  nom: string;
  /** Numéro au format du contrat (« +237677301145 »), ou rien. */
  telephone: string | null;
  /** 4 derniers chiffres de la pièce d'identité, ou rien. */
  pieceQuatreDerniers: string | null;
  /** Instant du dernier billet vendu à ce client (ISO). */
  dernierBilletA: string;
}

export const CLE_CLIENTS_CONNUS = "afrimove.guichet.clients-connus";
/** Taille du carnet : au-delà, les plus anciens sortent. */
export const CLIENTS_MAX = 50;

/** Minuscules, sans accents, espaces simples : « Aïcha  NGO » -> « aicha ngo ». */
export function normaliser(texte: string): string {
  return texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function chiffres(texte: string): string {
  return texte.replace(/\D/g, "");
}

/** Deux fiches désignent la même personne : même numéro, ou à défaut même nom. */
function memeClient(a: ClientConnu, b: ClientConnu): boolean {
  if (a.telephone !== null && b.telephone !== null) return a.telephone === b.telephone;
  if (a.telephone !== null || b.telephone !== null) return false;
  return normaliser(a.nom) === normaliser(b.nom);
}

/**
 * Le carnet une fois `client` ajouté en tête. Une fiche déjà connue est remplacée (elle remonte, et garde sa pièce
 * si la nouvelle vente n'en a pas saisi).
 */
export function fusionner(carnet: readonly ClientConnu[], client: ClientConnu): ClientConnu[] {
  const ancien = carnet.find((c) => memeClient(c, client));
  const fiche: ClientConnu = {
    ...client,
    pieceQuatreDerniers: client.pieceQuatreDerniers ?? ancien?.pieceQuatreDerniers ?? null,
  };
  return [fiche, ...carnet.filter((c) => !memeClient(c, client))].slice(0, CLIENTS_MAX);
}

/**
 * Les clients qui répondent à la saisie. Chaque mot doit convenir : un mot fait de chiffres cherche dans le numéro,
 * les autres dans le nom. Saisie vide : tout le carnet.
 */
export function filtrerClients(carnet: readonly ClientConnu[], saisie: string): ClientConnu[] {
  const mots = normaliser(saisie).split(" ").filter(Boolean);
  if (mots.length === 0) return [...carnet];
  return carnet.filter((client) => {
    const nom = normaliser(client.nom);
    const numero = chiffres(client.telephone ?? "");
    return mots.every((mot) => (/^\d+$/.test(mot) ? numero.includes(mot) : nom.includes(mot)));
  });
}

function estClient(valeur: unknown): valeur is ClientConnu {
  if (typeof valeur !== "object" || valeur === null) return false;
  const v = valeur as Record<string, unknown>;
  return (
    typeof v.nom === "string" &&
    v.nom.trim() !== "" &&
    (v.telephone === null || typeof v.telephone === "string") &&
    (v.pieceQuatreDerniers === null || typeof v.pieceQuatreDerniers === "string") &&
    typeof v.dernierBilletA === "string"
  );
}

/** Le carnet de l'appareil ; un contenu illisible ou abîmé donne un carnet vide. */
export function lireClientsConnus(): ClientConnu[] {
  const brut = lire(CLE_CLIENTS_CONNUS);
  if (brut === null) return [];
  try {
    const valeur: unknown = JSON.parse(brut);
    return Array.isArray(valeur) ? valeur.filter(estClient).slice(0, CLIENTS_MAX) : [];
  } catch {
    return [];
  }
}

/** Ajoute le client servi au carnet de l'appareil. Un client sans nom n'est pas gardé. */
export function memoriserClient(client: ClientConnu): ClientConnu[] {
  const carnet = lireClientsConnus();
  if (client.nom.trim() === "") return carnet;
  const suivant = fusionner(carnet, { ...client, nom: client.nom.trim() });
  ecrire(CLE_CLIENTS_CONNUS, JSON.stringify(suivant));
  return suivant;
}

/** « Aïcha Ngo » -> « AN » ; un seul mot donne ses deux premières lettres. */
export function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "";
  const lettres =
    mots.length === 1
      ? Array.from(mots[0] ?? "").slice(0, 2)
      : [mots[0], mots[mots.length - 1]].map((m) => Array.from(m ?? "")[0] ?? "");
  return lettres.join("").toLocaleUpperCase("fr");
}

/** « +237677301145 » -> « 6 77 30 11 45 » (un chiffre, puis des paires). */
export function telephoneNational(telephone: string): string {
  const national = telephone.startsWith("+237") ? telephone.slice(4) : telephone;
  const c = chiffres(national);
  const reste = c.slice(1).match(/\d{1,2}/g) ?? [];
  return [c.slice(0, 1), ...reste].join(" ");
}
