import { describe, expect, it } from 'vitest';
import { lienSms, lienWhatsApp, messagePartage } from './partage.ts';

const i = { de: 'Aïcha', passager: 'Aïcha', pourMoi: true, trajet: 'Yaoundé → Douala', quand: 'Bêta Express mer. 4 nov. 08:00', place: 'place 3C', code: 'AM-7F3K-22', destinataire: 'Maman' };
describe('partage d’un billet', () => {
  it('lien WhatsApp : indicatif 237, numéro nettoyé, message encodé', () => {
    const l = lienWhatsApp('6 55 32 98 10', 'Salut & bon voyage'); expect(l.startsWith('https://wa.me/237655329810?text=')).toBe(true); expect(decodeURIComponent(l.split('text=')[1])).toBe('Salut & bon voyage');
  });
  it('lien SMS', () => { expect(lienSms('655329810', 'Code AM-7F3K-22')).toBe('sms:+237655329810?body=Code%20AM-7F3K-22'); });
  it('message : son billet ou le billet d’un autre, avec le code', () => {
    expect(messagePartage(i)).toContain('Aïcha te partage son billet Yaoundé → Douala'); expect(messagePartage(i)).toContain('Code AM-7F3K-22');
    expect(messagePartage({ ...i, passager: 'Marie', pourMoi: false })).toContain('te partage le billet de Marie'); expect(messagePartage(i)).toMatch(/Bon voyage Maman !$/);
  });
});
