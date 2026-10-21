import { Injectable } from "@nestjs/common";
import type { Prisma } from "../socle/db/generated/client";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { PrismaService } from "../socle/db/prisma.service";
import { NumerosEnLigneEpuises } from "../numerotation/erreurs";
import type { NumerotationService } from "../numerotation/numerotation.service";
import { RegistreNumeros, type StockageNumerotation } from "../numerotation/ports";
import type {
  ColisStocke,
  GareRef,
  PhotoColis,
  ReclamationStockee,
  StatutReclamation,
} from "./modele";
import {
  ColisRepository,
  NumerotationColis,
  PhotosColis,
  ReclamationsRepository,
  type FiltreColis,
  type ResultatAjoutColis,
} from "./ports";
import type { EtatColis, EntreeHistorique, LigneDevis } from "./regles";
import { versIsoDouala } from "./temps";

/**
 * Adaptateurs PostgreSQL (Prisma) des ports du module colis (AM-163). Tables : `colis`, `photo_colis`
 * et `reclamation_colis` (migrations « modules_metier » et « modules_metier_garanties »), plus le
 * registre `numero_vu` de la numérotation pour les numéros des colis de l'app.
 *
 * Ce que la base garantit, sans compter sur le code :
 * - **un colis, un numéro** : clé primaire et index unique sur `numero` ; `ajouter` répond
 *   `id_existe` ou `numero_pris` d'après ce que la base a refusé ;
 * - **les essais de code de retrait sont comptés exactement** : `remplacer` est un
 *   `UPDATE … WHERE id = $1 AND version = $2` d'un seul tenant. Deux écritures qui partent de la même
 *   version ne passent jamais toutes les deux : la perdante relit et recommence (`ColisService.modifier`).
 *   Le CHECK `colis_code_bloque_apres_trois_essais` interdit en plus d'atteindre trois essais faux sans
 *   que le colis soit bloqué ;
 * - **une réclamation n'est décidée qu'une fois** : `remplacer` est un `UPDATE … WHERE statut = $attendu`.
 *
 * Les téléphones sont chiffrés (AES-256-GCM, contexte lié à la colonne) et retrouvables par un index
 * aveugle (HMAC) : la base ne contient jamais un numéro en clair.
 */

const CONTEXTE_EXPEDITEUR = "colis.expediteur";
const CONTEXTE_DESTINATAIRE = "colis.destinataire";
const CONTEXTE_INDEX = "colis.telephone";

type LigneColis = Prisma.ColisGetPayload<{ include: { origine: true; destination: true } }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AVEC_GARES = { origine: true, destination: true } as const;

const date = (iso: string | null): Date | null => (iso === null ? null : new Date(iso));
const iso = (d: Date | null): string | null => (d === null ? null : versIsoDouala(d));

function versGare(g: LigneColis["origine"]): GareRef {
  return { id: g.id, code: g.code, nom: g.nom, ville: g.ville };
}

