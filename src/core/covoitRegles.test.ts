import { describe, expect, it } from 'vitest';
import { codePriseEnCharge, lienTel, lienWhatsApp, messagePartage, nouvelleNote, remboursementCovoit, telInternational } from './covoitRegles.ts';

describe('règles du covoiturage', () => {
  it('remboursement par palier', () => {
    expect(remboursementCovoit(4500, 48 * 60)).toMatchObject({ rembourse: 4500, frais: 0, pourcent: 100 });
    expect(remboursementCovoit(4500, 5 * 60)).toMatchObject({ rembourse: 4050, frais: 450, pourcent: 90 });
    expect(remboursementCovoit(4500, 60)).toMatchObject({ rembourse: 2250, frais: 2250, pourcent: 50 });
    expect(remboursementCovoit(4500, -10)).toMatchObject({ pourcent: 50 });
    expect(remboursementCovoit(4500, 60, true)).toMatchObject({ rembourse: 0, frais: 4500, pourcent: 0 });
    expect(remboursementCovoit(4500, 24 * 60).pourcent).toBe(100); expect(remboursementCovoit(4500, 120).pourcent).toBe(90);
  });
  it('code de prise en charge : 4 chiffres, stable, propre à la réservation', () => {
    const c = codePriseEnCharge('cv1', 'p-aicha'); expect(c).toMatch(/^[1-9]\d{3}$/); expect(codePriseEnCharge('cv1', 'p-aicha')).toBe(c); expect(codePriseEnCharge('cv2', 'p-aicha')).not.toBe(c);
  });
  it('nouvelle note : moyenne pondérée à une décimale', () => {
    expect(nouvelleNote(undefined, 0, 5)).toEqual({ note: 5, nbAvis: 1 }); expect(nouvelleNote(4.9, 10, 3)).toEqual({ note: 4.7, nbAvis: 11 });
    expect(nouvelleNote(5, 1, 4)).toEqual({ note: 4.5, nbAvis: 2 });
  });
  it('liens : appel et WhatsApp', () => {
    expect(telInternational('670000115')).toBe('+237670000115'); expect(lienTel('+237 670 000 115')).toBe('tel:+237670000115');
    expect(lienWhatsApp('Salut ça va')).toBe('https://wa.me/?text=Salut%20%C3%A7a%20va'); expect(lienWhatsApp('x', '670000115')).toBe('https://wa.me/237670000115?text=x');
    expect(messagePartage({ de: 'Yaoundé', vers: 'Douala', quand: 'demain', heure: '07:30', conducteur: 'Moussa K.', vehicule: 'Toyota Corolla', plaque: 'CE 482 KM' })).toContain('Yaoundé → Douala');
  });
});
