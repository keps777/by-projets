import { useParams } from "react-router";
import { EcranInterAgencesConvention } from "@/ecrans/InterAgencesConvention";

export default function Page() {
  const { conventionId } = useParams();
  return <EcranInterAgencesConvention conventionId={conventionId} />;
}
