// Tranche d'état « auto », partagée par l'application membre (/auto) et le portail concessionnaire (/portail/concession).
import { tranche, app, maintenant } from '../../data/store.svelte.ts';
import { ASSURANCES, type Assurance, type Etape } from '../../core/auto.ts';
import { mensualite, type Controle } from '../../core/credit.ts';
import { jourDe } from '../../core/dates.ts';

export const CONCESSION = 'Auto Plus Bassa';
export type EtatVehicule = 'occasion' | 'quasi_neuve' | 'neuve';
export const TAGS_ETAT: Record<EtatVehicule, { libelle: string; couleur: string }> = {
  occasion: { libelle: 'OCCASION CERTIFIÉE', couleur: '#7C93FF' },
  quasi_neuve: { libelle: 'QUASI NEUVE', couleur: '#3DD598' },
  neuve: { libelle: 'NEUVE', couleur: '#3DD598' }
};

export interface Vehicule {
  id: string; titre: string; /** « la Yaris » (bouton de simulation). */ court: string; type: 'voiture' | 'moto'; meta: string; prix: number; etat: EtatVehicule;
  concession: string; controle: boolean; valeurExpertisee?: number; publie: boolean; /** Livré à un client : n'est plus proposé. */ vendu: boolean; couleur: string;
}
export interface Rdv { jour: string; heure: string; label: string }
export interface Dossier {
  id: string; numero: string; membre: boolean; client: string; score: number;
  vehiculeId: string; vehiculeTitre: string; prix: number; apport: number; duree: number; assurance: Assurance; taux: number;
  financement: number; mensualite: number;
  decision: { approuve: boolean; motif: string | null; controles: Controle[] } | null;
  etape: Etape; docs: boolean[]; creeLe: number; offreJusqua: string;
  signeLe: number | null; signature: string | null; creditId: string | null; rdv: Rdv | null; livreLe: number | null; motifRefus: string | null;
}
export interface Brouillon { vehiculeId: string; apport: number; duree: number; assurance: Assurance }
export interface TrancheAuto {
  vehicules: Vehicule[]; dossiers: Dossier[];
  /** Coffre voiture du membre : d'où part l'apport. */
  coffreVoiture: number;
  /** Signature dessinée lors d'un précédent contrat (tracé SVG), réutilisable. */
  signatureEnregistree: string | null;
  assuranceProposee: boolean;
  /** Ventes du mois déjà réalisées avant les dossiers listés (compteurs du portail). */
  baseVentes: { ventes: number; montant: number };
  monDossier: string | null; brouillon: Brouillon | null;
}

/** Tracé d'exemple de la maquette (signature d'Aïcha), viewBox 350 × 140. */
export const SIGNATURE_EXEMPLE = 'M48 96 C 70 40, 95 48, 92 86 S 120 118, 140 76 C 150 55, 160 60, 162 82 C 165 104, 180 100, 196 70 C 210 44, 228 50, 226 80 C 224 104, 246 106, 262 78 C 272 60, 290 64, 300 90';

const v = (id: string, titre: string, court: string, type: Vehicule['type'], meta: string, prix: number, etat: EtatVehicule, concession: string, couleur: string, extra: Partial<Vehicule> = {}): Vehicule =>
  ({ id, titre, court, type, meta, prix, etat, concession, controle: true, publie: true, vendu: false, couleur, ...extra });

export const vehiculesExemple = (): Vehicule[] => [
  v('v-yaris19', 'Toyota Yaris 2019', 'la Yaris', 'voiture', '68 000 km · Auto Plus Bassa · essence · 5 portes', 4_500_000, 'occasion', CONCESSION, '#C9CFDC', { valeurExpertisee: 4_800_000 }),
  v('v-swift21', 'Suzuki Swift 2021', 'la Swift', 'voiture', '31 000 km · CFAO Motors · essence · garantie 1 an', 5_200_000, 'quasi_neuve', 'CFAO Motors', '#E0574F'),
  v('v-haojue', 'Haojue 150 Pro', 'la Haojue', 'moto', 'Neuve · Moto Center Akwa · idéale moto-taxi', 750_000, 'neuve', 'Moto Center Akwa', '#2F7BFF'),
  v('v-i10', 'Hyundai i10 2018', 'la i10', 'voiture', '92 000 km · Auto Plus Bassa · essence · citadine', 3_900_000, 'occasion', CONCESSION, '#F2B84B'),
  v('v-apache', 'TVS Apache 160', "l'Apache", 'moto', 'Neuve · Moto Center Akwa · livraison 48 h', 1_150_000, 'neuve', 'Moto Center Akwa', '#3A3F4D'),
  v('v-corolla17', 'Toyota Corolla 2017', 'la Corolla', 'voiture', '74 000 km · Auto Plus Bassa · essence · berline', 5_440_000, 'occasion', CONCESSION, '#8FA7C9'),
  v('v-swift19', 'Suzuki Swift 2019', 'la Swift', 'voiture', '58 000 km · Auto Plus Bassa · essence · 5 portes', 4_160_000, 'occasion', CONCESSION, '#B8503F'),
  v('v-tucson18', 'Hyundai Tucson 2018', 'le Tucson', 'voiture', '66 000 km · Auto Plus Bassa · diesel · SUV', 8_800_000, 'occasion', CONCESSION, '#2E3A52'),
  v('v-yaris16', 'Toyota Yaris 2016', 'la Yaris', 'voiture', '97 000 km · Auto Plus Bassa · essence · 5 portes', 3_600_000, 'occasion', CONCESSION, '#D8DCE6'),
  v('v-rav4', 'Toyota RAV4 2016', 'le RAV4', 'voiture', '88 000 km · Auto Plus Bassa · essence · SUV', 7_900_000, 'occasion', CONCESSION, '#5B6B84', { publie: false, vendu: true }),
  v('v-hilux15', 'Toyota Hilux 2015', 'le Hilux', 'voiture', '120 000 km · Auto Plus Bassa · diesel · pick-up', 9_200_000, 'occasion', CONCESSION, '#9AA3B2', { publie: false }),
  v('v-picanto20', 'Kia Picanto 2020', 'la Picanto', 'voiture', '34 000 km · Auto Plus Bassa · essence · citadine', 5_100_000, 'quasi_neuve', CONCESSION, '#3DB48A', { publie: false, vendu: true })
];

