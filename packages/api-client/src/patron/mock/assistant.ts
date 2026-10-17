import { patron as c } from "@afrimove/contrats";
import { jourDecale, heure } from "@afrimove/fixtures";
import { ErreurHttp } from "../../infra/erreurs";
import { implementer } from "../../infra/scenarios";
import {
  OP_APPLIQUER_PROPOSITION,
  OP_CONVERSATION,
  OP_INSIGHTS,
  OP_QUESTION_ASSISTANT,
  OP_SIMULATION,
} from "../operations";
import { creerJournal, lireCommande } from "./contexte";
import type { ContributionMock, SourceFixtures } from "./contexte";
import { entier, montant } from "./lecture";

/** L'assistant du patron (planches Assistant et AssistantReponse) : insights, questions, simulations. */

const ACTIONS_CONNUES: Readonly<Record<string, Omit<c.ActionAssistant, "libelle">>> = {
  "Contrôle inopiné mardi": { id: "controle-inopine-mardi", type: "controle_inopine" },
  "Numéro obligatoire en cadence": {
    id: "cadence-numero-obligatoire",
    type: "regle_cadence_numero",
  },
  "Décaler le 10:00 à 09:15 dès lundi": { id: "decaler-1000-0915", type: "decaler_depart" },
  "Ajouter un départ mardi 17:00": { id: "ajouter-depart-mardi-1700", type: "ajouter_depart" },
  "Voir la ligne en détail": { id: "voir-ligne-dla-baf", type: "voir_ligne" },
};

function action(libelle: string): c.ActionAssistant {
  const connue = ACTIONS_CONNUES[libelle];
  if (!connue) throw new Error(`Action d'assistant inconnue dans la fixture : ${libelle}`);
  return { ...connue, libelle };
}

/** Le départ de 10:00 de Douala → Bafoussam (celui que l'assistant propose de décaler à 09:15). */
function departDe1000(src: SourceFixtures): string {
  return src.ecran("AnalysesLigne").donnees.departs.liste.find((d) => d.heure === "10:00")!
    ._departId;
}

function insights(src: SourceFixtures): c.InsightsAssistant {
  const d = src.ecran("Assistant").donnees;
  const visuel = src.ecran("Assistant").visuel["ecartsParJour"] as { ambre: readonly number[] };
  const total = /Total\s*([−-]\s*[\d  ]+)/.exec(d.fuite.explication);
  const remplissage = d.gain.simulation.flatMap((s) =>
    "remplis" in s
      ? [{ libelle: s.libelle, remplis: s.remplis as number, capacite: s.capacite as number }]
      : [],
  );
  const gain = d.gain.simulation.find((s) => "valeur" in s);
  return {
    fuites: [
      {
        id: "fuite-guichet-2",
        periodeJours: entier(d.fuite.periode),
        constat: d.fuite.constat,
        explication: d.fuite.explication,
        montantTotal: total ? entier(total[1]!) : null,
        joursConcernes: [...visuel.ambre],
        actions: d.fuite.actions.map(action),
      },
    ],
    gains: [
      {
        id: "gain-decaler-1000",
        constat: d.gain.constat,
        simulation: {
          scenarios: remplissage,
          gainMensuel: gain && "valeur" in gain ? montant(gain.valeur as string) : 0,
        },
        base: d.gain.base,
        action: action(d.gain.action),
      },
    ],
    questionsSuggerees: [...d.questions],
  };
}

function options(simulation: string): c.ReponseAssistant["simulation"] {
  const trouves = [...simulation.matchAll(/([+−-]\s*[\d,]+\s*M)\s*\/\s*mois à ([^·]+)/g)].map(
    (m) => ({ libelle: m[2]!.trim(), gainMensuel: montant(m[1]!) }),
  );
  return trouves.length > 0 ? { options: trouves } : null;
}

