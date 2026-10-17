import type { Depart } from "@afrimove/domain";
import { ALPHA, ALPHA_DLA_BAF, BUS_LT118, DEPART_ALPHA_BAF_0815, departDe } from "../monde";

/**
 * Les 5 départs quotidiens d'Alpha sur Douala → Bafoussam tels que AnalysesLigne et ConfigLigne les
 * listent : 06:00 (LT 118 AB), 08:15 (soute colis), 10:00, 13:00 et 16:30 (VIP, clim). Le 08:15 est
 * celui du monde commun, le même bus LT 118 AB que le 06:00 (voir INCOHERENCES.md).
 */
const d = (hhmm: string, classe: "classique" | "vip", busId?: string): Depart =>
  departDe({
    cie: ALPHA,
    ligne: ALPHA_DLA_BAF,
    hhmm,
    classe,
    ...(busId ? { busId } : {}),
  });

export const DEPARTS_DLA_BAF = {
  d0600: d("06:00", "classique", BUS_LT118.id),
  d0815: DEPART_ALPHA_BAF_0815,
  d1000: d("10:00", "classique"),
  d1300: d("13:00", "classique"),
  d1630: d("16:30", "vip"),
} as const;

export const TOUS_DEPARTS_DLA_BAF: readonly Depart[] = Object.values(DEPARTS_DLA_BAF);
