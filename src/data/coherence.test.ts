// Cohérence du monde de démonstration : après le seed, les équipages, l'historique du patron et les journées de démonstration du superviseur et du siège,
// chaque référence (personne, gare, ligne, départ, paiement, caisse…) pointe vers une entité qui existe, et aucun siège n'est vendu deux fois.
import { beforeEach, describe, expect, it } from 'vitest';
import { app, reinitialiser } from './store.svelte.ts';
import { assurerHistorique } from '../apps/patron/actions.ts';
import { affecterEquipages } from '../apps/terrain/route.ts';
import { amorcerDemo } from '../apps/superviseur/demo.ts';
import { injecterDemo } from '../apps/siege/demo.ts';
import { siegesIndisponibles } from '../domain/actions.ts';

const ids = <T extends { id: string }>(l: T[]) => new Set(l.map((x) => x.id));
describe('monde de démonstration', () => {
  beforeEach(() => { reinitialiser(); affecterEquipages(); assurerHistorique(); amorcerDemo('mvan'); amorcerDemo('akwa'); injecterDemo(); });
  it('chaque référence existe', () => {
    const m = app.monde, personnes = ids(m.personnes), gares = ids(m.gares), lignes = ids(m.lignes), departs = ids(m.departs), paiements = ids(m.paiements), billets = ids(m.billets), caisses = ids(m.caisses), bus = ids(m.bus), cies = ids(m.compagnies);
    const manquants: string[] = [], verifie = (ok: boolean, quoi: string) => { if (!ok) manquants.push(quoi); };
    for (const l of m.lignes) { verifie(gares.has(l.gareDe) && gares.has(l.gareVers), `ligne ${l.id} gares`); verifie(cies.has(l.compagnieId), `ligne ${l.id} compagnie`); }
    for (const d of m.departs) { verifie(lignes.has(d.ligneId), `départ ${d.id} ligne`); verifie(bus.has(d.busId), `départ ${d.id} bus`); if (d.chauffeurId) verifie(personnes.has(d.chauffeurId), `départ ${d.id} chauffeur`); if (d.convoyeurId) verifie(personnes.has(d.convoyeurId), `départ ${d.id} convoyeur`); }
    for (const b of m.billets) { verifie(departs.has(b.departId), `billet ${b.id} départ`); verifie(paiements.has(b.paiementId), `billet ${b.id} paiement`); verifie(personnes.has(b.acheteurId), `billet ${b.id} acheteur ${b.acheteurId}`); if (b.caisseId) verifie(caisses.has(b.caisseId), `billet ${b.id} caisse ${b.caisseId}`); }
    for (const p of m.paiements) { verifie(personnes.has(p.payeurId), `paiement ${p.id} payeur ${p.payeurId}`); if (p.pour.type === 'billet') for (const id of p.pour.ids) verifie(billets.has(id), `paiement ${p.id} billet ${id}`); }
    for (const c of m.caisses) { verifie(personnes.has(c.agentId), `caisse ${c.id} agent`); verifie(gares.has(c.gareId), `caisse ${c.id} gare`); }
    for (const c of m.colis) { verifie(personnes.has(c.expediteurId), `colis ${c.id} expéditeur`); if (c.relaisId) verifie(personnes.has(c.relaisId), `colis ${c.id} relais`); if (c.livreurId) verifie(personnes.has(c.livreurId), `colis ${c.id} livreur`); }
    for (const o of m.covoits) { verifie(personnes.has(o.conducteurId), `covoit ${o.id} conducteur`); for (const r of o.reservations) verifie(personnes.has(r.voyageurId), `covoit ${o.id} voyageur`); }
    for (const p of m.personnes) { if (p.gareId) verifie(gares.has(p.gareId), `personne ${p.id} gare`); if (p.compagnieId) verifie(cies.has(p.compagnieId), `personne ${p.id} compagnie`); }
    for (const n of m.notifications) verifie(personnes.has(n.destId), `notification ${n.id} destinataire ${n.destId}`);
    for (const e of m.evenements) if (e.acteurId) verifie(personnes.has(e.acteurId), `événement ${e.id} acteur ${e.acteurId}`);
    expect(manquants.slice(0, 10)).toEqual([]);
  });
  it('aucun identifiant en double, aucun code de billet en double, PIN uniques par gare et rôle actif', () => {
    const m = app.monde;
    for (const [nom, liste] of Object.entries({ billets: m.billets, paiements: m.paiements, personnes: m.personnes, departs: m.departs, caisses: m.caisses, colis: m.colis })) expect(new Set(liste.map((x) => x.id)).size, nom).toBe(liste.length);
    expect(new Set(m.billets.map((b) => b.code)).size).toBe(m.billets.length);
    expect(m.personnes.filter((p) => p.pin && p.actif && p.role !== 'voyageur').every((p) => /^\d{4}$/.test(p.pin!))).toBe(true);
  });
  it('aucun siège vendu deux fois, jamais plus que la capacité', () => {
    for (const d of app.monde.departs) {
      const vendus = app.monde.billets.filter((b) => b.departId === d.id && b.siege && (b.statut === 'valide' || b.statut === 'scanne')).map((b) => b.siege!);
      expect(new Set(vendus).size, d.id).toBe(vendus.length);
      for (const s of vendus) expect(d.prisAilleurs.includes(s), `${d.id} ${s}`).toBe(false);
      expect(siegesIndisponibles(d).size).toBeLessThanOrEqual(d.capacite);
    }
  });
  it('chaque rôle de démonstration a au moins un compte actif avec PIN (sauf la voyageuse), chaque accueil de rôle est une route', () => {
    const roles = new Set(app.monde.personnes.filter((p) => p.actif && p.pin).map((p) => p.role));
    for (const r of ['guichet', 'quai', 'chauffeur', 'convoyeur', 'controleur', 'superviseur', 'patron', 'comptable', 'relais', 'livreur', 'vendeur', 'conducteur'] as const) expect(roles.has(r), r).toBe(true);
  });
  it('le stockage reste raisonnable : monde + tranches sérialisés sous 1,2 Mo non compacté', () => { expect(JSON.stringify(app).length).toBeLessThan(1_200_000); });
});
