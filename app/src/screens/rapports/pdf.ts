// PDF du rapport, sans bibliothèque : une page HTML imprimable (A4, s'adapte au contenu) ouverte dans la boîte d'impression
// du téléphone, d'où l'on choisit « Enregistrer en PDF » ou le partage. Rien ne quitte l'appareil.
import { formaterMesure, type Langue, type MesureRapport } from '@core/rapport.ts';

export interface LignePdf { n: number; code: string; libelle: string; mesures: MesureRapport[]; ratio: number | null; couleur: string | null }
export interface DocumentPdf { titre: string; sousTitre: string; nom: string; langue: Langue; lignes: LignePdf[]; genereLe: string }

const echapper = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function etat(r: number | null, langue: Langue): { texte: string; classe: string } {
  if (r == null) return { texte: '—', classe: 'neutre' };
  if (r >= 1) return { texte: langue === 'fr' ? 'Atteint' : 'Reached', classe: 'bon' };
  if (r > 0) return { texte: `${Math.round(r * 100)} %`, classe: 'moyen' };
  return { texte: langue === 'fr' ? 'À reprendre' : 'Not yet', classe: 'mauvais' };
}

/** Page HTML autonome et imprimable : un tableau d'une ligne par point, qui continue sur d'autres pages si besoin. */
export function htmlImprimable(doc: DocumentPdf): string {
  const t = doc.langue === 'fr' ? { point: 'Point', mesures: 'Fait / attendu', etat: 'État', atteints: 'points atteints' } : { point: 'Item', mesures: 'Done / expected', etat: 'Status', atteints: 'items reached' };
  const atteints = doc.lignes.filter((l) => l.ratio != null && l.ratio >= 1).length;
  const lignes = doc.lignes.map((l) => {
    const e = etat(l.ratio, doc.langue);
    const mesures = l.mesures.length ? l.mesures.map((m) => `<span class="m">${echapper(formaterMesure(m, doc.langue))}</span>`).join('') : '<span class="m">—</span>';
    return `<tr><td class="n"><span class="pastille" style="background:${echapper(l.couleur ?? '#9D8CFF')}"></span>${l.n}</td>`
      + `<td><b>${echapper(l.code)}</b><br><small>${echapper(l.libelle)}</small></td><td class="mes">${mesures}</td><td class="etat ${e.classe}">${e.texte}</td></tr>`;
  }).join('');
  return `<!doctype html><html lang="${doc.langue}"><head><meta charset="utf-8"><title>${echapper(doc.titre)}</title><style>
@page { size: A4; margin: 16mm 14mm; }
* { box-sizing: border-box; }
body { margin: 0; font: 11pt/1.4 -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #16171b; background: #fff; }
header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #16171b; padding-bottom: 8pt; margin-bottom: 12pt; }
h1 { margin: 0; font-size: 20pt; letter-spacing: -0.01em; }
.sous { color: #5e6068; font-size: 10pt; }
.score { text-align: right; font-size: 10pt; color: #5e6068; }
.score b { display: block; font-size: 18pt; color: #16171b; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.06em; color: #5e6068; border-bottom: 1px solid #e3e1db; padding: 4pt 6pt; }
td { padding: 6pt; border-bottom: 1px solid #e3e1db; vertical-align: top; }
tr { break-inside: avoid; }
td.n { width: 28pt; font-family: ui-monospace, Menlo, monospace; white-space: nowrap; }
.pastille { display: inline-block; width: 7pt; height: 7pt; border-radius: 50%; margin-right: 4pt; }
small { color: #5e6068; }
td.mes .m { display: inline-block; font-family: ui-monospace, Menlo, monospace; font-size: 9.5pt; background: #f2f1ed; border-radius: 4pt; padding: 1pt 5pt; margin: 0 4pt 3pt 0; }
td.etat { width: 64pt; font-weight: 600; font-size: 9.5pt; white-space: nowrap; }
.bon { color: #1e7f4f; } .moyen { color: #8a5300; } .mauvais { color: #c2362b; } .neutre { color: #8a8c93; }
footer { margin-top: 14pt; font-size: 8pt; color: #8a8c93; }
</style></head><body>
<header><div><h1>${echapper(doc.titre)}</h1><div class="sous">${echapper(doc.sousTitre)} · ${echapper(doc.nom)}</div></div>
<div class="score"><b>${atteints}/${doc.lignes.length}</b>${t.atteints}</div></header>
<table><thead><tr><th>#</th><th>${t.point}</th><th>${t.mesures}</th><th>${t.etat}</th></tr></thead><tbody>${lignes}</tbody></table>
<footer>Luther Life · ${echapper(doc.genereLe)}</footer>
</body></html>`;
}

/** Ouvre la boîte d'impression sur la page (cadre caché) ; retourne faux si le navigateur ne le permet pas. */
export function imprimer(html: string): boolean {
  try {
    const cadre = document.createElement('iframe');
    cadre.setAttribute('aria-hidden', 'true');
    cadre.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0';
    document.body.appendChild(cadre);
    const fen = cadre.contentWindow;
    if (!fen) { cadre.remove(); return false; }
    fen.document.open();
    fen.document.write(html);
    fen.document.close();
    const lancer = () => {
      try { fen.focus(); fen.print(); } finally { setTimeout(() => cadre.remove(), 60_000); }
    };
    if (fen.document.readyState === 'complete') setTimeout(lancer, 50); else fen.addEventListener('load', lancer, { once: true });
    return true;
  } catch { return false; }
}
