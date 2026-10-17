import { useParams } from "react-router";
import { EcranSuperviseurDebloquer } from "@/ecrans/SuperviseurDebloquer";

export default function Page() {
  const { appareilId } = useParams();
  return <EcranSuperviseurDebloquer appareilId={appareilId} />;
}
