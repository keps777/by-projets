import type { voyageur as c } from "@afrimove/contrats";
import { analyserNumeroBillet } from "@afrimove/domain";

/** Mise en forme de l'aperçu « sans internet » : ce qui sépare la réponse de l'API de ce que montre la planche. */

type Echanges = c.ApercuSansInternet["whatsapp"]["echanges"];

/**
 * Texte de l'afficheur USSD : une ligne du contrat par ligne d'écran. Dans la planche, la réponse tapée
 * (« Repondre: 1 ») est séparée du menu par une ligne vide ; elle est ajoutée ici si la réponse du serveur ne
 * l'a pas déjà.
 */
export function texteUssd(lignes: readonly string[]): string {
  const sortie: string[] = [];
  lignes.forEach((ligne, i) => {
    const precedente = i > 0 ? lignes[i - 1] : undefined;
    if (/^Repondre\b/.test(ligne) && precedente !== undefined && precedente !== "") {
      sortie.push("");
    }
    sortie.push(ligne);
  });
  return sortie.join("\n");
}

/** Une ligne d'un message : texte simple, ou réponse proposée (« Oui · Changer de siège »). */
export interface LigneMessage {
  texte: string;
  /** Début de ligne mis en avant (ambre, gras) : la réponse proposée au voyageur. */
  reponse?: string;
  /** Reste de la ligne après `reponse` (séparateur compris). */
  suite?: string;
}

export interface MessageVue {
  de: Echanges[number]["de"];
  lignes: LigneMessage[];
  /** Message de confirmation (« ✓ Payé… »), écrit en vert. */
  confirmation: boolean;
}

/**
 * Les messages de la conversation, prêts à afficher :
 * - un message AfriMove dont la première ligne commence par « ✓ » est une confirmation (vert) ;
 * - une ligne « A · B » placée juste après une question (ligne finissant par « ? ») propose des réponses :
 *   « A » est mis en avant (ambre, gras), comme « Oui » dans la planche.
 */
export function messagesVue(echanges: Echanges): MessageVue[] {
  return echanges.map((echange) => {
    const lignes = echange.lignes.map((texte, i): LigneMessage => {
      const precedente = i > 0 ? echange.lignes[i - 1] : undefined;
      const separateur = texte.indexOf(" · ");
      if (echange.de === "afrimove" && precedente?.endsWith("?") === true && separateur > 0) {
        return { texte, reponse: texte.slice(0, separateur), suite: texte.slice(separateur) };
      }
      return { texte };
    });
    return {
      de: echange.de,
      lignes,
      confirmation: echange.de === "afrimove" && (echange.lignes[0]?.startsWith("✓") ?? false),
    };
  });
}

/** Numéro de billet cité dans la conversation (« Billet ALP-DLA-270106-0031, code 5582 »), le dernier cité. */
export function billetCite(echanges: Echanges): string | null {
  let trouve: string | null = null;
  for (const echange of echanges) {
    for (const ligne of echange.lignes) {
      for (const mot of ligne.split(/[\s,.;:()«»]+/)) {
        if (analyserNumeroBillet(mot) !== null) trouve = mot;
      }
    }
  }
  return trouve;
}

/** Rien à montrer : ni écran USSD ni conversation. */
export function apercuVide(apercu: c.ApercuSansInternet): boolean {
  return apercu.ussd.lignes.length === 0 && apercu.whatsapp.echanges.length === 0;
}