function echanges(src: SourceFixtures): c.ReponseAssistant[] {
  const e = src.ecran("AssistantReponse");
  const d = e.donnees;
  return d.echanges.map((x): c.ReponseAssistant => {
    const r = x.reponse as {
      resume: string;
      points?: readonly string[];
      actions?: readonly string[];
      sources?: string;
      simulation?: string;
    };
    return {
      question: x.question,
      repondueA: e.maintenant,
      dureeSecondes: entier(/(\d+)\s*s\b/.exec(d.detail)?.[1] ?? "0"),
      resume: r.resume,
      points: [...(r.points ?? [])],
      actions: (r.actions ?? []).map(action),
      sources: r.sources ?? null,
      simulation: r.simulation ? options(r.simulation) : null,
    };
  });
}

const normaliser = (t: string): string =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function mockAssistant(src: SourceFixtures): ContributionMock {
  const journal = creerJournal();
  const conversation: c.ReponseAssistant[] = echanges(src);
  const baseJours = entier(
    /(\d+) derniers jours/.exec(src.ecran("AssistantReponse").donnees.detail)?.[1] ?? "30",
  );
  const gain = insights(src).gains[0]!;

  const actionsConnues = (): Map<string, c.ActionAssistant> => {
    const m = new Map<string, c.ActionAssistant>();
    const tout = [
      ...insights(src).fuites.flatMap((f) => f.actions),
      ...insights(src).gains.map((g) => g.action),
      ...conversation.flatMap((r) => r.actions),
    ];
    for (const a of tout) m.set(a.id, a);
    return m;
  };

  return {
    operations: [
      implementer(OP_INSIGHTS, () => insights(src)),
      implementer(OP_CONVERSATION, () => ({
        id: "conversation-1",
        baseJours,
        echanges: conversation,
      })),
      implementer(OP_QUESTION_ASSISTANT, ({ question }, ctx) => {
        const connue = conversation.find((r) => normaliser(r.question) === normaliser(question));
        const reponse: c.ReponseAssistant = connue
          ? { ...connue, repondueA: ctx.horloge.iso() }
          : {
              question,
              repondueA: ctx.horloge.iso(),
              dureeSecondes: 4,
              resume:
                "Je n'ai pas de réponse préparée pour cette question dans la démonstration. Les questions suggérées sont disponibles.",
              points: [],
              actions: [],
              sources: null,
              simulation: null,
            };
        if (!connue) conversation.push(reponse);
        return reponse;
      }),
      implementer(OP_SIMULATION, (demande): c.ResultatSimulation => {
        const base = gain.base;
        if (
          demande.type === "horaire" &&
          demande.departId === departDe1000(src) &&
          demande.nouvelleHeure === "09:15"
        ) {
          return { demande, simulation: gain.simulation, base };
        }
        if (demande.type === "prix" && demande.nouveauPrix === 3500) {
          const option = conversation
            .flatMap((r) => r.simulation?.options ?? [])
            .find((o) => o.libelle === "3 500");
          return {
            demande,
            simulation: { scenarios: [], gainMensuel: option?.gainMensuel ?? 0 },
            base,
          };
        }
        throw new ErreurHttp(
          422,
          "Ce scénario ne contient que les simulations préparées par l'assistant",
          "SIMULATION_NON_PREPAREE",
        );
      }),
      implementer(OP_APPLIQUER_PROPOSITION, (params, ctx): c.PropositionAppliquee => {
        const cmd = lireCommande(c.AppliquerPropositionSchema, params);
        const action = actionsConnues().get(cmd.actionId);
        if (!action) {
          throw new ErreurHttp(
            404,
            `Proposition « ${cmd.actionId} » inconnue`,
            "PROPOSITION_INCONNUE",
          );
        }
        const lundi = heure("00:00", jourDecale(6));
        return {
          ...journal(cmd.signature.signeA),
          actionId: action.id,
          effetA: action.type === "decaler_depart" ? lundi : ctx.horloge.iso(),
        };
      }),
    ],
    flux: [],
  };
}
