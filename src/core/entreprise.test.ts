import { describe, expect, it } from 'vitest';
import { ecrireCsv, lireCsv, detecterSeparateur } from './csv.ts';
import {
  analyserImport, analyserInvitations, ajouterJoursOuvres, calendrierPaie, codeEntreprise, coutMensuelEmployeur, etapeEnErreur, formaterTel, niuValide,
  normaliserTel, plafondCredit, rccmValide, retenueSalarie, toutValider, validerEtape, type ChampsInscription
} from './entreprise.ts';
import { texteAttestation } from './attestation.ts';

const bon: ChampsInscription = {
  raisonSociale: 'NDIBA LOGISTIQUE', rccm: 'RC/DLA/2014/B/1287', niu: 'M012345678901', secteur: 'Transport', ville: 'Douala', effectif: '260',
  contactNom: 'Ndiba RH', contactFonction: 'DRH', contactTelephone: '691224821', jourPaie: '28', part: 0.5, signature: 'Ndiba RH', convention: true
};

describe('csv', () => {
  it('détecte le séparateur et lit les guillemets', () => {
    expect(detecterSeparateur('a;b;c\n1;2;3')).toBe(';');
    expect(detecterSeparateur('a,b,c')).toBe(',');
    expect(detecterSeparateur('﻿a\tb\tc')).toBe('\t');
    expect(lireCsv('nom;note\r\n"Ndiba; Aïcha";"a ""b"""\r\n\r\nx;y')).toEqual([['nom', 'note'], ['Ndiba; Aïcha', 'a "b"'], [''], ['x', 'y']]);
  });
  it("écrit avec BOM et neutralise les formules", () => {
    const t = ecrireCsv([['nom', 'total'], ['=CMD()', 5], ['a;b', -3]]);
    expect(t.startsWith('﻿nom;total\r\n')).toBe(true);
    expect(t).toContain("'=CMD();5");
    expect(t).toContain('"a;b";-3');
  });
});

describe('identifiants', () => {
  it('téléphone camerounais', () => {
    expect(normaliserTel('+237 6 91 22 48 21')).toBe('691224821');
    expect(normaliserTel('00237691224821')).toBe('691224821');
    expect(normaliserTel('691 22 48 21')).toBe('691224821');
    expect(normaliserTel('233 42 12 34')).toBeNull();
    expect(normaliserTel('233421234')).toBeNull();
    expect(normaliserTel('233421234', true)).toBe('233421234');
    expect(normaliserTel('12345')).toBeNull();
    expect(formaterTel('691224821')).toBe('+237 6 91 22 48 21');
  });
  it('NIU et RCCM', () => {
    expect(niuValide('m012345678901')).toBe(true);
    expect(niuValide('M01234')).toBe(false);
    expect(rccmValide('rc/dla/2014/b/1287')).toBe(true);
    expect(rccmValide('RC-DLA-2014')).toBe(false);
  });
  it("code d'entreprise", () => {
    expect(codeEntreprise('Groupe Ndiba Logistique SA', 4821)).toBe('GNL-4821');
    expect(codeEntreprise('X', 7)).toBe('XXX-0007');
  });
});

describe('inscription', () => {
  it('accepte un dossier complet', () => { expect(toutValider(bon)).toEqual({}); expect(etapeEnErreur(bon)).toBe(0); });
  it('signale les champs invalides par étape', () => {
    expect(Object.keys(validerEtape(1, { ...bon, niu: 'X1', rccm: '', effectif: '0', raisonSociale: '' })).sort()).toEqual(['effectif', 'niu', 'raisonSociale', 'rccm']);
    expect(Object.keys(validerEtape(2, { ...bon, contactTelephone: '123', contactNom: '' })).sort()).toEqual(['contactNom', 'contactTelephone']);
    expect(Object.keys(validerEtape(3, { ...bon, jourPaie: '32', part: 0.25, signature: '' })).sort()).toEqual(['jourPaie', 'part', 'signature']);
    expect(validerEtape(3, { ...bon, convention: false }).convention).toBeTruthy();
    expect(etapeEnErreur({ ...bon, contactNom: '' })).toBe(2);
  });
});

describe('Pass et retenues', () => {
  it('part employeur plafonnée à 12 500', () => {
    const r = (pass: 'essentiel' | 'famille' | 'premium', part: number) => retenueSalarie({ salaire: 500_000, pass, credit: 0, coffre: 0 }, part);
    expect(r('famille', 0).pass).toBe(25_000);
    expect(r('famille', 0.5)).toMatchObject({ pass: 12_500, employeur: 12_500 });
    expect(r('famille', 1)).toMatchObject({ pass: 12_500, employeur: 12_500 }); // 100 % de 25 000 plafonné à 12 500
    expect(r('essentiel', 1)).toMatchObject({ pass: 0, employeur: 9_000 });
    expect(r('premium', 1)).toMatchObject({ pass: 47_500, employeur: 12_500 });
  });
  it('limite les crédits à 33 % du net', () => {
    expect(plafondCredit(300_000)).toBe(99_000);
    const r = retenueSalarie({ salaire: 300_000, pass: 'famille', credit: 110_000, coffre: 0 }, 0.5);
    expect(r).toMatchObject({ credit: 99_000, plafonne: true, total: 111_500 });
    const aicha = retenueSalarie({ salaire: 520_000, pass: 'famille', credit: 44_000, coffre: 12_500 }, 0.5);
    expect(aicha).toMatchObject({ credit: 44_000, plafonne: false, total: 69_000 });
  });
  it("salaire inconnu : pas de plafonnement, pas de Pass : pas de coût", () => {
    expect(retenueSalarie({ salaire: 0, pass: null, credit: 5_000, coffre: 0 }, 0.5)).toMatchObject({ credit: 5_000, plafonne: false, pass: 0, employeur: 0 });
  });
  it('coût mensuel employeur', () => {
    expect(coutMensuelEmployeur(['famille', 'essentiel', null, 'premium'], 0.5)).toBe(12_500 + 4_500 + 12_500);
    expect(coutMensuelEmployeur(['famille'], 0)).toBe(0);
  });
});

