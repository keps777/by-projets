import { Injectable } from "@nestjs/common";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import { DemandesService, type DemandePassagerVue } from "./demandes.service";
import { Reservations, Trajets, Versements } from "./ports";
import { FRAIS_PAR_PLACE } from "./regles";
import { ProfilsService } from "./profils.service";
import { VerificationService } from "./verification.service";
import { trajetPublieVue, type ConducteurVue, type TrajetPublieVue } from "./vues";

export interface MesTrajetsVue {
  conducteur: ConducteurVue;
  resume: { gainSemaine: number; trajets: number; annulations: number; piecesOk: boolean };
  publies: TrajetPublieVue[];
  demandes: DemandePassagerVue[];
  fraisParPlace: number;
}

const SEMAINE_MS = 7 * 86_400_000;

/**
 * L'écran « Je conduis » : le résumé du conducteur (gain de la semaine, trajets, annulations, pièces),
 * ses trajets publiés avec les passagers qui ont payé, et les passagers qui cherchent une voiture.
 */
@Injectable()
export class ConducteurService {
  constructor(
    private readonly trajets: Trajets,
    private readonly reservations: Reservations,
    private readonly versements: Versements,
    private readonly verification: VerificationService,
    private readonly profils: ProfilsService,
    private readonly demandes: DemandesService,
    private readonly horloge: Horloge,
  ) {}

  async mesTrajets(conducteur: Utilisateur): Promise<MesTrajetsVue> {
    const maintenant = this.horloge.maintenant();
    const [{ vue }, publies, versements, annules, demandes] = await Promise.all([
      this.profils.conducteur(conducteur.id),
      this.trajets.duConducteur(conducteur.id, { statuts: ["publie"] }),
      // Sur les 7 derniers jours : l'argent réellement reçu, pas l'argent promis.
      this.versements.duConducteur(conducteur.id, new Date(maintenant.getTime() - SEMAINE_MS)),
      this.trajets.nombreAnnules(conducteur.id),
      this.demandes.pourConducteur(conducteur.id),
    ]);

    const vues: TrajetPublieVue[] = [];
    for (const t of publies) {
      const payees = (await this.reservations.duTrajet(t.id)).filter(
        (r) => r.statut === "payee" || r.statut === "terminee",
      );
      const passagers = await Promise.all(
        payees.map(async (r) => ({
          passager: await this.profils.nomAbrege(r.passagerId),
          places: r.places,
          // Le prix des places, sans les frais d'AfriMove : ce que le conducteur touchera.
          montantPaye: r.prixParPlace * r.places,
        })),
      );
      vues.push(trajetPublieVue(t, passagers, await this.trajets.nombreVues(t.id)));
    }

    return {
      conducteur: vue,
      resume: {
        gainSemaine: versements.reduce((s, v) => s + v.montant, 0),
        trajets: vue.trajets ?? 0,
        annulations: annules,
        piecesOk: await this.verification.estVerifie(conducteur.id),
      },
      publies: vues,
      demandes,
      fraisParPlace: FRAIS_PAR_PLACE,
    };
  }
}
