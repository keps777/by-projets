import { Injectable } from "@nestjs/common";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import { interdit } from "./erreurs";
import type { BusEnRoute } from "./modeles";
import { AlertesArret, EtatsSuivi, ReseauTransport } from "./ports";
import { estimer } from "./regles";
import { versIsoDouala } from "./temps";
import { aTraiterVue, alerteCarteVue, busEnRouteVue } from "./vues";

/**
 * Salle de contrôle : les bus de la compagnie sur la carte, avec leur dernière position, et les
 * alertes d'arrêt anormal. `alerte` et `aTraiter` ont la forme de `patron.SalleDeControle`
 * (`carte.alerte`, `aTraiter`), pour que l'écran les lise sans traduction.
 */
@Injectable()
export class ControleBusService {
  constructor(
    private readonly reseau: ReseauTransport,
    private readonly etats: EtatsSuivi,
    private readonly alertes: AlertesArret,
    private readonly horloge: Horloge,
  ) {}

  compagnieDe(u: Utilisateur): string {
    if (!u.compagnieId) throw interdit("COMPAGNIE_REQUISE", "Compte sans compagnie");
    return u.compagnieId;
  }

  async carte(compagnieId: string) {
    const maintenantMs = this.horloge.maintenant().getTime();
    const trajets = await this.reseau.trajetsEnRoute(compagnieId);
    const ouvertes = await this.alertes.ouvertes(compagnieId);
    const bus: BusEnRoute[] = [];
    for (const t of trajets) {
      const etat = await this.etats.lire(t.departId);
      if (!etat?.derniere) continue;
      const alerte = ouvertes.find((a) => a.departId === t.departId) ?? null;
      const vue = busEnRouteVue(t, etat, estimer(t, etat, maintenantMs), alerte, maintenantMs);
      if (vue) bus.push(vue);
    }
    // La carte met en avant le bus arrêté depuis le plus longtemps.
    const premiere = ouvertes[0];
    return {
      instant: versIsoDouala(maintenantMs),
      busEnRoute: trajets.filter((t) => t.etat === "parti").length,
      bus,
      alerte: premiere ? alerteCarteVue(premiere, maintenantMs) : null,
      aTraiter: ouvertes.map((a) => aTraiterVue(a, maintenantMs)),
    };
  }
}
