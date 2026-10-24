// Mini dictionnaire des écrans d'entrée et de Moi/Réglages : français, English, Pidgin camerounais.
// La langue vit dans `app.session.langue` (choisie au Splash, changée dans Réglages). Une clé absente retombe sur le français.
import { app } from '../../data/store.svelte.ts';

export type Langue = 'fr' | 'en' | 'pcm';
export const LANGUES: { id: Langue; nom: string }[] = [{ id: 'fr', nom: 'Français' }, { id: 'en', nom: 'English' }, { id: 'pcm', nom: 'Pidgin' }];

const D = {
  fr: {
    tagline: 'Tout le transport, dans ta poche.', taglineGrad: 'Bus, moto, colis, proches.', choisisLangue: 'Choisis ta langue', commencer: 'Commencer', dejaCompte: 'J’ai déjà un compte',
    jingleNote: 'Un jingle de 2 s joue à la première ouverture · coupé si le téléphone est en silencieux', langue: 'Langue',
    passer: 'Passer', suivant: 'Suivant', precedent: 'Précédent', cestParti: 'C’est parti',
    tuto1t: 'Tourne, choisis', tuto1: 'Les départs sont en 3D : tourne le panorama, le plus proche de l’heure est en face. Une touche pour choisir.',
    tuto2t: 'Paye par le visage', tuto2: 'Place dans un bus en 3D, puis MoMo, Orange Money ou carte. Ton visage confirme, rien à taper.',
    tuto3t: 'Suis ton bus', tuto3: 'Billet holographique signé, valable sans internet. Le bus avance sur une carte en relief, même dans l’îlot de ton écran.',
    pasMdp: 'Pas de mot de passe. Ton téléphone te reconnaît.', regardeEcran: 'Regarde l’écran', toucheCadre: 'Touche le cadre pour simuler Face ID.', continuerFace: 'Continuer avec Face ID', voirDeparts: 'Voir les départs',
    salut: 'Salut', utiliserNumero: 'Utiliser mon numéro', rienEnvoye: 'Rien n’est envoyé sans ton accord · le code SMS et le *123# restent possibles',
    codeSms: 'Code reçu par SMS', lectureAuto: 'lecture auto', renvoyerDans: 'Renvoyer dans', renvoyer: 'Renvoyer le code', continuer: 'Continuer', ussdSansInternet: '*123# sans internet', codeWhatsapp: 'Code par WhatsApp',
    moi: 'Moi', mesBillets: 'Mes billets', mesProches: 'Mes proches', mesColis: 'Mes colis', reglages: 'Réglages', autorisations: 'Autorisations', signaler: 'Signaler', gagner: 'Gagner avec AfriMove',
    visageActive: 'visage activé', niveau: 'niveau', aide: 'Aide · *123# · WhatsApp · 8 050',
    apparence: 'Apparence', securite: 'Sécurité et paiement', confirmerVisage: 'Confirmer par le visage', ceQuiReveille: 'Ce qui me réveille', donnees: 'Données', seDeconnecter: 'Se déconnecter',
    notifications: 'Notifications', toutMarquerLu: 'Tout marquer lu', toutLu: 'Tout est lu', aujourdhui: 'Aujourd’hui', hier: 'Hier', avant: 'Plus tôt', voyager: 'Voyager'
  },
  en: {
    tagline: 'All your travel, in your pocket.', taglineGrad: 'Bus, moto, parcels, family.', choisisLangue: 'Pick your language', commencer: 'Get started', dejaCompte: 'I already have an account',
    jingleNote: 'A 2-second jingle plays on first launch · muted if your phone is on silent', langue: 'Language',
    passer: 'Skip', suivant: 'Next', precedent: 'Back', cestParti: 'Let’s go',
    tuto1t: 'Spin, pick', tuto1: 'Departures are in 3D: spin the panorama, the one closest to the hour faces you. One tap to choose.',
    tuto2t: 'Pay with your face', tuto2: 'Pick a seat on a 3D bus, then MoMo, Orange Money or card. Your face confirms, nothing to type.',
    tuto3t: 'Follow your bus', tuto3: 'A signed holographic ticket that works offline. The bus moves on a relief map, even on your lock-screen island.',
    pasMdp: 'No password. Your phone recognises you.', regardeEcran: 'Look at the screen', toucheCadre: 'Tap the frame to simulate Face ID.', continuerFace: 'Continue with Face ID', voirDeparts: 'See departures',
    salut: 'Hi', utiliserNumero: 'Use my phone number', rienEnvoye: 'Nothing is sent without your consent · SMS code and *123# are still possible',
    codeSms: 'Code received by SMS', lectureAuto: 'auto-read', renvoyerDans: 'Resend in', renvoyer: 'Resend the code', continuer: 'Continue', ussdSansInternet: '*123# without internet', codeWhatsapp: 'Code by WhatsApp',
    moi: 'Me', mesBillets: 'My tickets', mesProches: 'My people', mesColis: 'My parcels', reglages: 'Settings', autorisations: 'Permissions', signaler: 'Report', gagner: 'Earn with AfriMove',
    visageActive: 'face enabled', niveau: 'level', aide: 'Help · *123# · WhatsApp · 8 050',
    apparence: 'Appearance', securite: 'Security and payment', confirmerVisage: 'Confirm with your face', ceQuiReveille: 'What wakes me up', donnees: 'Data', seDeconnecter: 'Log out',
    notifications: 'Notifications', toutMarquerLu: 'Mark all as read', toutLu: 'All read', aujourdhui: 'Today', hier: 'Yesterday', avant: 'Earlier', voyager: 'Travel'
  },
  pcm: {
    tagline: 'Everi transport, for yi pocket.', taglineGrad: 'Bus, moto, parcel, family.', choisisLangue: 'Pick yi language', commencer: 'Make we start', dejaCompte: 'I don get account',
    jingleNote: 'Small jingle go play for 2 seconds for first time · e go stop if yi phone dey silent', langue: 'Language',
    passer: 'Skip', suivant: 'Next one', precedent: 'Go back', cestParti: 'Make we go',
    tuto1t: 'Turn am, pick am', tuto1: 'Di departures dey for 3D: turn di panorama, di one wey near di time dey front. Touch one time to pick.',
    tuto2t: 'Pay with yi face', tuto2: 'Pick seat for 3D bus, afta MoMo, Orange Money or card. Yi face go confirm, no need to type.',
    tuto3t: 'Follow yi bus', tuto3: 'Ticket wey get signature, e work even if no network. Di bus dey waka for map, even for yi screen island.',
    pasMdp: 'No password. Yi phone dey know you.', regardeEcran: 'Look di screen', toucheCadre: 'Touch di frame make we simulate Face ID.', continuerFace: 'Continue with Face ID', voirDeparts: 'See di departures',
    salut: 'How far', utiliserNumero: 'Use my number', rienEnvoye: 'Nothing go commot without yi permission · SMS code and *123# still dey',
    codeSms: 'Code wey dem send for SMS', lectureAuto: 'auto-read', renvoyerDans: 'Send again for', renvoyer: 'Send di code again', continuer: 'Continue', ussdSansInternet: '*123# without internet', codeWhatsapp: 'Code for WhatsApp',
    moi: 'Me', mesBillets: 'My tickets', mesProches: 'My people', mesColis: 'My parcels', reglages: 'Settings', autorisations: 'Permissions', signaler: 'Report', gagner: 'Make money with AfriMove',
    visageActive: 'face don on', niveau: 'level', aide: 'Help · *123# · WhatsApp · 8 050',
    apparence: 'How e look', securite: 'Security and payment', confirmerVisage: 'Confirm with face', ceQuiReveille: 'Wetin di wake me', donnees: 'Data', seDeconnecter: 'Log out',
    notifications: 'Notifications', toutMarquerLu: 'Mark everi one as read', toutLu: 'All don read', aujourdhui: 'Today', hier: 'Yesterday', avant: 'Before', voyager: 'Travel'
  }
} as const;

export type CleI18n = keyof (typeof D)['fr'];
/** Traduit une clé dans la langue de la session (réactif : lit `app.session.langue`). */
export function t(cle: CleI18n, langue: Langue = app.session.langue): string {
  return (D[langue] as Record<string, string>)[cle] ?? D.fr[cle];
}
export const cleDeLangue = (l: string): l is Langue => l === 'fr' || l === 'en' || l === 'pcm';
