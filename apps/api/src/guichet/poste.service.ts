import { Injectable } from "@nestjs/common";
import { inconnu, interdit } from "../billetterie/erreurs";
import type { Compagnie, DepartComplet, Gare, Guichet } from "../billetterie/modeles";
import { Catalogue } from "../billetterie/ports";
import { MS_PAR_HEURE, MS_PAR_MINUTE, enMs, versIsoDouala } from "../billetterie/temps";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";

/** Le poste de travail d'un guichetier : son guichet, sa gare, sa compagnie. */
export interface PosteGuichet {
  guichet: Guichet;
  gare: Gare;
  compagnie: Compagnie;
}

/** États d'un départ qui peut encore recevoir des voyageurs (vente ou embarquement). */
export const ETATS_A_VENIR = ["embarquement", "en_vente", "retarde"] as const;

/**
 * Ce que les écrans du guichet (accueil, cadence, quai) ont en commun : retrouver le poste de l'agent et choisir
 * le départ dont on parle. Les données viennent du catalogue de la billetterie (lecture seule).
 */
@Injectable()
export class PosteGuichetService {
  constructor(
    private readonly catalogue: Catalogue,
    private readonly horloge: Horloge,
  ) {}

  maintenant(): string {
    return versIsoDouala(this.horloge.maintenant());
  }

  /** Le guichet où travaille l'agent (404 `GUICHET_INCONNU` s'il n'en a pas, ou s'il est d'une autre compagnie). */
  async de(u: Utilisateur): Promise<PosteGuichet> {
    const guichet = await this.catalogue.guichetDe(u.id);
    if (!guichet) throw inconnu("GUICHET_INCONNU", "Aucun guichet n'est affecté à ce compte");
    const gare = await this.catalogue.gare(guichet.gareId);
    if (!gare || (u.compagnieId !== null && gare.compagnieId !== u.compagnieId)) {
      throw inconnu("GUICHET_INCONNU", "Guichet introuvable");
    }
    const compagnie = await this.catalogue.compagnie(gare.compagnieId);
    if (!compagnie) throw inconnu("GUICHET_INCONNU", "Guichet introuvable");
    return { guichet, gare, compagnie };
  }

  /** Un départ de la compagnie de l'agent (404 `DEPART_INCONNU` sinon, y compris celui d'une autre compagnie). */
  async departDeLAgence(u: Utilisateur, departId: string): Promise<DepartComplet> {
    const dc = await this.catalogue.depart(departId);
    if (!dc || dc.compagnie.id !== u.compagnieId) {
      throw inconnu("DEPART_INCONNU", "Départ introuvable");
    }
    return dc;
  }

  /**
   * Les départs de la gare à embarquer ou à vendre, du plus proche au plus lointain : ceux qui sont partis
   * depuis plus de `retardMinutes` n'y sont plus.
   */
  async departsAVenir(gareId: string, retardMinutes = 30): Promise<DepartComplet[]> {
    const maintenant = enMs(this.maintenant());
    const departs = await this.catalogue.departs({
      gareOrigineId: gareId,
      etats: ETATS_A_VENIR,
      de: versIsoDouala(maintenant - retardMinutes * MS_PAR_MINUTE),
    });
    return departs.sort((a, b) => enMs(a.depart.heureDepart) - enMs(b.depart.heureDepart));
  }

  /** Le départ du quai : celui demandé, sinon l'embarquement en cours, sinon le prochain de la gare qui a un bus. */
  async departDuQuai(u: Utilisateur, departId: string | undefined): Promise<DepartComplet> {
    if (departId) return this.departDeLAgence(u, departId);
    if (!u.gareId) throw interdit("GARE_REQUISE", "Ce compte n'est rattaché à aucune gare");
    const maintenant = enMs(this.maintenant());
    const candidats = await this.catalogue.departs({
      gareOrigineId: u.gareId,
      etats: ETATS_A_VENIR,
      de: versIsoDouala(maintenant - 2 * MS_PAR_HEURE),
    });
    const choix =
      candidats.find((c) => c.depart.etat === "embarquement") ??
      candidats.find((c) => c.bus !== null && c.depart.etat !== "retarde");
    if (!choix) throw inconnu("AUCUN_DEPART", "Aucun départ à embarquer pour le moment");
    return choix;
  }
}
