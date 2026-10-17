import { useParams } from "react-router";
import { EcranPaiement } from "@/ecrans/Paiement";

export default function Page() {
  const { commandeId = "" } = useParams();
  return <EcranPaiement commandeId={commandeId} />;
}
