// Financement : simulateur de crédit à annuités constantes (bus, avance de trésorerie), plafond selon les recettes, score de confiance.
export type TypeOffre = 'bus' | 'tresorerie' | 'entretien';
export interface Offre {
  id: string; nom: string; par: string; type: TypeOffre; /** Montant maximum de l'offre (F). */ montantMax: number; montantMin: number; durees: number[]; dureeDefaut: number;
  /** Taux nominal par mois, en % (0 = sans intérêt). */ tauxMensuelPct: number; apportPct: number; badge: string; ton: 'ac' | 'ok' | 'inf'; piecesRequises: string[];
}
const annuelEnMensuel = (annuelPct: number) => annuelPct / 12;
export const OFFRES: Offre[] = [
  { id: 'bus-70', nom: 'Bus 70 places · Coaster', par: 'Afriland First Bank · via AfriMove', type: 'bus', montantMax: 38_000_000, montantMin: 20_000_000, durees: [24, 36, 48], dureeDefaut: 36, tauxMensuelPct: annuelEnMensuel(9.5), apportPct: 15, badge: 'recommandé', ton: 'ac', piecesRequises: ['releves', 'registre', 'cni', 'devis'] },
  { id: 'roulement', nom: 'Fonds de roulement', par: 'MTN MoMo Business', type: 'tresorerie', montantMax: 5_000_000, montantMin: 500_000, durees: [3, 6, 9], dureeDefaut: 6, tauxMensuelPct: 1.8, apportPct: 0, badge: 'rapide · 48 h', ton: 'ok', piecesRequises: ['releves', 'cni'] },
  { id: 'entretien', nom: 'Pneus et entretien', par: 'Coopérative transporteurs', type: 'entretien', montantMax: 1_500_000, montantMin: 300_000, durees: [4], dureeDefaut: 4, tauxMensuelPct: 0, apportPct: 0, badge: 'sans intérêt', ton: 'inf', piecesRequises: ['releves'] }
];
export const offreParId = (id: string) => OFFRES.find((o) => o.id === id);
/** Part maximale de la recette mensuelle que la mensualité peut représenter. */
export const PART_MAX = 0.2;

/** Mensualité d'un crédit à annuités constantes : K·i / (1 − (1+i)^−n). Sans intérêt : K / n. Arrondie au franc. */
export function mensualite(capital: number, tauxMensuelPct: number, mois: number): number {
  if (capital <= 0 || mois <= 0) return 0;
  const i = tauxMensuelPct / 100;
  return Math.round(i === 0 ? capital / mois : (capital * i) / (1 - Math.pow(1 + i, -mois)));
}
/** Capital qu'on peut emprunter pour une mensualité donnée (valeur actuelle de l'annuité). */
export function capitalPour(mensualiteMax: number, tauxMensuelPct: number, mois: number): number {
  if (mensualiteMax <= 0 || mois <= 0) return 0;
  const i = tauxMensuelPct / 100;
  return Math.floor(i === 0 ? mensualiteMax * mois : (mensualiteMax * (1 - Math.pow(1 + i, -mois))) / i);
}
export interface Simulation { montant: number; duree: number; apport: number; finance: number; mensualite: number; total: number; cout: number; partRecette: number | null; plafond: number; depasse: boolean; raison?: string }
/** Simule une offre : `montant` = prix du bien ou de l'avance ; l'apport est déduit du capital financé ; le plafond vient des recettes mensuelles. */
export function simuler(offre: Offre, o: { montant: number; duree: number; recetteMensuelle: number }): Simulation {
  const montant = Math.min(offre.montantMax, Math.max(0, Math.round(o.montant))), duree = offre.durees.includes(o.duree) ? o.duree : offre.dureeDefaut;
  const apport = Math.round((montant * offre.apportPct) / 100), finance = montant - apport, m = mensualite(finance, offre.tauxMensuelPct, duree);
  const plafondMensualite = Math.floor(o.recetteMensuelle * PART_MAX), plafond = Math.min(offre.montantMax, capitalPour(plafondMensualite, offre.tauxMensuelPct, duree) + apport);
  const part = o.recetteMensuelle > 0 ? Math.round((m / o.recetteMensuelle) * 1000) / 10 : null;
  let raison: string | undefined;
  if (montant < offre.montantMin) raison = `Montant minimum : ${offre.montantMin.toLocaleString('fr-FR')} F`;
  else if (o.recetteMensuelle <= 0) raison = 'Pas encore assez de recettes enregistrées';
  else if (m > plafondMensualite) raison = `La mensualité dépasse ${Math.round(PART_MAX * 100)} % de ta recette mensuelle`;
  return { montant, duree, apport, finance, mensualite: m, total: m * duree + apport, cout: m * duree - finance, partRecette: part, plafond, depasse: !!raison, raison };
}

export interface Confiance { score: number; eligible: boolean; regularite: number; ecartsPct: number; ponctualitePct: number; jours: number }
/** Score de confiance (0 à 100) : régularité des recettes quotidiennes (50 pts), faibles écarts de caisse (25 pts), ponctualité des départs (25 pts). */
export function scoreConfiance(o: { recettesJour: number[]; ecartsAbs: number; recetteCaisses: number; departsPartis: number; departsAHeure: number }): Confiance {
  const r = o.recettesJour.filter((x) => x > 0), jours = r.length, moy = r.length ? r.reduce((s, x) => s + x, 0) / r.length : 0;
  const cv = moy > 0 ? Math.sqrt(r.reduce((s, x) => s + (x - moy) ** 2, 0) / r.length) / moy : 1, regularite = Math.max(0, Math.min(1, 1 - cv));
  const ecartsPct = o.recetteCaisses > 0 ? Math.round((o.ecartsAbs / o.recetteCaisses) * 1000) / 10 : 0, ponctualitePct = o.departsPartis > 0 ? Math.round((o.departsAHeure / o.departsPartis) * 100) : 100;
  const score = Math.round(regularite * 50 + Math.max(0, 1 - ecartsPct / 2) * 25 + (ponctualitePct / 100) * 25);
  return { score: jours === 0 ? 0 : score, eligible: jours >= 7 && score >= 60, regularite: Math.round(regularite * 100), ecartsPct, ponctualitePct, jours };
}
export const ETAPES_DOSSIER = ['Dossier envoyé', 'Analyse par la banque', 'Visite de la gare', 'Offre signée', 'Fonds versés'] as const;
export const DELAIS_ETAPES = ['', '2–5 jours', 'à planifier', '—', '—'] as const;
export const PILL_ETAPE = ['envoyé', 'en analyse', 'visite', 'offre', 'versé'] as const;
export const PIECES: Record<string, { nom: string; detail: string }> = {
  releves: { nom: 'Relevés de caisse', detail: 'générés par AfriMove à partir de tes caisses' }, registre: { nom: 'Registre de commerce', detail: 'scanné' },
  cni: { nom: 'CNI du gérant', detail: 'vérifiée par le visage' }, devis: { nom: 'Devis du bus', detail: 'concession Toyota Douala' }
};