@Injectable()
export class ColisPrisma extends ColisRepository {
  readonly durable = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chiffrement: ChiffrementService,
  ) {
    super();
  }

  private indexTelephone(telephone: string): string {
    return this.chiffrement.indexAveugle(telephone, CONTEXTE_INDEX);
  }

  private versColis(l: LigneColis): ColisStocke {
    const expediteur = this.chiffrement.dechiffrerJson<{ nom: string; telephone: string }>(
      l.expediteurChiffre,
      CONTEXTE_EXPEDITEUR,
    );
    const destinataire = this.chiffrement.dechiffrerJson<{ nom: string; telephone: string }>(
      l.destinataireChiffre,
      CONTEXTE_DESTINATAIRE,
    );
    return {
      id: l.id,
      version: l.version,
      numero: l.numero,
      sequence: l.sequence,
      jour: l.jour,
      canal: l.canal,
      mode: l.mode,
      compagnieId: l.compagnieId,
      gareOrigine: versGare(l.origine),
      gareDestination: versGare(l.destination),
      departId: l.departId,
      heureDepart: iso(l.heureDepart),
      arriveePrevue: iso(l.arriveePrevue),
      expediteurId: l.expediteurId,
      expediteur: { nom: expediteur.nom, telephone: expediteur.telephone },
      destinataire: {
        nom: destinataire.nom,
        telephone: destinataire.telephone,
        surnom: l.destinataireSurnom,
      },
      contenu: l.contenu,
      poidsKg: l.poidsKg,
      valeurDeclaree: l.valeurDeclaree,
      assure: l.assure,
      valeurAssuree: l.valeurAssuree,
      assurance: { police: l.policeAssurance, enAttente: l.assuranceEnAttente },
      relaisId: l.relaisId,
      adresseLivraison: l.adresseLivraison,
      port: l.port,
      devis: l.devis as unknown as LigneDevis[],
      prixTotal: l.prixTotal,
      complementPoids: l.complementPoids,
      paiement:
        l.paiementReference !== null && l.paiementMoyen !== null && l.paiementEtat !== null
          ? {
              reference: l.paiementReference,
              moyen: l.paiementMoyen,
              etat: l.paiementEtat as "paye" | "en_attente",
              montant: l.paiementMontant ?? l.prixTotal,
              numero: l.paiementNumero,
            }
          : null,
      code: {
        hache: l.codeRetraitHache,
        sel: l.codeRetraitSel,
        chiffre: l.codeRetraitChiffre ?? "",
        essais: l.codeEssais,
        bloque: l.codeBloque,
        envoyeA: iso(l.codeEnvoyeA),
        smsDestinataire: l.codeSms as "envoye" | "au_retour_du_reseau",
      },
      creeA: versIsoDouala(l.creeA),
      disponibleDepuis: iso(l.disponibleDepuis),
      depose:
        l.deposeA !== null
          ? {
              a: versIsoDouala(l.deposeA),
              poidsReleveKg: l.deposePoidsKg ?? 0,
              photoRef: l.deposePhotoRef ?? "",
              par: l.deposePar ?? "",
            }
          : null,
      remise:
        l.remiseA !== null
          ? { a: versIsoDouala(l.remiseA), par: l.remisePar ?? "", photoRef: l.remisePhotoRef }
          : null,
      etat: l.etat as EtatColis,
      historique: l.historique as unknown as EntreeHistorique[],
      evenementIds: [...l.evenementIds],
    };
  }

  /** Les colonnes d'un colis. `version` est posée par l'appelant (1 à l'ajout, +1 à chaque remplacement). */
  private colonnes(c: ColisStocke, version: number) {
    return {
      version,
      compagnieId: c.compagnieId,
      gareOrigineId: c.gareOrigine.id,
      gareDestinationId: c.gareDestination.id,
      departId: c.departId,
      heureDepart: date(c.heureDepart),
      arriveePrevue: date(c.arriveePrevue),
      expediteurId: c.expediteurId,
      expediteurChiffre: this.chiffrement.chiffrerJson(c.expediteur, CONTEXTE_EXPEDITEUR),
      expediteurTelephoneIndex: this.indexTelephone(c.expediteur.telephone),
      destinataireChiffre: this.chiffrement.chiffrerJson(
        { nom: c.destinataire.nom, telephone: c.destinataire.telephone },
        CONTEXTE_DESTINATAIRE,
      ),
      destinataireTelephoneIndex: this.indexTelephone(c.destinataire.telephone),
      destinataireSurnom: c.destinataire.surnom,
      contenu: c.contenu,
      poidsKg: c.poidsKg,
      valeurDeclaree: c.valeurDeclaree,
      assure: c.assure,
      valeurAssuree: c.valeurAssuree,
      policeAssurance: c.assurance.police,
      assuranceEnAttente: c.assurance.enAttente,
      mode: c.mode,
      relaisId: c.relaisId,
      adresseLivraison: c.adresseLivraison,
      port: c.port,
      devis: c.devis as unknown as Prisma.InputJsonValue,
      prixTotal: c.prixTotal,
      complementPoids: c.complementPoids,
      paiementReference: c.paiement?.reference ?? null,
      paiementMoyen: c.paiement?.moyen ?? null,
      paiementEtat: c.paiement?.etat ?? null,
      paiementMontant: c.paiement?.montant ?? null,
      paiementNumero: c.paiement?.numero ?? null,
      codeRetraitHache: c.code.hache,
      codeRetraitSel: c.code.sel,
      codeRetraitChiffre: c.code.chiffre,
      codeEssais: c.code.essais,
      codeBloque: c.code.bloque,
      codeEnvoyeA: date(c.code.envoyeA),
      codeSms: c.code.smsDestinataire,
      disponibleDepuis: date(c.disponibleDepuis),
      deposeA: date(c.depose?.a ?? null),
      deposePoidsKg: c.depose?.poidsReleveKg ?? null,
      deposePhotoRef: c.depose?.photoRef ?? null,
      deposePar: c.depose?.par ?? null,
      remiseA: date(c.remise?.a ?? null),
      remisePar: c.remise?.par ?? null,
      remisePhotoRef: c.remise?.photoRef ?? null,
      etat: c.etat,
      historique: c.historique as unknown as Prisma.InputJsonValue,
      evenementIds: [...c.evenementIds],
    };
  }

  async ajouter(colis: ColisStocke): Promise<ResultatAjoutColis> {
    // INSERT … ON CONFLICT DO NOTHING : la clé primaire et l'index unique sur `numero` départagent
    // deux ajouts simultanés, sans verrou ni « lire puis écrire ».
    const { count } = await this.prisma.colis.createMany({
      data: [
        {
          id: colis.id,
          numero: colis.numero,
          sequence: colis.sequence,
          jour: colis.jour,
          canal: colis.canal,
          creeA: new Date(colis.creeA),
          ...this.colonnes(colis, 1),
        },
      ],
      skipDuplicates: true,
    });
    if (count === 1) return "ajoute";
    const existe = await this.prisma.colis.findUnique({
      where: { id: colis.id },
      select: { id: true },
    });
    return existe ? "id_existe" : "numero_pris";
  }

  async trouver(id: string): Promise<ColisStocke | null> {
    if (!UUID.test(id)) return null;
    const l = await this.prisma.colis.findUnique({ where: { id }, include: AVEC_GARES });
    return l ? this.versColis(l) : null;
  }

  async trouverParNumero(numero: string): Promise<ColisStocke | null> {
    const l = await this.prisma.colis.findUnique({ where: { numero }, include: AVEC_GARES });
    return l ? this.versColis(l) : null;
  }

  async remplacer(colis: ColisStocke, versionAttendue: number): Promise<boolean> {
    if (!UUID.test(colis.id)) return false;
    // Comparaison de la version et écriture dans la même instruction : si quelqu'un est passé
    // entre-temps, aucune ligne ne correspond et on répond `false`.
    const { count } = await this.prisma.colis.updateMany({
      where: { id: colis.id, version: versionAttendue },
      data: this.colonnes(colis, versionAttendue + 1),
    });
    return count === 1;
  }

  async lister(filtre: FiltreColis): Promise<ColisStocke[]> {
    const et: Prisma.ColisWhereInput[] = [];
    if (filtre.disponibleAvant !== undefined) {
      et.push({ disponibleDepuis: { not: null, lte: new Date(filtre.disponibleAvant) } });
    }
    if (filtre.codeNonEnvoye !== undefined) {
      const nonEnvoye: Prisma.ColisWhereInput = {
        paiementEtat: "paye",
        codeSms: { not: "envoye" },
      };
      et.push(filtre.codeNonEnvoye ? nonEnvoye : { NOT: nonEnvoye });
    }
    if (filtre.deposeApres !== undefined) {
      et.push({ deposeA: { not: null, gte: new Date(filtre.deposeApres) } });
    }
    // Une gare qui n'est pas un UUID n'existe pas en base : aucun colis (comme `plusGrandeSequence`).
    if (filtre.gareOrigineId !== undefined && !UUID.test(filtre.gareOrigineId)) return [];
    const lignes = await this.prisma.colis.findMany({
      where: {
        ...(filtre.gareOrigineId !== undefined ? { gareOrigineId: filtre.gareOrigineId } : {}),
        ...(filtre.deposePar !== undefined ? { deposePar: filtre.deposePar } : {}),
        ...(filtre.expediteurId !== undefined ? { expediteurId: filtre.expediteurId } : {}),
        ...(filtre.destinataireTelephone !== undefined
          ? { destinataireTelephoneIndex: this.indexTelephone(filtre.destinataireTelephone) }
          : {}),
        ...(filtre.compagnieId !== undefined ? { compagnieId: filtre.compagnieId } : {}),
        ...(filtre.departId !== undefined ? { departId: filtre.departId } : {}),
        ...(filtre.etats !== undefined ? { etat: { in: [...filtre.etats] } } : {}),
        ...(filtre.assuranceEnAttente !== undefined
          ? { assuranceEnAttente: filtre.assuranceEnAttente }
          : {}),
        ...(et.length > 0 ? { AND: et } : {}),
      },
      include: AVEC_GARES,
      orderBy: [{ creeA: "asc" }, { numero: "asc" }],
    });
    return lignes.map((l) => this.versColis(l));
  }

  async plusGrandeSequence(
    gareId: string,
    jour: string,
    plage: { debut: number; fin: number },
  ): Promise<number | null> {
    if (!UUID.test(gareId)) return null;
    const r = await this.prisma.colis.aggregate({
      _max: { sequence: true },
      where: {
        gareOrigineId: gareId,
        jour,
        sequence: { gte: plage.debut, lte: plage.fin },
      },
    });
    return r._max.sequence;
  }
}

