// Quai : choix du départ à embarquer, scan des billets, passages, appel du superviseur, billets de démonstration.
import { codeBrut, codeAffiche } from '../../core/terrain.ts';
import { planSieges } from '../../core/sieges.ts';
import { billetsDuDepart, consigner, departEnMs, departParId, ligneDe, personne, reserver, scannerBillet, siegesIndisponibles, type StatutScan } from '../../domain/actions.ts';
import type { Depart, Personne } from '../../domain/types.ts';
import { app } from '../../data/store.svelte.ts';
import { aujourdhui, hash, libelleDepart, maintenant, nouvelId, prevenirSuperviseurs } from './commun.ts';
import { lireTerrain, terrain, type Passage } from './etat.ts';

/** Départs de la gare de l'agent pour un jour, du plus proche au plus lointain. */
export function departsDeLaGare(agent: Personne | undefined, jour = aujourdhui()): Depart[] {
  if (!agent) return [];
  return app.monde.departs.filter((d) => { const l = ligneDe(d); return d.jour === jour && d.statut !== 'annule' && l.gareDe === agent.gareId && (!agent.compagnieId || l.compagnieId === agent.compagnieId); }).sort((a, b) => departEnMs(a) - departEnMs(b));
}
/** Départ à embarquer par défaut : celui en embarquement, sinon le prochain, sinon le dernier parti. */
export function departParDefaut(agent: Personne | undefined): Depart | undefined {
  const l = departsDeLaGare(agent); return l.find((d) => d.statut === 'embarquement') ?? l.find((d) => d.statut === 'prevu') ?? l.filter((d) => d.statut === 'parti').at(-1) ?? l.at(-1);
}
/** Départ choisi par l'agent du quai (sinon le départ par défaut). */
export function departDuQuai(agent: Personne | undefined): Depart | undefined {
  const id = lireTerrain().quai.departId, choisi = id ? departParId(id) : undefined;
  return choisi && choisi.statut !== 'annule' ? choisi : departParDefaut(agent);
}
export const choisirDepart = (departId: string) => { terrain().quai.departId = departId; };
export const basculerRadar = (actif?: boolean) => { const q = terrain().quai; q.radar = actif ?? !q.radar; };
/** Quai attribué à un départ (1 à 6), stable pour un même départ. */
export const numeroQuai = (d: Depart) => 1 + (hash(d.id) % 6);
export const enteteQuai = (d: Depart) => `Quai ${numeroQuai(d)} · ${libelleDepart(d)}`;
export const compteurABord = (departId: string) => billetsDuDepart(departId).filter((b) => b.statut === 'scanne').length;
export const passagesDuDepart = (departId: string): Passage[] => lireTerrain().passages.filter((p) => p.departId === departId);
export const passageParId = (id: string | null) => (id ? lireTerrain().passages.find((p) => p.id === id) : undefined) ?? lireTerrain().passages[0];

