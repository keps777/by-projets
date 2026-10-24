import { describe, expect, it } from 'vitest';
import { analyser, dansFenetre, libelleJour } from './voix.ts';

const REF = '2026-11-03'; // mardi

describe('analyse de la phrase dite', () => {
  it('comprend la phrase de la maquette', () => {
    expect(analyser('Je veux aller à Douala demain matin', REF)).toMatchObject({ destination: 'Douala', origine: null, jour: '2026-11-04', periode: 'matin', heure: null, fenetre: ['06:00', '12:00'] });
  });
  it('accepte une ville seule, sans accent ni majuscule', () => {
    expect(analyser('douala', REF)).toMatchObject({ destination: 'Douala', jour: null, periode: null, fenetre: null });
    expect(analyser('YAOUNDE demain', REF)).toMatchObject({ destination: 'Yaoundé', jour: '2026-11-04' });
  });
  it('distingue le départ et l’arrivée', () => {
    expect(analyser('de Douala à Yaoundé', REF)).toMatchObject({ origine: 'Douala', destination: 'Yaoundé' });
    expect(analyser('Yaoundé Bafoussam', REF)).toMatchObject({ origine: 'Yaoundé', destination: 'Bafoussam' });
    expect(analyser('depuis Bamenda', REF)).toMatchObject({ origine: 'Bamenda', destination: null });
    expect(analyser('from Yaoundé to Kribi tomorrow evening', REF)).toMatchObject({ origine: 'Yaoundé', destination: 'Kribi', jour: '2026-11-04', periode: 'soir' });
  });
  it('comprend le pidgin et l’anglais', () => {
    expect(analyser('I wan go Douala tomorrow morning', REF)).toMatchObject({ destination: 'Douala', jour: '2026-11-04', periode: 'matin' });
    expect(analyser('go Bafoussam tomoro', REF)).toMatchObject({ destination: 'Bafoussam', jour: '2026-11-04' });
  });
  it('comprend les jours : après-demain, jour de semaine, dans N jours, date', () => {
    expect(analyser('Douala après-demain', REF).jour).toBe('2026-11-05');
    expect(analyser('Douala vendredi', REF).jour).toBe('2026-11-06');
    expect(analyser('Douala mardi', REF).jour).toBe('2026-11-10');
    expect(analyser('Douala dans 3 jours', REF).jour).toBe('2026-11-06');
    expect(analyser('Douala le 15 novembre', REF).jour).toBe('2026-11-15');
    expect(analyser('Douala le 2 novembre', REF).jour).toBe('2027-11-02');
    expect(analyser('Douala ce week-end', REF).jour).toBe('2026-11-07');
    expect(analyser('Douala aujourd’hui', REF).jour).toBe(REF);
  });
  it('« ce soir » vaut aujourd’hui, le soir', () => {
    expect(analyser('Douala ce soir', REF)).toMatchObject({ jour: REF, periode: 'soir', fenetre: ['17:00', '24:00'] });
  });
  it('comprend les heures précises', () => {
    expect(analyser('Douala demain à 14h30', REF)).toMatchObject({ heure: '14:30', fenetre: ['13:30', '15:30'] });
    expect(analyser('Douala à 8 heures', REF).heure).toBe('08:00');
    expect(analyser('Douala demain 5pm', REF).heure).toBe('17:00');
    expect(analyser('Douala à 6h du soir', REF).heure).toBe('18:00');
    expect(analyser('Douala à 25h', REF).heure).toBeNull();
  });
  it('distingue après-midi, midi et matin', () => {
    expect(analyser('Douala cet après-midi', REF).periode).toBe('apres-midi');
    expect(analyser('Douala à midi', REF).periode).toBe('midi');
    expect(analyser('Douala très tôt', REF).periode).toBe('aube');
    expect(analyser('Douala cette nuit', REF)).toMatchObject({ jour: REF, periode: 'nuit' });
  });
  it('ne comprend rien à une phrase sans ville', () => {
    expect(analyser('bonjour', REF)).toMatchObject({ destination: null, origine: null, jour: null });
    expect(analyser('', REF).destination).toBeNull();
  });
  it('ne confond pas une ville avec un mot qui la contient', () => {
    expect(analyser('moudouala', REF).destination).toBeNull();
  });
  it('fenêtres et libellés', () => {
    expect(dansFenetre('08:00', ['06:00', '12:00'])).toBe(true); expect(dansFenetre('12:00', ['06:00', '12:00'])).toBe(false);
    expect(dansFenetre('23:30', ['21:00', '04:00'])).toBe(true); expect(dansFenetre('02:00', ['21:00', '04:00'])).toBe(true); expect(dansFenetre('10:00', ['21:00', '04:00'])).toBe(false);
    expect(libelleJour(REF, REF)).toBe('Aujourd’hui'); expect(libelleJour('2026-11-04', REF)).toBe('Demain'); expect(libelleJour('2026-11-05', REF)).toBe('Après-demain'); expect(libelleJour('2026-11-09', REF)).toBe('lun. 9 nov.');
  });
});
