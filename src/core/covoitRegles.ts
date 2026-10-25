// Covoiturage : règle de remboursement, code de prise en charge, notes, liens de partage et d'appel. Pur, testé.

/** Hachage FNV-1a (déterministe) pour fabriquer codes, choix de démonstration et notes. */
export function hachage(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

// ------------------------------------------------------------------ annulation
export interface PalierAnnulation { avantMin: number; pourcent: number; texte: string }
/** Du plus généreux au plus strict : plus de 24 h avant, intégral ; entre 2 h et 24 h, 10 % de frais ; moins de 2 h, moitié ; trajet démarré, rien. */
export const PALIERS_ANNULATION: PalierAnnulation[] = [
  { avantMin: 24 * 60, pourcent: 100, texte: 'Plus de 24 h avant le départ : remboursement intégral' },
  { avantMin: 120, pourcent: 90, texte: 'Entre 2 h et 24 h avant : remboursé à 90 % (10 % de frais)' },
  { avantMin: 0, pourcent: 50, texte: 'Moins de 2 h avant : remboursé à 50 %, le conducteur est dédommagé' },
  { avantMin: -Infinity, pourcent: 0, texte: 'Trajet démarré : pas de remboursement, signale un problème si besoin' }
];
export interface RemboursementCovoit { rembourse: number; frais: number; pourcent: number; regle: string }
export function remboursementCovoit(montant: number, minutesAvantDepart: number, demarre = false): RemboursementCovoit {
  const palier = demarre ? PALIERS_ANNULATION[3] : PALIERS_ANNULATION.find((p) => minutesAvantDepart >= p.avantMin && p.avantMin >= 0) ?? PALIERS_ANNULATION[2];
  const rembourse = Math.round((montant * palier.pourcent) / 100);
  return { rembourse, frais: montant - rembourse, pourcent: palier.pourcent, regle: palier.texte };
}

// ------------------------------------------------------------------ prise en charge
/** Code à 4 chiffres que le voyageur donne au conducteur en montant (le même à chaque affichage). */
export const codePriseEnCharge = (offreId: string, voyageurId: string): string => String(1000 + (hachage(`${offreId}|${voyageurId}`) % 9000));

// ------------------------------------------------------------------ notes
/** Nouvelle note moyenne (une décimale) après un avis ; `nbAvis` = nombre d'avis déjà pris en compte. */
export function nouvelleNote(ancienne: number | undefined, nbAvis: number, note: number): { note: number; nbAvis: number } {
  const n = Math.max(0, nbAvis), n1 = n + 1, moyenne = ancienne === undefined || n === 0 ? note : (ancienne * n + note) / n1;
  return { note: Math.round(moyenne * 10) / 10, nbAvis: n1 };
}
export const TAGS_AVIS_CONDUCTEUR = ['Ponctuel', 'Conduite sûre', 'Voiture propre', 'Sympa', 'Bon prix'] as const;
export const TAGS_AVIS_PASSAGER = ['Ponctuel', 'Respectueux', 'Agréable', 'Bagages raisonnables'] as const;
export const noteTexte = (n?: number) => (n ? (Math.round(n * 10) / 10).toFixed(1).replace('.', ',') : '—');

// ------------------------------------------------------------------ liens
const chiffres = (tel: string) => tel.replace(/\D/g, '').replace(/^237/, '');
/** Numéro camerounais en format international : « 670000115 » → « +237670000115 ». */
export const telInternational = (tel: string) => `+237${chiffres(tel)}`;
export const lienTel = (tel: string) => `tel:${telInternational(tel)}`;
export const lienWhatsApp = (texte: string, tel?: string) => `https://wa.me/${tel ? `237${chiffres(tel)}` : ''}?text=${encodeURIComponent(texte)}`;
export interface InfosPartage { de: string; vers: string; quand: string; heure: string; conducteur: string; vehicule: string; plaque?: string; depart?: string }
/** Message WhatsApp envoyé à un proche pour qu'il suive le trajet. */
export function messagePartage(i: InfosPartage): string {
  return `Je voyage en covoiturage AfriMove : ${i.de} → ${i.vers}, ${i.quand} à ${i.heure}.\nConducteur : ${i.conducteur} · ${i.vehicule}${i.plaque ? ` (${i.plaque})` : ''}${i.depart ? `\nPoint de départ : ${i.depart}` : ''}\nJe t'envoie un message à l'arrivée.`;
}
export const MOTIFS_PROBLEME = ['Le conducteur est en retard', 'Le conducteur ne vient pas', 'Véhicule différent de la fiche', 'Comportement inquiétant', 'Prix demandé différent', 'Autre problème'] as const;
