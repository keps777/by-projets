import { agence } from "@afrimove/api-client";
import type { agence as c } from "@afrimove/contrats";
import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";

/**
 * Impression des billets de cadence. L'écran ne parle qu'à cette interface : elle sera branchée sur
 * `@afrimove/impression` quand AM-075 sera fusionné (il suffira de fournir un autre service par
 * `FournisseurImpressionCadence`). En attendant, l'implémentation par défaut enregistre la demande
 * d'impression de l'agence (`impression.demandee`) et rend le statut que le serveur répond.
 */
export interface ServiceImpression {
  /** Imprime le billet ; `en_attente_imprimante` quand l'imprimante ne répond pas (il reste à imprimer). */
  imprimerBillet(billet: c.BilletImprimable): Promise<c.ResultatImpression["statut"]>;
}

const ContexteImpression = createContext<ServiceImpression | null>(null);

export function FournisseurImpressionCadence({
  service,
  children,
}: {
  service: ServiceImpression;
  children?: ReactNode;
}) {
  return <ContexteImpression.Provider value={service}>{children}</ContexteImpression.Provider>;
}

/** Le service d'impression fourni, sinon celui de l'agence (événement `impression.demandee`). */
export function useServiceImpression(): ServiceImpression {
  const fourni = useContext(ContexteImpression);
  const imprimer = agence.useImprimer();
  const derniere = useRef(imprimer.mutateAsync);
  derniere.current = imprimer.mutateAsync;
  return useMemo<ServiceImpression>(
    () =>
      fourni ?? {
        async imprimerBillet(billet) {
          const resultat = await derniere.current({
            document: "billet",
            documentId: billet.billetId,
            copies: 1,
            reimpression: false,
          });
          return resultat.statut;
        },
      },
    [fourni],
  );
}
