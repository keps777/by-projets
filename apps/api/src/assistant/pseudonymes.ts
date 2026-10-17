/**
 * Pseudonymisation de ce qui part vers le modèle de langage.
 *
 * Les noms des agents et des chauffeurs de l'agence sont remplacés par « Agent 1 », « Chauffeur 2 »…
 * avant l'envoi, puis remis dans la réponse. Les numéros de téléphone et les adresses électroniques
 * tapés dans une question disparaissent (« [numéro] », « [adresse] ») : l'assistant n'en a pas besoin.
 * Les lignes, gares, bus et montants de la compagnie ne sont pas des données personnelles et restent.
 */

const ECHAPPE = /[.*+?^${}()|[\]\\]/g;

/** Une lettre ou un chiffre (Unicode) : « Nana » ne doit pas être reconnu dans « Nanabé ». */
const LIMITE_AVANT = "(?<![\\p{L}\\p{N}])";
const LIMITE_APRES = "(?![\\p{L}\\p{N}])";

const TELEPHONE = /(?<![\d])(?:\+|00)?\d(?:[\s.\-]?\d){7,14}(?!\d)/g;
const COURRIEL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

export interface Personne {
  nom: string;
  genre: "Agent" | "Chauffeur";
}

export class Pseudonymes {
  private readonly versPseudo: Array<{ motif: RegExp; pseudo: string }> = [];
  private readonly versNom = new Map<string, string>();

  constructor(personnes: readonly Personne[]) {
    const compteurs: Record<Personne["genre"], number> = { Agent: 0, Chauffeur: 0 };
    const dejaVus = new Map<string, string>();
    // Les noms les plus longs d'abord : « Jean Nana » avant « Nana ».
    const tries = [...personnes]
      .map((p) => ({ ...p, nom: p.nom.trim() }))
      .filter((p) => p.nom.length >= 2)
      .sort((a, b) => b.nom.length - a.nom.length || a.nom.localeCompare(b.nom, "fr"));
    for (const p of tries) {
      const cle = p.nom.toLocaleLowerCase("fr");
      if (dejaVus.has(cle)) continue;
      compteurs[p.genre] += 1;
      const pseudo = `${p.genre} ${compteurs[p.genre]}`;
      dejaVus.set(cle, pseudo);
      this.versNom.set(pseudo, p.nom);
      this.versPseudo.push({
        motif: new RegExp(`${LIMITE_AVANT}${p.nom.replace(ECHAPPE, "\\$&")}${LIMITE_APRES}`, "giu"),
        pseudo,
      });
    }
  }

  /** Les faits calculés par l'API : seuls les noms de personnes sont remplacés (les montants restent). */
  masquer(texte: string): string {
    let sortie = texte;
    for (const { motif, pseudo } of this.versPseudo) sortie = sortie.replace(motif, pseudo);
    return sortie;
  }

  /** La question tapée par le patron : en plus, ni numéro de téléphone ni adresse électronique. */
  masquerQuestion(texte: string): string {
    return this.masquer(texte.replace(COURRIEL, "[adresse]").replace(TELEPHONE, "[numéro]"));
  }

  /** Remet les vrais noms dans un texte rendu par le modèle. */
  demasquer(texte: string): string {
    let sortie = texte;
    // « Agent 10 » avant « Agent 1 ».
    const pseudos = [...this.versNom.keys()].sort((a, b) => b.length - a.length);
    for (const pseudo of pseudos) {
      sortie = sortie.replace(
        new RegExp(`${LIMITE_AVANT}${pseudo}${LIMITE_APRES}`, "gu"),
        () => this.versNom.get(pseudo)!,
      );
    }
    return sortie;
  }

  /** Les noms réels qu'on masque (pour les tests et pour vérifier un envoi). */
  get noms(): string[] {
    return [...this.versNom.values()];
  }
}
