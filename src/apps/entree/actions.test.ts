import { beforeEach, describe, expect, it } from 'vitest';
import { app, reinitialiser } from '../../data/store.svelte.ts';
import { annulerBillet, billetsDe, notificationsDe, personne, regler, reserver } from '../../domain/actions.ts';
import { CODE_SMS_DEMO } from '../../data/constantes.ts';
import { acheter, demain, departsReservables, premierSiegeLibre } from './achat.ts';
import { ajouterProche, avancerLitiges, bilanProche, billetsAVenir, codeParrainDe, compteAppareil, creerCompteVoyageur, crediterBillets, ErreurCompte, ErreurLitige, ErreurProche, fidelite, litigesEnCours, marquerLu, marquerToutLu, mouvementsProches, ouvrirSession, palierDeLaPersonne, personneParTel, preparerFidelite, proches, signalerProbleme, utiliserPoints, voyagesPasses, bonsDisponibles, DELAI_PRISE_EN_CHARGE_MS, DELAI_REPONSE_MS, effacerMondeDemo, definirLangue } from './actions.ts';
import { preferences } from './etat.ts';

const libre = () => departsReservables('Yaoundé', 'Douala', demain())[0];
const acheterPour = (acheteurId: string, nom: string, tel: string) => { const d = libre(); const r = acheter({ departId: d.id, acheteurId, passager: { nom, tel }, canal: 'ussd', payer: true }); if (!r.ok) throw new Error(r.message); return r; };

describe('comptes voyageurs (connexion par SMS)', () => {
  beforeEach(() => reinitialiser());
  it('retrouve un voyageur quelle que soit l’écriture du numéro', () => {
    expect(personneParTel('+237 6 91 22 10 08')?.id).toBe('p-aicha'); expect(personneParTel('691221008')?.id).toBe('p-aicha'); expect(personneParTel('600000000')).toBeUndefined(); expect(personneParTel('abc')).toBeUndefined();
  });
  it('code SMS de démonstration à 4 chiffres', () => { expect(CODE_SMS_DEMO).toMatch(/^\d{4}$/); });
  it('crée un compte pour un numéro inconnu, notifie et refuse les doublons', () => {
    const p = creerCompteVoyageur('+237 6 55 12 34 56', '  Éloïse   Biya Ndzana '); expect(p).toMatchObject({ prenom: 'Éloïse', nom: 'Biya Ndzana', tel: '655123456', role: 'voyageur', points: 0 });
    expect(personneParTel('655123456')?.id).toBe(p.id); expect(notificationsDe(p.id)[0].titre).toBe('Bienvenue sur AfriMove');
    expect(() => creerCompteVoyageur('655123456', 'Autre')).toThrow(ErreurCompte); expect(() => creerCompteVoyageur('12', 'Marc')).toThrow(ErreurCompte); expect(() => creerCompteVoyageur('655999888', 'M')).toThrow(ErreurCompte);
  });
  it('un code de parrainage valide donne 500 points aux deux', () => {
    expect(codeParrainDe(personne('p-aicha')!)).toBe('AICHA-24');
    const p = creerCompteVoyageur('655123456', 'Éloïse Biya', 'aicha-24');
    expect(p.points).toBe(500); expect(personne('p-aicha')!.points).toBe(1980); expect(fidelite('p-aicha').mouvements[0].libelle).toBe('Parrainage · Éloïse');
    const q = creerCompteVoyageur('655123457', 'Marc Eto', 'FAUX-99'); expect(q.points).toBe(0);
  });
  it('ouvrirSession connecte, retient le compte de l’appareil et la langue', () => {
    expect(compteAppareil()?.id).toBe('p-aicha');
    const p = creerCompteVoyageur('655123456', 'Éloïse Biya'); p.langue = 'en'; ouvrirSession(p.id);
    expect(app.session).toMatchObject({ personneId: p.id, role: 'voyageur', vuTuto: true, langue: 'en' }); expect(compteAppareil()?.id).toBe(p.id);
  });
  it('la langue choisie est gardée dans la session et sur la fiche', () => { ouvrirSession('p-aicha'); definirLangue('pcm'); expect(app.session.langue).toBe('pcm'); expect(personne('p-aicha')!.langue).toBe('pcm'); });
});

