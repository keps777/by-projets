import { Injectable } from "@nestjs/common";
import { AgenceService } from "../billetterie/agence.service";
import { Refus } from "../billetterie/erreurs";
import {
  lireBilletVendu,
  lireBilletVenduCadence,
  lireTelephoneAjoute,
} from "../billetterie/schemas";
import { DonneesInvalides } from "../billetterie/validation";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { BilletsSynchronises, type ResultatVenteSync, type SiegeDeVente } from "./ports";
import type { EvenementRecu } from "./protocole";

/**
 * Les billets des ventes rejouées (A6) : l'adaptateur de la billetterie. Il n'a pas de stockage propre, tout est
 * écrit par `AgenceService` (billets, sièges, événements traités) : il suit donc `API_STOCKAGE` avec la billetterie,
 * dont le garde-fou de production vaut pour lui.
 */
@Injectable()
export class BilletsSynchroniseesBilletterie extends BilletsSynchronises {
  constructor(private readonly agence: AgenceService) {
    super();
  }

  async vendre(
    evenement: EvenementRecu,
    utilisateur: Utilisateur,
    siegePerdu: boolean,
  ): Promise<ResultatVenteSync> {
    try {
      const lu =
        evenement.type === "billet.vendu_cadence"
          ? lireBilletVenduCadence(evenement, "evenement")
          : lireBilletVendu(evenement, "evenement");
      const r = await this.agence.venteSynchronisee(utilisateur, lu, { siegePerdu });
      // Une vente déjà passée par `/agence/billets` (réponse mémorisée sans bilan de synchronisation) : gardée telle quelle.
      const bilan = (
        r as {
          synchro?: { siege: SiegeDeVente; occupantBilletId: string | null; anomalies: string[] };
        }
      ).synchro ?? {
        siege: lu.donnees.siege === null ? ("aucun" as const) : ("garde" as const),
        occupantBilletId: null,
        anomalies: [],
      };
      return { cree: true, billetId: r.billet.billetId, ...bilan };
    } catch (e) {
      if (e instanceof Refus) return { cree: false, code: e.code, message: e.message };
      if (e instanceof DonneesInvalides) {
        return { cree: false, code: "DONNEES_INVALIDES", message: e.message };
      }
      throw e;
    }
  }

  async ajouterTelephone(
    evenement: EvenementRecu,
    utilisateur: Utilisateur,
  ): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
    try {
      await this.agence.ajouterTelephone(utilisateur, lireTelephoneAjoute(evenement, "evenement"));
      return { ok: true };
    } catch (e) {
      if (e instanceof Refus) return { ok: false, code: e.code, message: e.message };
      if (e instanceof DonneesInvalides) {
        return { ok: false, code: "DONNEES_INVALIDES", message: e.message };
      }
      throw e;
    }
  }

  retirerSiege(billetId: string, departId: string, siege: number): Promise<boolean> {
    return this.agence.retirerSiegeSynchronise(billetId, departId, siege);
  }

  rendreSiege(billetId: string, departId: string, siege: number): Promise<boolean> {
    return this.agence.rendreSiegeSynchronise(billetId, departId, siege);
  }
}
