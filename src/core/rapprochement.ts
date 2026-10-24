// Rapprochement des paiements Mobile Money (MTN MoMo, Orange Money) : on compare le relevé de l'opérateur aux paiements et billets d'AfriMove.
// Une transaction du relevé est « rapprochée » quand un paiement AfriMove réglé et rattaché à un billet (ou colis) lui fait face.
export interface TxOperateur { ref: string; ts: number; numero: string; montant: number; operateur: 'MTN' | 'Orange'; /** Référence AfriMove saisie par le client, si l'opérateur la connaît. */ paiementRef?: string }
export interface PaiementR { id: string; ref: string; ts: number; montant: number; moyen: string; statut: string; payeurId: string; expireLe?: number; pour: { type: string; ids: string[] } }
export interface BilletR { id: string; code: string; paiementId: string; prix: number; statut: string; creeLe: number; /** Qui a réservé (un proche qui paie pour un autre). */ acheteurId?: string; /** Réservation expirée (statut « expire », ou paiement en attente dont le délai est passé). */ expire?: boolean }
export type Motif = 'expire' | 'refuse' | 'sans_billet' | 'montant' | 'doublon' | 'inconnue';
export interface Ecart { tx: TxOperateur; motif: Motif; piste: string; paiementId?: string; /** Billets sans paiement valide, de même montant, à associer. */ candidats: string[] }
export interface Rapprochement { total: number; rapproches: number; enCours: number; ecarts: Ecart[] }

export const operateurDe = (moyen: string): 'MTN' | 'Orange' | null => (moyen === 'momo' ? 'MTN' : moyen === 'om' ? 'Orange' : null);
const FENETRE_DOUBLON_MS = 10 * 60_000;
const hhmm = (ts: number) => new Date(ts).toTimeString().slice(0, 5);

/** Relevé « côté opérateur » reconstitué à partir des paiements mobile réglés (ou remboursés) d'AfriMove. */
export function releveDepuis(paiements: PaiementR[], numeroDe: (payeurId: string) => string): TxOperateur[] {
  const res: TxOperateur[] = [];
  for (const p of paiements) {
    const op = operateurDe(p.moyen);
    if (op && (p.statut === 'ok' || p.statut === 'rembourse')) res.push({ ref: `MP-${p.ref}`, ts: p.ts, numero: numeroDe(p.payeurId), montant: p.montant, operateur: op, paiementRef: p.ref });
  }
  return res;
}

function lie(p: PaiementR, billets: BilletR[]): boolean {
  if (p.pour.type !== 'billet') return p.pour.ids.length > 0;
  return billets.some((b) => (p.pour.ids.includes(b.id) || b.paiementId === p.id) && ['valide', 'scanne', 'rembourse'].includes(b.statut));
}

/** `traitees` : références de transactions déjà décidées (associées ou remboursées) : elles ne sont plus des écarts. */
export function rapprocher(releve: TxOperateur[], paiements: PaiementR[], billets: BilletR[], now: number, traitees: ReadonlySet<string> = new Set()): Rapprochement {
  const parRef = new Map(paiements.map((p) => [p.ref, p])), res: Rapprochement = { total: releve.length, rapproches: 0, enCours: 0, ecarts: [] };
  const tries = [...releve].sort((a, b) => a.ts - b.ts);
  for (const tx of tries) {
    if (traitees.has(tx.ref)) { res.rapproches++; continue; }
    const p = tx.paiementRef ? parRef.get(tx.paiementRef) : undefined;
    if (p && p.montant === tx.montant && (p.statut === 'ok' || p.statut === 'rembourse') && lie(p, billets)) { res.rapproches++; continue; }
    if (p && p.statut === 'attente' && (p.expireLe ?? 0) > now) { res.enCours++; continue; }
    const doublon = tries.find((o) => o !== tx && o.numero === tx.numero && o.montant === tx.montant && o.ts <= tx.ts && tx.ts - o.ts <= FENETRE_DOUBLON_MS);
    let motif: Motif, piste: string;
    if (doublon) { motif = 'doublon'; piste = `doublon de ${doublon.ref} (${hhmm(doublon.ts)}) · même numéro et même montant à ${Math.max(1, Math.round((tx.ts - doublon.ts) / 60_000))} min d’écart`; }
    else if (!p) { motif = 'inconnue'; piste = 'aucune vente AfriMove avec cette référence'; }
    else if (p.montant !== tx.montant) { motif = 'montant'; piste = `montant différent : ${p.montant.toLocaleString('fr-FR')} F côté AfriMove`; }
    else if (p.statut === 'attente') { motif = 'expire'; piste = `paiement ${p.ref} resté en attente (expiré) · vente non finalisée à ${hhmm(p.ts)}`; }
    else if (p.statut === 'refuse') { motif = 'refuse'; piste = `paiement ${p.ref} refusé côté AfriMove alors que l’opérateur a débité`; }
    else { motif = 'sans_billet'; piste = `paiement ${p.ref} reçu mais aucun billet lié`; }
    const propres = p ? billets.filter((b) => p.pour.ids.includes(b.id) || b.paiementId === p.id) : [];
    const sansPaiement = (b: BilletR) => b.expire ?? b.statut === 'expire';
    const libres = billets.filter((b) => sansPaiement(b) && b.prix === tx.montant && !propres.includes(b)).sort((a, b) => Number(b.acheteurId === p?.payeurId) - Number(a.acheteurId === p?.payeurId) || Math.abs(a.creeLe - tx.ts) - Math.abs(b.creeLe - tx.ts));
    const candidats = motif === 'doublon' ? [] : [...propres.filter((b) => sansPaiement(b) && b.prix === tx.montant), ...libres].slice(0, 5).map((b) => b.id);
    res.ecarts.push({ tx, motif, piste, paiementId: p?.id, candidats });
  }
  return res;
}
export const totalEcarts = (e: Ecart[]) => e.reduce((s, x) => s + x.tx.montant, 0);
