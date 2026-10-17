import type { SalleDeControle } from "./direct";

export type HeureVentes = SalleDeControle["ventesParHeure"]["heures"][number];

export type TonBarre = "pic" | "normal" | "prevu";

export interface Barre {
  heure: number;
  /** Hauteur en % de la plus haute barre (réalisée ou prévue). */
  hauteur: number;
  ton: TonBarre;
}

/** Nombre d'heures consécutives qui forment le pic de la journée (05 h, 06 h, 07 h dans la planche). */
const LARGEUR_PIC = 3;

/**
 * Les barres de « Ventes par heure ». La hauteur suit le montant ; les heures à venir sont en pointillés ; en ambre : les
 * trois heures consécutives les plus fortes (le pic) et l'heure qui vient de se terminer, comme la planche.
 */
export function barres(heures: readonly HeureVentes[]): Barre[] {
  const max = Math.max(0, ...heures.map((h) => h.montant));
  const realisees = heures.flatMap((h, i) => (h.prevu ? [] : [i]));

  let debutPic = -1;
  let meilleure = -1;
  for (let i = 0; i + LARGEUR_PIC <= heures.length; i += 1) {
    const fenetre = heures.slice(i, i + LARGEUR_PIC);
    if (fenetre.some((h) => h.prevu)) continue;
    const somme = fenetre.reduce((total, h) => total + h.montant, 0);
    if (somme > meilleure) {
      meilleure = somme;
      debutPic = i;
    }
  }
  const derniere = realisees.at(-1);

  return heures.map((h, i): Barre => {
    const hauteur = max === 0 ? 0 : Math.round((h.montant / max) * 1000) / 10;
    if (h.prevu) return { heure: h.heure, hauteur, ton: "prevu" };
    const dansLePic = debutPic >= 0 && i >= debutPic && i < debutPic + LARGEUR_PIC;
    return { heure: h.heure, hauteur, ton: dansLePic || i === derniere ? "pic" : "normal" };
  });
}

export interface RepereAxe {
  heure: number;
  prevu: boolean;
}

/**
 * Les quatre repères sous les barres : la première heure, deux repères réguliers, puis la fin de la journée prévue
 * (« 05 h · 09 h · 13 h · 17 h · prévu » avec les douze barres de 05 h à 16 h).
 */
export function reperesAxe(heures: readonly HeureVentes[]): RepereAxe[] {
  const premiere = heures[0];
  const derniere = heures.at(-1);
  if (!premiere || !derniere) return [];
  const pas = Math.max(1, Math.round(heures.length / 3));
  const reperes: RepereAxe[] = [0, 1, 2].flatMap((k) => {
    const h = heures[k * pas];
    return h ? [{ heure: h.heure, prevu: false }] : [];
  });
  return [...reperes, { heure: derniere.heure + 1, prevu: derniere.prevu }];
}
