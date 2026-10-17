import { Injectable } from "@nestjs/common";
import { remplissagePct, vivants } from "../analyses/agregats";
import { AnalysesService } from "../analyses/analyses.service";
import { francs, nombre } from "../analyses/format";
import { dateCourte } from "../analyses/periodes";
import { nomConcurrent } from "../analyses/regles";
import { BASE_JOURS, concurrentProche, series } from "../analyses/simulation";
import { CONCURRENT_RECENT_JOURS } from "./moteur";

/** Même forme que `ContexteQuestion` de `apps/api/src/rapport/modele.ts` (le test de compatibilité le vérifie). */
export interface ContexteQuestionRapport {
  compagnieId: string;
  jour: string;
  departFaible: { heure: string; remplissagePct: number } | null;
}

/** Même forme que `QuestionSuggeree` du module rapport. */
export interface QuestionRapport {
  question: string;
  reponse: string;
}

/**
 * La question que le rapport du soir suggère de poser à l'assistant, avec sa réponse déjà préparée
 * (« Pourquoi le 09:30 part si vide ? »). Réponse des règles, sans modèle de langage : le rapport part à
 * heure fixe et ne doit dépendre d'aucun service externe.
 *
 * À brancher dans le module rapport : `{ provide: AssistantRapport, useExisting: AssistantRapportMoteur }`
 * (voir `apps/api/src/assistant/README.md`).
 */
@Injectable()
export class AssistantRapportMoteur {
  constructor(private readonly analyses: AnalysesService) {}

  async suggerer(contexte: ContexteQuestionRapport): Promise<QuestionRapport | null> {
    if (contexte.departFaible === null) return null;
    const { heure, remplissagePct: duJour } = contexte.departFaible;
    const ctx = await this.analyses.contexte(contexte.compagnieId);

    // Parmi les départs à cette heure, celui qui remplit le moins sur les 30 derniers jours.
    const faits = vivants(ctx.departs);
    const candidats = series(faits.filter((d) => d.heure === heure))
      .filter((s) => s.occurrences.length > 0)
      .map((s) => ({ serie: s, pct: remplissagePct(s.occurrences) }))
      .sort((a, b) => a.pct - b.pct);
    const pire = candidats[0];
    if (!pire) return null;

    const ligne = ctx.lignes.find((l) => l.id === pire.serie.ligneId);
    const autres = faits.filter(
      (d) =>
        d.ligneId === pire.serie.ligneId && (d.heure !== heure || d.classe !== pire.serie.classe),
    );
    const dernier = pire.serie.occurrences[pire.serie.occurrences.length - 1]!;
    const phrases = [
      `Le ${heure}${ligne ? ` de ${ligne.nom}` : ""} remplit à ${nombre(Math.round(pire.pct))} % en moyenne sur ${BASE_JOURS} jours (${pire.serie.occurrences.length} départs)` +
        (autres.length > 0
          ? `, contre ${nombre(Math.round(remplissagePct(autres)))} % pour tes autres départs de la ligne.`
          : "."),
    ];
    const concurrent = ligne ? concurrentProche(ctx.offres, ligne.code, heure, dernier.prix) : null;
    if (concurrent && concurrent.jours >= CONCURRENT_RECENT_JOURS) {
      phrases.push(
        `${nomConcurrent(ctx.nommerConcurrents, concurrent.compagnie)} part à ${concurrent.heure} à ${francs(concurrent.prix)}, ${francs(dernier.prix - concurrent.prix)} de moins que toi.`,
      );
    }
    phrases.push(
      `Le ${dateCourte(contexte.jour)}, il est parti à ${nombre(Math.round(duJour))} %.`,
    );
    return { question: `Pourquoi le ${heure} part si vide ?`, reponse: phrases.join(" ") };
  }
}
