interface CodeBarresProps {
  /** Texte dont on tire les barres (le même texte donne toujours le même dessin). */
  texte: string;
  libelle: string;
  largeur?: number;
  hauteur?: number;
  className?: string;
}

/** Suite de largeurs de barres (1 à 3 unités) tirée du texte, sans hasard. */
export function largeursBarres(texte: string): number[] {
  let graine = 2166136261;
  for (const caractere of texte) {
    graine ^= caractere.codePointAt(0) ?? 0;
    graine = Math.imul(graine, 16777619) >>> 0;
  }
  const largeurs: number[] = [];
  for (let i = 0; i < 24; i += 1) {
    graine = (Math.imul(graine, 1664525) + 1013904223) >>> 0;
    largeurs.push(1 + ((graine >>> 24) % 3));
  }
  return largeurs;
}

/**
 * Barres verticales dessinées en SVG, comme celles des planches GuichetColis. C'est une
 * représentation pour l'aperçu à l'écran, pas un code lisible par un lecteur : l'encodage réel
 * appartient à l'impression.
 */
export function CodeBarres({
  texte,
  libelle,
  largeur = 96,
  hauteur = 40,
  className,
}: CodeBarresProps) {
  const largeurs = largeursBarres(texte);
  const total = largeurs.reduce((somme, l) => somme + l + 1, 0);
  const unite = (largeur - 4) / total;
  let x = 2;
  const barres = largeurs.map((l, i) => {
    const chemin = `M${x.toFixed(2)} 2h${(l * unite).toFixed(2)}v${hauteur - 4}h-${(l * unite).toFixed(2)}z`;
    x += (l + 1) * unite;
    return <path key={i} d={chemin} />;
  });
  return (
    <svg
      width={largeur}
      height={hauteur}
      viewBox={`0 0 ${largeur} ${hauteur}`}
      role="img"
      aria-label={libelle}
      className={className}
      fill="currentColor"
    >
      {barres}
    </svg>
  );
}
