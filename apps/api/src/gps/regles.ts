import { distanceKm, distanceM, positionSurLigne, type Point } from "./geo";
import type {
  AlerteArret,
  ArretTrajet,
  EtatSuivi,
  MissionSuivie,
  SoupconArret,
  TrajetBus,
} from "./modeles";
import { MS_PAR_MINUTE, MS_PAR_SECONDE, enMs, versIsoDouala } from "./temps";

/**
 * Règles du suivi GPS : fonctions pures, sans horloge ni stockage (l'instant est toujours donné).
 * Les seuils sont regroupés dans `REGLES_GPS` ; ceux qui ne viennent pas du ticket sont des choix
 * de réglage à confirmer (voir le README).
 */
export const REGLES_GPS = {
  /** Le téléphone du chauffeur ou du convoyeur envoie sa position toutes les 30 s (ticket). */
  periodeEnvoiSecondes: 30,
  /** Alerte quand un bus est arrêté plus de 10 min hors arrêt (ticket). */
  arretAnormalMinutes: 10,
  /** SMS au proche 15 min avant l'arrivée (ticket). */
  prevenirMinutesDefaut: 15,
  prevenirMinutesMax: 120,

  /** En dessous de cette vitesse, le bus est à l'arrêt. */
  vitesseArretKmh: 3,
  /** Au-dessus de cette vitesse, le bus roule, même si sa position bouge peu. */
  vitesseMouvementKmh: 8,
  /** Tant que le bus reste dans ce rayon de son point d'arrêt, la dérive du GPS ne compte pas. */
  rayonImmobiliteM: 150,
  /** Dans ce rayon d'un arrêt de la ligne, un arrêt est normal (pas d'alerte). */
  rayonArretM: 500,
  /** Au-delà de cette imprécision, la position est gardée mais ne sert pas aux calculs. */
  precisionMaxM: 500,
  /** Sans position depuis ce délai, le suivi n'est plus « en direct » (4 envois manqués). */
  signalPerduSecondes: 120,
  /** Le bus est « à » un arrêt quand il est à moins de cette distance de route de lui. */
  seuilPassageKm: 0.2,
  /** Zone d'un arrêt où l'on compare l'heure à la durée d'arrêt prévue. */
  zoneArretKm: 0.3,
  /** Plus loin que cela de la ligne, la position ne fait pas avancer le bus sur la ligne. */
  ecartMaxItineraireKm: 10,
  /** Une position datée plus loin que cela dans le futur est refusée (horloge du téléphone). */
  avanceMaxSecondes: 120,
  /** Une position plus vieille que cela est refusée. */
  anciennetéMaxHeures: 24,
  vitesseMaxKmh: 250,

  /** Monter en route : arrêt le plus proche d'une position GPS, et arrêts jugés « le même ». */
  rayonRechercheArretM: 3000,
  rayonCorrespondanceArretM: 1000,
  /** Monter en route : on propose les bus qui passent dans cette durée. */
  fenetreMonteeMinutes: 240,

  /** Moto en ville : détour par rapport au vol d'oiseau, et vitesse de référence. */
  detourLivraison: 1.3,
  vitesseLivraisonKmh: 20,
  vitesseLivraisonMinKmh: 12,
  vitesseLivraisonMaxKmh: 40,
} as const;

/* ------------------------------------------------------------------ lots de positions */

export interface EntreePosition {
  instant: string;
  latitude: number;
  longitude: number;
  precisionM?: number;
  vitesseKmh?: number;
}

export type MotifRejet = "dans_le_futur" | "trop_ancienne";

/**
 * Trie un lot reçu d'un appareil : les positions datées du futur (horloge du téléphone déréglée)
 * ou de plus de 24 h sont refusées une à une, les autres sont rendues de la plus ancienne à la plus
 * récente. Le rang d'origine est gardé pour répondre à l'appareil.
 */
export function trierLot(
  entrees: readonly EntreePosition[],
  maintenantMs: number,
): { retenues: EntreePosition[]; rejetees: { rang: number; motif: MotifRejet }[] } {
  const rejetees: { rang: number; motif: MotifRejet }[] = [];
  const retenues: EntreePosition[] = [];
  entrees.forEach((e, rang) => {
    const ms = enMs(e.instant);
    if (ms > maintenantMs + REGLES_GPS.avanceMaxSecondes * MS_PAR_SECONDE) {
      rejetees.push({ rang, motif: "dans_le_futur" });
    } else if (ms < maintenantMs - REGLES_GPS.anciennetéMaxHeures * 3_600_000) {
      rejetees.push({ rang, motif: "trop_ancienne" });
    } else {
      retenues.push(e);
    }
  });
  retenues.sort((a, b) => enMs(a.instant) - enMs(b.instant));
  return { retenues, rejetees };
}

