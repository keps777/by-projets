import { ErreurHttp, agence } from "@afrimove/api-client";
import { EtatChargement, EtatErreur, EtatVide } from "./etats";
import { VoirAnnulation } from "./VoirAnnulation";

/**
 * Planche « SuperviseurVoir » (AM-092) : le superviseur voit une demande d'annulation et la décide avec son PIN.
 *
 * Lit la demande par `useSuperviseurAnnulation(demandeId)` et le superviseur connecté (son identité et son nom
 * pour le PIN) par `useSuperviseurGare` : la demande ne les porte pas. Écrit par `useDeciderAnnulation`.
 * `networkMode: "always"` : les lectures sont locales, elles se rechargent aussi hors ligne (AM-160).
 */
export function EcranSuperviseurVoir({ demandeId }: { demandeId: string | undefined }) {
  const present = demandeId !== undefined && demandeId !== "";
  const demande = agence.useSuperviseurAnnulation(demandeId ?? "", {
    enabled: present,
    networkMode: "always",
  });
  const gare = agence.useSuperviseurGare({}, { enabled: present, networkMode: "always" });

  if (!present) return <EtatVide />;
  if (demande.isError) {
    const erreur = demande.error;
    return erreur instanceof ErreurHttp && erreur.statut === 404 ? (
      <EtatVide />
    ) : (
      <EtatErreur onReessayer={() => void demande.refetch()} />
    );
  }
  if (gare.isError) return <EtatErreur onReessayer={() => void gare.refetch()} />;
  if (demande.isPending || gare.isPending) return <EtatChargement />;
  return <VoirAnnulation demande={demande.data} superviseur={gare.data.superviseur} />;
}
