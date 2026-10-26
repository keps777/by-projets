// Ce que les écrans du transfert affichent, en fonctions pures sur le monde : résumé du droit, étapes, textes d'erreur, chaîne de détention.
import { fmt } from '../../core/argent.ts';
import type { CasErreur, Motif } from '../../domain/transfert.ts';
import { jourHeure, messageRecu, nomCourt } from '../../domain/transfert.ts';
import type { Droit, Monde, StatutDroit, Transfert } from '../../domain/types.ts';
import { nomPartie } from '../achat/chaine.ts';
import { heureDe, jourSemaine } from '../voyager/format.ts';

export const STATUTS: Record<StatutDroit, string> = { detenu: 'Détenu', en_vente: 'En vente', nomme: 'Nommé', vendu: 'Vendu', transfere: 'Cédé', voyage: 'Voyagé', gele: 'Gelé', rachete: 'Racheté' };
export interface ResumeDroit { trajet: string; jour: string; ligne: string; statut: string; ref: string; numero: string; compagnie: string }
/** « YUL → CDG », « Lun. 14 déc. 2026 », « Aérolys 812 · 18:05 » : la mini-carte blanche du droit. `statut` peut être forcé (« Cédé » pour l'expéditeur). */
export function resumeDroit(monde: Pick<Monde, 'vols' | 'compagnies'>, d: Pick<Droit, 'volId' | 'statut' | 'ref'>, statut?: string): ResumeDroit | undefined {
  const v = monde.vols.find((x) => x.id === d.volId); if (!v) return undefined;
  const cie = monde.compagnies.find((c) => c.id === v.compagnieId)?.nom ?? '', numero = v.numero.split(' ')[1] ?? v.numero, depart = Date.parse(`${v.jour}T${v.heureDepart}`);
  return { trajet: `${v.de} → ${v.vers}`, jour: jourSemaine(depart, { avecAnnee: true, maj: true }), ligne: `${cie} ${numero} · ${heureDe(depart)}`.trim(), statut: statut ?? STATUTS[d.statut], ref: d.ref, numero, compagnie: cie };
}

export const DESIGNATION_GENERIQUE = 'Ce proche';
/** « Marc T. » → sujet « Marc T. », complément « Marc T. » ; le proche inconnu → « Ce proche » / « ce proche ». */
export const designation = (nom: string): { sujet: string; complement: string } => (nom === DESIGNATION_GENERIQUE ? { sujet: 'Ce proche', complement: 'ce proche' } : { sujet: nom, complement: nom });

export type ChoixListe = 'liste' | 'vide' | 'chargement' | 'horsligne';
/** L'état de la liste des proches : forcé par `?etat=` (test) ou déduit de la connexion et du contenu. */
export function etatListe(forme: string | null, enLigne: boolean, nbProches: number, enChargement: boolean): ChoixListe {
  if (forme === 'chargement' || enChargement) return 'chargement';
  if (forme === 'horsligne' || !enLigne) return 'horsligne';
  if (forme === 'vide' || nbProches === 0) return 'vide';
  return 'liste';
}
export const CONSIGNE_CONTINUER: Record<ChoixListe, string> = { liste: 'Choisissez un proche pour continuer.', vide: 'Cherchez un proche pour continuer.', chargement: 'Chargement en cours…', horsligne: 'Reconnectez-vous pour continuer.' };

