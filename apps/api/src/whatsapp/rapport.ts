/**
 * Mise en forme du rapport du soir (planche RapportSoir) pour WhatsApp.
 *
 * L'API ne peut pas importer `@afrimove/contrats` à l'exécution (paquet non compilé, voir le README
 * de `apps/api`) : `RapportSoirEntree` en recopie la partie lue ici. Un test de parité
 * (`rapport.test.ts`) vérifie qu'un `RapportSoir` du contrat passe sans conversion.
 *
 * Un gabarit WhatsApp a un texte fixe et des variables numérotées, sans saut de ligne dans les
 * variables : la liste des gares tient donc sur une seule ligne (séparateur « ; »). Le corps d'un
 * gabarit ne peut pas dépasser 1 024 caractères : si le rapport est trop long, on retire d'abord les
 * remarques des gares, puis les dernières gares (« + 2 autres gares »).
 */

export interface RapportSoirEntree {
  /** `AAAA-MM-JJ` (heure de Douala). */
  jour: string;
  /** « Rapport du mardi 5 janvier · 3 gares ». */
  titre: string;
  chiffres: {
    billets: number;
    variationBilletsPct: number;
    colis: number;
    litiges: number;
    /** Entiers de FCFA. */
    recette: number;
    cash: number;
    momo: number;
  };
  gares: Array<{ nom: string; billets: number; ecart: number; remarques: string[] }>;
  enRoute: { texte: string };
  remplissage: { moyenPct: number; remarque: string | null };
  annulations: { nombre: number; montant: number; toutesAvecPin: boolean };
  enLigne: { billets: number; partPct: number };
  signatures: Array<{ nom: string; gare: string }>;
}

/** Texte du gabarit tel qu'il est soumis à WhatsApp (15 variables). */
export const CORPS_RAPPORT_SOIR =
  "AfriMove · {{1}}\n" +
  "{{2}}\n\n" +
  "Billets : {{3}} ({{4}})\n" +
  "Colis : {{5}} ({{6}})\n" +
  "Recette : {{7}} (cash {{8}} · MoMo {{9}})\n\n" +
  "Gares : {{10}}\n" +
  "En route : {{11}}\n" +
  "Remplissage : {{12}}\n" +
  "Annulations : {{13}}\n" +
  "En ligne : {{14}}\n\n" +
  "Signé : {{15}}\n" +
  "Le détail complet est dans l'app AfriMove.";

/** WhatsApp refuse un corps de plus de 1 024 caractères ; on garde une marge. */
export const LONGUEUR_CORPS_MAX = 1000;
/** Un SMS de repli ne dépasse pas la longueur d'un message `systeme` de la passerelle SMS. */
export const LONGUEUR_SECOURS_MAX = 300;

const ESPACE_FINE = " ";
const MOINS = "−";

/* ------------------------------------------------------------------------------------ formats */

/** Une ligne, sans saut de ligne ni suite d'espaces (interdits dans une variable de gabarit). */
export function nettoyer(texte: string): string {
  return texte
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim()
    .normalize("NFC");
}

