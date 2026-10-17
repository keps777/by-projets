import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { PersonnesRepository } from "../socle/comptes/personnes.repository";
import { Horloge } from "../socle/horloge";
import { BilletsService } from "./billets.service";
import { exigerAvantLeDepart, exigerSiegeExistant, exigerVendable } from "./controles";
import { Refus, conflit, inconnu, invalide } from "./erreurs";
import type {
  Billet,
  Commande,
  DepartComplet,
  LigneDevisStockee,
  Passager,
  TypeCommande,
} from "./modeles";
import {
  AvisBillets,
  Catalogue,
  Commandes,
  ConversionDevises,
  Inventaire,
  ProchesVoyageur,
  Promotions,
} from "./ports";
import { Passagers } from "./passagers";
import { FRAIS_VOYAGEUR_EN_LIGNE, finBlocageSiege } from "./regles";
import { Serialiseur } from "./serialiser";
import { SiegesService } from "./sieges.service";
import { hhmmDouala } from "./temps";
import { prixDuDepart } from "./vues";

/** Au plus 10 sièges retenus par une commande. */
export const SIEGES_MAX_PAR_COMMANDE = 10;

export interface DemandeDevisRecue {
  departId: string;
  places?: number | undefined;
  codePromo?: string | undefined;
  enLigne?: boolean | undefined;
}

export interface CreationCommande {
  departId: string;
  sieges: number[];
  pour: "moi" | "proche" | "plusieurs";
  procheId?: string | undefined;
  passagers?: { nom: string; telephone?: string | undefined }[] | undefined;
  codePromo?: string | undefined;
  devise?: string | undefined;
}

export function vueCommande(c: Commande) {
  return {
    id: c.id,
    type: c.type,
    libelle: c.libelle,
    lignes: c.lignes.map((l) => ({
      code: l.code,
      libelle: l.libelle,
      montant: l.montant,
      ...(l.montantBarre !== undefined ? { montantBarre: l.montantBarre } : {}),
      ...(l.offertAvec !== undefined ? { offertAvec: l.offertAvec } : {}),
    })),
    total: c.total,
    ...(c.conversion ? { conversion: c.conversion } : {}),
    statut: c.statut,
    creeeA: c.creeeA,
    expireA: c.expireA,
    billetIds: c.billetIds,
  };
}

/**
 * Devis, commande et confirmation de paiement d'un billet acheté en ligne.
 *
 * Une commande retient ses sièges 15 minutes. Le paiement (agrégateur MoMo, Orange Money, carte :
 * AM-165) appelle `confirmerPaiement` : la commande passe à « payée » et les billets sont émis.
 * Sans paiement, la commande expire et les sièges reviennent à la vente.
 */
@Injectable()
export class CommandesService {
  private readonly serie = new Serialiseur();

  constructor(
    private readonly commandes: Commandes,
    private readonly catalogue: Catalogue,
    private readonly inventaire: Inventaire,
    private readonly sieges: SiegesService,
    private readonly billets: BilletsService,
    private readonly promotions: Promotions,
    private readonly proches: ProchesVoyageur,
    private readonly devises: ConversionDevises,
    private readonly passagers: Passagers,
    private readonly personnes: PersonnesRepository,
    private readonly avis: AvisBillets,
    private readonly horloge: Horloge,
  ) {}

  private async departOuvert(departId: string): Promise<DepartComplet> {
    const dc = await this.catalogue.depart(departId);
    if (!dc) throw inconnu("DEPART_INCONNU", "Départ introuvable");
    return dc;
  }

  /* -------------------------------------------------------------- devis */

