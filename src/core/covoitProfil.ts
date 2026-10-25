// Covoiturage : validation du profil conducteur (formats camerounais plausibles) et disposition des sièges du véhicule. Pur, testé.
import type { Carrosserie, ProfilConducteur } from './covoitTypes.ts';

export const COULEURS = ['Blanc', 'Noir', 'Gris', 'Argent', 'Rouge', 'Bleu', 'Vert', 'Beige'] as const;
export const DELAI_VERIFICATION_MS = 90_000;
/** Saisie du formulaire « profil conducteur » (tout en texte, comme dans les champs). */
export interface SaisieProfil {
  cni: string; recto: string; verso: string; permis: string; validite: string;
  marque: string; modele: string; couleur: string; plaque: string; places: number; carrosserie: Carrosserie | ''; photos: string[];
}
export const saisieVide = (): SaisieProfil => ({ cni: '', recto: '', verso: '', permis: '', validite: '', marque: '', modele: '', couleur: '', plaque: '', places: 3, carrosserie: '', photos: [] });
export const normaliserPlaque = (p: string) => p.toUpperCase().replace(/[\s-]+/g, ' ').trim().replace(/^([A-Z]{2}) ?(\d{3,4}) ?([A-Z]{1,2})$/, '$1 $2 $3');
export const plaqueValide = (p: string) => /^[A-Z]{2} \d{3,4} [A-Z]{1,2}$/.test(normaliserPlaque(p));
/** Carte nationale d'identité : 8 à 12 chiffres. */
export const cniValide = (n: string) => /^\d{8,12}$/.test(n.replace(/[\s.-]/g, ''));
/** Permis de conduire : 6 à 14 lettres, chiffres ou tirets. */
export const permisValide = (n: string) => /^[A-Z0-9][A-Z0-9-]{5,13}$/i.test(n.replace(/\s/g, ''));

export type ErreursProfil = Partial<Record<keyof SaisieProfil, string>>;
/** Erreurs par champ, en français ; objet vide = profil complet et valide. `nowMs` : maintenant (pour la validité du permis). */
export function erreursProfil(s: SaisieProfil, nowMs: number): ErreursProfil {
  const e: ErreursProfil = {};
  if (!cniValide(s.cni)) e.cni = 'Numéro de carte d’identité : 8 à 12 chiffres.';
  if (!s.recto) e.recto = 'Ajoute la photo du recto de ta carte.';
  if (!s.verso) e.verso = 'Ajoute la photo du verso de ta carte.';
  if (!permisValide(s.permis)) e.permis = 'Numéro de permis : 6 à 14 lettres, chiffres ou tirets.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.validite)) e.validite = 'Indique la date de validité du permis.';
  else if (new Date(`${s.validite}T23:59:59`).getTime() < nowMs) e.validite = 'Ton permis n’est plus valide.';
  if (s.marque.trim().length < 2) e.marque = 'Indique la marque (ex. Toyota).';
  if (s.modele.trim().length < 1) e.modele = 'Indique le modèle (ex. Corolla).';
  if (!s.couleur) e.couleur = 'Choisis la couleur.';
  if (!plaqueValide(s.plaque)) e.plaque = 'Plaque au format LT 123 AB.';
  if (!Number.isInteger(s.places) || s.places < 1 || s.places > 4) e.places = 'Entre 1 et 4 places pour les passagers.';
  if (!s.carrosserie) e.carrosserie = 'Choisis le type de véhicule.';
  if (s.photos.length < 1) e.photos = 'Ajoute au moins une photo du véhicule.';
  return e;
}
/** Champs de chaque étape du formulaire (pour valider étape par étape). */
export const CHAMPS_ETAPE: (keyof SaisieProfil)[][] = [['cni', 'recto', 'verso'], ['permis', 'validite'], ['marque', 'modele', 'couleur', 'plaque', 'places', 'carrosserie'], ['photos']];
export const profilComplet = (p: ProfilConducteur | undefined | null): p is ProfilConducteur =>
  !!p && !!p.identite.numero && !!p.permis.numero && !!p.vehicule.marque && !!p.vehicule.plaque && !!p.vehicule.carrosserie && p.vehicule.places >= 1;