function couper(texte: string, max: number): string {
  const t = nettoyer(texte);
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/** `1004` → `1 004` (espace fine insécable). */
export function grouper(n: number, separateur = ESPACE_FINE): string {
  const [entier = "0"] = String(Math.abs(Math.round(n))).split(".");
  return entier.replace(/\B(?=(\d{3})+(?!\d))/g, separateur);
}

/** `-1000` → `−1 000 F`, `500` → `500 F` ; avec `signe`, `+500 F`. */
export function montant(n: number, options: { signe?: boolean; ascii?: boolean } = {}): string {
  const sep = options.ascii ? " " : ESPACE_FINE;
  const corps = `${grouper(n, sep)} F`;
  if (n < 0) return `${options.ascii ? "-" : MOINS}${corps}`;
  return options.signe && n > 0 ? `+${corps}` : corps;
}

/** `4410000` → `4,41 M F`, `2900000` → `2,9 M F`, `850000` → `850 000 F`. */
export function montantCourt(n: number, options: { ascii?: boolean } = {}): string {
  if (Math.abs(n) < 1_000_000) return montant(n, options);
  const millions = Math.round(Math.abs(n) / 10_000) / 100;
  const texte = String(millions).replace(".", ",");
  return `${n < 0 ? (options.ascii ? "-" : MOINS) : ""}${texte} M F`;
}

/** `6` → `+6 %`, `-3` → `−3 %`, `0` → `0 %` (arrondi à l'entier). */
export function pourcentSigne(pct: number): string {
  const n = Math.round(pct);
  return `${n > 0 ? "+" : n < 0 ? MOINS : ""}${Math.abs(n)} %`;
}

const pluriel = (n: number, un: string, plusieurs: string): string =>
  `${grouper(n)} ${n > 1 ? plusieurs : un}`;

/* ---------------------------------------------------------------------------------- validation */

type Objet = Record<string, unknown>;
const estObjet = (v: unknown): v is Objet =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Vérifie la forme du rapport ; rend les erreurs (liste vide si le rapport est lisible). */
export function erreursRapport(brut: unknown): string[] {
  const erreurs: string[] = [];
  if (!estObjet(brut)) return ["rapport : objet attendu"];
  const entier = (chemin: string, v: unknown, signe = true): void => {
    if (typeof v !== "number" || !Number.isInteger(v) || (!signe && v < 0)) {
      erreurs.push(`${chemin} : entier${signe ? "" : " positif"} attendu`);
    }
  };
  const nombre = (chemin: string, v: unknown): void => {
    if (typeof v !== "number" || !Number.isFinite(v)) erreurs.push(`${chemin} : nombre attendu`);
  };
  const texte = (chemin: string, v: unknown, max: number, vide = false): void => {
    if (typeof v !== "string" || (!vide && nettoyer(v) === "") || v.length > max) {
      erreurs.push(`${chemin} : texte de ${max} caractères au plus`);
    }
  };
  const objet = (chemin: string, v: unknown): Objet => {
    if (estObjet(v)) return v;
    erreurs.push(`${chemin} : objet attendu`);
    return {};
  };

  if (typeof brut["jour"] !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(brut["jour"])) {
    erreurs.push("jour : AAAA-MM-JJ attendu");
  }
  texte("titre", brut["titre"], 80);
  const c = objet("chiffres", brut["chiffres"]);
  entier("chiffres.billets", c["billets"], false);
  nombre("chiffres.variationBilletsPct", c["variationBilletsPct"]);
  entier("chiffres.colis", c["colis"], false);
  entier("chiffres.litiges", c["litiges"], false);
  entier("chiffres.recette", c["recette"]);
  entier("chiffres.cash", c["cash"]);
  entier("chiffres.momo", c["momo"]);

  const gares = brut["gares"];
  if (!Array.isArray(gares) || gares.length > 50) {
    erreurs.push("gares : liste de 50 gares au plus");
  } else {
    gares.forEach((g: unknown, i) => {
      const o = objet(`gares[${i}]`, g);
      texte(`gares[${i}].nom`, o["nom"], 40);
      entier(`gares[${i}].billets`, o["billets"], false);
      entier(`gares[${i}].ecart`, o["ecart"]);
      const r = o["remarques"];
      if (!Array.isArray(r) || r.length > 10 || r.some((x) => typeof x !== "string")) {
        erreurs.push(`gares[${i}].remarques : liste de 10 textes au plus`);
      }
    });
  }
  texte("enRoute.texte", objet("enRoute", brut["enRoute"])["texte"], 300);
  const rempl = objet("remplissage", brut["remplissage"]);
  nombre("remplissage.moyenPct", rempl["moyenPct"]);
  if (rempl["remarque"] !== null && rempl["remarque"] !== undefined) {
    texte("remplissage.remarque", rempl["remarque"], 200);
  }
  const a = objet("annulations", brut["annulations"]);
  entier("annulations.nombre", a["nombre"], false);
  entier("annulations.montant", a["montant"], false);
  if (typeof a["toutesAvecPin"] !== "boolean") {
    erreurs.push("annulations.toutesAvecPin : booléen attendu");
  }
  const l = objet("enLigne", brut["enLigne"]);
  entier("enLigne.billets", l["billets"], false);
  nombre("enLigne.partPct", l["partPct"]);
  const sig = brut["signatures"];
  if (!Array.isArray(sig) || sig.length > 20) {
    erreurs.push("signatures : liste de 20 signatures au plus");
  } else {
    sig.forEach((s: unknown, i) => {
      const o = objet(`signatures[${i}]`, s);
      texte(`signatures[${i}].nom`, o["nom"], 40);
      texte(`signatures[${i}].gare`, o["gare"], 40);
    });
  }
  return erreurs;
}

/* ---------------------------------------------------------------------------------- mise en forme */

export interface RapportFormate {
  /** Les 15 variables du gabarit, dans l'ordre. */
  parametres: string[];
  /** Fin de l'adresse du bouton « Ouvrir le détail dans l'app » : le jour du rapport. */
  bouton: string;
  /** SMS de repli, quand WhatsApp ne remet pas le rapport. */
  texteSecours: string;
}

function ligneGare(g: RapportSoirEntree["gares"][number], avecRemarques: boolean): string {
  const parties = [
    couper(g.nom, 40),
    `${pluriel(g.billets, "billet", "billets")}`,
    `écart ${montant(g.ecart, { signe: true })}`,
  ];
  if (avecRemarques) {
    for (const r of g.remarques) if (nettoyer(r) !== "") parties.push(couper(r, 120));
  }
  return parties.join(" · ");
}

function listeGares(
  gares: RapportSoirEntree["gares"],
  avecRemarques: boolean,
  garder: number,
): string {
  if (gares.length === 0) return "aucune gare";
  const lignes = gares.slice(0, garder).map((g) => ligneGare(g, avecRemarques));
  const reste = gares.length - garder;
  if (reste > 0) lignes.push(`+ ${reste} ${reste > 1 ? "autres gares" : "autre gare"}`);
  return lignes.join(" ; ");
}

function variables(compagnie: string, r: RapportSoirEntree, gares: string): string[] {
  const c = r.chiffres;
  const a = r.annulations;
  const annulations =
    a.nombre === 0
      ? "aucune"
      : `${a.nombre} (${montant(a.montant)}), ${a.toutesAvecPin ? "toutes avec PIN" : "dont au moins une sans PIN"}`;
  const remplissage =
    `${Math.round(r.remplissage.moyenPct)} % moyen` +
    (r.remplissage.remarque && nettoyer(r.remplissage.remarque) !== ""
      ? ` · ${couper(r.remplissage.remarque, 120)}`
      : "");
  const signatures =
    r.signatures.length === 0
      ? "aucune signature"
      : r.signatures.map((s) => `${couper(s.nom, 40)} (${couper(s.gare, 40)})`).join(", ");
  return [
    couper(compagnie, 30),
    couper(r.titre, 80),
    grouper(c.billets),
    `${pourcentSigne(c.variationBilletsPct)} vs hier`,
    grouper(c.colis),
    pluriel(c.litiges, "litige", "litiges"),
    montantCourt(c.recette),
    montantCourt(c.cash),
    montantCourt(c.momo),
    gares,
    couper(r.enRoute.texte, 300),
    remplissage,
    annulations,
    `${pluriel(r.enLigne.billets, "billet", "billets")} (${Math.round(r.enLigne.partPct)} %)`,
    signatures,
  ];
}

/** Texte final d'un gabarit : les `{{n}}` remplacés par les variables. */
export function remplirCorps(corps: string, parametres: readonly string[]): string {
  return corps.replace(/\{\{(\d+)\}\}/g, (_m, n: string) => parametres[Number(n) - 1] ?? "");
}

/** SMS de repli : l'essentiel en moins de 300 caractères, sans caractère hors alphabet GSM courant. */
export function texteSecoursRapport(compagnie: string, r: RapportSoirEntree): string {
  const c = r.chiffres;
  const titre = couper(r.titre.replace(/\s*·\s*/g, ", "), 80);
  const debut =
    `AfriMove ${couper(compagnie, 30)} : ${titre}. Billets ${grouper(c.billets, " ")} ` +
    `(${pourcentSigne(c.variationBilletsPct).replace(MOINS, "-")}), colis ${grouper(c.colis, " ")}, ` +
    `recette ${montantCourt(c.recette, { ascii: true })}.`;
  const fin = " Detail dans l'app AfriMove.";
  const ecarts = r.gares
    .filter((g) => g.ecart !== 0)
    .map((g) => `${couper(g.nom, 20)} ${montant(g.ecart, { signe: true, ascii: true })}`);
  let milieu = ecarts.length > 0 ? ` Ecarts : ${ecarts.join(", ")}.` : " Aucun ecart de caisse.";
  while (debut.length + milieu.length + fin.length > LONGUEUR_SECOURS_MAX && ecarts.length > 1) {
    ecarts.pop();
    milieu = ` Ecarts : ${ecarts.join(", ")}, ...`;
  }
  const texte = debut + milieu + fin;
  return texte.length <= LONGUEUR_SECOURS_MAX ? texte : couper(debut + fin, LONGUEUR_SECOURS_MAX);
}

/** Variables du gabarit `rapport_soir`, adresse du bouton et SMS de repli. */
export function formaterRapport(compagnie: string, r: RapportSoirEntree): RapportFormate {
  let parametres = variables(compagnie, r, listeGares(r.gares, true, r.gares.length));
  const trop = (p: string[]): boolean =>
    remplirCorps(CORPS_RAPPORT_SOIR, p).length > LONGUEUR_CORPS_MAX;
  if (trop(parametres)) {
    parametres = variables(compagnie, r, listeGares(r.gares, false, r.gares.length));
  }
  for (let garder = r.gares.length - 1; trop(parametres) && garder >= 0; garder--) {
    parametres = variables(compagnie, r, listeGares(r.gares, false, garder));
  }
  return { parametres, bouton: r.jour, texteSecours: texteSecoursRapport(compagnie, r) };
}
