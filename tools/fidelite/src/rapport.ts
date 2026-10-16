export type Statut = "ok" | "depasse" | "absent" | "erreur";

export type ResultatPlanche = {
  planche: string;
  statut: Statut;
  largeur: number;
  hauteur: number;
  seuil: number;
  /** Justification écrite du seuil quand il diffère du seuil par défaut. */
  justification: string | null;
  pourcentage?: number;
  pixelsDifferents?: number;
  pixelsTotal?: number;
  urlApp?: string;
  /** Pour « absent » et « erreur » : pourquoi. */
  raison?: string;
  avertissements: string[];
  /** Dossier des PNG, relatif au dossier de sortie. */
  dossier?: string;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const LIBELLES: Record<Statut, string> = {
  ok: "conforme",
  depasse: "écart trop grand",
  absent: "écran absent",
  erreur: "erreur du banc",
};

export function resume(resultats: ResultatPlanche[]): Record<Statut, number> {
  const r: Record<Statut, number> = { ok: 0, depasse: 0, absent: 0, erreur: 0 };
  for (const x of resultats) r[x.statut]++;
  return r;
}

/** Rapport HTML autonome (images en chemins relatifs) : maquette / app / diff côte à côte. */
export function genererRapport(resultats: ResultatPlanche[], horodatage: string): string {
  const r = resume(resultats);
  const lignes = resultats
    .map((x) => {
      const pct = x.pourcentage !== undefined ? `${x.pourcentage.toFixed(2)} %` : "–";
      const lien = x.dossier
        ? `<a href="#${esc(x.planche)}">${esc(x.planche)}</a>`
        : esc(x.planche);
      return `<tr class="${x.statut}"><td>${lien}</td><td>${LIBELLES[x.statut]}</td><td class="n">${pct}</td><td class="n">${x.seuil} %</td><td>${esc(x.raison ?? "")}</td></tr>`;
    })
    .join("\n");
  const cartes = resultats
    .filter((x) => x.dossier)
    .map((x) => {
      const d = esc(x.dossier ?? "");
      const pct = (x.pourcentage ?? 0).toFixed(2);
      return `<section id="${esc(x.planche)}" class="carte ${x.statut}">
  <h2>${esc(x.planche)} <span class="pastille ${x.statut}">${LIBELLES[x.statut]}</span></h2>
  <p class="meta"><b>${pct} %</b> de pixels différents (${x.pixelsDifferents} / ${x.pixelsTotal}) · seuil ${x.seuil} % · ${x.largeur}×${x.hauteur} · <code>${esc(x.urlApp ?? "")}</code></p>
  ${x.justification ? `<p class="just">Seuil propre à cette planche, justification : ${esc(x.justification)}</p>` : ""}
  ${x.avertissements.map((a) => `<p class="avert">Attention : ${esc(a)}</p>`).join("\n  ")}
  <div class="trio">
    <figure><figcaption>Maquette</figcaption><a href="${d}/maquette.png"><img src="${d}/maquette.png" alt="maquette ${esc(x.planche)}"></a></figure>
    <figure><figcaption>App</figcaption><a href="${d}/app.png"><img src="${d}/app.png" alt="app ${esc(x.planche)}"></a></figure>
    <figure><figcaption>Différence</figcaption><a href="${d}/diff.png"><img src="${d}/diff.png" alt="diff ${esc(x.planche)}"></a></figure>
  </div>
</section>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Banc de fidélité AfriMove</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{color-scheme:dark}
body{margin:0;background:#0B1019;color:#F4F0E8;font:14px/1.45 system-ui,sans-serif;padding:24px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:0 0 6px}
a{color:#FFB547}code{font-family:ui-monospace,monospace;font-size:12px;color:#B5BDCB}
.sous{color:#B5BDCB;margin:0 0 16px}
table{border-collapse:collapse;margin:12px 0 28px;width:100%;max-width:1000px}
th,td{text-align:left;padding:6px 10px;border-bottom:1px solid #273247}th{color:#7F8A9E;font-weight:600}
td.n{text-align:right;font-variant-numeric:tabular-nums}
tr.ok td:nth-child(2){color:#43E39B}tr.depasse td:nth-child(2),tr.erreur td:nth-child(2){color:#FF5C5C}tr.absent td:nth-child(2){color:#7F8A9E}
.carte{background:#141B28;border:1px solid #273247;border-radius:16px;padding:16px;margin:0 0 20px}
.carte.depasse,.carte.erreur{border-color:#FF5C5C}
.pastille{font-size:11px;padding:2px 8px;border-radius:999px;background:#1B2435;margin-left:8px;vertical-align:middle}
.pastille.ok{color:#43E39B}.pastille.depasse,.pastille.erreur{color:#FF5C5C}
.meta{margin:0 0 6px;color:#B5BDCB}.just{margin:0 0 6px;color:#FFB547}.avert{margin:0 0 6px;color:#FFB547}
.trio{display:flex;gap:12px;overflow-x:auto;align-items:flex-start}
figure{margin:0;flex:1 1 0;min-width:240px}figcaption{color:#7F8A9E;font-size:12px;margin-bottom:4px}
img{width:100%;height:auto;display:block;border:1px solid #273247;background:#050810}
</style></head><body>
<h1>Banc de fidélité maquette ↔ app</h1>
<p class="sous">${esc(horodatage)} · horloge figée au 05/01/2027 07:38 (Africa/Douala) · ${resultats.length} planche(s) : ${r.ok} conforme(s), ${r.depasse} hors seuil, ${r.absent} écran(s) absent(s), ${r.erreur} erreur(s)</p>
<table><thead><tr><th>Planche</th><th>Résultat</th><th>Écart</th><th>Seuil</th><th>Détail</th></tr></thead><tbody>
${lignes}
</tbody></table>
${cartes}
</body></html>
`;
}
