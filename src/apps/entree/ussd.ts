// Simulateur du menu USSD *123# : écrans de texte, touches numérotées, 0 pour revenir. Il lit et modifie le vrai monde simulé :
// un billet acheté ici (`reserver` + `regler`) apparaît dans « Mes billets », au quai et dans les points de fidélité.
import { app } from '../../data/store.svelte.ts';
import { jourSemaineCourt } from '../../core/dates.ts';
import { LIBELLE } from '../../core/colis.ts';
import { sceauValide } from '../../core/sceau.ts';
import { formaterTel, normaliserTel } from '../../core/telephone.ts';
import { fcfa } from '../../core/money.ts';
import { billetsDe, colisDe, departParId, heureLocale, ligneDe, personne, personneCourante, prixDuDepart } from '../../domain/actions.ts';
import type { Billet, Passager } from '../../domain/types.ts';
import { acheter, demain, departsReservables, nomCourt, premierSiegeLibre, prixPropose } from './achat.ts';
import { proches as prochesDe, voyagesPasses } from './actions.ts';

export type Ecran =
  | { t: 'racine' } | { t: 'villes'; pour?: string } | { t: 'departs'; vers: string; page: number; pour?: string } | { t: 'confirmer'; departId: string; pour?: string }
  | { t: 'resultat'; lignes: string[] } | { t: 'billets' } | { t: 'billet'; id: string } | { t: 'passes' } | { t: 'verifier' } | { t: 'colis' } | { t: 'proches' } | { t: 'autreNumero' } | { t: 'fin' };
export interface SessionUssd { pile: Ecran[] }
export interface Affichage { texte: string; touches: string[]; /** Saisie libre attendue (code de billet, numéro). */ saisie?: 'code' | 'numero'; titreSaisie?: string }
export const nouvelleSession = (): SessionUssd => ({ pile: [{ t: 'racine' }] });
export const ecranCourant = (s: SessionUssd) => s.pile[s.pile.length - 1];
export const VILLES_DEPUIS_YAOUNDE = ['Douala', 'Bafoussam', 'Bamenda'] as const;
const PAR_PAGE = 3;

/** Ligne de la personne qui compose : la voyageuse connectée, sinon Aïcha (le téléphone de démonstration). */
export function titulaire() { const p = personneCourante(); return p && p.role === 'voyageur' ? p : personne('p-aicha')!; }
/** « AM7F3K22 » → « AM-7F3K-22 » (lisible à la voix). */
export const codeLisible = (code: string) => (code.length === 8 ? `${code.slice(0, 2)}-${code.slice(2, 6)}-${code.slice(6)}` : code);
const nettoyerCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const jourLabel = () => jourSemaineCourt(demain());
const dernierBillet = (): Billet | undefined => billetsDe(titulaire().id).find((b) => b.statut === 'valide' || b.statut === 'scanne' || b.statut === 'attente_paiement');
const statutBillet = (b: Billet) => ({ valide: 'VALIDE', scanne: 'UTILISE', annule: 'ANNULE', rembourse: 'REMBOURSE', expire: 'EXPIRE', attente_paiement: 'A PAYER' })[b.statut];
const descBillet = (b: Billet) => { const d = departParId(b.departId), l = d && ligneDe(d); return l && d ? `${l.vers} ${d.heure}` : 'Billet'; };
const fcfaU = (n: number) => `${fcfa(n)} F`;

/** Prix « dès » vers une ville demain (null si plus aucun départ). */
export function prixDes(vers: string): number | null { const ds = departsReservables('Yaoundé', vers, demain()); return ds.length ? Math.min(...ds.map((d) => prixDuDepart(d))) : null; }

