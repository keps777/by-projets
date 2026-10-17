import { Injectable } from "@nestjs/common";
import { Refus, conflit, inconnu, invalide } from "../billetterie/erreurs";
import { jourDouala } from "../billetterie/temps";
import { Verrous } from "../paiements/verrous";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { TelephoneInvalide, normaliserTelephone } from "../socle/comptes/telephone";
import { Horloge } from "../socle/horloge";
import {
  TYPES_PIECES,
  type DossierConducteur,
  type PieceConducteur,
  type StatutDossier,
  type TypePiece,
} from "./modeles";
import { AnnuaireCovoiturage, Dossiers, NotifieurCovoiturage } from "./ports";
import {
  LIBELLES_PIECES,
  TEXTES,
  estVerifie,
  motifPourSms,
  normaliserImmatriculation,
  piecesAFournir,
  statutDossier,
} from "./regles";

export interface DepotPiece {
  fichierId: string;
  numero?: string | undefined;
  expireLe?: string | undefined;
}

export interface DeclarationVehicule {
  marque: string;
  modele: string;
  couleur: string;
  immatriculation: string;
  places: number;
  grandBagage?: boolean | undefined;
}

/** Pièces qui portent un numéro (la voiture, elle, se juge sur photos). */
const AVEC_NUMERO: readonly TypePiece[] = ["identite", "permis", "carte_grise"];

const contextePiece = (conducteurId: string, type: TypePiece): string =>
  `covoiturage.piece:${conducteurId}:${type}`;
const contexteVersement = (conducteurId: string): string => `covoiturage.versement:${conducteurId}`;

/**
 * Vérification des conducteurs : pièce d'identité, permis, carte grise et voiture. Un conducteur dont
 * les quatre pièces ne sont pas toutes validées (et en cours de validité) ne peut pas publier. Les
 * numéros de pièces et le numéro MoMo du conducteur sont chiffrés au repos ; ils ne sont jamais
 * rendus par l'API ni écrits dans le journal.
 */
@Injectable()
export class VerificationService {
  constructor(
    private readonly dossiers: Dossiers,
    private readonly chiffrement: ChiffrementService,
    private readonly annuaire: AnnuaireCovoiturage,
    private readonly notifieur: NotifieurCovoiturage,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
    private readonly verrous: Verrous,
  ) {}

  dossierDe(conducteurId: string): Promise<DossierConducteur | null> {
    return this.dossiers.trouver(conducteurId);
  }

  async estVerifie(conducteurId: string): Promise<boolean> {
    return estVerifie(await this.dossiers.trouver(conducteurId), this.horloge.maintenant());
  }

  /** Lève 403 `CONDUCTEUR_NON_VERIFIE` : un conducteur non vérifié ne publie pas. */
  async exigerVerifie(conducteurId: string): Promise<DossierConducteur> {
    const maintenant = this.horloge.maintenant();
    const d = await this.dossiers.trouver(conducteurId);
    if (d && estVerifie(d, maintenant)) return d;
    throw new Refus(
      403,
      "CONDUCTEUR_NON_VERIFIE",
      "Tu dois d'abord faire vérifier ta pièce d'identité, ton permis, ta carte grise et ta voiture",
      {
        statut: d ? statutDossier(d, maintenant) : "incomplet",
        aFournir: d ? piecesAFournir(d, maintenant) : [...TYPES_PIECES],
      },
    );
  }

  /* ------------------------------------------------------------------ côté conducteur */

  private vide(conducteurId: string): DossierConducteur {
    const maintenant = this.horloge.maintenant();
    return {
      conducteurId,
      vehicule: null,
      pieces: {},
      numeroVersementChiffre: null,
      creeA: maintenant,
      modifieA: maintenant,
    };
  }