/* ------------------------------------------------------------------ horaire prévu */

export interface HoraireArret {
  arriveeMs: number;
  departMs: number;
}

/**
 * Horaire prévu de chaque arrêt : la durée du trajet moins les arrêts prévus donne le temps de
 * conduite, réparti selon les kilomètres ; chaque arrêt intermédiaire ajoute sa durée.
 */
export function horaire(t: TrajetBus): HoraireArret[] {
  const n = t.arrets.length;
  const premier = t.arrets[0] as ArretTrajet;
  const dernier = t.arrets[n - 1] as ArretTrajet;
  const kmTotal = dernier.kmDepuisOrigine - premier.kmDepuisOrigine;
  const debut = enMs(t.heureDepart);
  const attentes = t.arrets.map((a, i) => (i === 0 || i === n - 1 ? 0 : (a.arretMinutes ?? 0)));
  const total = attentes.reduce((s, m) => s + m, 0);
  const conduiteMs = Math.max(1, t.dureeMinutes - total) * MS_PAR_MINUTE;
  let cumul = 0;
  return t.arrets.map((a, i) => {
    const part =
      kmTotal > 0 ? (a.kmDepuisOrigine - premier.kmDepuisOrigine) / kmTotal : i / (n - 1);
    const arriveeMs = debut + conduiteMs * part + cumul * MS_PAR_MINUTE;
    const attente = attentes[i] as number;
    cumul += attente;
    return { arriveeMs, departMs: arriveeMs + attente * MS_PAR_MINUTE };
  });
}

/**
 * Heure à laquelle le bus devrait se trouver au kilomètre `km`, selon l'horaire. Dans la zone d'un
 * arrêt intermédiaire, l'heure réelle (`instantMs`) est ramenée dans la fenêtre prévue de l'arrêt :
 * un bus qui fait sa pause normale n'a ni avance ni retard.
 */
export function prevuAuKm(
  t: TrajetBus,
  h: readonly HoraireArret[],
  km: number,
  instantMs: number,
): number {
  const n = t.arrets.length;
  for (let i = 1; i < n - 1; i++) {
    const a = t.arrets[i] as ArretTrajet;
    if (Math.abs(km - a.kmDepuisOrigine) <= REGLES_GPS.zoneArretKm) {
      const { arriveeMs, departMs } = h[i] as HoraireArret;
      return Math.min(Math.max(instantMs, arriveeMs), departMs);
    }
  }
  if (km <= (t.arrets[0] as ArretTrajet).kmDepuisOrigine) return (h[0] as HoraireArret).departMs;
  if (km >= (t.arrets[n - 1] as ArretTrajet).kmDepuisOrigine) {
    return (h[n - 1] as HoraireArret).arriveeMs;
  }
  for (let i = 0; i < n - 1; i++) {
    const a = t.arrets[i] as ArretTrajet;
    const b = t.arrets[i + 1] as ArretTrajet;
    if (km >= a.kmDepuisOrigine && km < b.kmDepuisOrigine) {
      const debut = (h[i] as HoraireArret).departMs;
      const fin = (h[i + 1] as HoraireArret).arriveeMs;
      const part = (km - a.kmDepuisOrigine) / (b.kmDepuisOrigine - a.kmDepuisOrigine);
      return debut + (fin - debut) * part;
    }
  }
  return (h[n - 1] as HoraireArret).arriveeMs;
}

/* ------------------------------------------------------------------ avancée du bus */

export interface Echantillon {
  instant: string;
  latitude: number;
  longitude: number;
  precisionM: number | null;
  vitesseKmh: number | null;
}

export const etatInitial = (departId: string): EtatSuivi => ({
  departId,
  version: 0,
  derniere: null,
  progressionKm: 0,
  passages: {},
  immobile: null,
  alerteId: null,
});

export interface ArretAnormal {
  depuis: string;
  latitude: number;
  longitude: number;
}