describe('fidélité', () => {
  beforeEach(() => reinitialiser());
  it('Aïcha : 1 480 points, palier Argent, historique de départ', () => {
    preparerFidelite('p-aicha'); expect(personne('p-aicha')!.points).toBe(1480); expect(palierDeLaPersonne('p-aicha').id).toBe('argent'); expect(fidelite('p-aicha').mouvements).toHaveLength(4);
  });
  it('le billet déjà payé du monde de démo n’est pas recompté', () => { preparerFidelite('p-aicha'); expect(crediterBillets('p-aicha')).toBe(0); expect(personne('p-aicha')!.points).toBe(1480); });
  it('un billet payé donne 1 point par 100 F, une seule fois', () => {
    preparerFidelite('p-aicha'); const r = acheterPour('p-aicha', 'Aïcha Ndiba', '691221008'), pts = Math.floor(r.billet.prix / 100);
    expect(personne('p-aicha')!.points).toBe(1480 + pts); expect(crediterBillets('p-aicha')).toBe(0); expect(personne('p-aicha')!.points).toBe(1480 + pts); expect(fidelite('p-aicha').mouvements[0]).toMatchObject({ pts });
  });
  it('un billet réservé mais pas payé ne donne rien ; payé ensuite il compte', () => {
    preparerFidelite('p-aicha'); const d = libre(), { paiement } = reserver({ departId: d.id, sieges: [premierSiegeLibre(d)], passagers: [{ nom: 'Aïcha Ndiba', tel: '691221008' }], acheteurId: 'p-aicha', canal: 'app', moyen: 'momo' });
    expect(crediterBillets('p-aicha')).toBe(0); regler(paiement.id, { ok: true }); expect(crediterBillets('p-aicha')).toBe(Math.floor(d.prix / 100));
  });
  it('un billet remboursé fait reprendre ses points', () => {
    preparerFidelite('p-aicha'); const r = acheterPour('p-aicha', 'Aïcha Ndiba', '691221008'); const avant = personne('p-aicha')!.points!;
    annulerBillet(r.billet.id); crediterBillets('p-aicha'); expect(personne('p-aicha')!.points).toBe(avant - Math.floor(r.billet.prix / 100)); crediterBillets('p-aicha'); expect(personne('p-aicha')!.points).toBe(avant - Math.floor(r.billet.prix / 100));
  });
  it('utiliser 500 points crée un bon de 500 F ; refusé s’il manque des points', () => {
    preparerFidelite('p-aicha'); const r = utiliserPoints('p-aicha'); expect(r).toEqual({ ok: true, montant: 500 }); expect(personne('p-aicha')!.points).toBe(980); expect(bonsDisponibles('p-aicha')).toHaveLength(1);
    expect(palierDeLaPersonne('p-aicha').id).toBe('argent');
    personne('p-aicha')!.points = 100; expect(utiliserPoints('p-aicha')).toMatchObject({ ok: false });
  });
});

describe('litiges', () => {
  beforeEach(() => reinitialiser());
  const billet = () => billetsDe('p-aicha')[0];
  it('crée un dossier lié au billet, notifie la voyageuse et le patron', () => {
    const l = signalerProbleme({ auteurId: 'p-aicha', categorie: 'Retard', objet: { type: 'billet', id: billet().id }, texte: 'Parti avec 1 h de retard', photos: 2 });
    expect(l.id).toBe('L-2041'); expect(l.statut).toBe('ouvert'); expect(l.texte).toContain('2 photos jointes'); expect(app.monde.litiges).toHaveLength(1); expect(litigesEnCours('p-aicha')).toBe(1);
    expect(notificationsDe('p-aicha')[0].titre).toBe('Dossier L-2041 ouvert'); expect(notificationsDe('p-luther')[0].titre).toBe('Nouveau litige L-2041');
    expect(signalerProbleme({ auteurId: 'p-aicha', categorie: 'Autre', objet: { type: 'colis', id: 'col-1' }, texte: 'Colis abîmé' }).id).toBe('L-2042');
  });
  it('refuse un texte vide ou un objet inconnu', () => {
    expect(() => signalerProbleme({ auteurId: 'p-aicha', categorie: 'Retard', objet: { type: 'billet', id: billet().id }, texte: ' ' })).toThrow(ErreurLitige);
    expect(() => signalerProbleme({ auteurId: 'p-aicha', categorie: 'Retard', objet: { type: 'billet', id: 'zzz' }, texte: 'Bonjour le problème' })).toThrow(ErreurLitige); expect(app.monde.litiges).toHaveLength(0);
  });
  it('le statut avance avec l’horloge : pris en charge après 15 min, résolu après 2 h', () => {
    const l = signalerProbleme({ auteurId: 'p-aicha', categorie: 'Bus annulé', objet: { type: 'depart', id: billet().departId }, texte: 'Départ annulé' });
    avancerLitiges(l.ts + DELAI_PRISE_EN_CHARGE_MS - 1); expect(l.statut).toBe('ouvert'); avancerLitiges(l.ts + DELAI_PRISE_EN_CHARGE_MS); expect(l.statut).toBe('en_cours');
    avancerLitiges(l.ts + DELAI_REPONSE_MS); expect(l.statut).toBe('resolu'); expect(l.reponse).toBeTruthy(); expect(litigesEnCours('p-aicha')).toBe(0);
  });
});