/** Scan d'un billet au quai (QR, code saisi ou « simuler un scan ») : le résultat est gardé comme « passage ». */
export function scanQuai(contenu: string, agentId: string, departId: string, via: Passage['via'] = 'code'): Passage {
  const t = terrain(), brut = contenu.trim(), r = scannerBillet(brut, agentId, departId);
  const p: Passage = { id: nouvelId('ps'), ts: maintenant(), departId, agentId, statut: r.statut, billetId: r.billet?.id, code: r.billet?.code ?? codeBrut(brut).split('.')[0].slice(0, 16), message: r.message, via };
  t.passages.unshift(p); if (t.passages.length > 80) t.passages.length = 80;
  if (r.statut !== 'ok') consigner('scan_refus', `${codeAffiche(p.code)} · ${r.message}`, agentId, r.billet?.id);
  return p;
}
const MOTIFS: Record<StatutScan, string> = { ok: 'billet valide', deja_scanne: 'billet déjà scanné', annule: 'billet annulé', faux: 'sceau invalide', mauvais_depart: 'autre départ', inconnu: 'billet inconnu', non_paye: 'paiement non confirmé' };
export const motifRefus = (s: StatutScan) => MOTIFS[s];
/** Appelle le superviseur de la gare : une notification qui ouvre « Superviseur › Voir ». */
export function appelerSuperviseur(passageId: string, agentId: string) {
  const p = lireTerrain().passages.find((x) => x.id === passageId), agent = personne(agentId); if (!p) throw new Error('passage_inconnu');
  const d = departParId(p.departId), sup = prevenirSuperviseurs(agent?.gareId, `Quai · ${motifRefus(p.statut)}`, `${agent?.prenom ?? 'Agent'} · ${d ? libelleDepart(d) : ''} · ${codeAffiche(p.code)}`, p.billetId ? `/superviseur/voir?billet=${p.billetId}` : '/superviseur/voir', 'quai');
  const mp = terrain().passages.find((x) => x.id === passageId)!; mp.superviseurAppele = maintenant(); consigner('quai', `Superviseur appelé · ${motifRefus(p.statut)} · ${codeAffiche(p.code)}`, agentId, p.billetId);
  return sup;
}
export function refuserAcces(passageId: string, agentId: string) { const p = terrain().passages.find((x) => x.id === passageId); if (!p) return; p.refuse = true; consigner('quai', `Accès refusé · ${codeAffiche(p.code)} · ${motifRefus(p.statut)}`, agentId, p.billetId); }
export function verifierIdentite(passageId: string, conforme: boolean, agentId: string) { const p = terrain().passages.find((x) => x.id === passageId); if (!p) return; p.identite = conforme ? 'ok' : 'non'; if (!conforme) p.refuse = true; consigner('quai', `Identité ${conforme ? 'confirmée' : 'non conforme'} · ${codeAffiche(p.code)}`, agentId, p.billetId); }

/** Contenus à proposer dans « simuler un scan » (billets du départ et cas de refus pour s'entraîner). */
export function scansSimulables(departId: string) {
  const bs = billetsDuDepart(departId), valides = bs.filter((b) => b.statut === 'valide'), dejaScannes = bs.filter((b) => b.statut === 'scanne');
  const autre = app.monde.billets.find((b) => b.statut === 'valide' && b.departId !== departId);
  const qr = (b: { code: string; sceau: string }) => `${b.code}.${b.sceau}`;
  return {
    valides: valides.slice(0, 8).map((b) => ({ id: b.id, libelle: `${b.passager.nom || 'Sans nom'} · ${b.siege ?? 'sans place'}`, contenu: qr(b), code: b.code })),
    essais: [
      ...(dejaScannes[0] ? [{ id: 'deja', libelle: 'Capture d’écran (déjà scanné)', contenu: qr(dejaScannes[0]), code: dejaScannes[0].code }] : []),
      ...(valides[0] ? [{ id: 'faux', libelle: 'Faux billet (sceau invalide)', contenu: `${valides[0].code}.000000000000`, code: valides[0].code }] : []),
      ...(autre ? [{ id: 'autre', libelle: 'Billet d’un autre départ', contenu: qr(autre), code: autre.code }] : []),
      { id: 'inconnu', libelle: 'Billet inconnu', contenu: 'ZZ2222ZZ', code: 'ZZ2222ZZ' }
    ]
  };
}
const NOMS_DEMO = ['Serge Biyaga', 'Nadia Owona', 'Paul Tchamba', 'Marie Kamga', 'Samuel Eto', 'Georges Ndzana', 'Estelle Mvondo', 'Hervé Fouda'];
/** Démonstration : vend quelques billets (espèces, guichet) pour pouvoir s'entraîner au scan quand le départ est vide. */
export function genererBilletsDemo(departId: string, agentId: string, n = 6) {
  const d = departParId(departId); if (!d) return [];
  const l = ligneDe(d), libres = planSieges(l.classe, d.capacite).map((s) => s.id).filter((id) => !siegesIndisponibles(d).has(id)).slice(0, n);
  if (!libres.length) return [];
  return reserver({ departId, sieges: libres, passagers: libres.map((_, i) => ({ nom: NOMS_DEMO[i % NOMS_DEMO.length], tel: `69000${String(100 + i)}0` })), acheteurId: agentId, canal: 'guichet', moyen: 'especes' }).billets;
}