export interface Avance {
  etat: EtatSuivi;
  /** Le bus est arrêté depuis assez longtemps, loin de tout arrêt. */
  arretAnormal: ArretAnormal | null;
  /** La position était plus ancienne que la dernière : rien n'a changé. */
  ignoree: boolean;
}

/** Vitesse déduite de deux positions, en km/h. */
function vitesseEntre(
  avant: { instant: string; latitude: number; longitude: number },
  apres: Echantillon,
): number {
  const dt = (enMs(apres.instant) - enMs(avant.instant)) / 3_600_000;
  if (dt <= 0) return 0;
  return Math.min(REGLES_GPS.vitesseMaxKmh, distanceKm(avant, apres) / dt);
}

/** Distance (m) de `p` à l'arrêt le plus proche de la ligne. */
export function distanceAuPlusProcheArretM(t: TrajetBus, p: Point): number {
  return Math.min(...t.arrets.map((a) => distanceM(a, p)));
}

/** Le bus est parti de sa gare d'origine (ou en est déjà loin). */
export function estParti(t: TrajetBus, etat: EtatSuivi | null): boolean {
  return (
    t.partiA !== null ||
    t.etat === "parti" ||
    t.etat === "arrive" ||
    (etat?.progressionKm ?? 0) > REGLES_GPS.zoneArretKm
  );
}

/**
 * Applique une position à l'état d'un départ : avancée sur la ligne (sans reculer), passages aux
 * arrêts, immobilité. Une position plus ancienne que la dernière retenue est ignorée, ce qui rend
 * le rejeu d'un lot sans effet.
 */
export function faireAvancer(t: TrajetBus, avant: EtatSuivi, ech: Echantillon): Avance {
  const instantMs = enMs(ech.instant);
  if (avant.derniere && instantMs <= enMs(avant.derniere.instant)) {
    return { etat: avant, arretAnormal: null, ignoree: true };
  }
  const vitesse = Math.min(
    REGLES_GPS.vitesseMaxKmh,
    ech.vitesseKmh ?? (avant.derniere ? vitesseEntre(avant.derniere, ech) : 0),
  );
  const exploitable = ech.precisionM === null || ech.precisionM <= REGLES_GPS.precisionMaxM;

  // Avancée sur la ligne : jamais en arrière, jamais depuis une position hors itinéraire.
  let progressionKm = avant.progressionKm;
  const passages = { ...avant.passages };
  if (exploitable) {
    const sur = positionSurLigne(ech, t.arrets);
    if (sur.ecartKm <= REGLES_GPS.ecartMaxItineraireKm) {
      progressionKm = Math.max(progressionKm, sur.progressionKm);
    }
    t.arrets.forEach((a, i) => {
      if (
        i > 0 &&
        passages[a.id] === undefined &&
        progressionKm >= a.kmDepuisOrigine - REGLES_GPS.seuilPassageKm
      ) {
        passages[a.id] = ech.instant;
      }
    });
  }

  // Immobilité : un point d'ancrage, tant que le bus reste dedans et roule à peine.
  let immobile = avant.immobile;
  if (exploitable) {
    const ancre = avant.immobile;
    const lent = vitesse <= REGLES_GPS.vitesseArretKmh;
    if (
      ancre &&
      distanceM(ancre, ech) <= REGLES_GPS.rayonImmobiliteM &&
      vitesse <= REGLES_GPS.vitesseMouvementKmh
    ) {
      immobile = ancre;
    } else {
      immobile = lent
        ? { depuis: ech.instant, latitude: ech.latitude, longitude: ech.longitude }
        : null;
    }
  }

  const etat: EtatSuivi = {
    ...avant,
    derniere: {
      instant: ech.instant,
      latitude: ech.latitude,
      longitude: ech.longitude,
      vitesseKmh: vitesse,
    },
    progressionKm,
    passages,
    immobile,
  };

  const enRoute = t.etat === "parti" || t.etat === "embarquement" || t.partiA !== null;
  const anormal =
    enRoute &&
    immobile !== null &&
    instantMs - enMs(immobile.depuis) >= REGLES_GPS.arretAnormalMinutes * MS_PAR_MINUTE &&
    distanceAuPlusProcheArretM(t, immobile) > REGLES_GPS.rayonArretM;
  return {
    etat,
    arretAnormal: anormal && immobile ? { ...immobile } : null,
    ignoree: false,
  };
}