  private async lignesDevis(
    dc: DepartComplet,
    places: number,
    enLigne: boolean,
    codePromo: string | undefined,
  ): Promise<{ lignes: LigneDevisStockee[]; total: number; promo: string | null }> {
    const lignes: LigneDevisStockee[] = [
      {
        code: "billet",
        libelle: places > 1 ? `${places} billets` : "Billet",
        montant: prixDuDepart(dc) * places,
      },
    ];
    let promo: string | null = null;
    if (enLigne) {
      const fraisPleins = FRAIS_VOYAGEUR_EN_LIGNE * places;
      let offert = false;
      // Un code vide (champ laissé vide dans l'application) équivaut à pas de code.
      if (codePromo !== undefined && codePromo.trim() !== "") {
        const p = await this.promotions.trouver(codePromo);
        if (!p) throw invalide("CODE_PROMO_INVALIDE", "Ce code promotionnel n'existe pas");
        offert = p.type === "frais_offerts";
        promo = p.code;
      }
      lignes.push(
        offert
          ? {
              code: "frais_voyageur",
              libelle: "Frais de service",
              montant: 0,
              montantBarre: fraisPleins,
              offertAvec: promo ?? "",
            }
          : { code: "frais_voyageur", libelle: "Frais de service", montant: fraisPleins },
      );
    }
    return { lignes, total: lignes.reduce((t, l) => t + l.montant, 0), promo };
  }

  async devis(d: DemandeDevisRecue) {
    const dc = await this.departOuvert(d.departId);
    const places = d.places ?? 1;
    if (places > SIEGES_MAX_PAR_COMMANDE) {
      throw invalide(
        "PLACES_TROP_NOMBREUSES",
        `Au plus ${SIEGES_MAX_PAR_COMMANDE} places par commande`,
      );
    }
    const { lignes, total } = await this.lignesDevis(dc, places, d.enLigne ?? true, d.codePromo);
    return {
      lignes: lignes.map((l) => ({
        code: l.code,
        libelle: l.libelle,
        montant: l.montant,
        ...(l.montantBarre !== undefined ? { montantBarre: l.montantBarre } : {}),
        ...(l.offertAvec !== undefined ? { offertAvec: l.offertAvec } : {}),
      })),
      total,
    };
  }

  /* -------------------------------------------------------------- commande */

  private async passagersDeLaCommande(
    voyageur: Utilisateur,
    c: CreationCommande,
  ): Promise<Passager[]> {
    const moi = await this.personnes.trouverParId(voyageur.id);
    const voyageurPassager: Passager = {
      nom: moi?.nom ? moi.nom : null,
      telephone: null,
      pieceQuatreDerniers: null,
    };
    const saisi = (i: number): Passager | null => {
      const p = c.passagers?.[i];
      return p && p.nom.trim() !== ""
        ? { nom: p.nom.trim(), telephone: p.telephone ?? null, pieceQuatreDerniers: null }
        : null;
    };
    if (c.pour === "moi") return [voyageurPassager];
    if (c.pour === "proche") {
      if (c.procheId !== undefined) {
        const proche = await this.proches.trouver(voyageur.id, c.procheId);
        if (!proche) throw inconnu("PROCHE_INCONNU", "Proche introuvable");
        return [{ nom: proche.nom, telephone: proche.telephone, pieceQuatreDerniers: null }];
      }
      const p = saisi(0);
      if (!p) throw invalide("PASSAGER_REQUIS", "Indique le nom de la personne qui voyage");
      return [p];
    }
    return c.sieges.map(
      (_, i) =>
        saisi(i) ??
        (i === 0 ? voyageurPassager : { nom: null, telephone: null, pieceQuatreDerniers: null }),
    );
  }