describe('notifications', () => {
  beforeEach(() => reinitialiser());
  it('marquer lu une notification, puis toutes', () => {
    const [n] = notificationsDe('p-aicha'); expect(n.lu).toBe(false); marquerLu(n.id); expect(n.lu).toBe(true);
    app.monde.notifications.push({ id: 'x1', destId: 'p-aicha', ts: 1, titre: 'a', sous: 'b', lu: false }, { id: 'x2', destId: 'p-maman', ts: 1, titre: 'a', sous: 'b', lu: false });
    expect(marquerToutLu('p-aicha')).toBe(1); expect(app.monde.notifications.find((x) => x.id === 'x2')!.lu).toBe(false);
  });
});

describe('proches et historique', () => {
  beforeEach(() => reinitialiser());
  it('liste les proches d’Aïcha', () => { expect(proches('p-aicha').map((p) => p.prenom)).toEqual(['Marie', 'Paul']); });
  it('ajoute un proche inconnu (contact créé), rattache un numéro connu, refuse doublon et numéro invalide', () => {
    const p = ajouterProche('p-aicha', 'Tonton Sa’a', '6 55 32 98 10'); expect(proches('p-aicha')).toHaveLength(3); expect(personne(p.id)).toMatchObject({ prenom: 'Tonton', nom: 'Sa’a', tel: '655329810' });
    const j = ajouterProche('p-aicha', '', '670000101'); expect(j.id).toBe('p-fatou');
    expect(() => ajouterProche('p-aicha', 'Paul', '699000222')).toThrow(ErreurProche); expect(() => ajouterProche('p-aicha', 'Moi', '691221008')).toThrow(ErreurProche); expect(() => ajouterProche('p-aicha', 'X', '123')).toThrow(ErreurProche);
    expect(() => ajouterProche('p-aicha', '', '655000000')).toThrow(ErreurProche);
  });
  it('bilan : ce que j’ai payé pour un proche, et ce qu’il a payé pour moi', () => {
    acheterPour('p-aicha', 'Marie Ndiba', '677000111'); const d = libre(); const r = acheter({ departId: d.id, acheteurId: 'p-paul', passager: { nom: 'Aïcha Ndiba', tel: '691221008' }, canal: 'ussd', payer: true }); expect(r.ok).toBe(true);
    const b = bilanProche('p-aicha', 'p-maman'); expect(b).toMatchObject({ voyages: 1, recu: 0 }); expect(b.paye).toBeGreaterThan(0);
    expect(bilanProche('p-aicha', 'p-paul')).toMatchObject({ paye: 0, voyages: 0 }); expect(bilanProche('p-aicha', 'p-paul').recu).toBeGreaterThan(0);
    const m = mouvementsProches('p-aicha'); expect(m).toHaveLength(2); expect(m.map((x) => Math.sign(x.montant)).sort()).toEqual([-1, 1]);
  });
  it('voyages passés : un billet scanné ; le billet à venir est compté à part', () => {
    expect(voyagesPasses('p-aicha')).toHaveLength(0); expect(billetsAVenir('p-aicha')).toHaveLength(1);
    billetsDe('p-aicha')[0].statut = 'scanne'; expect(voyagesPasses('p-aicha')).toHaveLength(1); expect(billetsAVenir('p-aicha')).toHaveLength(0);
  });
});

describe('remise à zéro', () => {
  it('efface le monde de démo, billets achetés compris', () => {
    reinitialiser(); preferences(); acheterPour('p-aicha', 'Aïcha Ndiba', '691221008'); expect(billetsDe('p-aicha')).toHaveLength(2);
    effacerMondeDemo(); expect(billetsDe('p-aicha')).toHaveLength(1); expect(app.session.personneId).toBeNull(); expect(app.tranches['entree']).toBeUndefined();
  });
});