/** Nom du dernier arrêt passé (l'origine tant qu'aucun autre ne l'est). */
export function dernierArretPasse(t: TrajetBus, etat: EtatSuivi): string {
  let nom = (t.arrets[0] as ArretTrajet).nom;
  for (const a of t.arrets) if (etat.passages[a.id] !== undefined) nom = a.nom;
  return nom;
}

/** Le début de l'alerte d'arrêt anormal. */
export function nouvelleAlerte(
  id: string,
  t: TrajetBus,
  etat: EtatSuivi,
  arret: ArretAnormal,
  maintenant: Date,
  soupcon: SoupconArret = "autre",
): AlerteArret {
  return {
    id,
    departId: t.departId,
    compagnieId: t.compagnie.id,
    immatriculation: t.bus?.immatriculation ?? "bus inconnu",
    apres: dernierArretPasse(t, etat),
    arretDepuis: arret.depuis,
    ouverteA: versIsoDouala(maintenant),
    latitude: arret.latitude,
    longitude: arret.longitude,
    soupcon,
    aBord: t.aBord ?? null,
    resolueA: null,
  };
}

/** Minutes d'immobilité d'une alerte ouverte, à l'instant `maintenantMs`. */
export function minutesArret(a: Pick<AlerteArret, "arretDepuis">, maintenantMs: number): number {
  return Math.max(0, Math.floor((maintenantMs - enMs(a.arretDepuis)) / MS_PAR_MINUTE));
}

/** « LT 207 AB arrêté 12 min après Edéa · 36 à bord » (texte de l'élément « à traiter »). */
export function texteAlerte(a: AlerteArret, maintenantMs: number): string {
  const aBord = a.aBord !== null ? ` · ${a.aBord} à bord` : "";
  return `${a.immatriculation} arrêté ${minutesArret(a, maintenantMs)} min après ${a.apres}${aBord}`;
}

/* ------------------------------------------------------------------ estimation d'arrivée */

export interface EtapeEstimee {
  arret: ArretTrajet;
  heureMs: number;
  statut: "passe" | "prochain" | "a_venir";
}

export interface Estimation {
  /** Instant de la dernière position (ou de la demande, sans position). */
  instantMs: number;
  enDirect: boolean;
  vitesseKmh: number;
  /** Avance (négatif) ou retard (positif) sur l'horaire, en millisecondes. */
  ecartMs: number;
  retardMinutes: number;
  arriveePrevueMs: number;
  arriveeEstimeeMs: number;
  /** Prochain arrêt à passer, destination comprise (`null` : le bus est arrivé). */
  prochainArret: ArretTrajet | null;
  /** Origine et arrêts intermédiaires (la destination est l'arrivée). */
  etapes: EtapeEstimee[];
}

/**
 * Estimation d'arrivée : le bus est supposé tenir l'horaire à partir de l'écart qu'il a
 * maintenant. Un bus arrêté voit donc son retard grandir à chaque position, un bus qui rattrape
 * le sien le voit se réduire. Sans position, l'estimation est l'horaire prévu (avec le retard de
 * départ connu).
 */
export function estimer(t: TrajetBus, etat: EtatSuivi | null, maintenantMs: number): Estimation {
  const h = horaire(t);
  const n = t.arrets.length;
  const derniere = etat?.derniere ?? null;
  const parti = estParti(t, etat);
  const instantMs = derniere ? enMs(derniere.instant) : maintenantMs;

  let ecartMs: number;
  if (derniere && etat) {
    ecartMs = instantMs - prevuAuKm(t, h, etat.progressionKm, instantMs);
  } else if (t.partiA) {
    ecartMs = enMs(t.partiA) - enMs(t.heureDepart);
  } else {
    ecartMs = maintenantMs - enMs(t.heureDepart);
  }
  // Un bus qui n'est pas encore parti n'arrive pas en avance.
  if (!parti) ecartMs = Math.max(0, ecartMs);

  const passe = (a: ArretTrajet, i: number): boolean =>
    i === 0 ? parti : etat?.passages[a.id] !== undefined;
  const rangProchain = t.arrets.findIndex((a, i) => !passe(a, i));

  const etapes: EtapeEstimee[] = t.arrets.slice(0, n - 1).map((arret, i) => {
    const estPasse = passe(arret, i);
    const heureMs = estPasse
      ? i === 0
        ? enMs(t.partiA ?? new Date((h[0] as HoraireArret).departMs))
        : enMs(etat?.passages[arret.id] as string)
      : (h[i] as HoraireArret).arriveeMs + ecartMs;
    return {
      arret,
      heureMs,
      statut: estPasse ? "passe" : i === rangProchain ? "prochain" : "a_venir",
    };
  });

  const arriveePrevueMs = (h[n - 1] as HoraireArret).arriveeMs;
  const fraiche =
    derniere !== null &&
    maintenantMs - instantMs <= REGLES_GPS.signalPerduSecondes * MS_PAR_SECONDE;
  return {
    instantMs,
    enDirect: fraiche && !["arrive", "annule", "fusionne"].includes(t.etat),
    vitesseKmh: derniere ? derniere.vitesseKmh : 0,
    ecartMs,
    retardMinutes: Math.max(0, Math.round(ecartMs / MS_PAR_MINUTE)),
    arriveePrevueMs,
    arriveeEstimeeMs: Math.max(instantMs, arriveePrevueMs + ecartMs),
    prochainArret: rangProchain >= 0 ? (t.arrets[rangProchain] as ArretTrajet) : null,
    etapes,
  };
}

