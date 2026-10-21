import { decoderPc850 } from "./escpos/codepage";
import type { StockageCle } from "./transport/transport";

/** Empreinte rapide (FNV-1a 32 bits) d'une suite d'octets : suffit à repérer un changement d'image dans un snapshot. */
export function empreinte(octets: ArrayLike<number>): string {
  let h = 2166136261;
  for (let i = 0; i < octets.length; i += 1) {
    h ^= octets[i] ?? 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Relit un flux ESC/POS en lignes lisibles : une ligne par ordre, le texte décodé, les images résumées par leur
 * taille et leur empreinte. C'est le format des snapshots.
 */
export function analyser(octets: Uint8Array): string[] {
  const lignes: string[] = [];
  let texte: number[] = [];
  const viderTexte = () => {
    if (texte.length > 0) lignes.push(`TEXTE ${JSON.stringify(decoderPc850(texte))}`);
    texte = [];
  };
  let i = 0;
  const lire = (k: number) => octets[i + k] ?? 0;
  while (i < octets.length) {
    const o = lire(0);
    if (o === 0x1b) {
      viderTexte();
      const c = lire(1);
      const n = lire(2);
      if (c === 0x40) {
        lignes.push("INIT");
        i += 2;
      } else if (c === 0x74) {
        lignes.push(`PAGE_DE_CODE ${n}`);
        i += 3;
      } else if (c === 0x61) {
        lignes.push(`ALIGNER ${["gauche", "centre", "droite"][n] ?? n}`);
        i += 3;
      } else if (c === 0x33) {
        lignes.push(`INTERLIGNE ${n}`);
        i += 3;
      } else if (c === 0x4d) {
        lignes.push(`POLICE ${n === 0 ? "A" : "B"}`);
        i += 3;
      } else if (c === 0x45) {
        lignes.push(`GRAS ${n}`);
        i += 3;
      } else if (c === 0x4a) {
        lignes.push(`AVANCER ${n}`);
        i += 3;
      } else {
        throw new Error(`Ordre ESC inconnu : ${c.toString(16)}`);
      }
    } else if (o === 0x1d) {
      viderTexte();
      const c = lire(1);
      if (c === 0x21) {
        const n = lire(2);
        lignes.push(`TAILLE ${(n >> 4) + 1}x${(n & 15) + 1}`);
        i += 3;
      } else if (c === 0x76) {
        const largeur = lire(4) + (lire(5) << 8);
        const hauteur = lire(6) + (lire(7) << 8);
        const taille = largeur * hauteur;
        const donnees = octets.subarray(i + 8, i + 8 + taille);
        lignes.push(
          `IMAGE ${largeur * 8}x${hauteur} octets=${taille} empreinte=${empreinte(donnees)}`,
        );
        i += 8 + taille;
      } else {
        throw new Error(`Ordre GS inconnu : ${c.toString(16)}`);
      }
    } else if (o === 0x0a) {
      viderTexte();
      lignes.push("LF");
      i += 1;
    } else {
      texte.push(o);
      i += 1;
    }
  }
  viderTexte();
  return lignes;
}

/** Hauteur de papier (points) consommée par un flux : interlignes à chaque LF, images, avances. */
export function hauteurDuFlux(octets: Uint8Array): number {
  let hauteur = 0;
  let interligne = 0;
  let i = 0;
  while (i < octets.length) {
    const o = octets[i] ?? 0;
    if (o === 0x1b) {
      const c = octets[i + 1];
      const n = octets[i + 2] ?? 0;
      if (c === 0x40) i += 2;
      else {
        if (c === 0x33) interligne = n;
        if (c === 0x4a) hauteur += n;
        i += 3;
      }
    } else if (o === 0x1d && octets[i + 1] === 0x76) {
      const largeur = (octets[i + 4] ?? 0) + ((octets[i + 5] ?? 0) << 8);
      const lignes = (octets[i + 6] ?? 0) + ((octets[i + 7] ?? 0) << 8);
      hauteur += lignes;
      i += 8 + largeur * lignes;
    } else if (o === 0x1d) {
      i += 3;
    } else {
      if (o === 0x0a) hauteur += interligne;
      i += 1;
    }
  }
  return hauteur;
}

/** Stockage qui garde tout en mémoire et peut tomber en panne. */
export class StockageDeTest implements StockageCle {
  readonly valeurs = new Map<string, string>();
  enPanne = false;
  lire(cle: string): string | null {
    if (this.enPanne) throw new Error("stockage en panne");
    return this.valeurs.get(cle) ?? null;
  }
  ecrire(cle: string, valeur: string): void {
    if (this.enPanne) throw new Error("stockage en panne");
    this.valeurs.set(cle, valeur);
  }
  retirer(cle: string): void {
    this.valeurs.delete(cle);
  }
}

/** Planificateur manuel : on avance le temps à la main. */
export class PlanificateurManuel {
  private temps = 0;
  private prochain = 1;
  private readonly taches = new Map<number, { a: number; action: () => void }>();

  readonly planifier = (action: () => void, ms: number): (() => void) => {
    const id = this.prochain++;
    this.taches.set(id, { a: this.temps + ms, action });
    return () => {
      this.taches.delete(id);
    };
  };

  get enAttente(): number {
    return this.taches.size;
  }

  /** Délais des tâches programmées, du plus proche au plus lointain. */
  get delais(): number[] {
    return [...this.taches.values()].map((t) => t.a - this.temps).sort((a, b) => a - b);
  }

  avancer(ms: number): void {
    this.temps += ms;
    for (const [id, t] of [...this.taches]) {
      if (t.a <= this.temps) {
        this.taches.delete(id);
        t.action();
      }
    }
  }
}

/** Laisse les promesses en cours se résoudre. */
export const attendreMicrotaches = async (n = 20) => {
  for (let i = 0; i < n; i += 1) await Promise.resolve();
};
