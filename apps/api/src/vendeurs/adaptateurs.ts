import { HttpException, Inject, Injectable, Logger } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { BilletsService, entreeHistorique } from "../billetterie/billets.service";
import { exigerAvantLeDepart, exigerVendable } from "../billetterie/controles";
import { Refus } from "../billetterie/erreurs";
import type { Billet, DepartComplet } from "../billetterie/modeles";
import { Passagers } from "../billetterie/passagers";
import { Billets, Catalogue, Inventaire, NumerotationEnLigne } from "../billetterie/ports";
import { genererCodeBilletUnique, numeroBillet } from "../billetterie/regles";
import { SiegesService } from "../billetterie/sieges.service";
import { aammjjDouala, enMs } from "../billetterie/temps";
import { Paiements } from "../paiements/ports";
import { PaiementsService } from "../paiements/paiements.service";
import type { Paiement } from "../paiements/modeles";
import { PasserelleSmsService } from "../sms/passerelle.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { SmsGateway } from "../socle/sms/sms.gateway";
import { normaliser } from "./regles";
import {
  DepartNonVendable,
  MessagesVendeurs,
  OPTIONS_VENDEURS,
  OffreBillets,
  PlusDePlace,
  ReglementsAgence,
  type BilletEmis,
  type DemandeReglement,
  type DemandeSmsBillet,
  type DepartOffert,
  type EtatReglement,
  type OptionsVendeurs,
} from "./ports";

/**
 * Adaptateurs vers le reste de la plateforme : le module des vendeurs ne parle à la billetterie, aux
 * paiements et aux SMS que par leurs services exportés, sans rien y modifier. Ils ne gardent aucun
 * état : ce sont des traducteurs, donc durables.
 */

const alea = (): number => randomBytes(4).readUInt32BE() / 2 ** 32;

/** Les erreurs de la billetterie qui disent « ce départ ne vend plus ». */
const CODES_DEPART_NON_VENDABLE = new Set(["DEPART_FERME", "BUS_NON_AFFECTE", "DEPART_PASSE"]);

/* ------------------------------------------------------------------ billetterie */

@Injectable()
export class OffreBilletsBilletterie extends OffreBillets {
  constructor(
    private readonly catalogue: Catalogue,
    private readonly sieges: SiegesService,
    private readonly inventaire: Inventaire,
    private readonly billets: Billets,
    private readonly billetsService: BilletsService,
    private readonly numerotation: NumerotationEnLigne,
    private readonly passagers: Passagers,
  ) {
    super();
  }

  private async offert(dc: DepartComplet): Promise<DepartOffert> {
    return {
      departId: dc.depart.id,
      compagnieId: dc.compagnie.id,
      compagnieNom: dc.compagnie.nom,
      classe: dc.depart.classe,
      heureDepart: dc.depart.heureDepart,
      prix: dc.ligne.tarifs[dc.depart.classe],
      placesLibres: await this.sieges.placesLibres(dc),
      origine: { code: dc.origine.code, ville: dc.origine.ville },
      destination: { code: dc.destination.code, ville: dc.destination.ville },
    };
  }

  /** « DLA » ou « Douala », sans tenir compte des accents ni de la casse. */
  private static correspond(texte: string | undefined, lieu: { code: string; ville: string }) {
    if (texte === undefined) return true;
    return (
      normaliser(texte) === normaliser(lieu.code) || normaliser(texte) === normaliser(lieu.ville)
    );
  }

  async departs(filtre: Parameters<OffreBillets["departs"]>[0]): Promise<DepartOffert[]> {
    const trouves: DepartComplet[] = [];
    for (const compagnieId of new Set(filtre.compagnieIds)) {
      trouves.push(
        ...(await this.catalogue.departs({
          compagnieId,
          de: filtre.de,
          avant: filtre.avant,
          etats: ["en_vente"],
        })),
      );
    }
    const retenus = trouves
      .filter((dc) => dc.bus !== null)
      .filter((dc) => OffreBilletsBilletterie.correspond(filtre.origine, dc.origine))
      .filter((dc) => OffreBilletsBilletterie.correspond(filtre.destination, dc.destination))
      .sort(
        (a, b) =>
          enMs(a.depart.heureDepart) - enMs(b.depart.heureDepart) ||
          a.compagnie.nom.localeCompare(b.compagnie.nom, "fr"),
      );
    return Promise.all(retenus.map((dc) => this.offert(dc)));
  }

  async depart(departId: string): Promise<DepartOffert | null> {
    const dc = await this.catalogue.depart(departId);
    return dc ? this.offert(dc) : null;
  }

  async compagnie(compagnieId: string) {
    const c = await this.catalogue.compagnie(compagnieId);
    return c ? { id: c.id, nom: c.nom } : null;
  }