/** « verifie » une fois le délai de contrôle écoulé (simulé), sinon l'état enregistré. */
export const statutVerification = (p: Pick<ProfilConducteur, 'statut' | 'soumisLe'>, nowMs: number): 'en_verification' | 'verifie' => (p.statut === 'verifie' || nowMs - p.soumisLe >= DELAI_VERIFICATION_MS ? 'verifie' : 'en_verification');
export const nomVehiculeProfil = (p: Pick<ProfilConducteur, 'vehicule'>) => `${p.vehicule.marque} ${p.vehicule.modele}`.trim();
export function profilDepuisSaisie(s: SaisieProfil, now: number): ProfilConducteur {
  return {
    identite: { numero: s.cni.replace(/[\s.-]/g, ''), recto: s.recto, verso: s.verso }, permis: { numero: s.permis.replace(/\s/g, '').toUpperCase(), validite: s.validite },
    vehicule: { marque: s.marque.trim(), modele: s.modele.trim(), couleur: s.couleur, plaque: normaliserPlaque(s.plaque), places: s.places, carrosserie: s.carrosserie as Carrosserie, photos: s.photos.slice(0, 3) },
    statut: 'en_verification', soumisLe: now, telVerifie: true, trajets: 0, depuis: new Date(now).toISOString().slice(0, 7), nbAvis: 0, fumeur: false, clim: true, femmes: false
  };
}
export function saisieDepuisProfil(p: ProfilConducteur): SaisieProfil {
  return { cni: p.identite.numero, recto: p.identite.recto, verso: p.identite.verso, permis: p.permis.numero, validite: p.permis.validite, marque: p.vehicule.marque, modele: p.vehicule.modele, couleur: p.vehicule.couleur, plaque: p.vehicule.plaque, places: p.vehicule.places, carrosserie: p.vehicule.carrosserie, photos: [...p.vehicule.photos] };
}

// ------------------------------------------------------------------ sièges
export interface Occupant { nom: string; initiales: string; places: number }
export interface Siege { index: number; role: 'conducteur' | 'passager'; /** Position en % de la carrosserie (0 à 100). */ x: number; y: number; etat: 'conducteur' | 'occupe' | 'libre' | 'ferme'; initiales?: string; nom?: string }
/** Position des sièges (x, y en %) selon la carrosserie : conducteur, avant droit, puis banquette arrière (gauche, droite, milieu). */
export const POSITIONS_SIEGES: Record<Carrosserie, { x: number; y: number }[]> = {
  citadine: [{ x: 30, y: 40 }, { x: 70, y: 40 }, { x: 28, y: 66 }, { x: 72, y: 66 }, { x: 50, y: 66 }],
  berline: [{ x: 30, y: 38 }, { x: 70, y: 38 }, { x: 28, y: 63 }, { x: 72, y: 63 }, { x: 50, y: 63 }],
  suv: [{ x: 30, y: 36 }, { x: 70, y: 36 }, { x: 28, y: 60 }, { x: 72, y: 60 }, { x: 50, y: 60 }],
  pickup: [{ x: 30, y: 33 }, { x: 70, y: 33 }, { x: 28, y: 52 }, { x: 72, y: 52 }, { x: 50, y: 52 }]
};
/** Tous les sièges du véhicule : le conducteur, les `places` proposées (occupées dans l'ordre des réservations, sinon libres), puis les sièges non proposés (fermés). */
export function disposerSieges(c: Carrosserie, places: number, occupants: Occupant[]): Siege[] {
  const pos = POSITIONS_SIEGES[c], assignes: { initiales: string; nom: string }[] = [];
  for (const o of occupants) for (let k = 0; k < o.places; k++) assignes.push({ initiales: o.initiales, nom: o.nom });
  return pos.map((p, i) => {
    if (i === 0) return { index: 0, role: 'conducteur', ...p, etat: 'conducteur' } satisfies Siege;
    const k = i - 1, propose = k < Math.min(4, places), a = assignes[k];
    return { index: i, role: 'passager', ...p, etat: !propose ? 'ferme' : a ? 'occupe' : 'libre', initiales: propose ? a?.initiales : undefined, nom: propose ? a?.nom : undefined } satisfies Siege;
  });
}
export const jaugeSieges = (places: number, prises: number) => `${Math.min(prises, places)}/${places}`;