/* ------------------------------------------------------------------ photos */

type LignePhoto = Prisma.PhotoColisGetPayload<object>;

function versPhoto(l: LignePhoto): PhotoColis {
  return {
    ref: l.ref,
    colisId: l.colisId,
    genre: l.genre as PhotoColis["genre"],
    priseA: versIsoDouala(l.priseA),
    expireA: versIsoDouala(l.expireA),
    supprimeeA: iso(l.supprimeeA),
  };
}

@Injectable()
export class PhotosColisPrisma extends PhotosColis {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async enregistrer(photo: PhotoColis): Promise<PhotoColis> {
    // Une seule instruction : la première date de prise de vue et la première liaison à un colis
    // l'emportent (COALESCE), le genre est celui du dernier appel.
    const lignes = await this.prisma.$queryRaw<LignePhoto[]>`
      INSERT INTO photo_colis ("ref", "colisId", "genre", "priseA", "expireA", "supprimeeA")
      VALUES (${photo.ref}, ${photo.colisId}::uuid, ${photo.genre}, ${new Date(photo.priseA)},
              ${new Date(photo.expireA)}, ${date(photo.supprimeeA)})
      ON CONFLICT ("ref") DO UPDATE
        SET "colisId" = COALESCE(photo_colis."colisId", EXCLUDED."colisId"),
            "genre" = EXCLUDED."genre"
      RETURNING *`;
    return versPhoto(lignes[0]!);
  }

