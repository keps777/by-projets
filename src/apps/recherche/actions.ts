// Actions de la recherche : lignes d'offres d'un trajet, retrouver une offre par son identifiant, recherches récentes (tranche « recherche »), alerte de prix, message à une agence.
// Les prix et les offres viennent de `offresDuVol` (domain/marche.ts) ; l'achat reste dans `acheter` (écran de paiement).
import { app, maintenant, nouvelId, tranche } from '../../data/store.svelte.ts';
import { compteDe, notifier } from '../../domain/compte.ts';
import { droitDe, offresDuVol, volDe, type Offre } from '../../domain/marche.ts';
import type { Agence, Droit, Vol } from '../../domain/types.ts';
import { departDuVol, filtrerSources, volsDuTrajet, type LigneOffre } from './offres.ts';
import { ajouterRecente, enRecente, rechercheVide, type Recente, type Recherche } from './params.ts';

/** Le compte a-t-il le Pass NexG ? (les drops membres sont alors visibles.) Sans compte : non. */
export const aLePass = (compteId: string | null | undefined): boolean => !!compteDe(compteId)?.pass.actif;

/** Toutes les lignes d'offres d'une recherche (un vol puis ses offres), sources et revendabilité appliquées. */
export function lignesDuTrajet(r: Recherche, pass: boolean): LigneOffre[] {
  const lignes = volsDuTrajet(app.monde.vols, r, maintenant()).flatMap((vol) => offresDuVol(vol.id, pass).map((offre) => ({ offre, vol })));
  return filtrerSources(lignes, r.sources, r.revendable, maintenant());
}

/** Les offres d'une agence (vitrine) : une ligne par offre dont le vol n'est pas encore parti, dans l'ordre de départ. */
export function offresDeAgence(agenceId: string, pass: boolean): LigneOffre[] {
  const lignes: LigneOffre[] = [];
  for (const oa of app.monde.offresAgence) {
    if (oa.agenceId !== agenceId) continue;
    const vol = volDe(oa.volId), offre = vol ? offresDuVol(vol.id, pass).find((o) => o.id === `agence:${oa.id}`) : undefined;
    if (vol && offre && departDuVol(vol) > maintenant()) lignes.push({ offre, vol });
  }
  return lignes.sort((a, b) => departDuVol(a.vol) - departDuVol(b.vol));
}

// --- Retrouver une offre ---
export type RaisonIndisponible = 'inconnue' | 'vendue' | 'drop';
export type ResultatOffre =
  | { ok: true; offre: Offre; vol: Vol; droit?: Droit; agence?: Agence; /** Offre publiée par le compte courant lui-même. */ laMienne: boolean }
  | { ok: false; raison: RaisonIndisponible; message: string; vol?: Vol };
/** Retrouve une offre d'après son identifiant (`revente:d-r816`, `neuf:v-ae816`, `agence:oa-1`, `drop:drop-128`). Une offre déjà vendue ou retirée renvoie une raison claire, pas une page vide. */
export function trouverOffre(id: string, compteId: string | null | undefined): ResultatOffre {
  const i = id.indexOf(':'), type = i < 0 ? '' : id.slice(0, i), ref = i < 0 ? '' : id.slice(i + 1), pass = aLePass(compteId);
  const inconnue: ResultatOffre = { ok: false, raison: 'inconnue', message: 'Cette offre n’existe pas ou a changé d’adresse.' };
  let volId: string | undefined, vendue = 'Cette offre n’est plus disponible.';
  if (type === 'neuf') volId = ref, vendue = 'Ce vol n’est plus proposé en neuf.';
  else if (type === 'revente') { volId = droitDe(ref)?.volId; vendue = 'Ce billet vient d’être vendu ou retiré de la vente.'; }
  else if (type === 'agence') { volId = app.monde.offresAgence.find((o) => o.id === ref)?.volId; vendue = 'Cette offre d’agence n’est plus disponible.'; }
  else if (type === 'drop') { volId = app.monde.drops.find((d) => d.id === ref)?.volId; vendue = 'Ce drop est terminé ou épuisé.'; }
  const vol = volId ? volDe(volId) : undefined; if (!vol) return inconnue;
  const offre = offresDuVol(vol.id, pass).find((o) => o.id === id);
  if (!offre) return { ok: false, raison: 'vendue', message: vendue, vol };
  if (offre.type === 'drop') return { ok: false, raison: 'drop', message: offre.masquee ? 'Les drops sont réservés aux membres du Pass NexG.' : 'Les drops s’achètent depuis l’écran du drop.', vol };
  const droit = offre.droitId ? droitDe(offre.droitId) : undefined, agence = offre.agenceId ? app.monde.agences.find((a) => a.id === offre.agenceId) : undefined;
  return { ok: true, offre, vol, droit, agence, laMienne: !!compteId && droit?.detenteurId === compteId };
}

