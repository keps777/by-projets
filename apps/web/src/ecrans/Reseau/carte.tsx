import { useTranslation } from "react-i18next";

/** Villes de la carte, dans l'ordre des données de la planche (le nom de la ville est celui de l'API). */
export const VILLES_CARTE = [
  "Douala",
  "Yaoundé",
  "Bafoussam",
  "Bamenda",
  "Kribi",
  "Ngaoundéré",
] as const;

const TEXTE = "var(--am-craie)";
const TEXTE_2 = "var(--am-craie-2)";
const TEXTE_3 = "var(--am-gris)";

function Etiquette({
  x,
  y,
  taille,
  poids,
  couleur,
  children,
}: {
  x: number;
  y: number;
  taille: 11 | 12;
  poids: 600 | 700;
  couleur: string;
  children: string;
}) {
  return (
    <text
      x={x}
      y={y}
      fill={couleur}
      fontFamily="var(--am-font-texte)"
      fontSize={taille}
      fontWeight={poids}
    >
      {children}
    </text>
  );
}

function Route({
  de,
  vers,
  largeur,
  couleur = "var(--am-trait)",
  pointille,
}: {
  de: string;
  vers: string;
  largeur: number;
  couleur?: string;
  pointille?: string;
}) {
  return (
    <path
      d={`M${de} L${vers}`}
      stroke={couleur}
      strokeWidth={largeur}
      strokeLinecap="round"
      {...(pointille ? { strokeDasharray: pointille } : {})}
    />
  );
}

function Bus({ x, y, couleur }: { x: number; y: number; couleur: string }) {
  return <circle cx={x} cy={y} r={6} fill={couleur} />;
}

function Gare({ x, y, r, couleur }: { x: number; y: number; r: number; couleur: string }) {
  return <circle cx={x} cy={y} r={r} fill="var(--am-nuit)" stroke={couleur} strokeWidth={3} />;
}

/**
 * Carte du réseau, dessinée comme dans la planche : routes entre les villes, bus en route (un point par
 * compagnie) et gares. `villes` (noms donnés par l'API) alimente l'étiquette lue par les lecteurs d'écran.
 */
export function CarteReseau({ villes }: { villes: readonly string[] | undefined }) {
  const { t } = useTranslation("Reseau");
  const noms = villes && villes.length > 0 ? villes : VILLES_CARTE;
  return (
    <svg
      width="356"
      height="250"
      viewBox="0 0 356 250"
      role="img"
      aria-label={t("carte.aria", { villes: noms.join(", ") })}
      // 250 px de haut sur la planche ; sur un écran bas (téléphone en paysage) la carte se réduit en gardant ses
      // proportions, pour laisser de la place aux lignes.
      style={{
        display: "block",
        width: "100%",
        height: "auto",
        maxHeight: "max(128px, calc(var(--am-ecran-h, 844px) * 0.3))",
      }}
    >
      <path
        d="M0 50h356M0 125h356M0 200h356M89 0v250M178 0v250M267 0v250"
        stroke="var(--am-surface)"
        strokeWidth={1}
      />
      <Route de="60 170" vers="200 120" largeur={8} />
      <Route de="60 170" vers="110 70" largeur={8} />
      <Route de="110 70" vers="150 30" largeur={6} />
      <Route de="200 120" vers="110 70" largeur={6} />
      <Route de="60 170" vers="90 225" largeur={6} />
      <Route de="200 120" vers="320 40" largeur={6} pointille="4 8" />
      <Route de="60 170" vers="200 120" largeur={3} couleur="var(--am-ambre)" />
      <Bus x={118} y={149} couleur="var(--am-orange)" />
      <Bus x={152} y={137} couleur="var(--am-orange)" />
      <Bus x={176} y={129} couleur="var(--am-orange)" />
      <Bus x={84} y={122} couleur="var(--am-bleu)" />
      <Bus x={97} y={96} couleur="var(--am-bleu)" />
      <Bus x={160} y={98} couleur="var(--am-vert)" />
      <Gare x={60} y={170} r={11} couleur={TEXTE} />
      <Gare x={200} y={120} r={11} couleur={TEXTE} />
      <Gare x={110} y={70} r={9} couleur={TEXTE} />
      <Gare x={150} y={30} r={7} couleur={TEXTE_2} />
      <Gare x={90} y={225} r={7} couleur={TEXTE_2} />
      <Gare x={320} y={40} r={7} couleur={TEXTE_3} />
      <Etiquette x={20} y={196} taille={12} poids={700} couleur={TEXTE}>
        Douala
      </Etiquette>
      <Etiquette x={214} y={124} taille={12} poids={700} couleur={TEXTE}>
        Yaoundé
      </Etiquette>
      <Etiquette x={124} y={66} taille={12} poids={700} couleur={TEXTE}>
        Bafoussam
      </Etiquette>
      <Etiquette x={160} y={26} taille={11} poids={600} couleur={TEXTE_2}>
        Bamenda
      </Etiquette>
      <Etiquette x={102} y={240} taille={11} poids={600} couleur={TEXTE_2}>
        Kribi
      </Etiquette>
      <Etiquette x={262} y={30} taille={11} poids={600} couleur={TEXTE_3}>
        Ngaoundéré
      </Etiquette>
      <text
        x={236}
        y={152}
        fill="var(--am-ambre)"
        fontFamily="var(--am-font-mono)"
        fontSize={10}
        fontWeight={700}
      >
        {t("carte.legende")}
      </text>
    </svg>
  );
}
