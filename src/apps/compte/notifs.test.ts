import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../data/store.svelte.ts';
import { etatInitial } from '../../data/seed.ts';
import { compteDe, notifier } from '../../domain/compte.ts';
import { CATEGORIES, alertesSuspendues, canaux, choisirNiveau, filtrerNotifs, grouperParJour, heureRelative, incluse, marquerLu, nonLues, notificationsDe, reglerCanal, texteCompteur, toutMarquerLu } from './notifs.ts';

const ALEX = 'ACC-0412', NOW = Date.parse('2026-10-12T09:00'), H = 3_600_000;
beforeEach(() => { for (const k of Object.keys(app)) delete (app as unknown as Record<string, unknown>)[k]; Object.assign(app, etatInitial()); app.session.compteId = ALEX; });

describe('centre de notifications', () => {
  it('liste celles du compte, la plus récente d’abord', () => { const l = notificationsDe(ALEX); expect(l.map((n) => n.id)).toEqual(['n-1', 'n-2', 'n-3', 'n-4']); app.monde.notifications.push({ ...l[0], id: 'autre', compteId: 'ACC-0187' }); expect(notificationsDe(ALEX)).toHaveLength(4); });
  it('filtre par catégorie', () => {
    const l = notificationsDe(ALEX); expect(filtrerNotifs(l, 'toutes')).toHaveLength(4); expect(filtrerNotifs(l, 'echeances').map((n) => n.id)).toEqual(['n-3']); expect(filtrerNotifs(l, 'drops').map((n) => n.id)).toEqual(['n-2', 'n-4']);
    expect(filtrerNotifs(l, 'soute').map((n) => n.id)).toEqual(['n-1']); expect(filtrerNotifs(l, 'ventes')).toEqual([]);
  });
  it('compte et décrit les non lues', () => { expect(nonLues(notificationsDe(ALEX))).toBe(2); expect(texteCompteur(0)).toBe('Tout est lu'); expect(texteCompteur(1)).toBe('1 non lue'); expect(texteCompteur(2)).toBe('2 non lues'); });
  it('groupe par jour : aujourd’hui, hier, plus tôt', () => { const g = grouperParJour(notificationsDe(ALEX), NOW); expect(g.map((x) => [x.id, x.titre, x.items.length])).toEqual([['auj', 'Aujourd’hui', 1], ['hier', 'Hier', 1], ['tot', 'Plus tôt', 2]]); expect(grouperParJour([], NOW)).toEqual([]); });
  it('heures relatives', () => {
    expect(heureRelative(NOW - 20_000, NOW)).toBe('maintenant'); expect(heureRelative(NOW - 12 * 60_000, NOW)).toBe('il y a 12 min'); expect(heureRelative(NOW - 2 * H, NOW)).toBe('il y a 2 h');
    expect(heureRelative(Date.parse('2026-10-11T18:20'), NOW)).toBe('hier · 18:20'); expect(heureRelative(Date.parse('2026-10-09T10:00'), NOW)).toBe('ven. 9 oct.');
  });
  it('marque lue une notification, puis toutes', () => { marquerLu('n-1'); expect(nonLues(notificationsDe(ALEX))).toBe(1); expect(toutMarquerLu(ALEX)).toBe(1); expect(nonLues(notificationsDe(ALEX))).toBe(0); expect(toutMarquerLu(ALEX)).toBe(0); marquerLu('inconnue'); });
  it('ne touche pas aux notifications des autres comptes', () => { notifier('ACC-0187', { type: 'systeme', titre: 't', sous: 's', essentielle: true }); toutMarquerLu(ALEX); expect(app.monde.notifications.find((n) => n.compteId === 'ACC-0187')!.lu).toBe(false); });
});

describe('préférences', () => {
  it('aperçu des catégories par niveau', () => { expect(CATEGORIES.map((c) => [c.id, incluse(c.id, 'tout'), incluse(c.id, 'essentiel'), incluse(c.id, 'rien')])).toEqual([['echeances', true, true, false], ['drops', true, false, false], ['soute', true, false, false], ['ventes', true, true, false]]); });
  it('suspend les alertes hors du niveau « Tout »', () => { expect(alertesSuspendues('tout')).toBe(false); expect(alertesSuspendues('essentiel')).toBe(true); expect(alertesSuspendues('rien')).toBe(true); });
  it('change le niveau du compte et ce niveau filtre ensuite les nouvelles notifications', () => {
    expect(choisirNiveau(ALEX, 'rien')).toBe(true); expect(compteDe(ALEX)!.prefsNotif).toBe('rien'); const n = app.monde.notifications.length;
    notifier(ALEX, { type: 'prix', titre: 'p', sous: 's', essentielle: false }); expect(app.monde.notifications.length).toBe(n);
    choisirNiveau(ALEX, 'tout'); notifier(ALEX, { type: 'prix', titre: 'p', sous: 's', essentielle: false }); expect(app.monde.notifications.length).toBe(n + 1);
    expect(choisirNiveau(ALEX, 'bizarre' as never)).toBe(false); expect(choisirNiveau('ACC-9999', 'tout')).toBe(false);
  });
  it('mémorise les canaux dans la tranche', () => { expect(canaux()).toEqual({ appareil: true, courriel: true }); reglerCanal('courriel', false); expect(canaux().courriel).toBe(false); expect(app.tranches.notifs).toEqual({ appareil: true, courriel: false }); });
});
