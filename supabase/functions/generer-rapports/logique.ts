// Génération du rapport du soir et des rappels de récapitulatif (spec §9, §10), à l'heure LOCALE de chaque profil.
// Appelée chaque minute. Aucune API Deno ici.
import { ajouterJours, jourSemaine, localVersUtc, lundiDe, moisDe, utcVersLocal, uuidDeterministe, type TypeRappel } from '../_shared/core/index.ts';
import { construireContenu, type ContenuRapport, type DonneesJour } from './contenu.ts';

export interface ProfilRapport { id: string; fuseau: string; heure_rapport: string }

export interface RapportNouveau {
  id: string; user_id: string; jour: string; contenu: ContenuRapport; genere_a: string; maj_a: string; envoye_a: null;
}
export interface RappelServeur {
  id: string; user_id: string; type: TypeRappel; occurrence_id: null; rapport_id: string | null; envoyer_a: string; cle_unique: string;
}

export interface DepotRapports {
  /** Profils non supprimés. */
  profils(): Promise<ProfilRapport[]>;
  /** Vrai si un rapport non supprimé existe pour ce jour. */
  rapportExiste(userId: string, jour: string): Promise<boolean>;
  donnees(userId: string, jour: string): Promise<DonneesJour>;
  /** Insère en ignorant un identifiant déjà pris. */
  insererRapport(r: RapportNouveau): Promise<void>;
  /** Insère en ignorant les conflits (identifiant ou clé unique). */
  insererRappels(r: RappelServeur[]): Promise<string[]>;
}

/** Rattrapage : si une exécution est manquée, on génère encore pendant ce délai après l'heure prévue. */
export const FENETRE_MIN = 120;
export const RECAP_SEMAINE_MIN = 20 * 60; // dimanche 20:00
export const RECAP_MOIS_MIN = 8 * 60; // le 1er à 08:00
const FUSEAU_DEFAUT = 'America/Toronto';

export function minutesDe(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '');
  return m ? Math.min(1439, +m[1] * 60 + +m[2]) : 21 * 60 + 15;
}

const dansFenetre = (minutes: number, heure: number) => minutes >= heure && minutes < heure + FENETRE_MIN;
const local = (p: ProfilRapport, maintenant: number) => utcVersLocal(maintenant, p.fuseau || FUSEAU_DEFAUT);

/** Jour local dont le rapport est à produire maintenant, ou null. */
export function jourARapporter(p: ProfilRapport, maintenant: number): string | null {
  const { jour, minutes } = local(p, maintenant);
  return dansFenetre(minutes, minutesDe(p.heure_rapport)) ? jour : null;
}

export const idRapport = (userId: string, jour: string) => uuidDeterministe(`rapport:${userId}:${jour}`);
/** Les clés des rappels de rapport et de récap ne contiennent pas l'utilisateur : il entre dans l'identifiant. */
export const idRappelServeur = (userId: string, cle: string) => uuidDeterministe(`rappel:${userId}:${cle}`);

function rappel(userId: string, type: TypeRappel, cle: string, envoyerA: number, rapportId: string | null = null): RappelServeur {
  return { id: idRappelServeur(userId, cle), user_id: userId, type, occurrence_id: null, rapport_id: rapportId, envoyer_a: new Date(envoyerA).toISOString(), cle_unique: cle };
}

/** Rappels de récapitulatif dus maintenant : semaine (dimanche 20:00) et mois (le 1er à 08:00), heure locale. */
export function rappelsRecap(p: ProfilRapport, maintenant: number): RappelServeur[] {
  const { jour, minutes } = local(p, maintenant);
  const fuseau = p.fuseau || FUSEAU_DEFAUT;
  const res: RappelServeur[] = [];
  if (jourSemaine(jour) === 6 && dansFenetre(minutes, RECAP_SEMAINE_MIN)) {
    res.push(rappel(p.id, 'recap_semaine', `recap_semaine:${lundiDe(jour)}`, localVersUtc(jour, RECAP_SEMAINE_MIN, fuseau)));
  }
  if (jour.endsWith('-01') && dansFenetre(minutes, RECAP_MOIS_MIN)) {
    // Le récap du 1er résume le mois qui vient de finir.
    res.push(rappel(p.id, 'recap_mois', `recap_mois:${moisDe(ajouterJours(jour, -1))}`, localVersUtc(jour, RECAP_MOIS_MIN, fuseau)));
  }
  return res;
}

export interface BilanRapports { profils: number; rapports: number; rappels: number; erreurs: number }

export async function genererRapports(depot: DepotRapports, maintenant = Date.now()): Promise<BilanRapports> {
  const profils = await depot.profils();
  const bilan: BilanRapports = { profils: profils.length, rapports: 0, rappels: 0, erreurs: 0 };
  const rappels: RappelServeur[] = [];
  const iso = new Date(maintenant).toISOString();
  for (const p of profils) {
    try {
      rappels.push(...rappelsRecap(p, maintenant));
      const jour = jourARapporter(p, maintenant);
      if (!jour || (await depot.rapportExiste(p.id, jour))) continue;
      const contenu = construireContenu(await depot.donnees(p.id, jour), jour);
      const id = idRapport(p.id, jour);
      await depot.insererRapport({ id, user_id: p.id, jour, contenu, genere_a: iso, maj_a: iso, envoye_a: null });
      rappels.push(rappel(p.id, 'rapport', `rapport:${jour}`, maintenant, id));
      bilan.rapports++;
    } catch (e) {
      bilan.erreurs++;
      console.error('generer-rapports :', e instanceof Error ? e.message : String(e));
    }
  }
  if (rappels.length) bilan.rappels = (await depot.insererRappels(rappels)).length;
  return bilan;
}