  async trouver(ref: string): Promise<PhotoColis | null> {
    const l = await this.prisma.photoColis.findUnique({ where: { ref } });
    return l ? versPhoto(l) : null;
  }

  async parColis(colisId: string): Promise<PhotoColis[]> {
    if (!UUID.test(colisId)) return [];
    const lignes = await this.prisma.photoColis.findMany({
      where: { colisId },
      orderBy: [{ priseA: "asc" }, { ref: "asc" }],
    });
    return lignes.map(versPhoto);
  }

  async expirees(maintenant: string): Promise<PhotoColis[]> {
    const lignes = await this.prisma.photoColis.findMany({
      where: { supprimeeA: null, expireA: { lte: new Date(maintenant) } },
      orderBy: [{ expireA: "asc" }, { ref: "asc" }],
    });
    return lignes.map(versPhoto);
  }

  async marquerSupprimee(ref: string, a: string): Promise<void> {
    await this.prisma.photoColis.updateMany({ where: { ref }, data: { supprimeeA: new Date(a) } });
  }
}

/* ------------------------------------------------------------------ réclamations */

type LigneReclamation = Prisma.ReclamationColisGetPayload<object>;

function versReclamation(l: LigneReclamation): ReclamationStockee {
  return {
    reference: l.reference,
    colisId: l.colisId,
    colisNumero: l.colisNumero,
    compagnieId: l.compagnieId,
    auteurId: l.auteurId,
    motif: l.motif as ReclamationStockee["motif"],
    message: l.message,
    ouverteA: versIsoDouala(l.ouverteA),
    reponseAvant: versIsoDouala(l.reponseAvant),
    statut: l.statut as StatutReclamation,
    decision: l.decision as ReclamationStockee["decision"],
  };
}

