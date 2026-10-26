// Actions du portefeuille : importer un billet acheté ailleurs (crée un droit d'origine « import »), activer ou couper les rappels d'échéance.
import { app, maintenant, nouvelId, tranche } from '../../data/store.svelte.ts';
import { arrondi } from '../../core/argent.ts';
import { refAleatoire } from '../../core/regles.ts';
import { compteDe, notifier } from '../../domain/compte.ts';
import type { Droit } from '../../domain/types.ts';
import { RAPPELS_DEFAUT, type CleRappel, type Rappels } from './echeances.ts';
import { lirePrix, valider, verifier, type DemandeImport, type Eligibilite, type MotifRefus } from './import.ts';

export type ResultatImport = { ok: true; droit: Droit } | { ok: false; motif: MotifRefus | 'saisie' | 'compte'; message: string };
const refUnique = (): string => { let n = app.monde.droits.length * 31 + Math.floor(maintenant() / 1000); let r = refAleatoire(n); while (app.monde.droits.some((d) => d.ref === r)) r = refAleatoire(++n); return r; };

/** Importe le billet : vérifie de nouveau (la démo ne fait confiance à rien), puis inscrit au registre un droit détenu, d'origine « import », au prix déclaré. Le prix payé est déclaratif : aucun paiement, aucun billet réel. */
export function importerBillet(d: DemandeImport, compteId: string | null | undefined): ResultatImport {
  const compte = compteDe(compteId); if (!compte || !compte.actif) return { ok: false, motif: 'compte', message: 'Connectez-vous pour importer un billet.' };
  const erreurs = valider(d), premiere = Object.values(erreurs)[0]; if (premiere) return { ok: false, motif: 'saisie', message: premiere };
  const e: Eligibilite = verifier(app.monde, d, maintenant()); if (!e.ok) return { ok: false, motif: e.motif, message: `${e.titre}. ${e.texte}` };
  const prix = arrondi(lirePrix(d.prix)), id = nouvelId('d');
  const droit: Droit = {
    id, ref: refUnique(), pnr: e.reservation.pnr, volId: e.vol.id, detenteurId: compte.id, statut: 'detenu', prixPaye: prix, origine: 'import', bagagesInclus: 2,
    chaine: [{ id: nouvelId('m'), quand: maintenant(), type: 'import', de: null, vers: compte.id, prix, note: `Importé depuis ${e.compagnie} (réservation ${e.reservation.pnr})` }]
  };
  app.monde.droits.push(droit);
  notifier(compte.id, { type: 'achat', titre: `Billet importé : ${e.vol.de} → ${e.vol.vers}`, sous: `Vol ${e.vol.numero} · désormais dans votre portefeuille, nommez le voyageur avant l’échéance.`, essentielle: true, lien: `/droit/${id}` });
  return { ok: true, droit: app.monde.droits[app.monde.droits.length - 1] };
}

/* ---------- rappels d'échéance (tranche « portefeuille ») ---------- */
interface TranchePortefeuille { rappels: Rappels }
const defautTranche = (): TranchePortefeuille => ({ rappels: { ...RAPPELS_DEFAUT } });
/** Rappels activés. Lecture seule : si la tranche n'existe pas encore (lecture depuis un `$derived`), on rend les valeurs par défaut sans la créer. */
export function lireRappels(): Rappels { return { ...RAPPELS_DEFAUT, ...tranche<TranchePortefeuille>('portefeuille', defautTranche).rappels }; }
/** Active ou coupe un rappel ; renvoie son nouvel état. */
export function basculerRappel(cle: CleRappel): boolean { const t = tranche<TranchePortefeuille>('portefeuille', defautTranche); t.rappels[cle] = !t.rappels[cle]; return t.rappels[cle]; }
