// Registre interne des droits : mise en forme des lignes du tableau et des maillons de la chaîne de détention. Fonctions pures, pseudonymisées (ACC-…, adm-…, jamais de nom de voyageur).
import { departDe, echeanceDe, joursAvant } from '../../core/regles.ts';
import { app } from '../../data/store.svelte.ts';
import { statutAvantGel } from '../../domain/admin.ts';
import { compagnieDe, volDe } from '../../domain/marche.ts';
import type { Droit, Maillon, StatutDroit, TypeMaillon, Vol } from '../../domain/types.ts';
import { pnrDe } from '../achat/actions.ts';

/** Hypothèse d'affichage : un droit détenu devient « À nommer » quand son échéance de nommage est à 90 jours ou moins. */
export const SEUIL_A_NOMMER_JOURS = 90;
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const p2 = (n: number): string => String(n).padStart(2, '0');

/** « UTC−5 » : fuseau du moment indiqué (heure locale de l'appareil : Montréal dans la démo, donc UTC−4 l'été, UTC−5 l'hiver). */
export function fuseau(ms: number): string {
  const m = -new Date(ms).getTimezoneOffset(), h = Math.trunc(Math.abs(m) / 60), reste = Math.abs(m) % 60;
  return `UTC${m < 0 ? '−' : '+'}${h}${reste ? `:${p2(reste)}` : ''}`;
}
export const jourMois = (ms: number): string => { const d = new Date(ms); return `${d.getDate()} ${MOIS[d.getMonth()]}`; };
export const jourMoisAn = (ms: number): string => `${jourMois(ms)} ${new Date(ms).getFullYear()}`;
export const heure = (ms: number): string => { const d = new Date(ms); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
/** « 12 oct. 2026, 14:02 (UTC−4) » */
export const instantComplet = (ms: number): string => `${jourMoisAn(ms)}, ${heure(ms)} (${fuseau(ms)})`;
export const jourSemaine = (ms: number): string => JOURS[new Date(ms).getDay()];
/** Dernier rapprochement quotidien (02:00) avant l'instant donné : « 12 oct. 02:00 ». */
export function rapprochement(now: number): string { const d = new Date(now); d.setHours(2, 0, 0, 0); if (d.getTime() > now) d.setDate(d.getDate() - 1); return `${jourMois(d.getTime())} ${heure(d.getTime())}`; }

/** Identifiant de compte tel qu'affiché : toujours pseudonymisé. */
export function pseudonyme(id: string | null | undefined): string {
  if (!id) return '—';
  if (id === 'nexgtt') return 'NexG-TT';
  if (id.startsWith('agence:')) return `${app.monde.agences.find((a) => a.id === id.slice(7))?.nom ?? 'Agence'} (exemple)`;
  return id;
}

export type StatutAffiche = 'anommer' | 'detenu' | 'envente' | 'nomme' | 'vendu' | 'cede' | 'parti' | 'rachete';
export type TonPuce = 'signal' | 'neutre' | 'info' | 'ok';
export const STATUTS_AFFICHES: Record<StatutAffiche, { label: string; ton: TonPuce }> = {
  anommer: { label: 'À nommer', ton: 'signal' }, detenu: { label: 'Détenu', ton: 'neutre' }, envente: { label: 'En vente', ton: 'info' }, nomme: { label: 'Nommé — prêt', ton: 'ok' },
  vendu: { label: 'Vendu', ton: 'neutre' }, cede: { label: 'Cédé', ton: 'neutre' }, parti: { label: 'Parti', ton: 'neutre' }, rachete: { label: 'Racheté', ton: 'neutre' }
};
/** Statut d'affichage d'un droit. Un droit gelé garde son statut d'avant le gel (le gel est un indicateur distinct). */
export function statutAffiche(d: Droit, now: number): StatutAffiche {
  const base: StatutDroit = d.statut === 'gele' ? statutAvantGel(d) : d.statut;
  if (base === 'en_vente') return 'envente'; if (base === 'nomme') return 'nomme'; if (base === 'vendu') return 'vendu'; if (base === 'transfere') return 'cede'; if (base === 'voyage') return 'parti'; if (base === 'rachete') return 'rachete';
  const v = volDe(d.volId); if (!v) return 'detenu';
  const depart = departDe(v.jour, v.heureDepart);
  return now < depart && joursAvant(echeanceDe(depart), now) <= SEUIL_A_NOMMER_JOURS ? 'anommer' : 'detenu';
}

export type CanalCle = 'primaire' | 'drop' | 'agence' | 'autre';
/** Canal d'origine du droit, d'après son premier maillon : « Primaire », « Drop N° 127 », « Agence Horizon (exemple) ». */
export function canalDe(d: Droit): { cle: CanalCle; label: string } {
  const premier: TypeMaillon | undefined = d.chaine[0]?.type ?? (d.origine === 'neuf' ? 'achat_neuf' : (d.origine as TypeMaillon));
  if (premier === 'achat_neuf') return { cle: 'primaire', label: 'Primaire' };
  if (premier === 'drop') { const n = d.dropId ? (app.monde.drops.find((x) => x.id === d.dropId)?.n ?? Number(/(\d+)$/.exec(d.dropId)?.[1])) : NaN; return { cle: 'drop', label: Number.isFinite(n) ? `Drop N° ${n}` : 'Drop' }; }
  if (premier === 'agence') return { cle: 'agence', label: d.agenceId || d.chaine[0]?.de ? pseudonyme(d.agenceId ? `agence:${d.agenceId}` : d.chaine[0]?.de) : 'Agence' };
  return { cle: 'autre', label: premier === 'import' ? 'Import' : 'Autre' };
}

export const EVENEMENTS: Record<TypeMaillon, { label: string; sous: string }> = {
  achat_neuf: { label: 'Émission', sous: 'Achat neuf' }, drop: { label: 'Émission', sous: 'Achat lors d’un drop' }, agence: { label: 'Émission', sous: 'Achat en agence' }, import: { label: 'Import', sous: 'Billet importé' },
  revente: { label: 'Vente', sous: 'Revente entre membres' }, transfert: { label: 'Transfert', sous: 'Sans vente' }, rachat: { label: 'Rachat', sous: 'Rachat par NexG-TT' }, nommage: { label: 'Nommage', sous: 'Voyageur nommé' },
  gel: { label: 'Gel', sous: 'Action d’administration' }, degel: { label: 'Dégel', sous: 'Action d’administration' }
};

export interface LigneRegistre {
  id: string; ref: string; pnr: string; de: string; vers: string; vol: string; numero: string; depart: number; departJour: string; departSous: string; detenteur: string;
  statut: StatutAffiche; gele: boolean; canal: string; canalCle: CanalCle; echeance: string; echeanceSous: string; urgente: boolean; rang: number; evenement: string; evenementDate: string;
}
const dans = (j: number): string => (j === 0 ? 'aujourd’hui' : `dans ${j} jour${j > 1 ? 's' : ''}`);
/** Numéro du vol tel qu'affiché : « Aérolys 812 ». */
export const nomVol = (v: Vol): string => `${compagnieDe(v).nom} ${v.numero.replace(/^\S+\s*/, '')}`;

export function ligneDe(d: Droit, now: number): LigneRegistre | undefined {
  const v = volDe(d.volId); if (!v) return undefined;
  const depart = departDe(v.jour, v.heureDepart), ech = echeanceDe(depart), statut = statutAffiche(d, now), canal = canalDe(d), dernier = d.chaine.at(-1);
  const actif = statut === 'anommer' || statut === 'detenu' || statut === 'envente';
  const nomme = [...d.chaine].reverse().find((m) => m.type === 'nommage');
  const sansObjet = statut === 'vendu' || statut === 'cede' || statut === 'parti' || statut === 'rachete';
  return {
    id: d.id, ref: d.ref, pnr: pnrDe(d), de: v.de, vers: v.vers, vol: nomVol(v), numero: v.numero, depart, departJour: jourMoisAn(depart), departSous: `${jourSemaine(depart)} · ${heure(depart)} · ${fuseau(depart)}`, detenteur: pseudonyme(d.detenteurId),
    statut, gele: d.statut === 'gele', canal: canal.label, canalCle: canal.cle,
    echeance: actif ? `${jourMois(ech)} · ${heure(ech)}` : '—',
    echeanceSous: actif ? (now >= ech ? `échéance passée · ${fuseau(ech)}` : `${dans(joursAvant(ech, now))} · ${fuseau(ech)}`) : statut === 'nomme' ? (nomme ? `Nommé le ${jourMoisAn(nomme.quand)}` : 'Voyageur nommé') : sansObjet ? 'Sans objet' : '—',
    urgente: actif && now < ech && statut === 'anommer', rang: d.chaine.length,
    evenement: dernier ? `#${d.chaine.length} ${EVENEMENTS[dernier.type].label}` : '—', evenementDate: dernier ? jourMoisAn(dernier.quand) : ''
  };
}
/** Tout le registre, trié « départ le plus proche » d'abord (les vols déjà partis à la fin). */
export function registre(droits: Droit[], now: number): LigneRegistre[] {
  return droits.map((d) => ligneDe(d, now)).filter((l): l is LigneRegistre => !!l).sort((a, b) => (a.depart < now ? 1 : 0) - (b.depart < now ? 1 : 0) || a.depart - b.depart || a.ref.localeCompare(b.ref));
}

export interface Filtres { q: string; statut: 'all' | 'anommer' | 'detenu' | 'envente' | 'nomme' | 'gele'; canal: 'all' | 'primaire' | 'drop' | 'agence' }
export const FILTRES_VIDES: Filtres = { q: '', statut: 'all', canal: 'all' };
const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[\s-]+/g, '');
/** Recherche par référence, PNR, compte ou vol (numéro, avec ou sans compagnie) ; filtres Statut et Canal. */
export function filtrer(lignes: LigneRegistre[], f: Filtres): LigneRegistre[] {
  const q = norm(f.q);
  return lignes.filter((l) => {
    if (f.statut === 'gele' ? !l.gele : f.statut !== 'all' && l.statut !== f.statut) return false;
    if (f.canal !== 'all' && l.canalCle !== f.canal) return false;
    return !q || [l.ref, l.pnr, l.detenteur, l.vol, l.numero].some((h) => norm(h).includes(q));
  });
}
export const compteDroits = (n: number): string => `${n} droit${n > 1 ? 's' : ''} trouvé${n > 1 ? 's' : ''}`;