  /**
   * Retient le plus petit siège libre. La billetterie retient 15 minutes (`finBlocageSiege`) : le
   * délai de la vente (10 minutes) est plus court, et `liberer` rend le siège dès que la vente
   * s'arrête.
   */
  async retenir(a: { departId: string; par: string; jusqua: string }) {
    const dc = await this.catalogue.depart(a.departId);
    if (!dc) throw new DepartNonVendable();
    try {
      const libres = await this.sieges.libres(dc);
      for (const siege of libres.slice(0, 5)) {
        try {
          await this.sieges.bloquer(dc, siege, a.par);
          return { siege };
        } catch (e) {
          if (e instanceof Refus && e.code === "SIEGE_PRIS") continue;
          throw e;
        }
      }
    } catch (e) {
      if (e instanceof Refus && CODES_DEPART_NON_VENDABLE.has(e.code)) {
        throw new DepartNonVendable();
      }
      throw e;
    }
    throw new PlusDePlace();
  }

  async liberer(a: { departId: string; par: string; siege: number }): Promise<void> {
    const levees = await this.inventaire.leverBlocages(a.departId, a.par);
    this.sieges.publierLiberations(a.departId, levees);
  }

  async emettre(a: Parameters<OffreBillets["emettre"]>[0]): Promise<BilletEmis> {
    const existant = await this.billets.trouver(a.billetId);
    if (existant) {
      return {
        billetId: existant.id,
        numero: existant.numero,
        siege: existant.siege,
        code: existant.codeBillet,
        emisLe: existant.creeA,
      };
    }
    const dc = await this.catalogue.depart(a.departId);
    if (!dc) throw new DepartNonVendable();
    // Payé, mais le départ est annulé, fermé ou déjà parti : pas de billet (la vente passe à rembourser).
    try {
      exigerVendable(dc);
      exigerAvantLeDepart(dc, a.at);
    } catch (e) {
      if (e instanceof Refus && CODES_DEPART_NON_VENDABLE.has(e.code))
        throw new DepartNonVendable();
      throw e;
    }
    let siege = a.siege;
    for (let essai = 0; essai < 6; essai++) {
      if (siege === null) siege = await this.premierSiegeLibre(dc);
      const sequence = await this.numerotation.prochaine({
        compagnieId: dc.compagnie.id,
        gareId: dc.origine.id,
        aammjj: aammjjDouala(a.at),
        reference: a.billetId,
      });
      const pris = new Set(
        (await this.billets.duDepart(dc.depart.id))
          .filter((b) => b.etat !== "annule")
          .map((b) => b.codeBillet),
      );
      const billet: Billet = {
        id: a.billetId,
        numero: numeroBillet({
          agence: dc.compagnie.code,
          gare: dc.origine.code,
          aammjj: aammjjDouala(a.at),
          sequence,
        }),
        sequence,
        compagnieId: dc.compagnie.id,
        gareId: dc.origine.id,
        departId: dc.depart.id,
        siege,
        classe: dc.depart.classe,
        prix: dc.ligne.tarifs[dc.depart.classe],
        bagage: 0,
        canal: "vendeur",
        guichetId: null,
        acheteurId: null,
        commandeId: null,
        passagerChiffre: this.passagers.chiffrer({
          nom: a.voisin.nom,
          telephone: a.voisin.telephone,
          pieceQuatreDerniers: null,
        }),
        passagerTelephoneIndex: this.passagers.indexTelephone(a.voisin.telephone),
        codeBillet: genererCodeBilletUnique(alea, pris),
        qr: "",
        creeA: a.at,
        etat: "paye",
        historique: [entreeHistorique("payer", "reserve", "paye", a.at, a.par)],
        evenementId: null,
        appareilId: null,
        auteurId: a.par,
        paiement: {
          mode: a.moyen === "mtn_momo" ? "momo" : "orange_money",
          reference: a.reference,
        },
        aCompleterAuQuai: false,
        smsEnvoye: false,
        retardPrevenu: false,
        embarqueA: null,
        reporteDe: null,
      };
      try {
        const emis = await this.billetsService.enregistrer(billet, a.par);
        return {
          billetId: emis.id,
          numero: emis.numero,
          siege: emis.siege,
          code: emis.codeBillet,
          emisLe: emis.creeA,
        };
      } catch (e) {
        if (!(e instanceof Refus)) throw e;
        // Le code à 4 chiffres était pris : on en tire un autre (même identifiant, même numéro).
        if (e.code === "CODE_BILLET_PRIS") continue;
        // Le siège retenu a été perdu : un autre siège libre, s'il en reste.
        if (e.code === "SIEGE_PRIS") {
          siege = null;
          continue;
        }
        throw e;
      }
    }
    throw new PlusDePlace();
  }

  private async premierSiegeLibre(dc: DepartComplet): Promise<number> {
    const [premier] = await this.sieges.libres(dc);
    if (premier === undefined) throw new PlusDePlace();
    return premier;
  }
}

