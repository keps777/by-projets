import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import type { SignaturePin } from "../modules/commande";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { normaliserTelephone } from "../socle/comptes/telephone";
import { Horloge } from "../socle/horloge";
import { AnnuairePatrons } from "./annuaire";
import { compagnieDe, erreur, modifier } from "./commun";
import { SMS } from "./contenu";
import type { CompagnieRef, ConventionStockee, InvitationStockee } from "./modele";
import {
  AnnuaireCompagnies,
  CompteursReferences,
  ConventionsRepository,
  InvitationsCompagnies,
  SignaturesPatron,
} from "./ports";
import { autreCompagnie, concerne, defautDesParts, effetDeLaSortie, enVigueur } from "./regles";
import { aammjjDouala, versIsoDouala } from "./temps";
import type { PropositionConvention } from "./validation";

/**
 * Les conventions entre deux compagnies : proposition signée par le PIN du premier patron, signature du second
 * (la convention entre alors en vigueur), sortie avec 30 jours de préavis, invitation d'une nouvelle compagnie.
 * Une compagnie ne voit que les conventions dont elle est partie : pour toute autre, la réponse est « inconnue ».
 */
@Injectable()
export class ConventionsService {
  private readonly logger = new Logger("ConventionsService");

  constructor(
    readonly repo: ConventionsRepository,
    private readonly annuaire: AnnuaireCompagnies,
    private readonly patrons: AnnuairePatrons,
    private readonly signatures: SignaturesPatron,
    private readonly invitations: InvitationsCompagnies,
    private readonly compteurs: CompteursReferences,
    private readonly horloge: Horloge,
    private readonly audit: AuditService,
  ) {}

  maintenant(): string {
    return versIsoDouala(this.horloge.maintenant());
  }

  static introuvable() {
    return erreur(404, "convention_introuvable", "Convention introuvable");
  }

  async compagnie(id: string): Promise<CompagnieRef> {
    const c = await this.annuaire.trouver(id);
    if (!c) throw erreur(404, "compagnie_introuvable", "Compagnie introuvable");
    return c;
  }

  /** La compagnie a-t-elle une convention en vigueur ? (« Autre ville via une autre compagnie » du guichet colis.) */
  async aUneConventionActive(compagnieId: string): Promise<boolean> {
    return (await this.repo.lister(compagnieId)).some(enVigueur);
  }

  /** La convention en vigueur entre deux compagnies, ou `null`. */
  async activeEntre(a: string, b: string): Promise<ConventionStockee | null> {
    return (await this.repo.entre(a, b)).find(enVigueur) ?? null;
  }

  /** Lecture d'une convention signée des deux côtés par une des deux compagnies ; inconnue pour toute autre. */
  async lire(utilisateur: Utilisateur, id: string): Promise<ConventionStockee> {
    const compagnieId = compagnieDe(utilisateur);
    const convention = await this.repo.trouver(id);
    if (!convention || convention.statut === "proposee" || !concerne(convention, compagnieId)) {
      throw ConventionsService.introuvable();
    }
    return convention;
  }

  /** Les conventions signées des deux côtés de la compagnie, de la plus récente à la plus ancienne. */
  async mesConventions(compagnieId: string): Promise<ConventionStockee[]> {
    return (await this.repo.lister(compagnieId)).filter((c) => c.statut !== "proposee");
  }

  /** Les propositions en attente de signature où la compagnie est partie (envoyées ou reçues). */
  async propositions(utilisateur: Utilisateur): Promise<ConventionStockee[]> {
    const compagnieId = compagnieDe(utilisateur);
    return (await this.repo.lister(compagnieId)).filter((c) => c.statut === "proposee");
  }

