import { describe, expect, it } from "vitest";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { HorlogeFixe } from "../socle/testing/memoire";
import type { AlerteArret, EtatSuivi } from "./modeles";
import {
  AlertesMemoire,
  AvisMemoire,
  BilletsMemoire,
  DiffusionMemoire,
  EtatsSuiviMemoire,
  PositionsMemoire,
  PrevenirMemoire,
  ProchesMemoire,
  ReseauMemoire,
} from "./memoire";
import { SuiviBusService } from "./suivi.service";
import { MS_PAR_MINUTE, enMs, versIsoDouala } from "./temps";
import { COMPAGNIE, DEPART, pointAuKm, trajetType } from "./testing/monde";

/**
 * Le suivi sans HTTP : ce qui arrive quand deux appareils écrivent en même temps, ou que le
 * serveur tombe entre deux écritures.
 */

const equipage: Utilisateur = {
  id: "chauffeur-1",
  role: "chauffeur",
  compagnieId: COMPAGNIE,
  gareId: null,
};

class EtatsConcurrents extends EtatsSuiviMemoire {
  /** Nombre d'écritures à refuser comme si un autre appareil venait d'écrire. */
  perdre = 0;
  ecritures = 0;
  async ecrire(etat: EtatSuivi) {
    this.ecritures += 1;
    if (this.perdre > 0) {
      this.perdre -= 1;
      return false;
    }
    return super.ecrire(etat);
  }
}

class EtatsQuiTombent extends EtatsSuiviMemoire {
  tomber = 0;
  async ecrire(etat: EtatSuivi) {
    if (this.tomber > 0) {
      this.tomber -= 1;
      throw new Error("serveur tombé avant l'écriture de l'état");
    }
    return super.ecrire(etat);
  }
}

class AlertesQuiTombent extends AlertesMemoire {
  tomber = 0;
  async ouvrir(alerte: AlerteArret) {
    if (this.tomber > 0) {
      this.tomber -= 1;
      throw new Error("serveur tombé avant l'écriture de l'alerte");
    }
    return super.ouvrir(alerte);
  }
}

function monde(
  o: {
    etats?: EtatsSuiviMemoire;
    alertes?: AlertesMemoire;
    avis?: AvisMemoire;
  } = {},
) {
  const horloge = new HorlogeFixe(new Date("2026-11-02T08:05:00.000Z")); // 09:05
  const reseau = new ReseauMemoire();
  reseau.ajouterTrajet(trajetType(DEPART, { chauffeurId: equipage.id }));
  const positions = new PositionsMemoire();
  const etats = o.etats ?? new EtatsSuiviMemoire();
  const alertes = o.alertes ?? new AlertesMemoire();
  const avis = o.avis ?? new AvisMemoire();
  const diffusion = new DiffusionMemoire();
  const service = new SuiviBusService(
    reseau,
    new BilletsMemoire(),
    new ProchesMemoire(),
    positions,
    etats,
    alertes,
    new PrevenirMemoire(),
    avis,
    diffusion,
    horloge,
  );
  const pos = (km: number, decalageS = 0, extra: Record<string, unknown> = {}) => ({
    instant: versIsoDouala(horloge.maintenant().getTime() + decalageS * 1000),
    ...pointAuKm(km),
    precisionM: 8,
    vitesseKmh: 80,
    ...extra,
  });
  return { horloge, reseau, positions, etats, alertes, avis, diffusion, service, pos };
}

describe("deux appareils écrivent en même temps", () => {
  it("reprend la lecture quand l'état a changé entre-temps", async () => {
    const etats = new EtatsConcurrents();
    const m = monde({ etats });
    etats.perdre = 3;
    const r = await m.service.enregistrerPositions(equipage, DEPART, [m.pos(70)]);
    expect(r.acceptees).toBe(1);
    expect(etats.ecritures).toBe(4); // trois refus, puis l'écriture
    expect((await etats.lire(DEPART))?.progressionKm).toBeCloseTo(70, 0);
  });

  it("renonce avec 409 SUIVI_OCCUPE si l'état ne se libère jamais, sans perdre les positions", async () => {
    const etats = new EtatsConcurrents();
    const m = monde({ etats });
    etats.perdre = 100;
    await expect(
      m.service.enregistrerPositions(equipage, DEPART, [m.pos(70)]),
    ).rejects.toMatchObject({ code: "SUIVI_OCCUPE" });
    // La position est gardée : le renvoi du lot l'appliquera.
    expect(m.positions.compter(`bus:${DEPART}`)).toBe(1);
    etats.perdre = 0;
    const rejeu = await m.service.enregistrerPositions(equipage, DEPART, [m.pos(70)]);
    expect(rejeu).toMatchObject({ acceptees: 0, doublons: 1 });
    expect((await etats.lire(DEPART))?.progressionKm).toBeCloseTo(70, 0);
  });

  it("des lots simultanés ne perdent aucun passage à un arrêt", async () => {
    const m = monde();
    const lots = [30, 60, 90, 120].map((km, i) => [m.pos(km, -(120 - i * 30))]);
    await Promise.all(lots.map((lot) => m.service.enregistrerPositions(equipage, DEPART, lot)));
    const etat = await m.etats.lire(DEPART);
    expect(Object.keys(etat?.passages ?? {}).sort()).toEqual(["arret-edea-a", "arret-pouma-a"]);
    expect(etat?.progressionKm).toBeCloseTo(120, 0);
  });
});

