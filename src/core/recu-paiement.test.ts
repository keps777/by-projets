import { describe, expect, it } from 'vitest';
import { texteRecu, type Recu } from './recu-paiement.ts';

const R: Recu = {
  ref: 'AM-7F2K9Q', ts: new Date(2026, 9, 21, 9, 43).getTime(), partenaire: 'Clinique Les Palmiers', ini: 'CL', lieu: '', categorie: 'sante',
  lignes: [{ nom: 'Consultation pédiatrie', montant: 15_000 }, { nom: 'Analyses sanguines', montant: 12_000 }, { nom: 'Médicaments', montant: 8500 }],
  total: 35_500, priseEnCharge: 28_400, paye: 7100, mode: 'comptant', soldeApres: 79_400, points: 4, scoreApres: 746, note: 0
};
describe('texte du reçu', () => {
  it('masque le détail des soins par défaut', () => {
    const t = texteRecu(R);
    expect(t).toContain('AM-7F2K9Q'); expect(t).toContain('Total : 35 500 FCFA'); expect(t).toContain('Payé par vous : 7 100 FCFA');
    expect(t).not.toContain('Consultation');
  });
  it('inclut le détail à la demande et décrit un étalement', () => {
    expect(texteRecu(R, true)).toContain('Consultation pédiatrie : 15 000');
    expect(texteRecu({ ...R, mode: 'etale', mois: 3, mensualite: 2440 })).toContain('en 3 fois (2 440 par mois)');
  });
});
