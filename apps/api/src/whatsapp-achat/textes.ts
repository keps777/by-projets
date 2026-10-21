import type { JourDemande, Periode } from "./comprehension";
import type { Langue } from "./langues";

/**
 * Les messages de la conversation, en français, en anglais et en pidgin du Cameroun.
 *
 * Trois messages viennent de la planche « USSD » (`docs/maquettes-v3/USSD.dc.html`, fixtures
 * `packages/fixtures/src/ecrans/USSD.ts`, conversation WhatsApp) et sont repris **mot pour mot en
 * français** : la liste des départs, la proposition de siège avec son paiement, et le billet payé.
 * `textes.test.ts` les compare au fixture, ligne à ligne. Tout le reste (aide, erreurs, choix du
 * siège, rappels) est écrit ici faute de maquette ; l'anglais et le pidgin sont **entièrement**
 * inventés et à faire relire par des locuteurs : voir `TEXTES_INVENTES` et le README.
 */

export const LONGUEUR_MESSAGE_MAX = 1000;

/** Une ligne de la liste des départs (planche : « 1 · 08:00 Bêta VIP 7 500 »). */
export interface LigneDepart {
  /** « HH:MM », heure de Douala. */
  heure: string;
  /** Nom complet de la compagnie : « Bêta Voyages ». */
  compagnie: string;
  vip: boolean;
  prix: number;
}

export interface SiegeLibre {
  numero: number;
  /** Emplacement du plan (`emplacementSiege` de la billetterie) : « fenêtre », « couloir · près de la porte »… */
  emplacement: string;
}

export interface BilletPaye {
  numero: string;
  code: string;
  /** Prénom du compte, ou `null` (compte sans nom : le message ne salue personne). */
  prenom: string | null;
}

/* ------------------------------------------------------------------ mise en forme commune */

/** Premier mot du nom de la compagnie, accents gardés : « Bêta Voyages » → « Bêta ». */
export function compagnieCourte(nom: string): string {
  return (nom.trim().split(/\s+/)[0] ?? "").slice(0, 14);
}

