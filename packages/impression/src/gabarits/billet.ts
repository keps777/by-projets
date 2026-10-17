import { bitmapLogo, bitmapQr } from "../escpos/images";
import { PAPIER_58_MM, colonnes, type Morceau, type ProfilPapier } from "../escpos/constructeur";
import {
  decouperTexte,
  largeurQuiTient,
  ligneTexte,
  rendreEscPos,
  type ElementGabarit,
} from "./mise-en-page";

/**
 * Ce que le billet imprimé porte. Les textes arrivent déjà formatés comme à l'écran (voir `formats.ts`) :
 * le même objet nourrit l'aperçu et le papier. Planche de référence : CadenceBillet (20b).
 */
export interface DonneesBillet {
  /** « ALPHA VOYAGES ». */
  compagnie: string;
  /** « DLA → YDE ». */
  trajet: string;
  /** « 05:30 · 05.01.27 ». */
  depart: string;
  /** « 19 » ; null si le billet n'a pas de siège. */
  siege: string | null;
  /** « CLASSIQUE ». */
  classe: string;
  /** Nom du voyageur ; null : « à compléter au quai ». */
  nom: string | null;
  /** 4 derniers chiffres de la pièce ; null : « ____ (4 chiffres) ». */
  piece: string | null;
  /** Contenu du QR code. */
  qr: string;
  /** Code à 4 chiffres, ex. « 9047 ». */
  code: string;
  /** « ALP-DLA-270105-0232 ». */
  numero: string;
  /** Ligne du bas. */
  pied: string;
}

export const PIED_BILLET = "Au quai 20 min avant · afrimove.cm";

export interface OptionsBillet {
  papier?: ProfilPapier;
  /** Côté du QR code, en points (3 cm = 240). */
  qrPoints?: number;
  /** Papier avancé en fin de billet pour pouvoir le déchirer. */
  avanceFinale?: number;
}

/** Ne garde que les champs du billet, quoi que l'appelant ait passé en plus. */
export function champsBillet(d: DonneesBillet): DonneesBillet {
  return {
    compagnie: String(d.compagnie),
    trajet: String(d.trajet),
    depart: String(d.depart),
    siege: d.siege === null ? null : String(d.siege),
    classe: String(d.classe),
    nom: d.nom === null ? null : String(d.nom),
    piece: d.piece === null ? null : String(d.piece),
    qr: String(d.qr),
    code: String(d.code),
    numero: String(d.numero),
    pied: String(d.pied),
  };
}

function verifier(d: DonneesBillet): void {
  if (!/^\d{4}$/.test(d.code)) throw new Error("Billet : le code doit faire 4 chiffres");
  if (d.qr.length === 0) throw new Error("Billet : contenu du QR code vide");
  if (d.numero.length === 0) throw new Error("Billet : numéro vide");
}

/** « NOM : » suivi d'une valeur, repliée sur plusieurs lignes alignées sous la première. */
function ligneAvecEtiquette(
  etiquette: string,
  valeur: string,
  gras: boolean,
  largeurColonnes: number,
  suffixe = "",
): ElementGabarit[] {
  const reste = Math.max(8, largeurColonnes - etiquette.length - suffixe.length);
  return decouperTexte(valeur, reste).map((morceau, rang, toutes) => {
    const debut: Morceau = { texte: rang === 0 ? etiquette : " ".repeat(etiquette.length) };
    const fin: Morceau[] = suffixe && rang === toutes.length - 1 ? [{ texte: suffixe }] : [];
    return ligneTexte([debut, { texte: morceau, gras }, ...fin], "gauche", 2);
  });
}

/** Mise en page du billet, du logo au pied de page. */
export function mettreEnPageBillet(
  d: DonneesBillet,
  options: OptionsBillet = {},
): ElementGabarit[] {
  verifier(d);
  const { papier = PAPIER_58_MM, qrPoints = 240 } = options;
  const cols = colonnes(papier);
  const elements: ElementGabarit[] = [];

  elements.push({ type: "image", image: bitmapLogo(48), alignement: "gauche", ecart: 4 });
  elements.push(
    ...decouperTexte(d.compagnie, cols).map((t) =>
      ligneTexte([{ texte: t, gras: true }], "gauche", 4),
    ),
  );
  elements.push(
    ligneTexte(
      [{ texte: d.trajet, gras: true, l: largeurQuiTient(d.trajet, papier, 2), h: 2 }],
      "gauche",
      4,
    ),
  );
  elements.push(
    ligneTexte(
      [{ texte: d.depart, gras: true, l: largeurQuiTient(d.depart, papier, 2), h: 2 }],
      "gauche",
      6,
    ),
  );
  elements.push(
    ligneTexte(
      d.siege !== null
        ? [
            { texte: "SIÈGE " },
            { texte: d.siege, gras: true, l: 2, h: 2 },
            { texte: ` · ${d.classe}` },
          ]
        : [{ texte: d.classe }],
      "gauche",
      4,
    ),
  );
  elements.push(ligneTexte("-".repeat(cols), "gauche", 2));
  elements.push(...ligneAvecEtiquette("NOM : ", d.nom ?? "à compléter au quai", true, cols));
  elements.push(
    ...(d.piece !== null
      ? ligneAvecEtiquette("PIÈCE : ", d.piece, true, cols)
      : [ligneTexte("PIÈCE : ____ (4 chiffres)", "gauche", 2)]),
  );
  elements.push({ type: "espace", points: 6 });
  elements.push({
    type: "image",
    image: bitmapQr(d.qr, { cotePoints: qrPoints }),
    alignement: "centre",
    ecart: 4,
  });
  elements.push(
    ligneTexte([{ texte: d.code.split("").join(" "), gras: true, l: 3, h: 3 }], "centre", 4),
  );
  elements.push(...decouperTexte(d.numero, cols).map((t) => ligneTexte(t, "centre", 4)));
  elements.push(
    ...decouperTexte(d.pied, colonnes(papier, "B")).map((t) =>
      ligneTexte([{ texte: t, police: "B" }], "centre", 2),
    ),
  );
  return elements;
}

/** Octets ESC/POS du billet. */
export function genererBillet(d: DonneesBillet, options: OptionsBillet = {}): Uint8Array {
  return rendreEscPos(mettreEnPageBillet(d, options), {
    papier: options.papier ?? PAPIER_58_MM,
    avanceFinale: options.avanceFinale ?? 96,
  });
}