  /** Le patron propose une convention à une autre compagnie ; sa signature PIN est la première. */
  async proposer(
    utilisateur: Utilisateur,
    saisie: PropositionConvention,
    signature: SignaturePin,
  ): Promise<ConventionStockee> {
    const moi = compagnieDe(utilisateur);
    if (saisie.compagnieId === moi) {
      throw erreur(422, "meme_compagnie", "Une convention lie deux compagnies différentes");
    }
    const [mienne, autre] = [await this.compagnie(moi), await this.compagnie(saisie.compagnieId)];
    const defaut = defautDesParts(saisie.parts, [moi, autre.id]);
    if (defaut) throw erreur(422, "parts_invalides", defaut);
    for (const ligne of saisie.voyageurs.lignes) {
      const attendues = [moi, autre.id];
      const ok =
        attendues.includes(ligne.premiere) &&
        Object.keys(ligne.parts).length === 2 &&
        attendues.every((c) => (ligne.parts[c] ?? 0) > 0);
      if (!ok) {
        throw erreur(
          422,
          "ligne_voyageurs_invalide",
          `Ligne ${ligne.origine} → ${ligne.destination} : la première compagnie et une part pour chacune sont requises`,
        );
      }
    }
    await this.signatures.verifier(utilisateur, signature);

    const maintenant = this.maintenant();
    const convention: ConventionStockee = {
      id: randomUUID(),
      version: 1,
      compagnieA: moi,
      compagnieB: autre.id,
      statut: "proposee",
      renouvellement: saisie.renouvellement,
      parts: saisie.parts,
      voyageurs: saisie.voyageurs,
      proposeeLe: maintenant,
      signatures: [{ compagnieId: moi, personneId: utilisateur.id, signeLe: maintenant }],
      activeLe: null,
      denonciation: null,
    };
    if ((await this.repo.ajouter(convention)) === "paire_deja_ouverte") {
      throw erreur(
        409,
        "convention_existante",
        "Une convention est déjà ouverte avec cette compagnie",
      );
    }
    await this.tracer(utilisateur, "inter_agences.convention_proposee", convention, {
      avec: autre.nom,
    });
    await this.patrons.prevenirPatrons(autre.id, SMS.proposition(mienne.nom));
    return convention;
  }

  /** Le patron de la seconde compagnie signe à son tour avec son PIN : la convention entre en vigueur. */
  async signer(
    utilisateur: Utilisateur,
    id: string,
    signature: SignaturePin,
  ): Promise<ConventionStockee> {
    const moi = compagnieDe(utilisateur);
    const lue = await this.repo.trouver(id);
    if (!lue || !concerne(lue, moi)) throw ConventionsService.introuvable();
    if (lue.statut !== "proposee") {
      throw erreur(409, "deja_signee", "Cette convention est déjà signée");
    }
    if (lue.compagnieB !== moi) {
      throw erreur(403, "attente_de_l_autre", "C'est à l'autre compagnie de signer");
    }
    await this.signatures.verifier(utilisateur, signature);

    const maintenant = this.maintenant();
    const convention = await modifier(
      () => this.repo.trouver(id),
      (c, v) => this.repo.remplacer(c, v),
      (c) => {
        if (c.statut !== "proposee")
          throw erreur(409, "deja_signee", "Cette convention est déjà signée");
        return {
          ...c,
          statut: "active" as const,
          activeLe: maintenant,
          signatures: [
            ...c.signatures,
            { compagnieId: moi, personneId: utilisateur.id, signeLe: maintenant },
          ],
        };
      },
      ConventionsService.introuvable,
    );
    await this.tracer(utilisateur, "inter_agences.convention_signee", convention, {});
    const [mienne, autre] = [
      await this.compagnie(moi),
      await this.compagnie(convention.compagnieA),
    ];
    await this.patrons.prevenirPatrons(autre.id, SMS.signee(mienne.nom));
    return convention;
  }

