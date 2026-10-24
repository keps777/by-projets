// Modules activables par le patron. Les autres applications lisent `app.monde.params.modules` : un module est actif tant que sa clé n'est pas `false`
// (une clé absente, comme `ussd`, compte pour actif). `moduleActif('colis')` est la façon courte de le demander.
import { app } from '../../data/store.svelte.ts';

export interface DefModule { cle: string; nom: string; sous: string; prix: number; icone: string; /** Module de base, toujours actif. */ socle?: boolean }
export const MODULES: DefModule[] = [
  { cle: 'billets', nom: 'Billets et quai', sous: 'vente, cadence, radar de scan', prix: 0, icone: 'M3.5 7.5h17v3a2 2 0 0 0 0 4v3h-17v-3a2 2 0 0 0 0-4z', socle: true },
  { cle: 'colis', nom: 'Colis', sous: 'étiquettes, dépôt au guichet, suivi', prix: 15000, icone: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5L12 12l8-4.5M12 12v9' },
  { cle: 'relais', nom: 'Points relais', sous: 'retrait des colis chez un commerçant', prix: 5000, icone: 'M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11ZM12 10m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0' },
  { cle: 'moto', nom: 'Livraison moto', sous: 'dernier kilomètre jusqu’au destinataire', prix: 5000, icone: 'M6 17m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M18 17m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M6 17l4-8h5l3 8' },
  { cle: 'groupe', nom: 'Proches et cagnottes', sous: 'payer pour quelqu’un, bus entier', prix: 10000, icone: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z' },
  { cle: 'covoiturage', nom: 'Covoiturage', sous: 'conducteurs vérifiés sur tes lignes', prix: 15000, icone: 'M9 8m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M2.5 20a6.5 6.5 0 0 1 13 0M15 19.5a4.5 4.5 0 0 1 6.5-4' },
  { cle: 'ussd', nom: 'USSD *123# et WhatsApp', sous: 'ventes sans internet', prix: 20000, icone: 'M6 2.5h12v19H6zM10 18h4' },
  { cle: 'interAgences', nom: 'Inter-agences', sous: 'colis avec d’autres compagnies', prix: 30000, icone: 'M4 12h16M12 4l8 8-8 8' },
  { cle: 'assistant', nom: 'Assistant du patron', sous: 'questions sur tes chiffres', prix: 15000, icone: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z' },
  { cle: 'financement', nom: 'Financement', sous: 'offres de bus et avances de trésorerie', prix: 0, icone: 'M4 18L10 11l4 4 6-8M15 7h5v5' }
];
export const moduleActif = (cle: string): boolean => app.monde.params.modules[cle] !== false;
export const prixMensuel = (modules: Record<string, boolean>) => MODULES.reduce((s, m) => s + (m.socle || modules[m.cle] !== false ? m.prix : 0), 0);