  /** Déclare (ou change) le véhicule. Un autre véhicule oblige à redéposer la carte grise et la voiture. */
  async declarerVehicule(conducteurId: string, v: DeclarationVehicule): Promise<DossierConducteur> {
    return this.verrous.executer(`dossier:${conducteurId}`, async () => {
      const dossier = (await this.dossiers.trouver(conducteurId)) ?? this.vide(conducteurId);
      const immatriculation = normaliserImmatriculation(v.immatriculation);
      if (!/^[A-Z0-9 ]{4,20}$/.test(immatriculation)) {
        throw invalide("IMMATRICULATION_INVALIDE", "Numéro d'immatriculation invalide");
      }
      const change =
        dossier.vehicule !== null && dossier.vehicule.immatriculation !== immatriculation;
      const pieces = { ...dossier.pieces };
      if (change) {
        delete pieces.carte_grise;
        delete pieces.voiture;
      }
      const apres: DossierConducteur = {
        ...dossier,
        pieces,
        vehicule: {
          marque: v.marque.trim(),
          modele: v.modele.trim(),
          couleur: v.couleur.trim(),
          immatriculation,
          places: v.places,
          grandBagage: v.grandBagage ?? false,
        },
        modifieA: this.horloge.maintenant(),
      };
      await this.dossiers.enregistrer(apres);
      await this.audit.enregistrer({
        action: "covoiturage.vehicule_declare",
        resultat: "succes",
        cible: { type: "conducteur", id: conducteurId },
        details: { changeDeVehicule: change },
        at: this.horloge.maintenant(),
      });
      return apres;
    });
  }

  /** Dépose (ou redépose) une pièce : elle repasse « à vérifier ». */
  async deposerPiece(
    conducteurId: string,
    type: TypePiece,
    depot: DepotPiece,
  ): Promise<DossierConducteur> {
    const maintenant = this.horloge.maintenant();
    if (AVEC_NUMERO.includes(type) && (depot.numero === undefined || depot.numero.trim() === "")) {
      throw invalide("NUMERO_REQUIS", `Le numéro de la ${LIBELLES_PIECES[type]} est obligatoire`);
    }
    if (type === "permis" && depot.expireLe === undefined) {
      throw invalide("EXPIRATION_REQUISE", "La date de fin de validité du permis est obligatoire");
    }
    if (depot.expireLe !== undefined && depot.expireLe < jourDouala(maintenant)) {
      throw invalide("PIECE_PERIMEE", `La ${LIBELLES_PIECES[type]} est périmée`);
    }
    return this.verrous.executer(`dossier:${conducteurId}`, async () => {
      const dossier = (await this.dossiers.trouver(conducteurId)) ?? this.vide(conducteurId);
      const piece: PieceConducteur = {
        type,
        statut: "a_verifier",
        fichierId: depot.fichierId,
        numeroChiffre:
          AVEC_NUMERO.includes(type) && depot.numero
            ? this.chiffrement.chiffrer(depot.numero.trim(), contextePiece(conducteurId, type))
            : null,
        expireLe: depot.expireLe ?? null,
        deposeeA: maintenant,
        verifieePar: null,
        verifieeA: null,
        motifRefus: null,
      };
      const apres: DossierConducteur = {
        ...dossier,
        pieces: { ...dossier.pieces, [type]: piece },
        modifieA: maintenant,
      };
      await this.dossiers.enregistrer(apres);
      await this.audit.enregistrer({
        action: "covoiturage.piece_deposee",
        resultat: "succes",
        cible: { type: "conducteur", id: conducteurId },
        details: { piece: type },
        at: maintenant,
      });
      return apres;
    });
  }

  /** Numéro MoMo qui reçoit le paiement à l'arrivée (un numéro camerounais). */
  async definirNumeroVersement(conducteurId: string, brut: string): Promise<DossierConducteur> {
    let numero: string;
    try {
      numero = normaliserTelephone(brut);
    } catch (e) {
      if (e instanceof TelephoneInvalide) {
        throw invalide("TELEPHONE_INVALIDE", "Numéro de téléphone invalide");
      }
      throw e;
    }
    if (!numero.startsWith("+237")) {
      throw invalide(
        "TELEPHONE_NON_CAMEROUNAIS",
        "MTN MoMo et Orange Money demandent un numéro camerounais (+237)",
      );
    }
    return this.verrous.executer(`dossier:${conducteurId}`, async () => {
      const dossier = (await this.dossiers.trouver(conducteurId)) ?? this.vide(conducteurId);
      const apres: DossierConducteur = {
        ...dossier,
        numeroVersementChiffre: this.chiffrement.chiffrer(numero, contexteVersement(conducteurId)),
        modifieA: this.horloge.maintenant(),
      };
      await this.dossiers.enregistrer(apres);
      await this.audit.enregistrer({
        action: "covoiturage.numero_versement_defini",
        resultat: "succes",
        cible: { type: "conducteur", id: conducteurId },
        at: this.horloge.maintenant(),
      });
      return apres;
    });
  }