/** Empreinte d'un maillon : condensé (53 bits) de l'événement et de l'empreinte précédente, 12 caractères hexadécimaux. Simulation : un registre réel utiliserait SHA-256. */
export function condense(texte: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < texte.length; i++) { const c = texte.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0').slice(0, 12);
}
export const EMPREINTE_ORIGINE = '0'.repeat(12);
export interface LigneChaine {
  rang: number; id: string; type: TypeMaillon; label: string; sous: string; date: string; heure: string; de: string; vers: string; avecDe: boolean; prix: number | null; prixSous?: string; commission?: number; note?: string;
  empreinte: string; precedente: string; precedenteSous: string; admin: boolean;
}
/** Maillons du plus ancien au plus récent, numérotés, avec leur empreinte chaînée. */
export function chaineDe(d: Droit): LigneChaine[] {
  let prec = EMPREINTE_ORIGINE;
  return d.chaine.map((m: Maillon, i) => {
    const rang = i + 1, empreinte = condense(`${prec}|${rang}|${m.type}|${m.quand}|${m.de ?? ''}|${m.vers}|${m.prix}|${m.commission ?? ''}|${m.note ?? ''}`);
    const e = EVENEMENTS[m.type], admin = m.type === 'gel' || m.type === 'degel';
    const ligne: LigneChaine = {
      rang, id: m.id, type: m.type, label: e.label, sous: admin && m.note ? `Motif : ${m.note}` : e.sous, date: jourMoisAn(m.quand), heure: `${heure(m.quand)} · ${fuseau(m.quand)}`, de: pseudonyme(m.de), vers: pseudonyme(m.vers),
      avecDe: !!m.de && m.de !== m.vers, prix: m.prix > 0 ? m.prix : null, ...(m.commission ? { commission: m.commission } : {}), ...(m.note ? { note: m.note } : {}), empreinte, precedente: prec, precedenteSous: rang === 1 ? 'origine' : `= n° ${rang - 1}`, admin
    };
    prec = empreinte; return ligne;
  });
}