/* ------------------------------------------------------------------ paiements */

/** Statuts HTTP qui disent « refusé pour de bon » : une nouvelle tentative ne changerait rien. */
const refusDefinitif = (e: unknown): e is HttpException =>
  e instanceof HttpException &&
  ((e.getStatus() >= 400 && e.getStatus() < 500) || e.getStatus() === 503);

function codeDe(e: HttpException): string {
  const corps = e.getResponse() as { code?: unknown } | string;
  return typeof corps === "object" && typeof corps.code === "string"
    ? corps.code.toLowerCase()
    : "refuse";
}

function etatDuPaiement(p: Paiement): EtatReglement {
  switch (p.statut) {
    case "reussi":
      return { etat: "reussi", reference: p.referenceOperateur };
    case "en_attente":
      return { etat: "en_attente" };
    case "echoue":
      return { etat: "refuse", cause: p.cause ?? "echoue" };
    case "expire":
      return { etat: "refuse", cause: p.cause ?? "expire" };
  }
}

/**
 * Le vendeur paie l'agence par un push MoMo ou Orange Money, comme un guichet (`payerAuGuichet`) :
 * tout le montant va au compte de la compagnie, AfriMove n'en prend rien et le vendeur n'en reçoit
 * rien. L'identifiant de la vente est la clé d'idempotence (un double envoi ne débite qu'une fois).
 */
@Injectable()
export class ReglementsAgencePaiements extends ReglementsAgence {
  constructor(
    private readonly paiements: PaiementsService,
    private readonly stockage: Paiements,
  ) {
    super();
  }

  private acteur(vendeurId: string, compagnieId: string): Utilisateur {
    return { id: vendeurId, role: "vendeur", compagnieId, gareId: null };
  }

  async regler(d: DemandeReglement): Promise<EtatReglement> {
    try {
      const p = await this.paiements.payerAuGuichet(this.acteur(d.vendeurId, d.compagnieId), {
        moyen: d.moyen,
        telephone: d.telephone,
        montant: d.montant,
        cle: d.cle,
      });
      return etatDuPaiement(p);
    } catch (e) {
      // Mode dégradé, compagnie sans compte, montant refusé : un refus net, pas un résultat inconnu.
      if (refusDefinitif(e)) return { etat: "refuse", cause: codeDe(e) };
      throw e;
    }
  }

  async statut(cle: string, compagnieId: string): Promise<EtatReglement> {
    const p = await this.stockage.parCle(`guichet:${compagnieId}:${cle}`);
    if (!p) return { etat: "inconnu" };
    // Interroge l'agrégateur si le webhook tarde.
    const frais = await this.paiements.statutGuichet(this.acteur("vendeurs", compagnieId), p.id);
    return etatDuPaiement(frais);
  }
}

/* ------------------------------------------------------------------ SMS */

/**
 * Le SMS du billet part par la passerelle SMS (gabarit `billet`), avec la même clé d'idempotence que
 * le billet vendu au guichet (`billet:<id>:<numéro>`) : si l'intégration branche aussi `billet.emis`
 * sur les SMS, le voisin ne reçoit pas deux messages. Les autres messages passent par `SmsGateway`.
 * Une panne de SMS est notée, jamais propagée : la vente est faite.
 */
@Injectable()
export class MessagesVendeursSms extends MessagesVendeurs {
  private readonly logger = new Logger("MessagesVendeursSms");

  constructor(
    private readonly passerelle: PasserelleSmsService,
    private readonly sms: SmsGateway,
    @Inject(OPTIONS_VENDEURS) private readonly options: OptionsVendeurs,
  ) {
    super();
  }

  async envoyerBillet(d: DemandeSmsBillet): Promise<boolean> {
    try {
      await this.passerelle.envoyerBillet({
        billetId: d.billetId,
        destinataire: d.destinataire,
        variables: {
          compagnie: d.depart.compagnieNom,
          origine: d.depart.origine.ville,
          destination: d.depart.destination.ville,
          departA: new Date(d.depart.heureDepart),
          siege: d.siege !== null ? String(d.siege) : "-",
          code: d.code,
          lien: `${this.options.baseLienBillet}${d.billetId}`,
        },
        compagnieId: d.depart.compagnieId,
        demandeurId: d.vendeurId,
      });
      return true;
    } catch (e) {
      this.logger.warn(`SMS du billet ${d.numero} non envoyé (${(e as Error).name})`);
      return false;
    }
  }

  async prevenir(telephone: string, message: string): Promise<boolean> {
    try {
      await this.sms.envoyer(telephone, message);
      return true;
    } catch (e) {
      this.logger.warn(`SMS non envoyé (${(e as Error).name})`);
      return false;
    }
  }
}