export function affichage(s: SessionUssd): Affichage {
  const e = ecranCourant(s), moi = titulaire();
  switch (e.t) {
    case 'racine': return { texte: 'AfriMove *123#\n1 Voyager\n2 Mes billets\n3 Verifier un billet\n4 Colis\n5 Payer pour un proche', touches: ['1', '2', '3', '4', '5'] };
    case 'villes': {
      const l = VILLES_DEPUIS_YAOUNDE.map((v, i) => { const p = prixDes(v); return `${i + 1} ${v}${p ? ` des ${fcfaU(p)}` : ' (complet)'}`; });
      return { texte: `${e.pour ? `Pour ${nomPour(e.pour)}\n` : ''}Voyager\nDe Yaounde vers :\n${l.join('\n')}\n4 Autre ville`, touches: ['1', '2', '3', '4'] };
    }
    case 'departs': {
      const tous = departsReservables('Yaoundé', e.vers, demain()), debut = (e.page * PAR_PAGE) % Math.max(tous.length, 1), page = tous.slice(debut, debut + PAR_PAGE);
      if (!page.length) return { texte: `Yaounde > ${e.vers} ${jourLabel()}\nPlus de depart ce jour-la.\n0 retour`, touches: [] };
      const l = page.map((d, i) => `${i + 1} ${d.heure} ${nomCourt(d)}${ligneDe(d).classe === 'VIP' ? ' VIP' : ''} ${fcfaU(prixPropose(d))}`);
      const plus = tous.length > PAR_PAGE;
      return { texte: `Yaounde > ${e.vers} ${jourLabel()}\n${l.join('\n')}${plus ? `\n${page.length + 1} Voir plus tard` : ''}`, touches: page.map((_, i) => String(i + 1)).concat(plus ? [String(page.length + 1)] : []) };
    }
    case 'confirmer': {
      const d = departParId(e.departId); if (!d) return { texte: 'Depart introuvable.\n0 retour', touches: [] };
      const siege = premierSiegeLibre(d); if (!siege) return { texte: 'Ce depart est complet.\n0 retour', touches: [] };
      return { texte: `${nomCourt(d)} ${d.heure} place ${siege}\n${e.pour ? `Pour ${nomPour(e.pour)}\n` : ''}${fcfaU(prixPropose(d))} par MoMo ?\n1 Oui, payer (fenetre MTN)\n2 Reserver, payer au guichet`, touches: ['1', '2'] };
    }
    case 'resultat': return { texte: e.lignes.join('\n'), touches: [] };
    case 'billets': {
      const bs = billetsDe(moi.id).filter((b) => b.statut === 'valide' || b.statut === 'attente_paiement').slice(0, 3);
      if (!bs.length) return { texte: 'Mes billets\nAucun billet a venir.\n1 Billets passes', touches: ['1'] };
      return { texte: `Mes billets\n${bs.map((b, i) => `${i + 1} ${codeLisible(b.code)} ${descBillet(b)}`).join('\n')}\n${bs.length + 1} Billets passes`, touches: bs.map((_, i) => String(i + 1)).concat(String(bs.length + 1)) };
    }
    case 'billet': {
      const b = app.monde.billets.find((x) => x.id === e.id); if (!b) return { texte: 'Billet introuvable.\n0 retour', touches: [] };
      const d = departParId(b.departId)!;
      return { texte: `${codeLisible(b.code)} ${statutBillet(b)}\n${b.passager.nom} · ${b.siege ?? 'libre'} · ${nomCourt(d)} ${d.heure}\n${jourSemaineCourt(d.jour)} · ${ligneDe(d).de} > ${ligneDe(d).vers}`, touches: [] };
    }
    case 'passes': {
      const ps = voyagesPasses(moi.id).slice(0, 4);
      return { texte: ps.length ? `Billets passes\n${ps.map((b, i) => `${i + 1} ${codeLisible(b.code)} ${descBillet(b)}`).join('\n')}` : 'Billets passes\nAucun voyage passe.\n0 retour', touches: [] };
    }
    case 'verifier': {
      const b = dernierBillet();
      return { texte: `Verifier un billet\nTape le code :\nex. AM-7F3K-22${b ? `\n1 ${codeLisible(b.code)} (dernier)` : ''}`, touches: b ? ['1'] : [], saisie: 'code', titreSaisie: 'Code du billet' };
    }
    case 'colis': return { texte: 'Colis\n1 Suivre ' + (colisDe(moi.id)[0]?.code ?? '—') + '\n2 Envoyer un colis\n3 Points relais proches', touches: ['1', '2', '3'] };
    case 'proches': {
      const ps = prochesDe(moi.id).slice(0, 5);
      return { texte: `Payer pour un proche\n${ps.map((p, i) => `${i + 1} ${p.prenom} ${formaterTel(p.tel)}`).join('\n')}${ps.length ? '\n' : ''}${ps.length + 1} Autre numero`, touches: ps.map((_, i) => String(i + 1)).concat(String(ps.length + 1)) };
    }
    case 'autreNumero': return { texte: 'Autre numero\nTape le numero du proche\nex. 6 77 10 22 33', touches: [], saisie: 'numero', titreSaisie: 'Numéro du proche' };
    case 'fin': return { texte: 'Session terminee.\nMerci d’utiliser AfriMove.', touches: [] };
  }
}
/** « Maman 6 77 00 01 11 » pour un proche choisi (`pour` = id de personne ou `tel:<numéro>`). */
function nomPour(pour: string) { if (pour.startsWith('tel:')) return formaterTel(pour.slice(4)); const p = personne(pour); return p ? `${p.prenom} ${formaterTel(p.tel)}` : '?'; }
function passagerPour(pour: string | undefined): Passager {
  const moi = titulaire(); if (!pour) return { nom: `${moi.prenom} ${moi.nom}`.trim(), tel: moi.tel };
  if (pour.startsWith('tel:')) return { nom: 'Proche', tel: pour.slice(4) };
  const p = personne(pour); return p ? { nom: `${p.prenom} ${p.nom}`.trim(), tel: p.tel } : { nom: 'Proche', tel: '' };
}

