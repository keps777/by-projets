import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  DOSSIER_OUTIL,
  HORLOGE_ISO,
  chargerConfig,
  chargerEcrans,
  chargerSeuils,
  seuilPour,
  type Config,
  type Ecran,
} from "./config";
import { capturerApp, capturerMaquette, ouvrirNavigateur } from "./capture";
import { comparer } from "./comparer";
import { listerPlanches, servirMaquettes, tailleDePlanche } from "./maquettes";
import { genererRapport, resume, type ResultatPlanche } from "./rapport";

export type Options = {
  /** Planches à comparer ; "toutes" pour --all. */
  planches: string[] | "toutes";
  appUrl?: string;
  /** Pour une seule planche : route de l'écran, sans passer par ecrans.json. */
  route?: string;
  scenario?: string;
  maquettes?: string;
  sortie?: string;
  seuils?: string;
  ecrans?: string;
  dossierOutil?: string;
  /** Écran absent = échec (par défaut, simple information). */
  strict?: boolean;
  journal?: (ligne: string) => void;
};

export type Bilan = {
  resultats: ResultatPlanche[];
  rapport: string;
  /** 0 = tout va bien, 1 = au moins une planche hors seuil/en erreur (ou absente en mode strict). */
  code: 0 | 1;
};

export function construireUrlApp(
  appUrl: string,
  route: string,
  scenario: string,
  params: Config["params"],
): string {
  const u = new URL(route, appUrl.endsWith("/") ? appUrl : `${appUrl}/`);
  u.searchParams.set(params.scenario, scenario);
  u.searchParams.set(params.conception, "1");
  u.searchParams.set(params.horloge, HORLOGE_ISO);
  return u.toString();
}

async function appRepond(appUrl: string): Promise<string | null> {
  try {
    await fetch(appUrl, { signal: AbortSignal.timeout(4000), redirect: "manual" });
    return null;
  } catch (e) {
    const cause = (e as { cause?: { code?: string } }).cause?.code ?? (e as Error).message;
    return `app injoignable à ${appUrl} (${cause})`;
  }
}

export async function executer(options: Options): Promise<Bilan> {
  const log = options.journal ?? (() => undefined);
  const outil = options.dossierOutil ?? DOSSIER_OUTIL;
  const config = chargerConfig(outil);
  const appUrl = options.appUrl ?? process.env["FIDELITE_APP_URL"] ?? config.appUrl;
  const dossierMaquettes = resolve(options.maquettes ?? config.maquettes);
  const sortie = resolve(options.sortie ?? config.sortie);
  const seuils = chargerSeuils(options.seuils ?? join(outil, "seuils.json"));
  const ecrans = chargerEcrans(options.ecrans ?? join(outil, "ecrans.json"));

  const disponibles = listerPlanches(dossierMaquettes);
  const demandees = options.planches === "toutes" ? disponibles : options.planches;
  for (const p of demandees) {
    if (!disponibles.includes(p)) {
      throw new Error(`Planche inconnue : "${p}" (pas de ${p}.dc.html dans ${dossierMaquettes})`);
    }
  }
  for (const p of Object.keys(seuils.planches)) {
    if (!disponibles.includes(p)) throw new Error(`seuils.json : la planche "${p}" n'existe pas`);
  }

  const resultats: ResultatPlanche[] = [];
  const aCapturer: { planche: string; ecran: Ecran }[] = [];
  for (const planche of demandees) {
    const t = tailleDePlanche(dossierMaquettes, planche);
    const { seuil, justification } = seuilPour(seuils, planche);
    const base = {
      planche,
      largeur: t.largeur,
      hauteur: t.hauteur,
      seuil,
      justification,
      avertissements: [],
    };
    const declare: Ecran | undefined =
      options.route && demandees.length === 1
        ? { route: options.route, ...(options.scenario ? { scenario: options.scenario } : {}) }
        : ecrans[planche];
    if (!declare) {
      resultats.push({
        ...base,
        statut: "absent",
        raison: "non déclaré dans ecrans.json (aucune route dans apps/web)",
      });
      continue;
    }
    aCapturer.push({
      planche,
      ecran: options.scenario ? { ...declare, scenario: options.scenario } : declare,
    });
  }

  if (aCapturer.length > 0) {
    const injoignable = await appRepond(appUrl);
    if (injoignable) {
      for (const { planche } of aCapturer) {
        const t = tailleDePlanche(dossierMaquettes, planche);
        const { seuil, justification } = seuilPour(seuils, planche);
        resultats.push({
          planche,
          largeur: t.largeur,
          hauteur: t.hauteur,
          seuil,
          justification,
          avertissements: [],
          statut: "absent",
          raison: injoignable,
        });
      }
    } else {
      await capturerTout(aCapturer, {
        config,
        appUrl,
        dossierMaquettes,
        sortie,
        seuils,
        resultats,
        log,
      });
    }
  }

  // Ordre stable : celui des planches demandées.
  resultats.sort((a, b) => demandees.indexOf(a.planche) - demandees.indexOf(b.planche));
  mkdirSync(sortie, { recursive: true });
  const rapport = join(sortie, "rapport.html");
  writeFileSync(rapport, genererRapport(resultats, new Date().toISOString()));
  writeFileSync(join(sortie, "resultats.json"), JSON.stringify(resultats, null, 2) + "\n");

  const r = resume(resultats);
  const code = r.depasse + r.erreur > 0 || (options.strict && r.absent > 0) ? 1 : 0;
  return { resultats, rapport, code };
}

