import { describe, expect, it } from 'vitest';
import { cleDePage, compteurNotifications, estRaccourciOrbe, grouperParJour, notificationsAutorisees, orbeAutorisee } from './fenetres.ts';

describe('fenêtres globales : droits', () => {
  it('l’orbe est réservée à la voyageuse, hors siège et hors sa page autonome', () => {
    expect(orbeAutorisee('voyageur', 'mobile', '/pass')).toBe(true);
    expect(orbeAutorisee('voyageur', undefined, '/covoit')).toBe(true);
    expect(orbeAutorisee('voyageur', 'plein', '/orbe')).toBe(false);
    expect(orbeAutorisee('voyageur', 'web', '/siege/analyses')).toBe(false);
    for (const r of ['guichet', 'patron', 'superviseur', 'quai', null, undefined]) expect(orbeAutorisee(r, 'mobile', '/')).toBe(false);
  });
  it('les notifications s’ouvrent pour toute personne connectée sur une page mobile', () => {
    expect(notificationsAutorisees('voyageur', 'mobile', '/moi')).toBe(true);
    expect(notificationsAutorisees('patron', 'mobile', '/patron')).toBe(true);
    expect(notificationsAutorisees('comptable', 'web', '/siege/comptable')).toBe(false);
    expect(notificationsAutorisees(null, 'mobile', '/')).toBe(false);
    expect(notificationsAutorisees('voyageur', 'mobile', '/notifications')).toBe(false);
  });
  it('la clé de page change avec le chemin ou la requête', () => {
    expect(cleDePage('/pass', '')).not.toBe(cleDePage('/pass', '?billet=b1'));
    expect(cleDePage('/pass', '?a=1')).toBe(cleDePage('/pass', '?a=1'));
  });
  it('raccourci Ctrl/⌘ + K', () => {
    expect(estRaccourciOrbe({ key: 'k', ctrlKey: true, metaKey: false })).toBe(true);
    expect(estRaccourciOrbe({ key: 'K', ctrlKey: false, metaKey: true })).toBe(true);
    expect(estRaccourciOrbe({ key: 'k', ctrlKey: false, metaKey: false })).toBe(false);
    expect(estRaccourciOrbe({ key: 'k', ctrlKey: true, metaKey: false, shiftKey: true })).toBe(false);
    expect(estRaccourciOrbe({ key: 'j', ctrlKey: true, metaKey: false })).toBe(false);
  });
});

describe('notifications : regroupement par jour', () => {
  const h = (j: string, hh: number) => new Date(`${j}T${String(hh).padStart(2, '0')}:00:00`).getTime();
  const n = (id: string, ts: number, lu = false) => ({ id, ts, lu });
  it('sépare aujourd’hui, hier et plus tôt, du plus récent au plus ancien, sans groupe vide', () => {
    const g = grouperParJour([n('a', h('2026-11-02', 9)), n('b', h('2026-11-03', 6)), n('c', h('2026-10-20', 9)), n('d', h('2026-11-03', 7))], '2026-11-03');
    expect(g.map((x) => x.cle)).toEqual(['auj', 'hier', 'avant']);
    expect(g[0].items.map((x) => x.id)).toEqual(['d', 'b']);
    expect(grouperParJour([n('x', h('2026-11-03', 6))], '2026-11-03').map((x) => x.cle)).toEqual(['auj']);
    expect(grouperParJour([], '2026-11-03')).toEqual([]);
  });
  it('compteur de l’en-tête', () => {
    expect(compteurNotifications(0, 0)).toBe('Aucune notification');
    expect(compteurNotifications(4, 0)).toBe('Tout est lu');
    expect(compteurNotifications(4, 1)).toBe('1 non lue');
    expect(compteurNotifications(4, 3)).toBe('3 non lues');
  });
});