/** « 7 500 » : milliers séparés par une espace, comme la planche. */
export function milliers(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** « Bêta VIP » ou « Alpha ». */
export function etiquetteCompagnie(compagnie: string, vip: boolean): string {
  return `${compagnieCourte(compagnie)}${vip ? " VIP" : ""}`;
}

/** Une ligne de la liste : « 1 · 08:00 Bêta VIP 7 500 ». */
export function ligneDepart(rang: number, d: LigneDepart): string {
  return `${rang} · ${d.heure} ${etiquetteCompagnie(d.compagnie, d.vip)} ${milliers(d.prix)}`;
}

/** « 1 », « 1 ou 2 », « 1, 2 ou 3 » (le mot de liaison change avec la langue). */
export function enumerer(nombre: number, ou: string): string {
  const rangs = Array.from({ length: nombre }, (_, i) => String(i + 1));
  if (rangs.length <= 1) return rangs.join("");
  return `${rangs.slice(0, -1).join(", ")} ${ou} ${rangs[rangs.length - 1]}`;
}

/** Emplacement d'un siège dans la langue (le plan de la billetterie le donne en français). */
export function emplacementDans(emplacement: string, langue: Langue): string {
  const cote = emplacement.startsWith("fenêtre") ? "fenêtre" : "couloir";
  const porte = emplacement.includes("porte");
  const mots = {
    fr: { fenêtre: "fenêtre", couloir: "couloir", porte: "près de la porte" },
    en: { fenêtre: "window", couloir: "aisle", porte: "near the door" },
    pcm: { fenêtre: "window", couloir: "aisle", porte: "near di door" },
  }[langue];
  return `${mots[cote]}${porte ? ` · ${mots.porte}` : ""}`;
}

/* ------------------------------------------------------------------ le catalogue */

export interface Textes {
  jour(j: JourDemande): string;
  periode(p: Periode): string;
  aide: string;
  salutation: string;
  /** La liste des départs. `trajet` : ligne ajoutée quand le trajet n'a pas été dit en entier. */
  listeDeparts(a: {
    jour: JourDemande;
    trajet: string | null;
    lignes: readonly LigneDepart[];
  }): string;
  aucunDepart(a: {
    trajet: string;
    jour: JourDemande | null;
    periode: Periode | null;
    apres: string | null;
  }): string;
  villeInconnue(mot: string, villes: readonly string[]): string;
  memeVille: string;
  dateNonLue: string;
  choixInvalide(nombre: number): string;
  /** La proposition de siège et de paiement (deux lignes : le texte, puis les deux réponses). */
  confirmation(a: {
    compagnie: string;
    vip: boolean;
    heure: string;
    siege: number;
    emplacement: string;
    prix: number;
  }): string;
  reponseInvalide: string;
  siegesLibres(sieges: readonly SiegeLibre[]): string;
  siegeInvalide: string;
  siegePris: string;
  aucunAutreSiege: string;
  numeroMomo: string;
  numeroMomoInvalide: string;
  paiementDemande: string;
  paiementRefuse: string;
  paiementEnCours: string;
  paiementEchoue: string;
  placeReprise: string;
  billetPaye(b: BilletPaye): string;
  modeDegrade: string;
  complet: string;
  departIndisponible: string;
  delaiDepasse: string;
  annule: string;
  rienAAnnuler: string;
  sansDemande: string;
  vocalIllisible: string;
  nonTexte: string;
  /** Ce que le vocal a donné, renvoyé pour que le voyageur vérifie. */
  compris(texte: string): string;
  compteIndisponible: string;
  indisponible: string;
  tropDErreurs: string;
}

/* ------------------------------------------------------------------ français */

const JOURS_FR: Readonly<Record<JourDemande, string>> = {
  aujourdhui: "aujourd'hui",
  demain: "demain",
  apres_demain: "après-demain",
};
const PERIODES_FR: Readonly<Record<Periode, string>> = {
  matin: "matin",
  apres_midi: "après-midi",
  soir: "soir",
  nuit: "nuit",
};

const AIDE_FR =
  "Bienvenue sur AfriMove. Écris « billet » et ton trajet, par exemple : billet Douala Yaoundé demain matin. Tu peux aussi m'envoyer un message vocal.";

export const FR: Textes = {
  jour: (j) => JOURS_FR[j],
  periode: (p) => PERIODES_FR[p],
  aide: AIDE_FR,
  salutation: `Bonjour ! ${AIDE_FR}`,
  listeDeparts({ jour, trajet, lignes }) {
    const n = lignes.length;
    return [
      ...(trajet !== null ? [trajet] : []),
      `${n} départ${n > 1 ? "s" : ""} ${JOURS_FR[jour]} :`,
      ...lignes.map((l, i) => ligneDepart(i + 1, l)),
      `Réponds ${enumerer(n, "ou")}.`,
    ].join("\n");
  },
  aucunDepart({ trajet, jour, periode, apres }) {
    const quand =
      jour === null
        ? "aujourd'hui ni demain"
        : JOURS_FR[jour] + (periode !== null ? ` ${PERIODES_FR[periode]}` : "");
    const heure = apres !== null && jour !== null ? ` à partir de ${apres}` : "";
    return `Aucun départ ${quand}${heure} pour ${trajet}. Essaie un autre jour ou un autre trajet.`;
  },
  villeInconnue: (mot, villes) =>
    `Je ne connais pas « ${mot} ». Villes desservies : ${villes.join(", ")}. Écris par exemple : billet Douala Yaoundé demain.`,
  memeVille: "Le départ et l'arrivée sont la même ville. Écris deux villes différentes.",
  dateNonLue:
    "Je ne sais pas encore lire cette date. Écris « aujourd'hui », « demain » ou « après-demain ».",
  choixInvalide: (n) => `Je n'ai pas compris. Réponds ${enumerer(n, "ou")}, ou écris « annuler ».`,
  confirmation: ({ compagnie, vip, heure, siege, emplacement, prix }) =>
    [
      `${etiquetteCompagnie(compagnie, vip)} ${heure}, siège ${siege} ${emplacementDans(emplacement, "fr")}. ${milliers(prix)} F par MoMo ?`,
      "Oui · Changer de siège",
    ].join("\n"),
  reponseInvalide: "Réponds « Oui » pour payer, « Changer de siège » ou « Annuler ».",
  siegesLibres: (sieges) =>
    [
      "Sièges libres :",
      ...sieges.map((s) => `${s.numero} · ${emplacementDans(s.emplacement, "fr")}`),
      "Réponds avec le numéro du siège.",
    ].join("\n"),
  siegeInvalide: "Ce siège n'est pas libre. Réponds avec un numéro de la liste.",
  siegePris: "Ce siège vient d'être pris. Voici une autre place.",
  aucunAutreSiege:
    "Il n'y a pas d'autre siège libre sur ce départ. Réponds « Oui » pour garder le tien.",
  numeroMomo: "Sur quel numéro MoMo veux-tu payer ? Écris-le sans espace, par exemple 677012345.",
  numeroMomoInvalide:
    "Ce numéro n'est pas un numéro MTN ou Orange du Cameroun. Exemple : 677012345.",
  paiementDemande:
    "Demande de paiement envoyée sur ton téléphone. Valide avec ton code secret : ton billet arrive ici dès que c'est confirmé.",
  paiementRefuse:
    "Le paiement a été refusé. Rien n'a été débité. Écris « billet » pour recommencer.",
  paiementEnCours:
    "Un paiement est déjà en cours. Valide-le sur ton téléphone : ton billet arrive ici dès que c'est confirmé.",
  paiementEchoue:
    "Le paiement n'a pas abouti. Rien n'a été débité. Écris « billet » pour recommencer.",
  placeReprise:
    "Ta place a été reprise avant la fin du paiement. Tu es remboursé. Écris « billet » pour choisir un autre départ.",
  billetPaye: ({ numero, code, prenom }) =>
    `✓ Payé. Billet ${numero}, code ${code}. Bon voyage${prenom !== null ? `, ${prenom}` : ""}.`,
  modeDegrade: "Le paiement MoMo est indisponible pour le moment. Achète ton billet à la gare.",
  complet: "Plus de place sur ce départ. Écris « billet » pour en choisir un autre.",
  departIndisponible: "Ce départ n'est plus disponible. Écris « billet » pour en choisir un autre.",
  delaiDepasse: "Le délai est dépassé, ta place est libérée. Écris « billet » pour recommencer.",
  annule: "Annulé. Ta place est libérée. Écris « billet » quand tu veux recommencer.",
  rienAAnnuler:
    "Aucun achat en cours. Pour annuler un billet déjà payé, passe par l'application AfriMove ou à la gare.",
  sansDemande: "Je n'ai pas de demande en cours. Écris « billet » et ton trajet pour commencer.",
  vocalIllisible:
    "Je n'ai pas pu comprendre ton message vocal. Écris ta demande, par exemple : billet Douala Yaoundé demain.",
  nonTexte:
    "Je lis les messages écrits et les vocaux. Écris par exemple : billet Douala Yaoundé demain.",
  compris: (texte) => `J'ai compris : « ${texte} ».`,
  compteIndisponible: "Ce compte n'est pas disponible. Contacte le support AfriMove.",
  indisponible: "Service indisponible. Réessaie dans quelques instants.",
  tropDErreurs: "Je ne comprends pas. Écris « billet » et ton trajet pour recommencer.",
};

/* ------------------------------------------------------------------ anglais */

const JOURS_EN: Readonly<Record<JourDemande, string>> = {
  aujourdhui: "today",
  demain: "tomorrow",
  apres_demain: "the day after tomorrow",
};
const PERIODES_EN: Readonly<Record<Periode, string>> = {
  matin: "morning",
  apres_midi: "afternoon",
  soir: "evening",
  nuit: "night",
};

const AIDE_EN =
  "Welcome to AfriMove. Write « ticket » and your trip, for example: ticket Douala Yaoundé tomorrow morning. You can also send a voice message.";

export const EN: Textes = {
  jour: (j) => JOURS_EN[j],
  periode: (p) => PERIODES_EN[p],
  aide: AIDE_EN,
  salutation: `Hello! ${AIDE_EN}`,
  listeDeparts({ jour, trajet, lignes }) {
    const n = lignes.length;
    return [
      ...(trajet !== null ? [trajet] : []),
      `${n} departure${n > 1 ? "s" : ""} ${JOURS_EN[jour]}:`,
      ...lignes.map((l, i) => ligneDepart(i + 1, l)),
      `Reply ${enumerer(n, "or")}.`,
    ].join("\n");
  },
  aucunDepart({ trajet, jour, periode, apres }) {
    const quand =
      jour === null
        ? "today or tomorrow"
        : JOURS_EN[jour] + (periode !== null ? ` ${PERIODES_EN[periode]}` : "");
    const heure = apres !== null && jour !== null ? ` after ${apres}` : "";
    return `No departure ${quand}${heure} for ${trajet}. Try another day or another trip.`;
  },
  villeInconnue: (mot, villes) =>
    `I don't know « ${mot} ». Cities we serve: ${villes.join(", ")}. Write for example: ticket Douala Yaoundé tomorrow.`,
  memeVille: "The departure and the arrival are the same city. Write two different cities.",
  dateNonLue:
    "I can't read that date yet. Write « today », « tomorrow » or « the day after tomorrow ».",
  choixInvalide: (n) => `I didn't understand. Reply ${enumerer(n, "or")}, or write « cancel ».`,
  confirmation: ({ compagnie, vip, heure, siege, emplacement, prix }) =>
    [
      `${etiquetteCompagnie(compagnie, vip)} ${heure}, seat ${siege} ${emplacementDans(emplacement, "en")}. ${milliers(prix)} F by MoMo?`,
      "Yes · Change seat",
    ].join("\n"),
  reponseInvalide: "Reply « Yes » to pay, « Change seat » or « Cancel ».",
  siegesLibres: (sieges) =>
    [
      "Free seats:",
      ...sieges.map((s) => `${s.numero} · ${emplacementDans(s.emplacement, "en")}`),
      "Reply with the seat number.",
    ].join("\n"),
  siegeInvalide: "This seat is not free. Reply with a number from the list.",
  siegePris: "This seat was just taken. Here is another seat.",
  aucunAutreSiege: "There is no other free seat on this departure. Reply « Yes » to keep yours.",
  numeroMomo:
    "Which MoMo number do you want to pay with? Write it without spaces, for example 677012345.",
  numeroMomoInvalide: "This is not an MTN or Orange number from Cameroon. Example: 677012345.",
  paiementDemande:
    "Payment request sent to your phone. Approve it with your secret code: your ticket arrives here as soon as it is confirmed.",
  paiementRefuse: "The payment was refused. Nothing was charged. Write « ticket » to start again.",
  paiementEnCours:
    "A payment is already in progress. Approve it on your phone: your ticket arrives here as soon as it is confirmed.",
  paiementEchoue:
    "The payment did not go through. Nothing was charged. Write « ticket » to start again.",
  placeReprise:
    "Your seat was taken before the payment finished. You are refunded. Write « ticket » to choose another departure.",
  billetPaye: ({ numero, code, prenom }) =>
    `✓ Paid. Ticket ${numero}, code ${code}. Have a good trip${prenom !== null ? `, ${prenom}` : ""}.`,
  modeDegrade: "MoMo payment is unavailable right now. Buy your ticket at the station.",
  complet: "No seat left on this departure. Write « ticket » to choose another one.",
  departIndisponible:
    "This departure is no longer available. Write « ticket » to choose another one.",
  delaiDepasse: "The time is up, your seat is released. Write « ticket » to start again.",
  annule: "Cancelled. Your seat is released. Write « ticket » whenever you want to start again.",
  rienAAnnuler:
    "No purchase in progress. To cancel a ticket you already paid, use the AfriMove app or go to the station.",
  sansDemande: "I have no request in progress. Write « ticket » and your trip to start.",
  vocalIllisible:
    "I could not understand your voice message. Write your request, for example: ticket Douala Yaoundé tomorrow.",
  nonTexte:
    "I read written messages and voice messages. Write for example: ticket Douala Yaoundé tomorrow.",
  compris: (texte) => `I understood: « ${texte} ».`,
  compteIndisponible: "This account is not available. Contact AfriMove support.",
  indisponible: "Service unavailable. Try again in a few moments.",
  tropDErreurs: "I don't understand. Write « ticket » and your trip to start again.",
};

/* ------------------------------------------------------------------ pidgin du Cameroun */

const JOURS_PCM: Readonly<Record<JourDemande, string>> = {
  aujourdhui: "today",
  demain: "tumara",
  apres_demain: "afta tumara",
};
const PERIODES_PCM: Readonly<Record<Periode, string>> = {
  matin: "morning",
  apres_midi: "afternoon",
  soir: "evening",
  nuit: "night",
};

const AIDE_PCM =
  "Welcome fo AfriMove. Write « ticket » and di road, like: ticket Douala Yaoundé tumara morning. You fit send voice message too.";

export const PCM: Textes = {
  jour: (j) => JOURS_PCM[j],
  periode: (p) => PERIODES_PCM[p],
  aide: AIDE_PCM,
  salutation: `How far! ${AIDE_PCM}`,
  listeDeparts({ jour, trajet, lignes }) {
    const n = lignes.length;
    return [
      ...(trajet !== null ? [trajet] : []),
      `${n} bus fo ${JOURS_PCM[jour]}:`,
      ...lignes.map((l, i) => ligneDepart(i + 1, l)),
      `Ansa ${enumerer(n, "or")}.`,
    ].join("\n");
  },
  aucunDepart({ trajet, jour, periode, apres }) {
    const quand =
      jour === null
        ? "today or tumara"
        : JOURS_PCM[jour] + (periode !== null ? ` ${PERIODES_PCM[periode]}` : "");
    const heure = apres !== null && jour !== null ? ` afta ${apres}` : "";
    return `No bus fo ${quand}${heure} fo ${trajet}. Try anoda day or anoda road.`;
  },
  villeInconnue: (mot, villes) =>
    `I no know « ${mot} ». Na dis town dem we dey go: ${villes.join(", ")}. Write like: ticket Douala Yaoundé tumara.`,
  memeVille:
    "Di town wey you dey go from and di one you dey go na di same. Write two different town.",
  dateNonLue: "I no fit read dat date yet. Write « today », « tumara » or « afta tumara ».",
  choixInvalide: (n) => `I no understand. Ansa ${enumerer(n, "or")}, or write « cancel ».`,
  confirmation: ({ compagnie, vip, heure, siege, emplacement, prix }) =>
    [
      `${etiquetteCompagnie(compagnie, vip)} ${heure}, seat ${siege} ${emplacementDans(emplacement, "pcm")}. ${milliers(prix)} F fo MoMo?`,
      "Yes · Change seat",
    ].join("\n"),
  reponseInvalide: "Ansa « Yes » fo pay, « Change seat » or « Cancel ».",
  siegesLibres: (sieges) =>
    [
      "Seat dem wey free:",
      ...sieges.map((s) => `${s.numero} · ${emplacementDans(s.emplacement, "pcm")}`),
      "Ansa wit di seat number.",
    ].join("\n"),
  siegeInvalide: "Dat seat no free. Ansa wit one number from di list.",
  siegePris: "Dem don take dat seat. See anoda seat.",
  aucunAutreSiege: "No oda seat free fo dis bus. Ansa « Yes » fo keep your own.",
  numeroMomo: "Which MoMo number you wan use pay? Write am without space, like 677012345.",
  numeroMomoInvalide: "Dis no be MTN or Orange number fo Cameroon. Example: 677012345.",
  paiementDemande:
    "I don send payment request to your phone. Confirm am wit your secret code: your ticket go come here as e confirm.",
  paiementRefuse:
    "Dem refuse di payment. Nothing no comot from your money. Write « ticket » fo start again.",
  paiementEnCours:
    "One payment dey already. Confirm am for your phone: your ticket go come here as e confirm.",
  paiementEchoue:
    "Di payment no pass. Nothing no comot from your money. Write « ticket » fo start again.",
  placeReprise:
    "Dem don take your seat before di payment finish. We don refund you. Write « ticket » fo choose anoda bus.",
  billetPaye: ({ numero, code, prenom }) =>
    `✓ Payment don enter. Ticket ${numero}, code ${code}. Safe journey${prenom !== null ? `, ${prenom}` : ""}.`,
  modeDegrade: "MoMo payment no dey work now. Buy your ticket fo di station.",
  complet: "No seat again fo dis bus. Write « ticket » fo choose anoda one.",
  departIndisponible: "Dis bus no dey again. Write « ticket » fo choose anoda one.",
  delaiDepasse: "Di time don pass, your seat don free. Write « ticket » fo start again.",
  annule: "E don cancel. Your seat don free. Write « ticket » wen you wan start again.",
  rienAAnnuler:
    "No buy dey go on. Fo cancel ticket wey you don pay, use di AfriMove app or go di station.",
  sansDemande: "I no get any request now. Write « ticket » and di road fo start.",
  vocalIllisible:
    "I no fit understand your voice message. Write wetin you want, like: ticket Douala Yaoundé tumara.",
  nonTexte:
    "I dey read written message and voice message. Write like: ticket Douala Yaoundé tumara.",
  compris: (texte) => `I don understand: « ${texte} ».`,
  compteIndisponible: "Dis account no dey available. Contact AfriMove support.",
  indisponible: "Service no dey work. Try again small time.",
  tropDErreurs: "I no understand. Write « ticket » and di road fo start again.",
};

const PAR_LANGUE: Readonly<Record<Langue, Textes>> = { fr: FR, en: EN, pcm: PCM };

export const textes = (langue: Langue): Textes => PAR_LANGUE[langue];

/**
 * Les messages écrits sans maquette, pour la relecture produit et le rapport de livraison : tout
 * le français sauf les trois messages de la planche, et tout l'anglais et le pidgin.
 */
export function textesInventes(): readonly string[] {
  const exemple = {
    sieges: [{ numero: 4, emplacement: "fenêtre · près de la porte" }],
    ligne: { heure: "08:30", compagnie: "Alpha Voyages", vip: false, prix: 4000 },
  };
  const liste: string[] = [];
  for (const [langue, t] of Object.entries(PAR_LANGUE) as [Langue, Textes][]) {
    const tous = [
      t.aide,
      t.salutation,
      t.aucunDepart({ trajet: "Douala → Yaoundé", jour: "demain", periode: "matin", apres: null }),
      t.villeInconnue("Garoua", ["Douala", "Yaoundé"]),
      t.memeVille,
      t.dateNonLue,
      t.choixInvalide(3),
      t.reponseInvalide,
      t.siegesLibres(exemple.sieges),
      t.siegeInvalide,
      t.siegePris,
      t.aucunAutreSiege,
      t.numeroMomo,
      t.numeroMomoInvalide,
      t.paiementDemande,
      t.paiementRefuse,
      t.paiementEnCours,
      t.paiementEchoue,
      t.placeReprise,
      t.modeDegrade,
      t.complet,
      t.departIndisponible,
      t.delaiDepasse,
      t.annule,
      t.rienAAnnuler,
      t.sansDemande,
      t.vocalIllisible,
      t.nonTexte,
      t.compris("je veux aller à Yaoundé demain"),
      t.compteIndisponible,
      t.indisponible,
      t.tropDErreurs,
    ];
    // En français, la liste, la proposition de siège et le billet payé viennent de la planche ;
    // dans les autres langues, ils sont inventés aussi.
    if (langue !== "fr") {
      tous.push(
        t.listeDeparts({ jour: "demain", trajet: null, lignes: [exemple.ligne] }),
        t.confirmation({
          compagnie: "Alpha Voyages",
          vip: false,
          heure: "08:30",
          siege: 7,
          emplacement: "fenêtre",
          prix: 4000,
        }),
        t.billetPaye({ numero: "ALP-DLA-270106-0031", code: "5582", prenom: "Aïcha" }),
      );
    } else {
      tous.push(
        t.listeDeparts({ jour: "demain", trajet: "Douala → Yaoundé", lignes: [exemple.ligne] }),
        t.billetPaye({ numero: "ALP-DLA-270106-0031", code: "5582", prenom: null }),
      );
    }
    liste.push(...tous);
  }
  return liste;
}