// --- Recherches récentes (tranche « recherche ») ---
interface TrancheRecherche { recentes: Recente[]; messages: { agenceId: string; compteId: string; texte: string; quand: number }[] }
/** Les deux recherches de la maquette, pour que « Recherches récentes » ne soit jamais vide au premier usage. */
const RECENTES_DEFAUT = (): Recente[] => [{ de: 'YUL', vers: 'PUJ', jour: '2027-02-21', flex: false, n: 2 }, { de: 'YUL', vers: 'PPT', jour: '2027-05-09', flex: true, n: 1 }];
const lireTranche = () => tranche<TrancheRecherche>('recherche', () => ({ recentes: RECENTES_DEFAUT(), messages: [] }));
/** À appeler depuis un écran (au montage) : crée la tranche, ce qu'un `$derived` n'a pas le droit de faire. */
export function preparerRecentes(): void { lireTranche(); }
/** Lecture seule (utilisable dans un `$derived`) : la tranche si elle existe, sinon les valeurs par défaut. */
export const recentes = (): Recente[] => (app.tranches.recherche as TrancheRecherche | undefined)?.recentes ?? RECENTES_DEFAUT();
export function memoriserRecherche(r: Recherche): void { const t = lireTranche(); t.recentes = ajouterRecente(t.recentes, enRecente(r)); }
export function oublierRecentes(): void { lireTranche().recentes = []; }
/** Recherche de départ du formulaire : l'aéroport du compte (YUL sinon). */
export const rechercheInitiale = (compteId: string | null | undefined): Recherche => rechercheVide(compteDe(compteId)?.aeroport || undefined);

// --- Alerte de prix ---
const alerteIndex = (compteId: string, de: string, vers: string, prix: number) => app.monde.alertes.findIndex((a) => a.compteId === compteId && a.de === de && a.vers === vers && a.prixMax === prix);
export const alerteActive = (compteId: string | null | undefined, vol: Vol, prix: number): boolean => !!compteId && alerteIndex(compteId, vol.de, vol.vers, prix) >= 0;
/** Crée l'alerte « prévenez-moi si une offre de ce trajet est à ce prix ou moins » ; une seconde pression la retire. Renvoie l'état final. */
export function basculerAlerte(compteId: string, vol: Vol, prix: number): boolean {
  const i = alerteIndex(compteId, vol.de, vol.vers, prix);
  if (i >= 0) { app.monde.alertes.splice(i, 1); return false; }
  app.monde.alertes.push({ id: nouvelId('al'), compteId, de: vol.de, vers: vol.vers, prixMax: prix, actif: true, creeLe: maintenant() }); return true;
}

// --- Message à une agence (démo) ---
export type ResultatMessage = { ok: true } | { ok: false; raison: 'vide' | 'compte' };
export function envoyerMessageAgence(compteId: string | null | undefined, agence: Pick<Agence, 'id' | 'nom'>, texte: string): ResultatMessage {
  if (!texte.trim()) return { ok: false, raison: 'vide' };
  if (!compteId || !compteDe(compteId)) return { ok: false, raison: 'compte' };
  lireTranche().messages.push({ agenceId: agence.id, compteId, texte: texte.trim(), quand: maintenant() });
  notifier(compteId, { type: 'systeme', titre: `Message envoyé à ${agence.nom}`, sous: 'Un conseiller vous répondra ici (démo).', essentielle: true, lien: `/agence/${agence.id}` });
  return { ok: true };
}
