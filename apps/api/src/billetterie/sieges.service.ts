import { Injectable } from "@nestjs/common";
import { Horloge } from "../socle/horloge";
import { exigerAvantLeDepart, exigerSiegeExistant, exigerVendable } from "./controles";
import { conflit } from "./erreurs";
import type { DepartComplet } from "./modeles";
import { DiffusionTempsReel, Inventaire } from "./ports";
import { emplacementSiege, finBlocageSiege } from "./regles";
import { enMs, versIsoDouala } from "./temps";
import { capaciteDe, siegesLibres } from "./vues";

/** Message du canal des sièges d'un départ, avant personnalisation par spectateur. */
export interface MessageSiegeInterne {
  type: "siege";
  departId: string;
  siege: number;
  etat: "libre" | "pris" | "bloque";
  /** Le voyageur qui a bloqué le siège (devient « à moi » pour lui seul). */
  par: string | null;
  jusqua?: string;
  versionPlan: number;
}

export const canalSieges = (departId: string): string => `sieges:${departId}`;

/**
 * Inventaire des sièges vu par les voyageurs : plan en temps réel, blocage de 15 minutes, comptage
 * des places libres. Toute modification du plan (blocage, vente, libération, expiration) est
 * diffusée sur le canal du départ, avec le numéro de version du plan.
 */
@Injectable()
export class SiegesService {
  constructor(
    private readonly inventaire: Inventaire,
    private readonly diffusion: DiffusionTempsReel,
    private readonly horloge: Horloge,
  ) {}

  maintenant(): string {
    return versIsoDouala(this.horloge.maintenant());
  }

  async libres(dc: DepartComplet): Promise<number[]> {
    const plan = await this.inventaire.plan(dc.depart.id);
    return siegesLibres(plan, capaciteDe(dc), this.maintenant());
  }

  async placesLibres(dc: DepartComplet): Promise<number> {
    return (await this.libres(dc)).length;
  }

  /** Le plan tel que ce voyageur le voit (ses blocages sont « à moi »). */
  async vue(dc: DepartComplet, voyageurId: string | null) {
    const maintenant = this.maintenant();
    const plan = await this.inventaire.plan(dc.depart.id);
    const capacite = capaciteDe(dc);
    const sieges: {
      numero: number;
      etat: "libre" | "pris" | "bloque" | "a_moi";
      emplacement: string;
    }[] = [];
    let mon: { departId: string; siege: number; jusqua: string } | undefined;
    for (let numero = 1; numero <= capacite; numero++) {
      let etat: "libre" | "pris" | "bloque" | "a_moi" = "libre";
      const bloc = plan.bloques[numero];
      if (plan.occupes[numero] !== undefined) etat = "pris";
      else if (bloc && enMs(bloc.jusqua) > enMs(maintenant)) {
        etat = voyageurId !== null && bloc.par === voyageurId ? "a_moi" : "bloque";
        if (etat === "a_moi" && !mon) {
          mon = { departId: dc.depart.id, siege: numero, jusqua: bloc.jusqua };
        }
      }
      sieges.push({ numero, etat, emplacement: emplacementSiege(numero) });
    }
    return {
      departId: dc.depart.id,
      capacite,
      sieges,
      libres: sieges.filter((s) => s.etat === "libre" || s.etat === "a_moi").length,
      ...(mon ? { mon } : {}),
      versionPlan: plan.version,
    };
  }

  /**
   * Bloque un siège 15 minutes pour ce voyageur. Un voyageur n'a qu'un siège bloqué à la fois par
   * départ : en choisir un autre libère le premier (sauf si une commande le retient déjà).
   */
  async bloquer(dc: DepartComplet, siege: number, voyageurId: string) {
    exigerVendable(dc);
    exigerAvantLeDepart(dc, this.horloge.maintenant());
    exigerSiegeExistant(dc, siege);
    const maintenant = this.maintenant();
    const jusqua = finBlocageSiege(maintenant);
    const r = await this.inventaire.bloquer({
      departId: dc.depart.id,
      siege,
      par: voyageurId,
      commandeId: null,
      jusqua,
      maintenant,
    });
    if (!r.ok) {
      throw conflit("SIEGE_PRIS", "Ce siège vient d'être pris par un autre voyageur", {
        siege,
      });
    }
    this.publier(dc.depart.id, siege, "bloque", voyageurId, jusqua, r.version);
    const levees = await this.inventaire.leverBlocages(dc.depart.id, voyageurId, [siege]);
    for (const l of levees)
      this.publier(dc.depart.id, l.siege, "libre", null, undefined, l.version);
    return { departId: dc.depart.id, siege, jusqua };
  }

  /** Diffuse l'état d'un siège aux spectateurs du départ. */
  publier(
    departId: string,
    siege: number,
    etat: MessageSiegeInterne["etat"],
    par: string | null,
    jusqua: string | undefined,
    versionPlan: number,
  ): void {
    const message: MessageSiegeInterne = {
      type: "siege",
      departId,
      siege,
      etat,
      par,
      ...(jusqua ? { jusqua } : {}),
      versionPlan,
    };
    this.diffusion.publier(canalSieges(departId), message);
  }

  publierLiberations(
    departId: string,
    levees: readonly { siege: number; version: number }[],
  ): void {
    for (const l of levees) this.publier(departId, l.siege, "libre", null, undefined, l.version);
  }

  /** Les blocages dont la fin est passée reviennent à la vente, et les spectateurs le voient. */
  async expirerBlocages() {
    const expires = await this.inventaire.expirer(this.maintenant());
    for (const e of expires) this.publier(e.departId, e.siege, "libre", null, undefined, e.version);
    return expires;
  }
}