  async creer(voyageur: Utilisateur, c: CreationCommande) {
    const dc = await this.departOuvert(c.departId);
    exigerVendable(dc);
    exigerAvantLeDepart(dc, this.horloge.maintenant());
    if (new Set(c.sieges).size !== c.sieges.length) {
      throw invalide("SIEGES_EN_DOUBLE", "Un siège ne peut être choisi qu'une fois");
    }
    if (c.sieges.length > SIEGES_MAX_PAR_COMMANDE) {
      throw invalide(
        "PLACES_TROP_NOMBREUSES",
        `Au plus ${SIEGES_MAX_PAR_COMMANDE} places par commande`,
      );
    }
    if (c.pour !== "plusieurs" && c.sieges.length !== 1) {
      throw invalide("SIEGES_INCOHERENTS", "Un seul siège pour « moi » ou « un proche »");
    }
    for (const s of c.sieges) exigerSiegeExistant(dc, s);
    const passagers = await this.passagersDeLaCommande(voyageur, c);

    const { lignes, total, promo } = await this.lignesDevis(dc, c.sieges.length, true, c.codePromo);
    let conversion: Commande["conversion"] = null;
    if (c.devise !== undefined && c.devise !== "XAF") {
      conversion = await this.devises.convertir(total, c.devise);
      if (!conversion) {
        throw invalide("DEVISE_NON_SUPPORTEE", `La devise ${c.devise} n'est pas prise en charge`);
      }
    }

    const maintenant = this.sieges.maintenant();
    const expireA = finBlocageSiege(maintenant);
    const id = randomUUID();

    // Une seule commande en attente par voyageur et par départ : la nouvelle remplace l'ancienne.
    for (const ancienne of await this.commandes.duDepart(dc.depart.id, "en_attente_paiement")) {
      if (ancienne.voyageurId === voyageur.id) await this.annuler(ancienne.id, "remplacee");
    }

    const retenus: number[] = [];
    for (const siege of c.sieges) {
      const r = await this.inventaire.bloquer({
        departId: dc.depart.id,
        siege,
        par: voyageur.id,
        commandeId: id,
        jusqua: expireA,
        maintenant,
      });
      if (!r.ok) {
        this.sieges.publierLiberations(
          dc.depart.id,
          await this.inventaire.leverCommande(dc.depart.id, id),
        );
        throw conflit("SIEGE_PRIS", "Un siège vient d'être pris par un autre voyageur", { siege });
      }
      retenus.push(siege);
      this.sieges.publier(dc.depart.id, siege, "bloque", voyageur.id, expireA, r.version);
    }
    this.sieges.publierLiberations(
      dc.depart.id,
      await this.inventaire.leverBlocages(dc.depart.id, voyageur.id, retenus),
    );

    const type: TypeCommande =
      c.pour === "proche" ? "proche" : c.pour === "plusieurs" ? "groupe" : "billet";
    const commande: Commande = {
      id,
      voyageurId: voyageur.id,
      departId: dc.depart.id,
      type,
      libelle: `${dc.compagnie.nom} · ${dc.origine.ville} → ${dc.destination.ville} · ${hhmmDouala(dc.depart.heureDepart)}`,
      lignes,
      total,
      conversion,
      statut: "en_attente_paiement",
      creeeA: maintenant,
      expireA,
      sieges: c.sieges,
      passagersChiffre: this.passagers.chiffrerListe(passagers),
      billetIds: [],
      codePromo: promo,
      moyenPaiement: null,
    };
    await this.commandes.ajouter(commande);
    return vueCommande(commande);
  }

  /** Une commande de ce voyageur ; échue, elle passe à « expirée » avant d'être renvoyée. */
  async obtenir(commandeId: string, voyageurId: string) {
    const c = await this.commandes.trouver(commandeId);
    if (!c || c.voyageurId !== voyageurId)
      throw inconnu("COMMANDE_INCONNUE", "Commande introuvable");
    return vueCommande(await this.expirerSiEchue(c));
  }

  private async expirerSiEchue(c: Commande): Promise<Commande> {
    if (c.statut !== "en_attente_paiement") return c;
    if (Date.parse(c.expireA) > this.horloge.maintenant().getTime()) return c;
    return (await this.expirer(c)) ?? (await this.commandes.trouver(c.id)) ?? c;
  }

  private async expirer(c: Commande): Promise<Commande | null> {
    const expiree = await this.commandes.transitionner(c.id, ["en_attente_paiement"], {
      statut: "expiree",
    });
    if (!expiree) return null;
    this.sieges.publierLiberations(
      c.departId,
      await this.inventaire.leverCommande(c.departId, c.id),
    );
    await this.avis.publier({
      type: "commande.expiree",
      commandeId: c.id,
      voyageurId: c.voyageurId,
    });
    return expiree;
  }

  /** Annule une commande non payée : les sièges retenus reviennent à la vente. */
  async annuler(commandeId: string, _raison: string): Promise<boolean> {
    const c = await this.commandes.trouver(commandeId);
    if (!c) return false;
    const annulee = await this.commandes.transitionner(c.id, ["en_attente_paiement"], {
      statut: "annulee",
    });
    if (!annulee) return false;
    this.sieges.publierLiberations(
      c.departId,
      await this.inventaire.leverCommande(c.departId, c.id),
    );
    return true;
  }

