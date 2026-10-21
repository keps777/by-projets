import { describe, expect, it } from "vitest";
import type { EtatSuivi, TrajetBus } from "./modeles";
import {
  REGLES_GPS,
  dernierArretPasse,
  distanceAuPlusProcheArretM,
  doitPrevenir,
  estimer,
  estimerLivraison,
  etatInitial,
  faireAvancer,
  horaire,
  nouvelleAlerte,
  passageAArret,
  precisionEtape,
  prevuAuKm,
  texteAlerte,
  trierLot,
  type Echantillon,
} from "./regles";
import { MS_PAR_MINUTE, enMs, hhmmDouala } from "./temps";
import { COORDONNEES, DEPART, heure, pointAuKm, trajetType } from "./testing/monde";

const t0 = enMs(heure("08:00"));
const a = (minutes: number): string => new Date(t0 + minutes * MS_PAR_MINUTE).toISOString();

/** Une position au kilomètre `km`, `minutes` après 08:00. */
function ech(minutes: number, km: number, extra: Partial<Echantillon> = {}): Echantillon {
  return {
    instant: a(minutes),
    ...pointAuKm(km),
    precisionM: 10,
    vitesseKmh: 80,
    ...extra,
  };
}

/** Joue une suite de positions et rend l'état final et la dernière avancée. */
function jouer(t: TrajetBus, positions: Echantillon[], depart: EtatSuivi = etatInitial(DEPART)) {
  let etat = depart;
  let derniere = faireAvancer(t, etat, positions[0] as Echantillon);
  etat = derniere.etat;
  for (const p of positions.slice(1)) {
    derniere = faireAvancer(t, etat, p);
    etat = derniere.etat;
  }
  return { etat, derniere };
}

const t = trajetType(DEPART);
const ms = (hhmm: string): number => enMs(heure(hhmm));

describe("horaire prévu", () => {
  const h = horaire(t);

  it("répartit la conduite selon les kilomètres et ajoute les arrêts prévus", () => {
    // 270 min - 10 min d'arrêt à Edéa = 260 min de conduite pour 250 km.
    expect(h[0]).toEqual({ arriveeMs: ms("08:00"), departMs: ms("08:00") });
    expect(hhmmDouala(h[1]!.arriveeMs)).toBe("09:07");
    expect(hhmmDouala(h[1]!.departMs)).toBe("09:17");
    expect(hhmmDouala(h[2]!.arriveeMs)).toBe("10:04");
    expect(hhmmDouala(h[3]!.arriveeMs)).toBe("10:46");
    expect(h[4]!.arriveeMs).toBe(ms("12:30"));
  });

  it("l'arrivée prévue est départ + durée du trajet, quels que soient les arrêts", () => {
    const sansArret = trajetType(DEPART, {
      arrets: t.arrets.map((x) => ({ ...x, arretMinutes: undefined })),
    });
    expect(horaire(sansArret)[4]!.arriveeMs).toBe(ms("12:30"));
  });

  it("sans kilomètres, répartit également", () => {
    const plat = trajetType(DEPART, {
      arrets: t.arrets.map((x) => ({ ...x, kmDepuisOrigine: 0 })),
    });
    const hp = horaire(plat);
    expect(hp[2]!.arriveeMs - hp[1]!.departMs).toBeCloseTo(hp[3]!.arriveeMs - hp[2]!.departMs, -1);
  });
});

describe("heure prévue au kilomètre", () => {
  const h = horaire(t);

  it("interpole entre deux arrêts", () => {
    const milieu = prevuAuKm(t, h, 87.5, 0);
    expect(milieu).toBeCloseTo((h[1]!.departMs + h[2]!.arriveeMs) / 2, -2);
  });

  it("aux bornes de la ligne", () => {
    expect(prevuAuKm(t, h, -1, 0)).toBe(h[0]!.departMs);
    expect(prevuAuKm(t, h, 250, 0)).toBe(h[4]!.arriveeMs);
    expect(prevuAuKm(t, h, 300, 0)).toBe(h[4]!.arriveeMs);
  });

  it("dans la zone d'un arrêt, l'heure réelle est ramenée dans la pause prévue", () => {
    const pause = (instant: number) => prevuAuKm(t, h, 65, instant);
    expect(pause(ms("09:12"))).toBe(ms("09:12")); // pendant la pause : ni avance ni retard
    expect(pause(ms("09:30"))).toBe(h[1]!.departMs); // pause dépassée : retard compté depuis la fin
    expect(pause(ms("09:00"))).toBe(h[1]!.arriveeMs); // arrivé en avance
  });
});

