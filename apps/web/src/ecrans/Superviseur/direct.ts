import type { agence } from "@afrimove/api-client";

/** Ce que `useSuperviseurGare` renvoie et ce que le canal de la gare publie (@afrimove/contrats n'est pas une dépendance de l'application). */
export type SuperviseurGare = NonNullable<ReturnType<typeof agence.useSuperviseurGare>["data"]>;
export type MessageGare = NonNullable<ReturnType<typeof agence.useGareDirect>["dernier"]>;
export type DemandeSuperviseur = SuperviseurGare["demandes"][number];
export type GuichetSuperviseur = SuperviseurGare["guichets"][number];

type Horodate<T> = T & { at: string };

/** Les messages du temps réel reçus depuis la dernière lecture, par clé : le plus récent gagne. */
export interface Direct {
  demandes: Record<string, Horodate<{ demande: DemandeSuperviseur }>>;
  guichets: Record<number, Horodate<{ guichet: GuichetSuperviseur }>>;
  remplissages: Record<string, Horodate<{ vendus: number; capacite: number }>>;
}

export const DIRECT_VIDE: Direct = { demandes: {}, guichets: {}, remplissages: {} };

/** Range un message du canal de la gare dans l'état du temps réel. */
export function recevoir(direct: Direct, message: MessageGare): Direct {
  switch (message.type) {
    case "demande":
      return {
        ...direct,
        demandes: {
          ...direct.demandes,
          [message.demande.demandeId]: { at: message.at, demande: message.demande },
        },
      };
    case "guichet":
      return {
        ...direct,
        guichets: {
          ...direct.guichets,
          [message.guichet.rang]: { at: message.at, guichet: message.guichet },
        },
      };
    case "remplissage":
      return {
        ...direct,
        remplissages: {
          ...direct.remplissages,
          [message.departId]: {
            at: message.at,
            vendus: message.vendus,
            capacite: message.capacite,
          },
        },
      };
  }
}

/** Un message plus ancien que la lecture est déjà compté dans celle-ci : il est ignoré. */
function aJour(messageAt: string, lectureAt: string): boolean {
  return Date.parse(messageAt) >= Date.parse(lectureAt);
}

/**
 * La lecture de l'accueil, complétée par ce que le temps réel a publié depuis : une demande qui arrive s'ajoute (une
 * seule fois, même publiée de nouveau), un guichet qui bouge remplace le sien, un départ qui se remplit change son
 * compteur. Les demandes déjà traitées disparaissent à la lecture suivante, qui est plus récente que leur message.
 */
export function avecDirect(gare: SuperviseurGare, direct: Direct): SuperviseurGare {
  const connues = new Set(gare.demandes.map((d) => d.demandeId));
  const nouvelles = Object.values(direct.demandes)
    .filter((m) => aJour(m.at, gare.at) && !connues.has(m.demande.demandeId))
    .map((m) => m.demande);

  const guichets = gare.guichets.map((g) => {
    const m = direct.guichets[g.rang];
    return m && aJour(m.at, gare.at) ? m.guichet : g;
  });
  const rangs = new Set(guichets.map((g) => g.rang));
  for (const m of Object.values(direct.guichets)) {
    if (aJour(m.at, gare.at) && !rangs.has(m.guichet.rang)) guichets.push(m.guichet);
  }
  guichets.sort((a, b) => a.rang - b.rang);

  return {
    ...gare,
    demandes: [...gare.demandes, ...nouvelles],
    guichets,
    apresMidi: gare.apresMidi.map((d) => {
      const m = direct.remplissages[d.departId];
      return m && aJour(m.at, gare.at) ? { ...d, vendus: m.vendus, capacite: m.capacite } : d;
    }),
  };
}