describe("le serveur tombe entre deux écritures", () => {
  it("la position écrite mais pas l'état : le renvoi du lot rattrape l'état", async () => {
    const etats = new EtatsQuiTombent();
    const m = monde({ etats });
    etats.tomber = 1;
    const lot = [m.pos(70)];
    await expect(m.service.enregistrerPositions(equipage, DEPART, lot)).rejects.toThrow(
      "serveur tombé",
    );
    expect(await etats.lire(DEPART)).toBeNull();
    expect(m.positions.compter(`bus:${DEPART}`)).toBe(1);

    const rejeu = await m.service.enregistrerPositions(equipage, DEPART, lot);
    expect(rejeu).toMatchObject({ acceptees: 0, doublons: 1 });
    expect((await etats.lire(DEPART))?.progressionKm).toBeCloseTo(70, 0);
  });

  it("l'état annonce une alerte jamais écrite : la position suivante l'ouvre", async () => {
    const alertes = new AlertesQuiTombent();
    const m = monde({ alertes });
    alertes.tomber = 1;
    // 10 minutes d'arrêt à 70 km : l'alerte s'ouvre, mais l'écriture tombe.
    for (let i = 0; i < 21; i++) {
      m.horloge.avancer(30_000);
      await m.service.enregistrerPositions(equipage, DEPART, [m.pos(70, 0, { vitesseKmh: 0 })]);
    }
    const etat = await m.etats.lire(DEPART);
    expect(etat?.alerteId).not.toBeNull();
    expect(alertes.toutes()).toHaveLength(1);
    expect(alertes.toutes()[0]).toMatchObject({
      id: etat?.alerteId,
      resolueA: null,
      apres: "Edéa",
    });
    expect(m.avis.alertes).toHaveLength(1);
  });

  it("une alerte qui échoue à notifier reste ouverte et ne bloque pas les positions", async () => {
    const avis = new AvisMemoire();
    avis.alerteArret = async () => {
      throw new Error("passerelle SMS indisponible");
    };
    const m = monde({ avis });
    for (let i = 0; i < 21; i++) {
      m.horloge.avancer(30_000);
      const r = await m.service.enregistrerPositions(equipage, DEPART, [
        m.pos(70, 0, { vitesseKmh: 0 }),
      ]);
      expect(r.acceptees).toBe(1);
    }
    expect(m.alertes.toutes().filter((a) => a.resolueA === null)).toHaveLength(1);
  });
});

describe("alerte d'arrêt anormal", () => {
  it("s'ouvre une seule fois, même si le lot contient tout l'arrêt, et se ferme au départ", async () => {
    const m = monde();
    m.horloge.avancer(15 * MS_PAR_MINUTE); // 09:20
    const maintenant = m.horloge.maintenant().getTime();
    // Un téléphone sans réseau rattrape 12 minutes d'arrêt d'un coup, puis repart.
    const lot = Array.from({ length: 25 }, (_, i) => ({
      instant: versIsoDouala(maintenant - (12 * 60 - i * 30) * 1000),
      ...pointAuKm(70),
      precisionM: 8,
      vitesseKmh: 0,
    }));
    await m.service.enregistrerPositions(equipage, DEPART, lot);
    expect(m.alertes.toutes()).toHaveLength(1);
    expect(m.alertes.toutes()[0]?.resolueA).toBeNull();
    expect(m.avis.alertes).toHaveLength(1);

    m.horloge.avancer(30_000);
    await m.service.enregistrerPositions(equipage, DEPART, [m.pos(73)]);
    expect(m.alertes.toutes()[0]?.resolueA).not.toBeNull();

    // Un deuxième arrêt plus loin est une autre alerte.
    for (let i = 0; i < 21; i++) {
      m.horloge.avancer(30_000);
      await m.service.enregistrerPositions(equipage, DEPART, [m.pos(90, 0, { vitesseKmh: 0 })]);
    }
    expect(m.alertes.toutes()).toHaveLength(2);
    expect(m.avis.alertes).toHaveLength(2);
  });

  it("l'alerte date du début de l'arrêt, pas de la réception", async () => {
    const m = monde();
    const debut = m.horloge.maintenant().getTime();
    for (let i = 0; i < 21; i++) {
      m.horloge.avancer(30_000);
      await m.service.enregistrerPositions(equipage, DEPART, [m.pos(70, 0, { vitesseKmh: 0 })]);
    }
    const alerte = m.alertes.toutes()[0]!;
    expect(enMs(alerte.arretDepuis)).toBe(debut + 30_000);
    expect(enMs(alerte.ouverteA) - enMs(alerte.arretDepuis)).toBe(10 * MS_PAR_MINUTE);
  });
});

describe("diffusion", () => {
  it("publie la dernière position du lot (une seule fois) sur le canal du départ", async () => {
    const m = monde();
    const recus: unknown[] = [];
    m.diffusion.souscrire(`gps:bus:${DEPART}`, (x) => recus.push(x));
    m.horloge.avancer(2 * MS_PAR_MINUTE);
    const now = m.horloge.maintenant().getTime();
    const lot = [60, 30, 0].map((s, i) => ({
      ...m.pos(60 + i),
      instant: versIsoDouala(now - s * 1000),
    }));
    await m.service.enregistrerPositions(equipage, DEPART, lot);
    expect(recus).toHaveLength(1);
    expect(recus[0]).toMatchObject({ departId: DEPART, instant: versIsoDouala(now) });
    // Rejouer le lot ne publie rien de plus.
    await m.service.enregistrerPositions(equipage, DEPART, lot);
    expect(recus).toHaveLength(1);
  });
});