  /** Un patron quitte la convention : préavis de 30 jours, les colis en route vont au bout. */
  async denoncer(
    utilisateur: Utilisateur,
    id: string,
    signature: SignaturePin,
  ): Promise<ConventionStockee> {
    const moi = compagnieDe(utilisateur);
    const lue = await this.repo.trouver(id);
    if (!lue || !concerne(lue, moi) || lue.statut === "proposee") {
      throw ConventionsService.introuvable();
    }
    if (lue.statut === "resiliee" || lue.denonciation) {
      throw erreur(409, "deja_denoncee", "La sortie de cette convention est déjà demandée");
    }
    await this.signatures.verifier(utilisateur, signature);

    const maintenant = this.maintenant();
    const effetLe = effetDeLaSortie(maintenant);
    const convention = await modifier(
      () => this.repo.trouver(id),
      (c, v) => this.repo.remplacer(c, v),
      (c) => {
        if (c.denonciation) throw erreur(409, "deja_denoncee", "La sortie est déjà demandée");
        return { ...c, denonciation: { par: moi, le: maintenant, effetLe } };
      },
      ConventionsService.introuvable,
    );
    await this.tracer(utilisateur, "inter_agences.convention_denoncee", convention, { effetLe });
    const [mienne, autre] = [
      await this.compagnie(moi),
      await this.compagnie(autreCompagnie(convention, moi)),
    ];
    await this.patrons.prevenirPatrons(autre.id, SMS.sortie(mienne.nom, effetLe.slice(0, 10)));
    return convention;
  }

  /** Tâche de fond : les sorties dont le préavis est écoulé prennent effet. Renvoie le nombre de conventions closes. */
  async appliquerSorties(): Promise<number> {
    const maintenant = this.maintenant();
    let closes = 0;
    for (const c of await this.repo.toutes()) {
      if (c.statut !== "active" || !c.denonciation) continue;
      if (Date.parse(c.denonciation.effetLe) > Date.parse(maintenant)) continue;
      const ok = await this.repo.remplacer({ ...c, statut: "resiliee" }, c.version);
      if (ok) closes += 1;
      else
        this.logger.warn(
          `Convention ${c.id} modifiée pendant la clôture, reprise au prochain tour`,
        );
    }
    return closes;
  }

  /**
   * « Ajouter une compagnie » : un SMS part vers le patron de la compagnie invitée. Redemander la même
   * invitation le même jour renvoie la même référence sans second SMS.
   */
  async inviter(
    utilisateur: Utilisateur,
    saisie: { compagnie: string; patron: string },
  ): Promise<{ reference: string; envoyeeLe: string }> {
    const moi = compagnieDe(utilisateur);
    let telephone: string;
    try {
      telephone = normaliserTelephone(saisie.patron);
    } catch {
      throw erreur(422, "telephone_invalide", "Numéro du patron invalide");
    }
    const mienne = await this.compagnie(moi);
    const maintenant = this.maintenant();
    const jour = aammjjDouala(maintenant);
    const cle = `${moi}:${telephone}:${jour}`;
    const deja = await this.invitations.parCle(cle);
    if (deja) return { reference: deja.reference, envoyeeLe: deja.envoyeeLe };
    const prochain = await this.compteurs.prochain(`INV-${jour}`);
    const candidate: InvitationStockee = {
      reference: `INV-${jour}-${prochain}`,
      cle,
      compagnieId: moi,
      personneId: utilisateur.id,
      nomCompagnie: saisie.compagnie,
      telephone,
      envoyeeLe: maintenant,
    };
    const { invitation, nouvelle } = await this.invitations.ajouterOuExistante(candidate);
    if (nouvelle) {
      await this.patrons.prevenir(telephone, SMS.invitation(mienne.nom, saisie.compagnie));
      await this.audit.enregistrer({
        acteur: { id: utilisateur.id, role: utilisateur.role, compagnieId: moi },
        action: "inter_agences.invitation",
        resultat: "succes",
        cible: { type: "invitation", id: invitation.reference },
        details: { compagnie: saisie.compagnie },
      });
    }
    return { reference: invitation.reference, envoyeeLe: invitation.envoyeeLe };
  }

  private tracer(
    utilisateur: Utilisateur,
    action: string,
    convention: ConventionStockee,
    details: Record<string, unknown>,
  ): Promise<unknown> {
    return this.audit.enregistrer({
      acteur: { id: utilisateur.id, role: utilisateur.role, compagnieId: utilisateur.compagnieId },
      action,
      resultat: "succes",
      cible: { type: "convention", id: convention.id },
      details,
    });
  }
}
