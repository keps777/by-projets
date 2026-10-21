import { useParams } from "react-router";
import { EcranSiegePay } from "@/ecrans/SiegePay";

export default function Page() {
  const { departId = "" } = useParams();
  return <EcranSiegePay departId={departId} />;
}