export interface TextesErreur { titre: string; texte1: string; texte2: string; technique: boolean }
/** Les textes de l'écran « Transfert non effectué » : la raison de l'échec, ce qui n'a pas changé, ce qu'on peut faire. */
/** Termine une phrase par un point, sans le doubler après une initiale (« Léa A. »). */
const pt = (s: string): string => (s.endsWith('.') ? s : `${s}.`);
export function textesErreur(cas: CasErreur, ctx: { versNom?: string; motif?: Motif; echeance?: number } = {}): TextesErreur {
  const proche = ctx.versNom ?? 'le proche', fin = ctx.versNom ? ` et rien n’a été envoyé à ${ctx.versNom}` : '';
  const regle = 'Un droit ne peut être transféré que s’il est détenu, non nommé et avant l’échéance.';
  switch (cas) {
    case 'technique': return { titre: 'Le transfert n’a pas abouti', texte1: `Rien n’a changé : ce droit est toujours à vous et ${proche} n’a reçu aucun message.`, texte2: 'Réessayer ne peut pas transférer le droit deux fois.', technique: true };
    case 'reseau': return { titre: 'Connexion perdue', texte1: `Le transfert exige une connexion. Rien n’a changé : ce droit est toujours à vous et ${proche} n’a reçu aucun message.`, texte2: 'Reconnectez-vous, puis réessayez : le droit ne peut pas être transféré deux fois.', technique: false };
    case 'echeance': return { titre: 'L’échéance est passée', texte1: `Le ${ctx.echeance ? jourHeure(ctx.echeance) : 'moment de l’échéance'} est passé : plus aucune transaction n’est possible sur ce billet.`, texte2: `Rien n’a été transféré et ${ctx.versNom ?? 'le proche'} n’a reçu aucun message.`, technique: false };
    case 'destinataire': return { titre: 'Ce proche ne peut pas recevoir le droit', texte1: `Le compte de ${proche} n’est pas actif : le droit est toujours à vous et aucun message n’a été envoyé.`, texte2: 'Choisissez un autre proche, ou réessayez quand ce compte sera de nouveau actif.', technique: false };
    case 'solde': return { titre: 'Solde NexG insuffisant', texte1: `Les frais de transfert dépassent votre solde : le droit est toujours à vous${pt(fin)}`, texte2: 'Alimentez votre solde NexG, puis réessayez.', technique: false };
    case 'vendu':
      switch (ctx.motif) {
        case 'en_vente': return { titre: 'Ce droit est en vente', texte1: `Retirez d’abord l’annonce de revente : un droit en vente ne peut pas être transféré. Rien n’a été transféré${pt(fin)}`, texte2: regle, technique: false };
        case 'nomme': return { titre: 'Le voyageur est déjà nommé', texte1: `Le billet est nominatif : il ne peut plus être transféré ni revendu. Rien n’a été transféré${pt(fin)}`, texte2: regle, technique: false };
        case 'gele': return { titre: 'Ce droit est gelé', texte1: `Aucune transaction n’est possible pour le moment. Rien n’a été transféré${pt(fin)}`, texte2: 'Le gel est administratif : contactez le support si vous pensez qu’il s’agit d’une erreur.', technique: false };
        case 'autre': return { titre: 'Ce droit n’est pas transférable', texte1: `Rien n’a été transféré${pt(fin)}`, texte2: regle, technique: false };
        default: return { titre: 'Ce droit n’est plus disponible', texte1: `Ce droit vient d’être vendu ou cédé pendant que vous confirmiez. Il n’est plus à vous : ${pt(ctx.versNom ? `rien n’a été envoyé à ${ctx.versNom}` : 'rien n’a été transféré')}`, texte2: regle, technique: false };
      }
  }
}
/** Actions proposées sous l'erreur, d'après le cas. */
export type ActionErreur = 'reessayer' | 'choisir' | 'billet' | 'portefeuille';
export const actionsErreur = (cas: CasErreur, motif?: Motif): { principale: ActionErreur; secondaire?: ActionErreur } => {
  if (cas === 'technique' || cas === 'reseau' || cas === 'solde') return { principale: 'reessayer', secondaire: 'billet' };
  if (cas === 'destinataire') return { principale: 'choisir', secondaire: 'billet' };
  if (cas === 'echeance' || motif === 'en_vente' || motif === 'nomme' || motif === 'gele') return { principale: 'billet' };
  return { principale: 'portefeuille' };
};

