import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Faux apps/web pour tester la chaîne sans écran réel.
 *  - /ecran?scenario=Factice[&variante=altere|leger] : reconstruit la planche Factice en JS, avec la
 *    date et l'heure lues sur l'horloge (new Date()) et le badge « TOUCHE 2 » seulement si le flag
 *    conception est actif (paramètre d'URL ?conception=1 ou localStorage) : exactement ce que fera la vraie app.
 *  - /sans-flag : comme /ecran mais sans jamais afficher le badge (flag ignoré).
 *  - /large : la planche Large.
 *  - /copie/<Planche> : copie d'une vraie planche de `dossier`, support.js inliné (pour comparer une planche à elle-même).
 *  - /interdit : répond 404 (écran absent).
 */
export type EcranFactice = { url: string; fermer: () => Promise<void> };

const PAGE_FACTICE = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Factice</title>
<style>body{margin:0}</style></head><body><div id="racine"></div><script>
const q = new URLSearchParams(location.search);
const variante = q.get("variante");
let flag = q.get("conception") === "1";
try { flag = flag || localStorage.getItem("afrimove.conception") === "1"; } catch (e) {}
const d = new Date();
const date = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
const heure = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(d);
const cta = variante === "altere" ? "#6FA8FF" : "#FF6A1F";
const haut = variante === "altere" ? 420 : 120;
const trait = variante === "leger" ? '<div style="position:absolute;left:0;top:0;width:390px;height:6px;background:#43E39B"></div>' : "";
document.getElementById("racine").innerHTML =
  '<div style="position:relative;width:390px;height:844px;box-sizing:border-box;display:flex;flex-direction:column;gap:12px;padding:20px 16px;background:#0B1019;color:#F4F0E8;font-family:Arial,sans-serif;overflow:hidden">' + trait +
  '<span style="font-size:12px;color:#B5BDCB">' + date + ' · ' + heure + '</span>' +
  '<span style="font-size:22px;font-weight:700">Départs en direct</span>' +
  (flag ? '<span style="align-self:flex-start;font-size:10px;letter-spacing:.12em;padding:6px 9px;border-radius:999px;background:#1B2435;color:#FFB547">TOUCHE 2</span>' : '<span style="height:25px"></span>') +
  '<div style="height:120px;border-radius:16px;background:#141B28;border:1px solid #273247;padding:14px;font-size:14px">Douala Akwa → Yaoundé Mvan</div>' +
  '<div style="height:' + haut + 'px;border-radius:16px;background:' + cta + ';color:#0B1019;padding:14px;font-size:14px;font-weight:700">Acheter un billet</div></div>';
</script></body></html>`;

const PAGE_LARGE = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Large</title><style>body{margin:0}</style></head>
<body><div style="min-height:100vh;box-sizing:border-box;background:#050810;color:#F4F0E8;font-family:Arial,sans-serif;padding:24px">Salle de contrôle factice</div></body></html>`;

export async function demarrerEcranFactice(dossierMaquettes?: string): Promise<EcranFactice> {
  const serveur: Server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    const html = (corps: string) =>
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(corps);
    if (u.pathname === "/ecran") return html(PAGE_FACTICE);
    if (u.pathname === "/sans-flag") {
      // App qui ignore le flag conception : le badge n'apparaît jamais.
      return html(
        PAGE_FACTICE.replace('q.get("conception") === "1"', "false").replace(
          'localStorage.getItem("afrimove.conception") === "1"',
          "false",
        ),
      );
    }
    if (u.pathname === "/large") return html(PAGE_LARGE);
    if (u.pathname.startsWith("/copie/") && dossierMaquettes) {
      const nom = u.pathname.slice("/copie/".length).replace(/[^A-Za-z0-9]/g, "");
      const support = readFileSync(new URL("../support/support.js", import.meta.url), "utf8");
      const page = readFileSync(join(dossierMaquettes, `${nom}.dc.html`), "utf8").replace(
        /<script src="\.\/support\.js"><\/script>/,
        () => `<script>${support}</script>`,
      );
      return html(page);
    }
    res.writeHead(404).end("introuvable");
  });
  await new Promise<void>((ok) => serveur.listen(0, "127.0.0.1", ok));
  const { port } = serveur.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    fermer: () => new Promise<void>((ok) => serveur.close(() => ok())),
  };
}