  /** Les commandes qui attendent encore leur paiement sur ce départ. */
  async enAttenteDuDepart(departId: string): Promise<string[]> {
    return (await this.commandes.duDepart(departId, "en_attente_paiement")).map((c) => c.id);
  }

  /** Balayage : les commandes dont le délai est passé expirent et libèrent leurs sièges. */
  async expirerEchues(): Promise<number> {
    const echues = await this.commandes.enAttenteExpirees(this.sieges.maintenant());
    let n = 0;
    for (const c of echues) if (await this.expirer(c)) n++;
    return n;
  }

  /* -------------------------------------------------------------- paiement confirmé */

  /**
   * Appelé par les paiements (AM-165) quand l'agrégateur confirme : la commande passe à « payée »
   * et ses billets sont émis (un par siège, numéro 4001–9999, QR signé). Rejouer l'appel (webhook
   * renvoyé) ne crée rien de plus. Si un siège a été repris entre-temps (paiement arrivé après
   * l'expiration), les billets déjà émis sont annulés avec remboursement intégral et l'erreur
   * `SIEGES_PERDUS` (409) dit aux paiements de rembourser.
   */
  confirmerPaiement(
    commandeId: string,
    moyen: string,
  ): Promise<{ commande: Commande; billets: Billet[] }> {
    return this.serie.executer(`commande:${commandeId}`, async () => {
      const c = await this.commandes.trouver(commandeId);
      if (!c) throw inconnu("COMMANDE_INCONNUE", "Commande introuvable");
      if (c.statut === "payee") {
        const billets: Billet[] = [];
        for (const id of c.billetIds) {
          const b = await this.billets.duVoyageur(id, c.voyageurId).catch(() => null);
          if (b) billets.push(b.billet);
        }
        return { commande: c, billets };
      }
      if (c.statut === "annulee") {
        throw conflit("COMMANDE_ANNULEE", "Cette commande a été annulée");
      }
      const dc = await this.departOuvert(c.departId);
      const payee = await this.commandes.transitionner(c.id, ["en_attente_paiement", "expiree"], {
        statut: "payee",
        moyenPaiement: moyen,
      });
      if (!payee) throw conflit("COMMANDE_ANNULEE", "Cette commande n'est plus payable");

      const at = this.sieges.maintenant();
      const passagers = this.passagers.dechiffrerListe(c.passagersChiffre);
      const emis: Billet[] = [];
      try {
        for (const [i, siege] of c.sieges.entries()) {
          emis.push(
            await this.billets.emettreEnLigne({
              commande: payee,
              dc,
              siege,
              passager: passagers[i] ?? { nom: null, telephone: null, pieceQuatreDerniers: null },
              at,
            }),
          );
        }
      } catch (e) {
        for (const b of emis) {
          await this.billets.annuler(b, {
            dc,
            par: "systeme",
            raison: "agence",
            validePar: "systeme",
            motif: "sièges repris avant le paiement",
            remboursementIntegral: true,
          });
        }
        await this.commandes.transitionner(c.id, ["payee"], { statut: "expiree", billetIds: [] });
        this.sieges.publierLiberations(
          c.departId,
          await this.inventaire.leverCommande(c.departId, c.id),
        );
        if (e instanceof Refus && e.code === "SIEGE_PRIS") {
          throw conflit(
            "SIEGES_PERDUS",
            "Les sièges ont été repris avant le paiement : rembourser",
          );
        }
        throw e;
      }
      const finale =
        (await this.commandes.transitionner(c.id, ["payee"], {
          billetIds: emis.map((b) => b.id),
        })) ?? payee;
      this.sieges.publierLiberations(
        c.departId,
        await this.inventaire.leverCommande(c.departId, c.id),
      );
      await this.avis.publier({
        type: "commande.payee",
        commandeId: c.id,
        voyageurId: c.voyageurId,
        billetIds: emis.map((b) => b.id),
      });
      return { commande: finale, billets: emis };
    });
  }
}
