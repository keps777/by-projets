// (n) À 320 px de large, aucune page déclarée dans un `routes.ts` ne déborde horizontalement : chaque route est ouverte avec un rôle qui y a droit.
import { readdirSync, readFileSync } from 'node:fs';
import { aller, expect, ouvrir, sansDebordement, test } from './aide';

const PERSONNE: Record<string, string> = {
  voyageur: 'p-aicha', guichet: 'p-fatou', quai: 'p-ibrahim', chauffeur: 'p-emile', convoyeur: 'p-youssouf', controleur: 'p-clarisse', superviseur: 'p-abdou',
  patron: 'p-luther', comptable: 'p-nadege', relais: 'p-mado', livreur: 'p-samuel', conducteur: 'p-moussa', vendeur: 'p-brigitte'
};
/** Routes déclarées : chemin + premier rôle autorisé (ou voyageuse pour une page publique), lues dans `src/apps/<nom>/routes.ts`. */
function routes(): { chemin: string; role: string }[] {
  const res: { chemin: string; role: string }[] = [];
  for (const dossier of readdirSync('src/apps')) {
    let texte = ''; try { texte = readFileSync(`src/apps/${dossier}/routes.ts`, 'utf8'); } catch { continue; }
    const rolesDuFichier = /const roles(?:: [^=]+)? = \[([^\]]*)\]/.exec(texte)?.[1], agents = /const AGENTS = \[([^\]]*)\]/.exec(texte)?.[1];
    const premier = (liste?: string) => /'([a-z]+)'/.exec(liste ?? '')?.[1];
    for (const ligne of texte.split('\n')) {
      const chemin = /chemin: '([^']+)'/.exec(ligne)?.[1]; if (!chemin) continue;
      const direct = /roles: \[([^\]]*)\]/.exec(ligne)?.[1];
      const role = (direct && premier(direct)) || (/roles: patron/.test(ligne) ? 'patron' : '') || (/roles: QUAI/.test(ligne) ? 'quai' : '') || (/\.\.\.AGENTS/.test(ligne) ? premier(agents) : '') || (/\broles\b/.test(ligne) && !direct ? premier(rolesDuFichier) : '') || (/\.\.\.siege/.test(ligne) ? 'patron' : '') || 'voyageur';
      res.push({ chemin: chemin.replace(/:[a-z]+/g, '1'), role: role ?? 'voyageur' });
    }
  }
  return res;
}
/** Paramètres qui donnent à la page un vrai contenu plutôt qu'un état vide. */
const AVEC_CONTEXTE: Record<string, string> = {
  '/siege': '?depart=d-2026-11-04-FX-Classique-mvan-aller-0615', '/paiement': '?depart=d-2026-11-04-FX-Classique-mvan-aller-0615', '/pass': '?billet=b-aicha1', '/pass/annule': '?billet=b-aicha1', '/pass/hors-ligne': '?billet=b-aicha1',
  '/colis/suivi': '?colis=col-1', '/livraison': '?colis=col-1', '/patron/gare': '?gare=mvan', '/patron/personne': '?personne=p-fatou', '/assistant/reponse': '?q=bilan', '/superviseur/valider': '', '/siege/config/ligne': '?ligne=l-BX-Classique-mvan-aller',
  '/siege/config/personne': '?personne=p-fatou', '/siege/analyses/ligne': '?ligne=l-BX-Classique-mvan-aller', '/siege/analyses/bus': '?bus=bus-BX-C1', '/vente': '', '/litige': '?billet=b-aicha1'
};
const parRole = new Map<string, string[]>();
for (const r of routes()) parRole.set(r.role, [...(parRole.get(r.role) ?? []), r.chemin]);

test.use({ viewport: { width: 320, height: 640 } });
test('on a bien trouvé les routes à contrôler', () => { expect([...parRole.values()].flat().length).toBeGreaterThan(90); expect(parRole.get('voyageur')!.length).toBeGreaterThan(40); });

for (const [role, chemins] of parRole) {
  test(`(n) 320 px · ${role} : ${chemins.length} pages sans débordement horizontal`, async ({ page }) => {
    await ouvrir(page, chemins[0] + (AVEC_CONTEXTE[chemins[0]] ?? ''), { connecte: PERSONNE[role] });
    const trop: string[] = [];
    for (const [i, chemin] of chemins.entries()) {
      if (i > 0) await aller(page, chemin + (AVEC_CONTEXTE[chemin] ?? ''));
      await expect(page.locator('[aria-busy="true"]'), chemin).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => location.pathname), chemin).toBe(chemin);
      const r = await sansDebordement(page);
      if (!r.ok) trop.push(`${chemin} : ${r.largeur} px pour ${r.fenetre}${r.fautif ? ` (${r.fautif})` : ''}`);
    }
    expect(trop, 'pages qui débordent').toEqual([]);
  });
}
