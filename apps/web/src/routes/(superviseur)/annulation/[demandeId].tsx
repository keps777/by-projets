import { useParams } from "react-router";
import { EcranSuperviseurVoir } from "@/ecrans/SuperviseurVoir";

export default function Page() {
  const { demandeId } = useParams();
  return <EcranSuperviseurVoir demandeId={demandeId} />;
}