describe("avancée du bus", () => {
  it("avance sur la ligne et ne recule jamais", () => {
    const { etat } = jouer(t, [ech(10, 20), ech(11, 30), ech(12, 25)]);
    expect(etat.progressionKm).toBeCloseTo(30, 0);
  });

  it("enregistre le premier passage à chaque arrêt, jamais l'origine", () => {
    const { etat } = jouer(t, [ech(30, 40), ech(55, 66), ech(56, 67), ech(80, 112)]);
    expect(Object.keys(etat.passages).sort()).toEqual(["arret-edea-a", "arret-pouma-a"]);
    expect(etat.passages["arret-edea-a"]).toBe(a(55));
    expect(etat.passages["arret-pouma-a"]).toBe(a(80));
  });

  it("ignore une position plus ancienne que la dernière ou rejouée", () => {
    const base = jouer(t, [ech(10, 20), ech(11, 30)]).etat;
    const vieille = faireAvancer(t, base, ech(5, 10));
    expect(vieille.ignoree).toBe(true);
    expect(vieille.etat).toBe(base);
    const rejouee = faireAvancer(t, base, ech(11, 30));
    expect(rejouee.ignoree).toBe(true);
  });

  it("ne tient pas compte d'une position trop imprécise ni hors itinéraire", () => {
    const base = jouer(t, [ech(10, 20)]).etat;
    const floue = faireAvancer(t, base, ech(11, 90, { precisionM: 900 })).etat;
    expect(floue.progressionKm).toBeCloseTo(20, 0);
    expect(floue.derniere?.instant).toBe(a(11)); // gardée comme dernière position
    const ailleurs = faireAvancer(t, base, {
      instant: a(12),
      latitude: 5.5,
      longitude: 12.5,
      precisionM: 5,
      vitesseKmh: 60,
    }).etat;
    expect(ailleurs.progressionKm).toBeCloseTo(20, 0);
  });

  it("déduit la vitesse de deux positions quand le téléphone ne la donne pas", () => {
    // ~7,7 km à vol d'oiseau (10 km de route) en 6 min : environ 80 km/h. La vitesse déduite sous-estime
    // un peu (la route n'est pas droite), ce qui ne sert qu'à décider si le bus est arrêté.
    const base = jouer(t, [ech(10, 20, { vitesseKmh: null })]).etat;
    const { etat } = jouer(t, [ech(16, 30, { vitesseKmh: null })], base);
    expect(etat.derniere?.vitesseKmh).toBeGreaterThan(70);
    expect(etat.derniere?.vitesseKmh).toBeLessThan(100);
  });

  it("nomme le dernier arrêt passé", () => {
    expect(dernierArretPasse(t, jouer(t, [ech(30, 40)]).etat)).toBe("Douala Akwa");
    expect(dernierArretPasse(t, jouer(t, [ech(30, 40), ech(60, 70)]).etat)).toBe("Edéa");
  });
});