export interface EtapeChaineFait { id: string; kind: 'passe' | 'nouveau' | 'echeance' | 'depart'; date: string; heure?: string; titre: string; detail: string }
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const jourMois = (ms: number) => { const d = new Date(ms); return `${d.getDate()} ${MOIS[d.getMonth()]}`; };
const TITRES: Record<string, string> = { achat_neuf: 'Achat neuf', drop: 'Achat au drop', revente: 'Revente', agence: 'Achat auprès d’une agence', import: 'Billet importé', transfert: 'Transfert (sans vente)', rachat: 'Rachat par NexG-TT', nommage: 'Voyageur nommé', gel: 'Gel administratif', degel: 'Dégel' };
/** La chaîne de détention du droit, puis les deux jalons à venir : l'échéance de finalisation et le départ. Le dernier transfert est mis en avant. */
export function chaineFait(monde: Pick<Monde, 'comptes' | 'agences' | 'vols' | 'compagnies'>, d: Pick<Droit, 'chaine' | 'volId'>, depart: number, echeance: number): EtapeChaineFait[] {
  const v = monde.vols.find((x) => x.id === d.volId), cie = v ? (monde.compagnies.find((c) => c.id === v.compagnieId)?.nom ?? '') : '';
  const maillons = [...d.chaine].sort((a, b) => a.quand - b.quand); const dernierTransfert = [...maillons].reverse().find((m) => m.type === 'transfert');
  const etapes: EtapeChaineFait[] = maillons.map((m) => {
    const nouveau = m === dernierTransfert; const de = nomPartie(m.de, monde), vers = nomPartie(m.vers, monde);
    const detail = m.type === 'transfert' || m.type === 'revente' ? `${de} → ${vers}` : m.type === 'nommage' ? vers : `${vers}${m.prix ? ` · ${fmt(m.prix)}` : ''}`;
    return { id: m.id, kind: nouveau ? 'nouveau' : 'passe', date: jourMois(m.quand), ...(nouveau || m.type === 'transfert' ? { heure: heureDe(m.quand) } : {}), titre: TITRES[m.type] ?? 'Mouvement', detail };
  });
  etapes.push({ id: 'echeance', kind: 'echeance', date: jourMois(echeance), heure: heureDe(echeance), titre: 'Échéance de finalisation', detail: `${nomPartie(d.chaine.at(-1)?.vers ?? null, monde)} nomme le voyageur ; ensuite, plus aucune transaction.` });
  etapes.push({ id: 'depart', kind: 'depart', date: jourMois(depart), heure: heureDe(depart), titre: `Départ ${v ? `${v.de} → ${v.vers}` : ''}`.trim(), detail: v ? `${cie} ${v.numero.split(' ')[1] ?? v.numero}`.trim() : '' });
  return etapes;
}
/** L'aperçu du message que reçoit le proche (courriel et notification). Mêmes mots que la notification enregistrée. */
export function apercuRecu(monde: Pick<Monde, 'comptes' | 'vols' | 'compagnies'>, t: Transfert, d: Pick<Droit, 'volId'>, echeance: number): { courrielTitre: string; courrielLignes: [string, string]; notifTitre: string; notifTexte: string } | undefined {
  const de = monde.comptes.find((c) => c.id === t.de), v = monde.vols.find((x) => x.id === d.volId); if (!de || !v) return undefined;
  const cie = monde.compagnies.find((c) => c.id === v.compagnieId)?.nom ?? '', trajet = `${v.de} → ${v.vers}`, depart = Date.parse(`${v.jour}T${v.heureDepart}`), court = nomCourt(de);
  const jour = jourSemaine(depart, { avecAnnee: true });
  return { courrielTitre: `${court} vous a transféré un droit de voyage`, courrielLignes: [`${trajet} · ${jour} · ${cie} ${v.numero.split(' ')[1] ?? v.numero}`, `Statut : Détenu. À nommer avant le ${jourHeure(echeance)}.`], notifTitre: 'Droit de voyage reçu', notifTexte: messageRecu(court, trajet, echeance, t.note === 'Échéance proche' ? echeance - t.quand : undefined) };
}

/** Le compte a-t-il (eu) ce droit ? Seul un détenteur actuel ou passé voit son état. */
export const lieAuCompte = (d: Pick<Droit, 'detenteurId' | 'chaine'>, compteId: string): boolean => d.detenteurId === compteId || d.chaine.some((m) => m.de === compteId || m.vers === compteId);
export const CAS: CasErreur[] = ['technique', 'vendu', 'echeance', 'destinataire', 'reseau', 'solde'];
export const MOTIFS: Motif[] = ['detenteur', 'en_vente', 'nomme', 'gele', 'vendu', 'autre', 'echeance'];
/** `?cas=` ou `?motif=` de l'adresse, s'ils sont connus (aperçu d'un cas d'erreur, tests). */
export const casConnu = (v: string | null): CasErreur | undefined => CAS.find((c) => c === v);
export const motifConnu = (v: string | null): Motif | undefined => MOTIFS.find((c) => c === v);
