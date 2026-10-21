import type {
  AlerteArret,
  ATraiterBus,
  BilletSuivi,
  BusEnRoute,
  EtatSuivi,
  MessageBusInterne,
  ProcheSuivi,
  PrevenirProche,
  TrajetBus,
} from "./modeles";
import { minutesArret, precisionEtape, texteAlerte, type Estimation } from "./regles";
import { versIsoDouala } from "./temps";

/**
 * Réponses de l'API : chaque fonction rend la forme d'un schéma de `@afrimove/contrats`
 * (`voyageur.SchemaSuiviBus`, `voyageur.SchemaMessagePositionBus`, `colis.SchemaPositionLivreur`,
 * `patron.ATraiterSchema`…). Les tests relisent chaque réponse avec le schéma zod.
 */

const iso = (ms: number): string => versIsoDouala(ms);

export function etapesVue(e: Estimation) {
  return e.etapes.map((etape, i) => {
    const precision = precisionEtape(etape, i);
    return {
      arret: etape.arret.nom,
      arretId: etape.arret.id,
      heure: iso(etape.heureMs),
      statut: etape.statut,
      ...(precision ? { precision } : {}),
      ...(etape.arret.arretMinutes && etape.arret.arretMinutes > 0
        ? { arretMinutes: etape.arret.arretMinutes }
        : {}),
      ...(etape.arret.placesQuiMontent && etape.arret.placesQuiMontent > 0
        ? { placesQuiMontent: etape.arret.placesQuiMontent }
        : {}),
    };
  });
}

export function prevenirVue(
  t: TrajetBus,
  ligne: PrevenirProche | null,
  proche: ProcheSuivi | null,
  minutesParDefaut: number,
) {
  if (!proche) return undefined;
  return {
    procheId: proche.id,
    nom: proche.nom,
    minutesAvantArrivee: ligne?.minutesAvantArrivee ?? minutesParDefaut,
    gareArrivee: t.gareArrivee,
    actif: ligne?.actif ?? false,
  };
}

export function suiviBusVue(
  billet: BilletSuivi,
  t: TrajetBus,
  e: Estimation,
  prevenir: ReturnType<typeof prevenirVue>,
) {
  return {
    billetId: billet.billetId,
    enDirect: e.enDirect,
    compagnie: { id: t.compagnie.id, nom: t.compagnie.nom },
    siege: billet.siege,
    bus: { immatriculation: t.bus?.immatriculation ?? "" },
    villes: [...t.villes],
    vitesseKmh: Math.round(e.vitesseKmh),
    arrivee: {
      prevue: iso(e.arriveePrevueMs),
      estimee: iso(e.arriveeEstimeeMs),
      retardMinutes: e.retardMinutes,
    },
    etapes: etapesVue(e),
    ...(prevenir ? { prevenir } : {}),
  };
}

/** Message de position d'un bus, sans voyageur : ce que diffusent les canaux entre instances. */
export function messageBus(t: TrajetBus, etat: EtatSuivi, e: Estimation): MessageBusInterne | null {
  const d = etat.derniere;
  if (!d) return null;
  return {
    departId: t.departId,
    instant: d.instant,
    latitude: d.latitude,
    longitude: d.longitude,
    vitesseKmh: Math.round(d.vitesseKmh),
    arriveeEstimee: iso(e.arriveeEstimeeMs),
    retardMinutes: e.retardMinutes,
    ...(e.prochainArret ? { prochainArret: e.prochainArret.nom } : {}),
  };
}

/** Le message du canal d'un voyageur : le billet qu'il suit s'y ajoute. */
export function messagePositionBus(billetId: string, m: MessageBusInterne) {
  return {
    billetId,
    instant: m.instant,
    latitude: m.latitude,
    longitude: m.longitude,
    vitesseKmh: m.vitesseKmh,
    arriveeEstimee: m.arriveeEstimee,
    retardMinutes: m.retardMinutes,
    ...(m.prochainArret ? { prochainArret: m.prochainArret } : {}),
  };
}

export function busEnRouteVue(
  t: TrajetBus,
  etat: EtatSuivi,
  e: Estimation,
  alerte: AlerteArret | null,
  maintenantMs: number,
): BusEnRoute | null {
  const m = messageBus(t, etat, e);
  if (!m) return null;
  return {
    departId: t.departId,
    immatriculation: t.bus?.immatriculation ?? "",
    compagnie: t.compagnie.nom,
    ligne: t.ligneLibelle,
    instant: m.instant,
    latitude: m.latitude,
    longitude: m.longitude,
    vitesseKmh: m.vitesseKmh,
    arriveeEstimee: m.arriveeEstimee,
    retardMinutes: m.retardMinutes,
    ...(m.prochainArret ? { prochainArret: m.prochainArret } : {}),
    ...(alerte ? { arretMinutes: minutesArret(alerte, maintenantMs) } : {}),
    enDirect: e.enDirect,
  };
}

export function aTraiterVue(a: AlerteArret, maintenantMs: number): ATraiterBus {
  return {
    id: a.id,
    type: "bus_arrete",
    texte: texteAlerte(a, maintenantMs),
    quand: a.ouverteA,
  };
}

/** L'alerte de la carte de la salle de contrôle (`patron.SalleDeControle.carte.alerte`). */
export function alerteCarteVue(a: AlerteArret, maintenantMs: number) {
  return {
    immatriculation: a.immatriculation,
    arretMinutes: minutesArret(a, maintenantMs),
    soupcon: a.soupcon,
  };
}