@Injectable()
export class ReclamationsColisPrisma extends ReclamationsRepository {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ajouter(reclamation: ReclamationStockee): Promise<boolean> {
    const n = await this.prisma.$executeRaw`
      INSERT INTO reclamation_colis ("reference", "colisId", "colisNumero", "compagnieId", "auteurId",
        "motif", "message", "ouverteA", "reponseAvant", "statut", "decision")
      VALUES (${reclamation.reference}, ${reclamation.colisId}::uuid, ${reclamation.colisNumero},
        ${reclamation.compagnieId}::uuid, ${reclamation.auteurId}::uuid, ${reclamation.motif},
        ${reclamation.message}, ${new Date(reclamation.ouverteA)}, ${new Date(reclamation.reponseAvant)},
        ${reclamation.statut}, ${reclamation.decision === null ? null : JSON.stringify(reclamation.decision)}::jsonb)
      ON CONFLICT ("reference") DO NOTHING`;
    return n === 1;
  }

  async trouver(reference: string): Promise<ReclamationStockee | null> {
    const l = await this.prisma.reclamationColis.findUnique({ where: { reference } });
    return l ? versReclamation(l) : null;
  }

  async remplacer(
    reclamation: ReclamationStockee,
    statutAttendu: StatutReclamation,
  ): Promise<boolean> {
    // Compare-et-échange sur le statut : deux décisions simultanées ne passent pas toutes les deux.
    const n = await this.prisma.$executeRaw`
      UPDATE reclamation_colis
      SET "colisId" = ${reclamation.colisId}::uuid, "colisNumero" = ${reclamation.colisNumero},
          "compagnieId" = ${reclamation.compagnieId}::uuid, "auteurId" = ${reclamation.auteurId}::uuid,
          "motif" = ${reclamation.motif}, "message" = ${reclamation.message},
          "ouverteA" = ${new Date(reclamation.ouverteA)}, "reponseAvant" = ${new Date(reclamation.reponseAvant)},
          "statut" = ${reclamation.statut},
          "decision" = ${reclamation.decision === null ? null : JSON.stringify(reclamation.decision)}::jsonb
      WHERE "reference" = ${reclamation.reference} AND "statut" = ${statutAttendu}`;
    return n === 1;
  }

  async parColis(colisId: string): Promise<ReclamationStockee[]> {
    if (!UUID.test(colisId)) return [];
    const lignes = await this.prisma.reclamationColis.findMany({
      where: { colisId },
      orderBy: [{ ouverteA: "asc" }, { reference: "asc" }],
    });
    return lignes.map(versReclamation);
  }

  async lister(filtre: {
    compagnieId?: string | null;
    statut?: ReclamationStockee["statut"];
  }): Promise<ReclamationStockee[]> {
    const lignes = await this.prisma.reclamationColis.findMany({
      where: {
        ...(filtre.compagnieId !== undefined ? { compagnieId: filtre.compagnieId } : {}),
        ...(filtre.statut !== undefined ? { statut: filtre.statut } : {}),
      },
      orderBy: [{ ouverteA: "asc" }, { reference: "asc" }],
    });
    return lignes.map(versReclamation);
  }
}

/* ------------------------------------------------------------------ numéros des colis de l'app */

/**
 * Numéro des colis de l'app (4001–9999), pris dans le registre `numero_vu` de la numérotation : une
 * seule source de vérité pour « un numéro n'est jamais attribué deux fois » (clé primaire du registre),
 * partagée avec le contrôle de fin de journée. Idempotent par `reference` (l'identifiant du colis).
 */
@Injectable()
export class NumerotationColisServeur extends NumerotationColis {
  constructor(
    private readonly numerotation: Pick<NumerotationService, "prendreEnLigne">,
    private readonly registre: RegistreNumeros,
  ) {
    super();
  }

  get durable(): boolean {
    return (this.registre as Partial<StockageNumerotation>).durable === true;
  }

  async prochainEnLigne(demande: {
    gareId: string;
    compagnieId: string | null;
    at: string;
    reference: string;
  }): Promise<number> {
    try {
      const pris = await this.numerotation.prendreEnLigne({
        gareId: demande.gareId,
        compagnieId: demande.compagnieId,
        genre: "colis",
        at: demande.at,
        reference: demande.reference,
      });
      return pris.numero;
    } catch (e) {
      if (e instanceof NumerosEnLigneEpuises) {
        throw new RangeError("Plage de numéros épuisée (4001–9999)");
      }
      throw e;
    }
  }
}