/** Appuie sur une touche numérotée de l'écran courant. Renvoie la session (la même, modifiée). */
export function appuyer(s: SessionUssd, touche: string): SessionUssd {
  const e = ecranCourant(s), a = affichage(s); if (!a.touches.includes(touche)) return s;
  const n = Number(touche), pousser = (x: Ecran) => { s.pile.push(x); };
  switch (e.t) {
    case 'racine': pousser(([{ t: 'villes' }, { t: 'billets' }, { t: 'verifier' }, { t: 'colis' }, { t: 'proches' }] as Ecran[])[n - 1]); break;
    case 'villes': if (n <= 3) pousser({ t: 'departs', vers: VILLES_DEPUIS_YAOUNDE[n - 1], page: 0, pour: e.pour }); else pousser({ t: 'resultat', lignes: ['Autre ville', 'Bientot disponible.', 'Utilise l’app ou le', 'guichet. 0 retour'] }); break;
    case 'departs': {
      const tous = departsReservables('Yaoundé', e.vers, demain()), debut = (e.page * PAR_PAGE) % Math.max(tous.length, 1), page = tous.slice(debut, debut + PAR_PAGE);
      if (n <= page.length) pousser({ t: 'confirmer', departId: page[n - 1].id, pour: e.pour });
      else { e.page += 1; } /* « Voir plus tard » : page suivante */
      break;
    }
    case 'confirmer': {
      const moi = titulaire(), r = acheter({ departId: e.departId, acheteurId: moi.id, passager: passagerPour(e.pour), canal: 'ussd', payer: n === 1 });
      if (!r.ok) { pousser({ t: 'resultat', lignes: [r.message, '0 retour'] }); break; }
      const d = departParId(r.billet.departId)!;
      pousser({ t: 'resultat', lignes: n === 1
        ? ['Paiement en cours...', `Billet ${codeLisible(r.billet.code)}`, `Place ${r.billet.siege} · ${d.heure} · ${fcfaU(r.paiement.montant)}`, 'SMS envoye. Bon voyage !']
        : ['Place retenue 10 min', `Billet ${codeLisible(r.billet.code)}`, `Place ${r.billet.siege} · ${d.heure}`, `Paie ${fcfaU(r.paiement.montant)} au guichet`, `avant ${heureLocale(r.paiement.expireLe ?? 0)}`] });
      break;
    }
    case 'billets': {
      const bs = billetsDe(titulaire().id).filter((b) => b.statut === 'valide' || b.statut === 'attente_paiement').slice(0, 3);
      if (n <= bs.length) pousser({ t: 'billet', id: bs[n - 1].id }); else pousser({ t: 'passes' }); break;
    }
    case 'verifier': { const b = dernierBillet(); if (b) pousser(verification(b.code)); break; }
    case 'colis': {
      const moi = titulaire();
      if (n === 1) { const c = colisDe(moi.id)[0]; pousser({ t: 'resultat', lignes: c ? [`Colis ${c.code}`, LIBELLE[c.statut], c.etapes[c.etapes.length - 1]?.lieu ?? '', `Code retrait ${c.codeRetrait}`] : ['Aucun colis en cours.', '0 retour'] }); }
      else if (n === 2) pousser({ t: 'resultat', lignes: ['Envoyer un colis', 'Depose-le au guichet ou', 'dans un point relais avec', 'le numero du destinataire.'] });
      else { const rs = app.monde.personnes.filter((p) => p.role === 'relais'); pousser({ t: 'resultat', lignes: ['Points relais proches', ...(rs.length ? rs.map((r) => `${r.prenom} ${r.nom} · ${r.zone ?? ''}`) : ['Aucun point relais.']), '0 retour'] }); }
      break;
    }
    case 'proches': {
      const ps = prochesDe(titulaire().id).slice(0, 5);
      if (n <= ps.length) pousser({ t: 'villes', pour: ps[n - 1].id }); else pousser({ t: 'autreNumero' }); break;
    }
    default: break;
  }
  return s;
}
function verification(codeSaisi: string): Ecran {
  const code = nettoyerCode(codeSaisi), b = app.monde.billets.find((x) => x.code === code);
  if (!b) return { t: 'resultat', lignes: ['Verifier un billet', `${codeLisible(code)} : INCONNU`, 'Aucun billet avec ce code.'] };
  const d = departParId(b.departId)!, ok = sceauValide({ code: b.code, departId: b.departId, siege: b.siege, nom: b.passager.nom, sceau: b.sceau });
  return { t: 'resultat', lignes: [`${codeLisible(b.code)} ${ok ? statutBillet(b) : 'FAUX'}`, `${b.passager.nom.split(' ')[0]} ${b.passager.nom.split(' ')[1]?.[0] ?? ''}. · ${b.siege ?? 'libre'} · ${nomCourt(d)} ${d.heure}`, `Signe le ${new Date(b.creeLe).getDate()}/${new Date(b.creeLe).getMonth() + 1}`] };
}
/** Saisie libre (code de billet, numéro d'un proche). */
export function saisir(s: SessionUssd, texte: string): SessionUssd {
  const e = ecranCourant(s);
  if (e.t === 'verifier') { if (nettoyerCode(texte).length >= 4) s.pile.push(verification(texte)); }
  else if (e.t === 'autreNumero') {
    const tel = normaliserTel(texte);
    s.pile.push(tel ? { t: 'villes', pour: `tel:${tel}` } : { t: 'resultat', lignes: ['Numero invalide.', 'Exemple : 6 77 10 22 33', '0 retour'] });
  }
  return s;
}
/** Touche 0 : écran précédent ; depuis le menu, fin de session. */
export function retourUssd(s: SessionUssd): SessionUssd {
  if (ecranCourant(s).t === 'fin') return nouvelleSession();
  if (s.pile.length > 1) s.pile.pop(); else s.pile.push({ t: 'fin' });
  return s;
}