async function capturerTout(
  liste: { planche: string; ecran: Ecran }[],
  c: {
    config: Config;
    appUrl: string;
    dossierMaquettes: string;
    sortie: string;
    seuils: ReturnType<typeof chargerSeuils>;
    resultats: ResultatPlanche[];
    log: (l: string) => void;
  },
): Promise<void> {
  const serveur = await servirMaquettes(c.dossierMaquettes);
  const navigateur = await ouvrirNavigateur();
  try {
    for (const { planche, ecran } of liste) {
      const t = tailleDePlanche(c.dossierMaquettes, planche);
      const { seuil, justification } = seuilPour(c.seuils, planche);
      const base = { planche, largeur: t.largeur, hauteur: t.hauteur, seuil, justification };
      const urlApp = construireUrlApp(
        c.appUrl,
        ecran.route,
        ecran.scenario ?? planche,
        c.config.params,
      );
      try {
        const app = await capturerApp(navigateur, c.config, urlApp, t, ecran.attente);
        if (app.etat === "absent") {
          c.resultats.push({
            ...base,
            avertissements: [],
            statut: "absent",
            raison: app.raison,
            urlApp,
          });
          continue;
        }
        const maquette = await capturerMaquette(
          navigateur,
          c.config,
          `${serveur.url}/${planche}.dc.html`,
          t,
        );
        const avertissements = [...maquette.avertissements, ...app.capture.avertissements];
        // Badge « TOUCHE n » : si la planche en montre un, l'app doit l'afficher (flag conception actif).
        if (/TOUCHE\s*\d/.test(maquette.texte) && !/TOUCHE\s*\d/.test(app.capture.texte)) {
          avertissements.push(
            "la maquette montre un badge « TOUCHE n » absent de l'app : le flag conception n'est pas pris en compte (paramètre d'URL ou localStorage)",
          );
        }
        const cmp = comparer(maquette.png, app.capture.png);
        const dossier = planche;
        mkdirSync(join(c.sortie, dossier), { recursive: true });
        writeFileSync(join(c.sortie, dossier, "maquette.png"), maquette.png);
        writeFileSync(join(c.sortie, dossier, "app.png"), app.capture.png);
        writeFileSync(join(c.sortie, dossier, "diff.png"), cmp.diff);
        const statut = cmp.pourcentage <= seuil ? "ok" : "depasse";
        c.log(
          `${planche} : ${cmp.pourcentage.toFixed(2)} % (seuil ${seuil} %) ${statut === "ok" ? "OK" : "TROP DE DIFFÉRENCE"}`,
        );
        c.resultats.push({
          ...base,
          statut,
          pourcentage: cmp.pourcentage,
          pixelsDifferents: cmp.pixelsDifferents,
          pixelsTotal: cmp.pixelsTotal,
          urlApp,
          avertissements,
          dossier,
        });
      } catch (e) {
        c.resultats.push({
          ...base,
          avertissements: [],
          statut: "erreur",
          raison: (e as Error).message.split("\n")[0] ?? "erreur",
          urlApp,
        });
      }
    }
  } finally {
    await navigateur.close();
    await serveur.fermer();
  }
}
