import { Injectable } from "@nestjs/common";
import { AnnuaireCovoiturage } from "./ports";
import { nomPublic } from "./regles";
import { ReputationService } from "./reputation.service";
import { VerificationService } from "./verification.service";
import { conducteurVue, type ConducteurVue } from "./vues";

/** Ce que les autres voyageurs voient d'un conducteur : nom abrégé, vérification, note, trajets. */
@Injectable()
export class ProfilsService {
  constructor(
    private readonly annuaire: AnnuaireCovoiturage,
    private readonly verification: VerificationService,
    private readonly reputation: ReputationService,
  ) {}

  async conducteur(id: string): Promise<{ vue: ConducteurVue; nomComplet: string }> {
    const [identite, verifie, reputation] = await Promise.all([
      this.annuaire.identite(id),
      this.verification.estVerifie(id),
      this.reputation.conducteur(id),
    ]);
    const nomComplet = identite?.nom ?? "";
    return { vue: conducteurVue(id, nomComplet, verifie, reputation), nomComplet };
  }

  /** Nom abrégé d'un passager (« Aïcha N. ») pour le conducteur. */
  async nomAbrege(id: string): Promise<string> {
    return nomPublic((await this.annuaire.identite(id))?.nom ?? "");
  }
}
