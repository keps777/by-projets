import type { patron } from "@afrimove/api-client";

/** Ce que les hooks du patron renvoient (@afrimove/contrats n'est pas une dépendance directe de l'écran). */
export type SalleDeControle = NonNullable<ReturnType<typeof patron.useSalleDeControle>["data"]>;
export type MessageDirect = NonNullable<ReturnType<typeof patron.useDirectControle>["dernier"]>;
export type Chiffres = SalleDeControle["chiffres"];
export type Gare = SalleDeControle["gares"][number];
export type ATraiter = SalleDeControle["aTraiter"][number];

/** Ce que le temps réel a publié depuis la dernière lecture. */
export interface Direct {
  chiffres?: { instant: string; chiffres: Chiffres };
  /** Dernière version de chaque gare, avec l'instant du message. */
  gares: Record<string, { instant: string; gare: Gare }>;
  aTraiter: ATraiter[];
}

export const DIRECT_VIDE: Direct = { gares: {}, aTraiter: [] };

/** Range un message du canal : les derniers chiffres remplacent les précédents, une gare aussi, un élément s'ajoute une fois. */
export function recevoir(direct: Direct, message: MessageDirect): Direct {
  switch (message.type) {
    case "chiffres":
      return { ...direct, chiffres: { instant: message.instant, chiffres: message.chiffres } };
    case "gare":
      return {
        ...direct,
        gares: {
          ...direct.gares,
          [message.gare.gareId]: { instant: message.instant, gare: message.gare },
        },
      };
    case "a_traiter":
      if (direct.aTraiter.some((x) => x.id === message.element.id)) return direct;
      return { ...direct, aTraiter: [message.element, ...direct.aTraiter] };
  }
}

function auMoinsAussiRecent(a: string, b: string): boolean {
  return Date.parse(a) >= Date.parse(b);
}

/** Du plus récent au plus ancien, comme la liste de la planche (14:00, 13:53, 13:40, 12:10). */
function parQuandDecroissant(a: ATraiter, b: ATraiter): number {
  return Date.parse(b.quand) - Date.parse(a.quand);
}

/**
 * La salle avec ce que le direct a publié depuis la lecture. Un message plus ancien que la lecture est ignoré (la
 * lecture le contient déjà) ; les éléments « à traiter » du direct que la lecture ne connaît pas encore s'ajoutent.
 */
export function salleAvecDirect(salle: SalleDeControle, direct: Direct): SalleDeControle {
  let resultat = salle;
  const { chiffres } = direct;
  if (chiffres && auMoinsAussiRecent(chiffres.instant, salle.instant)) {
    resultat = { ...resultat, instant: chiffres.instant, chiffres: chiffres.chiffres };
  }

  const recentes = Object.values(direct.gares).filter(({ instant }) =>
    auMoinsAussiRecent(instant, salle.instant),
  );
  if (recentes.length > 0) {
    const parId = new Map(recentes.map(({ gare }) => [gare.gareId, gare]));
    const connues = new Set(salle.gares.map((g) => g.gareId));
    resultat = {
      ...resultat,
      gares: [
        ...salle.gares.map((g) => parId.get(g.gareId) ?? g),
        ...recentes.map(({ gare }) => gare).filter((g) => !connues.has(g.gareId)),
      ],
    };
  }

  const connus = new Set(salle.aTraiter.map((x) => x.id));
  const nouveaux = direct.aTraiter.filter((x) => !connus.has(x.id));
  if (nouveaux.length > 0) {
    resultat = {
      ...resultat,
      aTraiter: [...[...nouveaux].sort(parQuandDecroissant), ...salle.aTraiter],
    };
  }
  return resultat;
}
