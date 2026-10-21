import { useParams } from "react-router";
import { EcranFinancementDemande } from "@/ecrans/FinancementDemande";

export default function Page() {
  const { dossierId } = useParams();
  return <EcranFinancementDemande dossierId={dossierId} />;
}