const TAUX_EXEMPLE = 0.015;
const exemple = (n: number, client: string, score: number | null, vehiculeId: string, titre: string, prix: number, etape: Etape, extra: Partial<Dossier> = {}): Dossier => {
  const m = Math.round(mensualite(prix, TAUX_EXEMPLE, 36)) + ASSURANCES.tous_risques.mensuel;
  return {
    id: `d-ex${n}`, numero: `CR-2026-${String(9100 + n)}`, membre: false, client, score: score ?? 0, vehiculeId, vehiculeTitre: titre, prix, apport: 0, duree: 36, assurance: 'tous_risques', taux: TAUX_EXEMPLE,
    financement: prix, mensualite: m, decision: { approuve: true, motif: null, controles: [] }, etape, docs: [true, true, true], creeLe: Date.now() - n * 86_400_000, offreJusqua: '',
    signeLe: null, signature: null, creditId: null, rdv: null, livreLe: null, motifRefus: null, ...extra
  };
};

export function dossiersExemple(now = maintenant()): Dossier[] {
  const d = new Date(now); const jourDuMois = (j: number) => new Date(d.getFullYear(), d.getMonth(), j, 10).getTime();
  const j = jourDe(d);
  return [
    exemple(1, 'Jean-Paul Mbarga', 742, 'v-corolla17', 'Toyota Corolla 2017', 5_440_000, 'nouvelle', { offreJusqua: j }),
    exemple(2, 'Rose Mballa', 768, 'v-swift19', 'Suzuki Swift 2019', 4_160_000, 'nouvelle', { offreJusqua: j }),
    exemple(3, 'Paul Kamga', 731, 'v-tucson18', 'Hyundai Tucson 2018', 8_800_000, 'etude', { docs: [true, false, false] }),
    exemple(4, 'Sandrine Owona', 715, 'v-yaris16', 'Toyota Yaris 2016', 3_600_000, 'etude'),
    exemple(5, 'Eric Nana', 790, 'v-hilux15', 'Toyota Hilux 2015', 9_200_000, 'accordee', { signeLe: now - 2 * 86_400_000, signature: SIGNATURE_EXEMPLE }),
    exemple(6, 'Clarisse Biya', 756, 'v-picanto20', 'Kia Picanto 2020', 5_100_000, 'livree', { signeLe: jourDuMois(1), signature: SIGNATURE_EXEMPLE, livreLe: jourDuMois(8) }),
    exemple(7, 'Arnaud Fouda', 748, 'v-rav4', 'Toyota RAV4 2016', 7_900_000, 'livree', { signeLe: jourDuMois(1), signature: SIGNATURE_EXEMPLE, livreLe: jourDuMois(3) })
  ];
}

export const defautAuto = (): TrancheAuto => ({
  vehicules: vehiculesExemple(), dossiers: dossiersExemple(),
  coffreVoiture: app.mode === 'demo' ? 1_200_000 : 0,
  signatureEnregistree: app.mode === 'demo' ? SIGNATURE_EXEMPLE : null,
  assuranceProposee: false, baseVentes: { ventes: 3, montant: 18_400_000 }, monDossier: null, brouillon: null
});

export const auto = (): TrancheAuto => tranche<TrancheAuto>('auto', defautAuto);
export const vehiculeDe = (id: string | null | undefined) => (id ? auto().vehicules.find((x) => x.id === id) : undefined);
export const dossierDe = (id: string | null | undefined) => (id ? auto().dossiers.find((x) => x.id === id) : undefined);
export const monDossier = () => dossierDe(auto().monDossier);
export const libelleCredit = (titre: string) => `Auto · ${titre}`;