describe("arrêt anormal : plus de 10 minutes à l'arrêt hors arrêt", () => {
  // À 80 km de Douala, entre Edéa et Pouma : loin de tout arrêt.
  const enPanne = (minutes: number, extra: Partial<Echantillon> = {}) =>
    ech(minutes, 80, { vitesseKmh: 0, ...extra });

  it("se déclenche à 10 minutes d'immobilité et pas avant", () => {
    const avant = jouer(t, [ech(60, 78), enPanne(70), enPanne(79)]);
    expect(avant.derniere.arretAnormal).toBeNull();
    const apres = jouer(t, [ech(60, 78), enPanne(70), enPanne(80)]);
    expect(apres.derniere.arretAnormal).toMatchObject({ depuis: a(70) });
  });

  it("la dérive du GPS (quelques mètres) ne remet pas le compteur à zéro", () => {
    const derive = (minutes: number, dx: number) => ({
      ...enPanne(minutes),
      longitude: pointAuKm(80).longitude + dx,
    });
    const { derniere } = jouer(t, [
      ech(60, 78),
      enPanne(70),
      derive(73, 0.0004),
      derive(76, -0.0004),
      derive(81, 0.0005),
    ]);
    expect(derniere.arretAnormal?.depuis).toBe(a(70));
  });

  it("une vitesse de quelques km/h affichée à l'arrêt (bruit du GPS) ne remet pas le compteur à zéro", () => {
    const { derniere } = jouer(t, [
      ech(60, 78),
      enPanne(70),
      enPanne(74, { vitesseKmh: 2 }),
      enPanne(78, { vitesseKmh: 5 }),
      enPanne(81, { vitesseKmh: 1 }),
    ]);
    expect(derniere.arretAnormal?.depuis).toBe(a(70));
  });

  it("un bus qui accélère sur place (plus de 8 km/h) n'est plus à l'arrêt", () => {
    const { derniere, etat } = jouer(t, [
      enPanne(70),
      enPanne(75),
      enPanne(78, { vitesseKmh: 20 }),
      enPanne(81),
    ]);
    expect(derniere.arretAnormal).toBeNull();
    expect(etat.immobile?.depuis).toBe(a(81));
  });

  it("un bus qui repart remet le compteur à zéro", () => {
    const { derniere, etat } = jouer(t, [
      enPanne(70),
      enPanne(75),
      ech(78, 82, { vitesseKmh: 40 }),
      enPanne(79),
      enPanne(85),
    ]);
    expect(etat.immobile?.depuis).toBe(a(79));
    expect(derniere.arretAnormal).toBeNull();
  });

  it("un bus qui roule au pas dans un embouteillage n'est pas arrêté", () => {
    // 2 km/h : 5 minutes = 170 m, au-delà du rayon d'immobilité à la longue.
    const pas = Array.from({ length: 30 }, (_, i) =>
      ech(70 + i, 80 + i * 0.034, { vitesseKmh: 2 }),
    );
    expect(jouer(t, pas).derniere.arretAnormal).toBeNull();
  });

  it("un arrêt à moins de 500 m d'un arrêt de la ligne est normal, même très long", () => {
    // 100 m avant Edéa.
    const pres = (minutes: number) => ({
      instant: a(minutes),
      latitude: COORDONNEES.edea.latitude + 0.0009,
      longitude: COORDONNEES.edea.longitude,
      precisionM: 5,
      vitesseKmh: 0,
    });
    const { derniere } = jouer(t, [pres(60), pres(90), pres(120)]);
    expect(derniere.arretAnormal).toBeNull();
  });

  it("au-delà de 500 m d'un arrêt, il compte", () => {
    const loin = (minutes: number) => ({
      instant: a(minutes),
      latitude: COORDONNEES.edea.latitude + 0.006, // ~670 m
      longitude: COORDONNEES.edea.longitude,
      precisionM: 5,
      vitesseKmh: 0,
    });
    expect(distanceAuPlusProcheArretM(t, loin(0))).toBeGreaterThan(500);
    expect(jouer(t, [loin(60), loin(75)]).derniere.arretAnormal).not.toBeNull();
  });

  it("une position trop imprécise ne déclenche ni ne remet à zéro", () => {
    const { derniere } = jouer(t, [
      enPanne(70),
      enPanne(75, { precisionM: 900, latitude: 3.0, longitude: 10.0 }),
      enPanne(81),
    ]);
    expect(derniere.arretAnormal?.depuis).toBe(a(70));
  });

  it("ne se déclenche pas pour un départ qui n'est ni à l'embarquement ni en route", () => {
    const programme = trajetType(DEPART, { etat: "en_vente", partiA: null });
    expect(jouer(programme, [enPanne(70), enPanne(85)]).derniere.arretAnormal).toBeNull();
  });

  it("l'alerte porte l'immatriculation, le dernier arrêt passé et le texte de la salle de contrôle", () => {
    const { etat, derniere } = jouer(t, [ech(30, 40), ech(60, 70), enPanne(72), enPanne(85)]);
    expect(derniere.arretAnormal).not.toBeNull();
    const alerte = nouvelleAlerte("al-1", t, etat, derniere.arretAnormal!, new Date(ms("09:25")));
    expect(alerte).toMatchObject({
      immatriculation: "LT 412 AB",
      apres: "Edéa",
      soupcon: "autre",
      aBord: 36,
      resolueA: null,
    });
    expect(texteAlerte(alerte, ms("09:25") + 0)).toBe(
      "LT 412 AB arrêté 13 min après Edéa · 36 à bord",
    );
  });
});

