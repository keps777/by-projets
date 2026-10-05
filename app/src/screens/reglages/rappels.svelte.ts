// « Quels rappels recevoir » : choix par type de rappel. Le profil n'a pas encore de colonne pour ces choix ;
// en attendant, ils sont gardés sur l'appareil (voir le rapport de session : lacune du modèle de données).
export type TypeRappelChoisi = 'bloc' | 'rapport' | 'recap_semaine' | 'recap_mois';
export type ChoixRappels = Record<TypeRappelChoisi, boolean>;

const CLE = 'luther-life:rappels-recus';
const DEFAUT: ChoixRappels = { bloc: true, rapport: true, recap_semaine: true, recap_mois: true };

function lire(): ChoixRappels {
  try { return { ...DEFAUT, ...(JSON.parse(localStorage.getItem(CLE) ?? '{}') as Partial<ChoixRappels>) }; } catch { return { ...DEFAUT }; }
}

class Rappels {
  choix = $state<ChoixRappels>(lire());
  basculer(t: TypeRappelChoisi): void {
    this.choix = { ...this.choix, [t]: !this.choix[t] };
    try { localStorage.setItem(CLE, JSON.stringify(this.choix)); } catch { /* stockage indisponible */ }
  }
}
export const rappelsRecus = new Rappels();
