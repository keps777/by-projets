import { useState } from "react";
import { useSearchParams } from "react-router";
import { lireAppareilEnrole, modeHttp } from "@/agent";
import { EcranConnexion } from "@/ecrans/Connexion";
import { EcranConnexionAgent, LienConnexionAgent } from "@/ecrans/ConnexionAgent";

/**
 * Connexion. Le voyageur garde son écran (numéro + code à 4 chiffres). Avec l'API réelle (mode http) un lien
 * mène à la connexion des agents (PIN, ou mot de passe puis SMS), qui s'ouvre d'office sur un téléphone déjà
 * enrôlé ou avec `?agent=1`. En démonstration le sélecteur de rôle suffit et le lien n'est pas proposé.
 */
export default function Page() {
  const [recherche] = useSearchParams();
  const http = modeHttp();
  const [agent, setAgent] = useState(
    () => http && (recherche.has("agent") || lireAppareilEnrole() !== null),
  );

  if (agent) return <EcranConnexionAgent onVoyageur={() => setAgent(false)} />;
  if (!http) return <EcranConnexion />;
  return (
    <>
      <EcranConnexion />
      <LienConnexionAgent onClick={() => setAgent(true)} />
    </>
  );
}