describe("estimation d'arrivée", () => {
  it("à l'heure : retard nul, arrivée estimée = prévue", () => {
    // À 09:00 (60 min de route), l'horaire place le bus à environ 57,7 km.
    const { etat } = jouer(t, [ech(60, 58)]);
    const e = estimer(t, etat, ms("09:00"));
    expect(e.retardMinutes).toBe(0);
    expect(e.arriveeEstimeeMs).toBeLessThanOrEqual(e.arriveePrevueMs);
  });

  it("en retard : le retard se lit sur la position et s'ajoute à l'arrivée", () => {
    // À 09:07, l'horaire place le bus à Edéa (65 km) ; il n'est qu'à 56 km : environ 9 min de retard.
    const { etat } = jouer(t, [ech(67, 56)]);
    const e = estimer(t, etat, ms("09:07"));
    const prevu = prevuAuKm(t, horaire(t), 56, ms("09:07"));
    expect(e.retardMinutes).toBe(Math.round((ms("09:07") - prevu) / MS_PAR_MINUTE));
    expect(e.retardMinutes).toBeGreaterThan(4);
    expect(e.arriveeEstimeeMs - e.arriveePrevueMs).toBe(ms("09:07") - prevu);
  });

  it("un bus à l'arrêt hors arrêt voit son retard grandir à chaque position", () => {
    const retard = (minutes: number): number => {
      const { etat } = jouer(t, [
        ech(60, 56),
        ech(70, 56, { vitesseKmh: 0 }),
        ech(minutes, 56, { vitesseKmh: 0 }),
      ]);
      return estimer(t, etat, enMs(a(minutes))).retardMinutes;
    };
    expect(retard(80)).toBeGreaterThan(retard(75));
    expect(retard(90) - retard(80)).toBeGreaterThanOrEqual(9);
    expect(retard(90)).toBeGreaterThan(25);
  });

  it("en avance : l'arrivée estimée précède la prévue, le retard reste à 0", () => {
    const { etat } = jouer(t, [ech(30, 90)]);
    const e = estimer(t, etat, ms("08:30"));
    expect(e.ecartMs).toBeLessThan(0);
    expect(e.retardMinutes).toBe(0);
    expect(e.arriveeEstimeeMs).toBeLessThan(e.arriveePrevueMs);
  });

  it("une pause normale à Edéa ne compte ni avance ni retard", () => {
    const { etat } = jouer(t, [ech(70, 65, { vitesseKmh: 0 })]); // 09:10, pendant la pause
    const e = estimer(t, etat, ms("09:10"));
    expect(e.ecartMs).toBe(0);
    expect(e.retardMinutes).toBe(0);
  });

  it("sans position : l'horaire prévu, avec le retard de départ connu", () => {
    const pasParti = trajetType(DEPART, { etat: "embarquement", partiA: null });
    const e = estimer(pasParti, null, ms("07:30"));
    expect(e.enDirect).toBe(false);
    expect(e.retardMinutes).toBe(0);
    expect(e.arriveeEstimeeMs).toBe(ms("12:30"));
    const parti = trajetType(DEPART, { partiA: heure("08:12") });
    expect(estimer(parti, null, ms("08:20")).retardMinutes).toBe(12);
    expect(estimer(parti, null, ms("08:20")).arriveeEstimeeMs).toBe(ms("12:42"));
  });

  it("un bus qui n'est pas parti n'arrive pas en avance mais peut être en retard au départ", () => {
    const quai = trajetType(DEPART, { etat: "embarquement", partiA: null });
    const tot = jouer(quai, [ech(-20, 0, { vitesseKmh: 0 })]).etat;
    expect(estimer(quai, tot, ms("07:40")).ecartMs).toBe(0);
    const tard = jouer(quai, [ech(15, 0, { vitesseKmh: 0 })]).etat;
    expect(estimer(quai, tard, ms("08:15")).retardMinutes).toBe(15);
  });

  it("n'est « en direct » que sur un signal frais, et pas après l'arrivée", () => {
    const { etat } = jouer(t, [ech(60, 56)]);
    expect(estimer(t, etat, ms("09:01")).enDirect).toBe(true);
    expect(estimer(t, etat, ms("09:00") + REGLES_GPS.signalPerduSecondes * 1000 + 1).enDirect).toBe(
      false,
    );
    expect(estimer({ ...t, etat: "arrive" }, etat, ms("09:00")).enDirect).toBe(false);
  });

  it("l'arrivée estimée ne précède jamais la dernière position", () => {
    const { etat } = jouer(t, [ech(270, 249)]);
    const e = estimer(t, etat, ms("12:31"));
    expect(e.arriveeEstimeeMs).toBeGreaterThanOrEqual(e.instantMs);
  });
});

