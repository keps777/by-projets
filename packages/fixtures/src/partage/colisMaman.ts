import type { ActionColis, Colis } from "@afrimove/domain";
import {
  AICHA,
  ALPHA_AKWA,
  ALPHA_BAFOUSSAM,
  COLIS_MAMAN,
  DEPART_ALPHA_BAF_0815,
  HACHE_COLIS_0017,
  MAMAN,
  SEL_COLIS_0017,
  colisDe,
} from "../monde";
import type { Etape } from "../monde";

/**
 * Le colis de Maman (C-DLA-270105-0017) arrivé à Bafoussam à 13:00, vu par les planches du relais
 * (mode « relais », remise chez Mama Fotso) et du livreur (mode « moto », mission à accepter).
 */
export function colisMamanArrive(mode: "relais" | "moto"): Colis {
  const etapes: Etape<ActionColis>[] = [
    { action: "charger", a: "08:10", par: "pers-convoyeur" },
    { action: "expedier", a: "11:20" },
    { action: "decharger", a: "13:00" },
    { action: "rendre_disponible", a: "13:05" },
  ];
  if (mode === "relais") etapes.push({ action: "envoyer_en_relais", a: "13:10" });
  return colisDe({
    gareOrigine: ALPHA_AKWA,
    gareDestination: ALPHA_BAFOUSSAM,
    depart: DEPART_ALPHA_BAF_0815,
    sequence: 17,
    expediteur: { nom: "Ngo Aïcha", telephone: AICHA.telephone },
    destinataire: { nom: "Ngo Thérèse", telephone: MAMAN.telephone },
    contenu: "Médicaments, vêtements",
    poidsKg: 2,
    valeurDeclaree: 25_000,
    assure: true,
    mode,
    canal: "app",
    codeRetraitHache: HACHE_COLIS_0017,
    codeRetraitSel: SEL_COLIS_0017,
    prixTotal: COLIS_MAMAN.prixTotal,
    creeA: "07:52",
    etapes,
  });
}
