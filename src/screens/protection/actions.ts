// Actions de la protection famille : assurés, souscription (prime mensuelle sur salaire), déclaration de sinistre, versement du capital.
import { app, maintenant, mouvement, nouvelId, notifier } from '../../data/store.svelte.ts';
import { niveauDuScore } from '../../core/credit.ts';
import { jourDe } from '../../core/dates.ts';
import { numeroDossier } from '../../core/protection.ts';
import { verifierAge } from '../../core/services.ts';
import { aChange, couvertsDeSouscription, primeDe, primeSelection, verifierDeclaration, verifierSouscription } from './calcul.ts';
import { etat, type Lien, type Quand } from './etat.ts';

export type Resultat<T = object> = ({ ok: true } & T) | { ok: false; erreur: string };
const ECHEC = (erreur: string) => ({ ok: false as const, erreur });
export const niveau = () => niveauDuScore(app.score.valeur);

export function basculer(id: string): Resultat {
  const a = etat().assures.find((x) => x.id === id);
  if (!a) return ECHEC('Assuré introuvable.');
  if (a.lien === 'vous') return ECHEC('Vous êtes toujours couvert(e).');
  if (a.dossier) return ECHEC(`Dossier de sinistre ${a.dossier} en cours.`);
  if (!a.couvert) { const v = verifierAge(a.age); if (!v.ok) return ECHEC(v.erreur); }
  a.couvert = !a.couvert; return { ok: true };
}
export function ajouterAssure(nom: string, lien: Lien, age: number | null, ville: string): Resultat<{ id: string }> {
  const e = etat();
  if (nom.trim().length < 2) return ECHEC('Entrez le prénom de la personne.');
  const v = verifierAge(age); if (!v.ok) return ECHEC(v.erreur);
  if (e.assures.some((a) => a.nom.toLowerCase() === nom.trim().toLowerCase())) return ECHEC('Cette personne est déjà dans la liste.');
  const id = nouvelId('as');
  e.assures.push({ id, nom: nom.trim(), lien, age, ville: ville.trim(), couvert: true });
  return { ok: true, id };
}
export function definirAge(id: string, age: number | null): Resultat {
  const a = etat().assures.find((x) => x.id === id); if (!a) return ECHEC('Assuré introuvable.');
  const v = verifierAge(age); if (!v.ok) return ECHEC(v.erreur);
  a.age = age; return { ok: true };
}
export const choisirCapital = (c: number) => { etat().capital = c; };

/** Active (ou met à jour) la protection : la prime mensuelle est ensuite prélevée sur le salaire (voir demarrage.ts). */
export function activer(now = maintenant()): Resultat<{ prime: number }> {
  const e = etat();
  const err = verifierSouscription(e, niveau()); if (err) return ECHEC(err);
  const ids = e.assures.filter((a) => a.couvert && !a.dossier).map((a) => a.id);
  const prime = primeSelection(e); const ancienne = e.souscription;
  e.souscription = { ts: ancienne?.ts ?? now, depuis: ancienne?.depuis ?? jourDe(new Date(now)), capital: e.capital, prime, assureIds: ids, primesPayees: ancienne?.primesPayees ?? 0 };
  notifier({ titre: ancienne ? 'Protection famille mise à jour' : 'Protection famille activée', sous: `${ids.length} personne${ids.length > 1 ? 's' : ''} · capital ${e.capital.toLocaleString('fr-FR')} FCFA · ${prime.toLocaleString('fr-FR')} / mois sur salaire`, lien: '/protection', ts: now });
  return { ok: true, prime };
}
export function resilier(): Resultat {
  const e = etat(); if (!e.souscription) return ECHEC('Aucune protection active.');
  e.souscription = null;
  notifier({ titre: 'Protection famille arrêtée', sous: 'Plus aucune prime ne sera prélevée. Les dossiers en cours restent honorés.', lien: '/protection' });
  return { ok: true };
}

export function declarer(assureId: string, ville: string, quand: Quand, now = maintenant()): Resultat<{ numero: string }> {
  const e = etat(); const s = e.souscription;
  if (!s) return ECHEC('Activez la protection avant de déclarer un sinistre.');
  const a = e.assures.find((x) => x.id === assureId);
  if (!a || a.lien === 'vous' || !s.assureIds.includes(a.id)) return ECHEC('Cette personne n\'est pas couverte.');
  if (a.dossier) return ECHEC(`Un dossier existe déjà : ${a.dossier}.`);
  const err = verifierDeclaration(ville); if (err) return ECHEC(err);
  const numero = numeroDossier(e.sinistres.length);
  e.sinistres.unshift({ id: nouvelId('sin'), numero, ts: now, assureId, nom: a.nom, ville: ville.trim(), quand, capital: s.capital, versementPrevu: now + 48 * 3_600_000, verse: false });
  a.dossier = numero; a.couvert = false;
  // L'assuré sort de la couverture : la prime est recalculée dès le prochain prélèvement.
  s.assureIds = s.assureIds.filter((i) => i !== a.id); s.prime = primeDe(e.assures, s.assureIds, s.capital);
  notifier({ titre: `Déclaration reçue · dossier ${numero}`, sous: `Un conseiller vous rappelle dans l'heure. Capital de ${s.capital.toLocaleString('fr-FR')} FCFA versé sous 48 h.`, lien: '/protection', ts: now });
  return { ok: true, numero };
}
/** Verse le capital des dossiers dont le délai de 48 h est écoulé. */
export function avancer(now = maintenant()) {
  for (const s of etat().sinistres) {
    if (s.verse || now < s.versementPrevu) continue;
    s.verse = true;
    mouvement({ titre: 'Capital Protection famille', sous: `Dossier ${s.numero}`, montant: s.capital, ini: 'PR', categorie: 'protection', ts: s.versementPrevu });
    notifier({ titre: `Capital versé · dossier ${s.numero}`, sous: `${s.capital.toLocaleString('fr-FR')} FCFA ajoutés à votre solde`, lien: '/protection', ts: s.versementPrevu });
  }
}
export { aChange, couvertsDeSouscription };