describe("étapes", () => {
  it("passé, prochain, à venir ; la destination est l'arrivée et n'est pas une étape", () => {
    const { etat } = jouer(t, [ech(70, 70)]); // Edéa passé, entre Edéa et Pouma
    const e = estimer(t, etat, ms("09:10"));
    expect(e.etapes.map((x) => [x.arret.nom, x.statut])).toEqual([
      ["Douala Akwa", "passe"],
      ["Edéa", "passe"],
      ["Pouma", "prochain"],
      ["Boumnyebel", "a_venir"],
    ]);
    expect(e.prochainArret?.nom).toBe("Pouma");
  });

  it("l'heure d'un arrêt passé est l'heure réelle, celle d'un arrêt à venir est prévue + écart", () => {
    const { etat } = jouer(t, [ech(70, 70)]);
    const e = estimer(t, etat, ms("09:10"));
    const [dla, edea, pouma] = e.etapes;
    expect(dla!.heureMs).toBe(ms("08:00")); // heure réelle du départ
    expect(edea!.heureMs).toBe(enMs(a(70))); // premier instant au-delà d'Edéa
    expect(pouma!.heureMs).toBe(horaire(t)[2]!.arriveeMs + e.ecartMs);
  });

  it("le prochain arrêt est la destination après le dernier arrêt intermédiaire", () => {
    const { etat } = jouer(t, [ech(200, 200)]);
    const e = estimer(t, etat, ms("11:20"));
    expect(e.etapes.every((x) => x.statut === "passe")).toBe(true);
    expect(e.prochainArret?.nom).toBe("Yaoundé Mvan");
  });

  it("avant le départ, l'origine est le prochain arrêt", () => {
    const quai = trajetType(DEPART, { etat: "embarquement", partiA: null });
    const e = estimer(quai, null, ms("07:50"));
    expect(e.etapes[0]).toMatchObject({ statut: "prochain" });
    expect(e.prochainArret?.nom).toBe("Douala Akwa");
  });

  it("précisions : parti, places qui montent, durée d'arrêt, prochain arrêt", () => {
    const { etat } = jouer(t, [ech(70, 70)]);
    const e = estimer(t, etat, ms("09:10"));
    expect(e.etapes.map((x, i) => precisionEtape(x, i))).toEqual([
      "parti",
      "arrêt 10 min",
      "prochain arrêt",
      "4 places montent ici",
    ]);
    const une = { ...e.etapes[3]!, arret: { ...e.etapes[3]!.arret, placesQuiMontent: 1 } };
    expect(precisionEtape(une, 3)).toBe("1 place monte ici");
  });
});

describe("monter en route : passage à un arrêt", () => {
  it("rend l'heure de passage estimée et l'arrivée à destination", () => {
    const { etat } = jouer(t, [ech(70, 70)]);
    const p = passageAArret(t, etat, 2, ms("09:10"))!;
    const e = estimer(t, etat, ms("09:10"));
    expect(p.passeAMs).toBe(e.etapes[2]!.heureMs);
    expect(p.arriveeDestinationMs).toBe(e.arriveeEstimeeMs);
  });

  it("rend null quand le bus est déjà passé, ou que le départ est terminé", () => {
    const { etat } = jouer(t, [ech(70, 70)]);
    expect(passageAArret(t, etat, 1, ms("09:10"))).toBeNull();
    expect(passageAArret({ ...t, etat: "arrive" }, etat, 2, ms("09:10"))).toBeNull();
    expect(passageAArret({ ...t, etat: "annule" }, etat, 2, ms("09:10"))).toBeNull();
  });

  it("un bus pas encore parti passe à l'heure prévue", () => {
    const quai = trajetType(DEPART, { etat: "en_vente", partiA: null });
    const p = passageAArret(quai, null, 2, ms("07:00"))!;
    expect(p.passeAMs).toBe(horaire(quai)[2]!.arriveeMs);
  });
});

