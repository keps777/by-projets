// Mode « Colis » de l'accueil : seuls les départs qui transportent la taille voulue restent, et leur prix devient celui du colis sur la ligne.
import { accepteColis, livraisonMin, prixColisLigne, type TailleColis } from '../../core/prixColis.ts';
import type { Offre } from '../../core/recherche.ts';
import { duree } from '../../core/tranches.ts';
import { app } from '../../data/store.svelte.ts';

/** Un covoiturage peut annoncer `colisOk` (absent du modèle de base : lu sans l'imposer au type partagé). */
const colisOkDe = (o: Offre): boolean | undefined => (o.covoitId ? (app.monde.covoits.find((c) => c.id === o.covoitId) as { colisOk?: boolean } | undefined)?.colisOk : undefined);
/** Les offres qui prennent un colis de cette taille, au prix du colis. Un bus complet (places) transporte encore des colis. */
export const offresColis = (offres: Offre[], taille: TailleColis): Offre[] =>
  offres.filter((o) => accepteColis({ genre: o.genre, colisOk: colisOkDe(o) }, taille)).map((o) => { const prix = prixColisLigne(taille, o.dureeMin); return { ...o, prix, prixBase: prix, complet: false }; });
/** « colis M · livré à Douala dans 3 h 15 » */
export const phraseColis = (o: Offre, taille: TailleColis, vers: string): string => `colis ${taille} · livré à ${vers} dans ${duree(livraisonMin(o.dureeMin, o.retardMin))}`;
/** Lien d'envoi pour le départ choisi (le départ de bus ou le covoiturage). */
export const lienEnvoiColis = (o: Offre, taille: TailleColis): string => (o.departId ? `/colis/envoi?depart=${o.departId}&taille=${taille}` : `/colis/envoi?covoit=${o.covoitId}&taille=${taille}`);