/** Précision affichée à côté d'une étape (« arrêt 10 min », « 4 places montent ici »…). */
export function precisionEtape(e: EtapeEstimee, indice: number): string | undefined {
  if (indice === 0 && e.statut === "passe") return "parti";
  const places = e.arret.placesQuiMontent;
  if (places && places > 0) return `${places} ${places > 1 ? "places montent" : "place monte"} ici`;
  if (e.arret.arretMinutes && e.arret.arretMinutes > 0) return `arrêt ${e.arret.arretMinutes} min`;
  return e.statut === "prochain" ? "prochain arrêt" : undefined;
}

/** Heure de passage estimée du bus à un arrêt, ou `null` s'il l'a déjà passé. */
export function passageAArret(
  t: TrajetBus,
  etat: EtatSuivi | null,
  rangArret: number,
  maintenantMs: number,
): { passeAMs: number; arriveeDestinationMs: number } | null {
  if (["arrive", "annule", "fusionne"].includes(t.etat)) return null;
  const e = estimer(t, etat, maintenantMs);
  const etape = e.etapes[rangArret];
  if (!etape || etape.statut === "passe") return null;
  return { passeAMs: etape.heureMs, arriveeDestinationMs: e.arriveeEstimeeMs };
}

/* ------------------------------------------------------------------ prévenir un proche */

/** Faut-il envoyer le SMS : l'arrivée estimée est dans `minutes` minutes ou moins. */
export function doitPrevenir(
  e: Pick<Estimation, "arriveeEstimeeMs">,
  maintenantMs: number,
  minutes: number,
): boolean {
  return e.arriveeEstimeeMs - maintenantMs <= minutes * MS_PAR_MINUTE;
}

/* ------------------------------------------------------------------ livreur moto */

export interface EstimationLivraison {
  minutesRestantes: number;
  arriveeMs: number;
}

/**
 * Temps restant d'un livreur moto : le trajet restant (à vol d'oiseau, majoré du détour urbain)
 * à sa vitesse moyenne récente, bornée ; 20 km/h à défaut. Si le colis n'est pas encore retiré,
 * le livreur passe d'abord au point de retrait.
 */
export function estimerLivraison(
  mission: Pick<MissionSuivie, "retire" | "retrait" | "remise">,
  position: Point,
  instantMs: number,
  vitessesRecentes: readonly number[],
): EstimationLivraison {
  const restantKm =
    (mission.retire
      ? distanceKm(position, mission.remise)
      : distanceKm(position, mission.retrait) + distanceKm(mission.retrait, mission.remise)) *
    REGLES_GPS.detourLivraison;
  const enMouvement = vitessesRecentes.filter((v) => v > 5);
  const moyenne =
    enMouvement.length > 0
      ? enMouvement.reduce((s, v) => s + v, 0) / enMouvement.length
      : REGLES_GPS.vitesseLivraisonKmh;
  const vitesse = Math.min(
    REGLES_GPS.vitesseLivraisonMaxKmh,
    Math.max(REGLES_GPS.vitesseLivraisonMinKmh, moyenne),
  );
  const minutesRestantes = Math.max(0, Math.ceil((restantKm / vitesse) * 60 - 1e-9));
  return { minutesRestantes, arriveeMs: instantMs + minutesRestantes * MS_PAR_MINUTE };
}
