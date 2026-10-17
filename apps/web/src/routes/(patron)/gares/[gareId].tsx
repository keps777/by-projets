import { useParams } from "react-router";
import { EcranPatronGare } from "@/ecrans/PatronGare";

export default function Page() {
  const { gareId } = useParams();
  return <EcranPatronGare gareId={gareId} />;
}
