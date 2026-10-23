import { ajouterJours, ajouterMois, jourCourt, jourDe, prochainePaie } from '../core/dates.ts';
import { maintenant } from './horloge.ts';
import type { Etat } from './types.ts';

export const vierge = (): Etat => ({
  version: 1, mode: 'vierge', compte: null, solde: 0, mouvements: [], notifications: [], credits: [], dernierePaie: null, tranches: {},
  auth: { hash: null, sel: null, verrou: { echecs: 0, verrouJusqua: null }, otp: null, derniereActivite: 0, connecte: false, biometrie: false, idBiometrie: null, appareils: [], telephoneEnCours: null },
  score: { valeur: 500, historique: [], conseilsFaits: [], signaux: { ponctualite: 50, anciennete: 50, endettement: 100, epargne: 0, dossier: 40 } }
});

const h = (jours: number, heure = 12) => { const d = new Date(maintenant()); d.setDate(d.getDate() - jours); d.setHours(heure, 0, 0, 0); return d.getTime(); };

/** Échéance de la facture des Palmiers de la démo (émise avant-hier, à régler sous 4 jours : voir `exemple()` de screens/sante/etat.ts). */
const echeanceFactureDemo = () => ajouterJours(jourDe(new Date(maintenant() - 2 * 86_400_000)), 4);

/** Aïcha Ndiba, 34 ans, logisticienne chez NDIBA LOGISTIQUE à Douala, niveau Pro (voir maquettes). Le code de démo est 482916. */
export const demo = (): Etat => {
  // La paie de référence est relative à « maintenant » (rejouable avec ?maintenant=…) : la dernière est passée, la suivante est dans le mois.
  const dernierePaie = ajouterMois(prochainePaie(jourDe(new Date(maintenant())), 28), -1);
  return {
  ...vierge(), mode: 'demo',
  compte: { id: 'u-aicha', prenom: 'Aïcha', nom: 'Ndiba', telephone: '690123456', ville: 'Douala', quartier: 'Bonamoussadi', employeur: 'NDIBA LOGISTIQUE', salaireNet: 520_000, jourPaie: 28, anciennete: '4 ans', pass: 'famille', numeroMembre: 'AM4821', cree: h(400) },
  solde: 86_500, dernierePaie,
  mouvements: [
    { id: 'm1', ts: h(1, 18), titre: 'Pharmacie du Rond-Point', sous: 'Santé', montant: -7100, ini: 'PH', categorie: 'sante' },
    { id: 'm2', ts: h(24), titre: 'Coffre Rentrée 2027', sous: 'Épargne', montant: 12_500, ini: 'CO', categorie: 'coffre' },
    { id: 'm3', ts: h(28), titre: 'Clinique Les Palmiers', sous: 'Santé', montant: -7100, ini: 'CL', categorie: 'sante' },
    { id: 'm4', ts: h(24), titre: 'Mensualité école 2 / 10', sous: 'École', montant: -44_000, ini: 'EC', categorie: 'ecole' },
    { id: 'm5', ts: h(32), titre: 'Recharge Orange Money', sous: 'Recharge', montant: 50_000, ini: 'OM', categorie: 'recharge' }
  ],
  notifications: [
    { id: 'n1', ts: Date.parse(dernierePaie + 'T09:00:00'), titre: 'Salaire reçu, Pass actif', sous: `Votre Pass Famille est actif jusqu'au ${jourCourt(ajouterMois(dernierePaie, 1, 28))}`, lu: false },
    { id: 'n2', ts: h(1, 18), titre: 'Facture Les Palmiers à régler', sous: `7 100 à payer avant le ${jourCourt(echeanceFactureDemo())}`, lu: false, lien: '/pay/facture?id=f-1190' },
    { id: 'n3', ts: h(3), titre: 'Crédit auto débloqué', sous: "Jusqu'à 4 500 000 à votre niveau Pro.", lu: true, lien: '/auto' }
  ],
  credits: [{ id: 'c-ecole', produit: 'ecole', libelle: 'École · rentrée 2026', capital: 440_000, mensualite: 44_000, duree: 10, payees: 2, prochaine: ajouterMois(dernierePaie, 1, 28), statut: 'actif' }],
  score: {
    valeur: 742, conseilsFaits: [], signaux: { ponctualite: 94, anciennete: 72, endettement: 88, epargne: 61, dossier: 80 },
    historique: [{ mois: 'mai', valeur: 650 }, { mois: 'juin', valeur: 668 }, { mois: 'juil.', valeur: 690 }, { mois: 'août', valeur: 702 }, { mois: 'sept.', valeur: 724 }, { mois: 'oct.', valeur: 742 }]
  }
  };
};