describe('calendrier de paie', () => {
  it('jours ouvrés', () => {
    expect(ajouterJoursOuvres('2026-10-28', 2)).toBe('2026-10-30');
    expect(ajouterJoursOuvres('2026-10-30', 2)).toBe('2026-11-03');
  });
  it('prochaines paies', () => {
    const c = calendrierPaie(28, '2026-10-22', 3);
    expect(c.map((x) => x.paie)).toEqual(['2026-10-28', '2026-11-28', '2026-12-28']);
    expect(c[0]).toMatchObject({ fichierAvant: '2026-10-25', reversement: '2026-10-30' });
    expect(calendrierPaie(31, '2026-02-10', 2).map((x) => x.paie)).toEqual(['2026-02-28', '2026-03-31']);
    expect(calendrierPaie(28, '2026-10-28', 1)[0].paie).toBe('2026-10-28');
  });
});

describe('import CSV', () => {
  const csv = 'Nom;Matricule;Téléphone;Salaire net;Service\r\nJean Mbarga;ndl-0188;+237 6 90 11 22 33;350 000;Logistique\r\n;NDL-2;690000000;;\r\nPaul Eto;NDL-0188;690000001;abc;\r\nMarie Kana;NDL-9;12345;;\r\nLuc Ayissi;NDL-10;690112233;;\r\n\r\nEve Mani;NDL-11;691000000;200000;';
  const a = analyserImport(csv, { matricules: ['NDL-0412'], telephones: ['695000000'] });
  it('rapporte les erreurs ligne par ligne', () => {
    expect(a.lignes.length).toBe(6);
    expect(a.valides.map((l) => l.matricule)).toEqual(['NDL-0188', 'NDL-11']);
    const par = (n: number) => a.lignes.find((l) => l.ligne === n)!.erreurs;
    expect(par(3)).toEqual(['Nom manquant']);
    expect(par(4)).toEqual(['Matricule en double (ligne 2)', 'Salaire illisible (chiffres uniquement)']);
    expect(par(5)).toEqual(['Téléphone invalide (9 chiffres, commençant par 6)']);
    expect(par(6)).toEqual(['Téléphone en double (ligne 2)']); // 690112233 = 6 90 11 22 33 de la ligne 2
    expect(a.valides[0]).toMatchObject({ nom: 'Jean Mbarga', telephone: '690112233', salaire: 350_000, service: 'Logistique' });
  });
  it('refuse les doublons avec les salariés existants', () => {
    const b = analyserImport('Ana;ndl-0412;695000000', { matricules: ['NDL-0412'], telephones: ['695000000'] });
    expect(b.lignes[0].erreurs).toEqual(['Matricule déjà enregistré', 'Téléphone déjà enregistré']);
  });
  it('sans en-tête : colonnes dans l’ordre nom, matricule, téléphone', () => {
    expect(analyserImport('Ana Bela,NDL-5,690000005').valides).toHaveLength(1);
  });
  it('fichiers inutilisables', () => {
    expect(analyserImport('').erreursGlobales).toEqual(['Le fichier est vide.']);
    expect(analyserImport('nom;matricule\nAna;N1').erreursGlobales[0]).toContain('téléphone');
    expect(analyserImport('nom;matricule;telephone').erreursGlobales).toEqual(['Aucune ligne de salarié dans le fichier.']);
  });
  it('invitations', () => {
    const r = analyserInvitations('690000001\n\n+237 691 00 00 02\nabc\nrh@x.cm\n690000001', ['691000002']);
    expect(r.valides).toEqual(['690000001']);
    expect(r.erreurs.map((e) => e.ligne)).toEqual([3, 4, 5, 6]);
    expect(r.erreurs[2].message).toContain('e-mail');
  });
});

describe('attestation de salaire', () => {
  it('rédige le texte avec le salaire et le jour de paie', () => {
    const t = texteAttestation({ numero: 'ATT-2026-0001', employeur: 'NDIBA LOGISTIQUE', ville: 'Douala', signataire: 'Ndiba RH', fonction: 'DRH', salarie: 'Aïcha Ndiba', matricule: 'NDL-0001', salaire: 520_000, jourPaie: 28, anciennete: '4 ans', date: '2026-10-22' });
    expect(t.join('\n')).toContain('520 000 FCFA');
    expect(t.join('\n')).toContain('le 28 de chaque mois');
    expect(t.join('\n')).toContain('Fait à Douala, le 22 octobre 2026');
    expect(t.join('\n')).toContain('depuis 4 ans');
  });
});
