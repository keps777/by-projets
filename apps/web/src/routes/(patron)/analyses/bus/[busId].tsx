import { useParams } from "react-router";
import { EcranAnalysesBus } from "@/ecrans/AnalysesBus";

export default function Page() {
  const { busId } = useParams();
  return <EcranAnalysesBus busId={busId} />;
}