describe("prévenir un proche", () => {
  it("part quand l'arrivée estimée est dans 15 minutes ou moins", () => {
    const e = { arriveeEstimeeMs: ms("12:30") };
    expect(doitPrevenir(e, ms("12:14"), 15)).toBe(false);
    expect(doitPrevenir(e, ms("12:15"), 15)).toBe(true);
    expect(doitPrevenir(e, ms("12:29"), 15)).toBe(true);
    expect(doitPrevenir(e, ms("12:00"), 45)).toBe(true);
  });
});

describe("lots de positions", () => {
  const maintenant = ms("09:00");
  const e = (iso: string) => ({ instant: iso, latitude: 4, longitude: 10 });

  it("refuse une position du futur ou de plus de 24 h, garde et trie les autres", () => {
    const { retenues, rejetees } = trierLot(
      [
        e("2026-11-02T09:00:30.000+01:00"),
        e("2026-11-02T09:10:00.000+01:00"), // du futur (+10 min)
        e("2026-11-02T08:59:00.000+01:00"),
        e("2026-11-01T08:00:00.000+01:00"), // plus de 24 h
        e("2026-11-02T09:02:00.000+01:00"), // 2 min d'avance : toléré
      ],
      maintenant,
    );
    expect(rejetees).toEqual([
      { rang: 1, motif: "dans_le_futur" },
      { rang: 3, motif: "trop_ancienne" },
    ]);
    expect(retenues.map((x) => x.instant)).toEqual([
      "2026-11-02T08:59:00.000+01:00",
      "2026-11-02T09:00:30.000+01:00",
      "2026-11-02T09:02:00.000+01:00",
    ]);
  });
});

describe("livreur moto", () => {
  const mission = {
    retire: true,
    retrait: { latitude: 4.05, longitude: 9.7 },
    remise: { latitude: 4.06, longitude: 9.7 },
  };
  const instant = ms("13:18");

  it("temps restant = distance × détour ÷ vitesse (20 km/h par défaut)", () => {
    // 1,11 km à vol d'oiseau × 1,3 = 1,44 km à 20 km/h = 4,3 min → 5 min.
    const e = estimerLivraison(mission, { latitude: 4.05, longitude: 9.7 }, instant, []);
    expect(e.minutesRestantes).toBe(5);
    expect(e.arriveeMs).toBe(instant + 5 * MS_PAR_MINUTE);
  });

  it("utilise la vitesse récente en mouvement, bornée entre 12 et 40 km/h", () => {
    const loin = { latitude: 4.0, longitude: 9.7 }; // ~6,7 km de la remise
    const lent = estimerLivraison(mission, loin, instant, [3, 4, 20]).minutesRestantes; // 20 km/h
    const vite = estimerLivraison(mission, loin, instant, [90, 100]).minutesRestantes; // plafonné 40
    const arrete = estimerLivraison(mission, loin, instant, [0, 1, 2]).minutesRestantes; // 20 par défaut
    expect(lent).toBe(arrete);
    expect(vite).toBeLessThan(lent);
    expect(estimerLivraison(mission, loin, instant, [6]).minutesRestantes).toBeGreaterThan(lent);
  });

  it("avant le retrait, le trajet passe d'abord par le point de retrait", () => {
    const avant = { ...mission, retire: false, retrait: { latitude: 4.02, longitude: 9.7 } };
    const depuis = { latitude: 4.0, longitude: 9.7 };
    const direct = estimerLivraison(mission, depuis, instant, []).minutesRestantes;
    const viaRetrait = estimerLivraison(avant, depuis, instant, []).minutesRestantes;
    expect(viaRetrait).toBeGreaterThanOrEqual(direct);
  });

  it("arrivé : 0 minute", () => {
    const e = estimerLivraison(mission, mission.remise, instant, []);
    expect(e.minutesRestantes).toBe(0);
  });
});