  /** Où envoyer l'argent : le numéro choisi par le conducteur, sinon celui de son compte. */
  async numeroVersement(conducteurId: string): Promise<string | null> {
    const d = await this.dossiers.trouver(conducteurId);
    if (d?.numeroVersementChiffre) {
      return this.chiffrement.dechiffrer(d.numeroVersementChiffre, contexteVersement(conducteurId));
    }
    return (await this.annuaire.identite(conducteurId))?.telephone ?? null;
  }

  /* ------------------------------------------------------------------ côté AfriMove */

  async lister(statut?: StatutDossier, limite = 100): Promise<DossierConducteur[]> {
    const maintenant = this.horloge.maintenant();
    const dossiers = await this.dossiers.tous(500);
    return dossiers
      .filter((d) => statut === undefined || statutDossier(d, maintenant) === statut)
      .slice(0, limite);
  }

  /** Les dossiers qui attendent une décision, les plus anciens d'abord. */
  async aVerifier(limite = 100): Promise<DossierConducteur[]> {
    return this.dossiers.aVerifier(limite);
  }

  /** Valide ou refuse une pièce déposée. Un refus doit dire pourquoi. */
  async decider(
    acteur: Utilisateur,
    conducteurId: string,
    type: TypePiece,
    decision: "validee" | "refusee",
    motif: string | undefined,
  ): Promise<DossierConducteur> {
    if (decision === "refusee" && (motif === undefined || motif.trim() === "")) {
      throw invalide("MOTIF_REQUIS", "Un refus doit dire pourquoi");
    }
    const maintenant = this.horloge.maintenant();
    const { avant, apres } = await this.verrous.executer(`dossier:${conducteurId}`, async () => {
      const dossier = await this.dossiers.trouver(conducteurId);
      const piece = dossier?.pieces[type];
      if (!dossier || !piece) throw inconnu("PIECE_INCONNUE", "Pièce introuvable");
      if (piece.statut !== "a_verifier") {
        throw conflit(
          "PIECE_DEJA_TRAITEE",
          "Cette pièce a déjà été traitée : le conducteur doit la redéposer",
        );
      }
      const decidee: PieceConducteur = {
        ...piece,
        statut: decision,
        verifieePar: acteur.id,
        verifieeA: maintenant,
        motifRefus: decision === "refusee" ? (motif ?? "").trim() : null,
      };
      const nouveau: DossierConducteur = {
        ...dossier,
        pieces: { ...dossier.pieces, [type]: decidee },
        modifieA: maintenant,
      };
      await this.dossiers.enregistrer(nouveau);
      return { avant: dossier, apres: nouveau };
    });
    await this.audit.enregistrer({
      acteur: { id: acteur.id, role: acteur.role, compagnieId: acteur.compagnieId },
      action: "covoiturage.piece_decidee",
      resultat: "succes",
      cible: { type: "conducteur", id: conducteurId },
      details: { piece: type, decision, motif: decision === "refusee" ? motif : undefined },
      at: maintenant,
    });

    if (decision === "refusee") {
      await this.notifieur.notifier({
        personneId: conducteurId,
        texte: TEXTES.sms.pieceRefusee(LIBELLES_PIECES[type], motifPourSms(motif ?? "")),
        cle: `covoiturage:piece-refusee:${conducteurId}:${type}:${maintenant.getTime()}`,
        reference: { type: "conducteur", id: conducteurId },
      });
    } else if (!estVerifie(avant, maintenant) && estVerifie(apres, maintenant)) {
      await this.notifieur.notifier({
        personneId: conducteurId,
        texte: TEXTES.sms.dossierVerifie,
        cle: `covoiturage:dossier-verifie:${conducteurId}:${maintenant.getTime()}`,
        reference: { type: "conducteur", id: conducteurId },
      });
    }
    return apres;
  }
}
