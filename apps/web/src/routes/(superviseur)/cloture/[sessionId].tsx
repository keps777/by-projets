import { useParams } from "react-router";
import { EcranSuperviseurValider } from "@/ecrans/SuperviseurValider";

export default function Page() {
  const { sessionId } = useParams();
  return <EcranSuperviseurValider sessionId={sessionId} />;
}
