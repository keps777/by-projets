import { parseArgs } from "node:util";
import { executer } from "./banc";
import { nomPlanche } from "./config";
import { resume } from "./rapport";

const AIDE = `Banc de fidélité AfriMove : compare une planche docs/maquettes-v3/<X>.dc.html à l'écran de apps/web.

Usage
  pnpm fidelite <Planche>        compare une planche (ex. pnpm fidelite Main)
  pnpm fidelite --all            compare toutes les planches ; les écrans pas encore livrés sont listés « écran absent »

Options
  --app-url <url>     adresse de apps/web (défaut : FIDELITE_APP_URL ou config.json, http://localhost:5173)
  --route <chemin>    route de l'écran, pour une seule planche, sans passer par ecrans.json
  --scenario <nom>    scénario de démonstration (défaut : nom de la planche)
  --sortie <dossier>  où écrire maquette.png, app.png, diff.png et rapport.html (défaut : tools/fidelite/sortie)
  --maquettes <dir>   dossier des planches (défaut : docs/maquettes-v3)
  --strict            un écran absent fait échouer la commande
  -h, --help          cette aide

Code de sortie : 0 tout est conforme (ou absent), 1 au moins une planche dépasse son seuil ou le banc a échoué, 2 usage.
Seuils : seuils.json (3 % par défaut ; tout seuil propre à une planche exige une justification écrite).
Écrans : ecrans.json (planche → route dans apps/web).`;

async function main(): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        all: { type: "boolean" },
        "app-url": { type: "string" },
        route: { type: "string" },
        scenario: { type: "string" },
        sortie: { type: "string" },
        maquettes: { type: "string" },
        strict: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (e) {
    console.error(`${(e as Error).message}\n\n${AIDE}`);
    return 2;
  }
  const { values, positionals } = parsed;
  if (values.help) {
    console.log(AIDE);
    return 0;
  }
  if (!values.all && positionals.length === 0) {
    console.error(`Indiquez une planche ou --all.\n\n${AIDE}`);
    return 2;
  }
  if (values.all && positionals.length > 0) {
    console.error("--all et un nom de planche sont exclusifs.");
    return 2;
  }
  if ((values.route || values.scenario) && (values.all || positionals.length !== 1)) {
    console.error("--route et --scenario ne valent que pour une seule planche.");
    return 2;
  }
  const planches = values.all ? ("toutes" as const) : positionals.map(nomPlanche);
  try {
    const bilan = await executer({
      planches,
      ...(values["app-url"] ? { appUrl: values["app-url"] } : {}),
      ...(values.route ? { route: values.route } : {}),
      ...(values.scenario ? { scenario: values.scenario } : {}),
      ...(values.sortie ? { sortie: values.sortie } : {}),
      ...(values.maquettes ? { maquettes: values.maquettes } : {}),
      strict: values.strict ?? false,
      journal: (l) => console.log(l),
    });
    const r = resume(bilan.resultats);
    const absentes = bilan.resultats.filter((x) => x.statut === "absent");
    const autres = bilan.resultats.filter((x) => x.statut === "erreur");
    for (const x of autres) console.error(`ERREUR ${x.planche} : ${x.raison}`);
    for (const x of bilan.resultats.filter((y) => y.avertissements.length > 0)) {
      for (const a of x.avertissements) console.warn(`attention ${x.planche} : ${a}`);
    }
    if (absentes.length > 0) {
      console.log(`\nÉcran absent (${absentes.length}) :`);
      if (absentes.length > 12 && values.all) {
        const raisons = new Set(absentes.map((x) => x.raison));
        console.log(`  ${absentes.map((x) => x.planche).join(", ")}`);
        for (const raison of raisons) console.log(`  → ${raison}`);
      } else {
        for (const x of absentes) console.log(`  ${x.planche} : ${x.raison}`);
      }
    }
    console.log(
      `\n${bilan.resultats.length} planche(s) : ${r.ok} conforme(s), ${r.depasse} hors seuil, ${r.absent} écran(s) absent(s), ${r.erreur} erreur(s)`,
    );
    console.log(`Rapport : ${bilan.rapport}`);
    return bilan.code;
  } catch (e) {
    console.error(`Erreur : ${(e as Error).message}`);
    return 1;
  }
}

process.exitCode = await main();
