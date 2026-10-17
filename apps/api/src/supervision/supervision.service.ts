import { Injectable } from "@nestjs/common";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { PersonnesRepository } from "../socle/comptes/personnes.repository";
import { Horloge } from "../socle/horloge";
import { CaisseService } from "../caisse/caisse.service";
import { conflit, interdit, introuvable, invalide } from "../caisse/erreurs";
import { francs, sequence4 } from "../caisse/format";
import { IdempotenceService } from "../caisse/journal/idempotence.service";
import { JournalSigneService } from "../caisse/journal/journal.service";
import {
  AlertesPatron,
  MouvementsCaisse,
  SessionsCaisse,
  type SessionStockee,
} from "../caisse/ports";
import {
  BLOCAGE_PIN_MINUTES,
  ESSAIS_PIN_MAX,
  ETATS_ANNULABLES,
  ETATS_REPORTABLES,
  LONGUEUR_PIN,
  decisionAnnulation,
  evaluerEcart,
} from "../caisse/regles";
import { aammjjDouala, debutJourDoualaMs, enMs, MS_PAR_JOUR, versIsoDouala } from "../caisse/temps";
import type { EvenementLu, ValidationSuperviseurLue } from "../caisse/validation";
import { gareDe } from "./commun";
import {
  lireDecisionAnnulation,
  lireDemandeAnnulation,
  lireRefusCaisse,
  lireValidationCaisse,
} from "./evenements";
import { ValidationSuperviseurService } from "./validation.service";
import {
  DemandesAnnulation,
  RegistreBillets,
  SourceGare,
  type BilletAnnulable,
  type DecisionAnnulation,
} from "./ports";

const PREFIXE_DEMANDE_CLOTURE = "dem-cloture-";

/** Identifiant de la demande de validation de la clôture d'une session (`idDemandeCloture` du client). */
export const idDemandeCloture = (sessionId: string): string =>
  `${PREFIXE_DEMANDE_CLOTURE}${sessionId}`;

/**
 * Lectures et décisions du superviseur de gare : l'accueil, la clôture à valider, la demande
 * d'annulation. Chaque décision exige la preuve du PIN du superviseur connecté (voir `PreuvesPinService`)
 * et laisse une entrée dans le journal signé.
 */
@Injectable()
export class SupervisionService {
  constructor(
    private readonly sessions: SessionsCaisse,
    private readonly mouvements: MouvementsCaisse,
    private readonly caisse: CaisseService,
    private readonly source: SourceGare,
    private readonly registre: RegistreBillets,
    private readonly demandes: DemandesAnnulation,
    private readonly alertes: AlertesPatron,
    private readonly personnes: PersonnesRepository,
    private readonly validation: ValidationSuperviseurService,
    private readonly journal: JournalSigneService,
    private readonly idem: IdempotenceService,
    private readonly horloge: Horloge,
  ) {}

  /* ------------------------------------------------------------------ l'accueil de la gare */

  async gare(gareIdDemandee: string | undefined, u: Utilisateur) {
    const gareId = gareDe(u, gareIdDemandee);
    const gare = await this.source.gare(gareId);
    if (!gare) throw introuvable("GARE_INCONNUE", "Gare inconnue");
    const maintenant = this.horloge.maintenant();
    const debutJour = versIsoDouala(debutJourDoualaMs(maintenant));
    const sessions = await this.sessions.deGare(gareId, debutJour);

    const guichets = await Promise.all(
      gare.guichets.map(async (g) => {
        const duGuichet = sessions.filter((s) => s.guichetRang === g.rang);
        const session =
          duGuichet.find((s) => s.etat === "ouverte") ??
          duGuichet.find((s) => s.etat === "cloturee") ??
          duGuichet.filter((s) => s.etat === "validee").pop();
        if (!session) {
          return {
            rang: g.rang,
            billets: g.billets,
            ecart: 0,
            etat: "ferme" as const,
            ouvertA: null,
          };
        }
        if (session.etat === "ouverte") {
          // Tant que la caisse n'est pas comptée, il n'y a pas d'écart à montrer.
          const ecart = session.comptage ? (await this.caisse.vue(session)).ecart.montant : 0;
          return {
            rang: g.rang,
            billets: g.billets,
            ecart,
            etat: "ouvert" as const,
            ouvertA: session.ouverteA,
          };
        }
        return {
          rang: g.rang,
          billets: g.billets,
          ecart: session.cloture?.ecart ?? 0,
          etat: session.etat === "cloturee" ? ("a_valider" as const) : ("ferme" as const),
          ouvertA: session.etat === "cloturee" ? session.ouverteA : null,
        };
      }),
    );

    const demandes: { quand: number; demande: Record<string, unknown> }[] = [];
    for (const s of sessions.filter((x) => x.etat === "cloturee" && x.cloture)) {
      const agent = await this.personnes.trouverParId(s.agentId);
      demandes.push({
        quand: enMs(s.cloture!.at),
        demande: {
          genre: "cloture",
          demandeId: idDemandeCloture(s.id),
          sessionId: s.id,
          guichetRang: s.guichetRang,
          agent: { id: s.agentId, nom: agent?.nom || "Inconnu" },
          compte: s.cloture!.cashCompte,
          ecart: s.cloture!.ecart,
        },
      });
    }
    for (const d of await this.demandes.enAttenteDeGare(gareId)) {
      const billet = await this.registre.trouver(d.billetId);
      if (!billet) continue;
      demandes.push({
        quand: enMs(d.demandeA),
        demande: {
          genre: "annulation",
          demandeId: d.demandeId,
          billetId: d.billetId,
          billetSequence: billet.sequence,
          guichetRang: d.guichetRang,
          montant: billet.prix,
          motif: d.motif,
        },
      });
    }
    const superviseur = await this.personnes.trouverParId(u.id);
    return {
      gare: { id: gare.id, nom: gare.nom },
      superviseur: { id: u.id, nom: superviseur?.nom || "Inconnu" },
      at: versIsoDouala(maintenant),
      quais: gare.quais,
      synchro: gare.synchro,
      demandes: demandes.sort((a, b) => a.quand - b.quand).map((d) => d.demande),
      guichets,
      apresMidi: gare.departsApresMidi,
    };
  }

  /* ------------------------------------------------------------------ une clôture à valider */

  async cloture(sessionId: string, u: Utilisateur) {
    const gareId = gareDe(u);
    const s = await this.sessions.trouver(sessionId);
    if (!s || s.gareId !== gareId)
      throw introuvable("SESSION_INCONNUE", "Session de caisse inconnue");
    if (!s.cloture) {
      throw conflit("SESSION_NON_CLOTUREE", "Cette caisse n'est pas encore clôturée", {
        etat: s.etat,
      });
    }
    const c = s.cloture;
    const agent = await this.personnes.trouverParId(s.agentId);
    const superviseur = await this.personnes.trouverParId(u.id);
    const evaluation = evaluerEcart(c.cashAttendu, c.cashCompte, s.tolerance);
    const historique = await this.historiqueAgent(s);
    const jour = aammjjDouala(s.ouverteA);
    return {
      sessionId: s.id,
      numero: s.numero,
      guichetRang: s.guichetRang,
      agent: { id: s.agentId, nom: agent?.nom || "Inconnu" },
      clotureeA: c.at,
      periode: { debut: s.ouverteA, fin: c.at },
      bilan: {
        attendu: c.cashAttendu,
        compte: c.cashCompte,
        ecart: c.ecart,
        statut: evaluation.statut,
      },
      resume: {
        billetsCash: c.decompte.billetsCash.nombre,
        colis: c.decompte.colisCash.nombre,
        annulationsValidees: c.decompte.annulationsValidees.nombre,
      },
      controles: {
        tolerance: { montant: s.tolerance, dansLaLimite: Math.abs(c.ecart) <= s.tolerance },
        historiqueAgent: historique,
        cadenceSansNom: await this.source.cadenceSansNom(s.gareId, jour),
      },
      commentaire: this.commentaireProposé(s),
      pin: {
        superviseur: { id: u.id, nom: superviseur?.nom || "Inconnu" },
        longueur: LONGUEUR_PIN,
        // La lecture d'empreinte (WebAuthn) n'est pas vérifiable côté serveur : voir le README.
        empreinteDisponible: false,
        essaisMax: ESSAIS_PIN_MAX,
        blocageMinutes: BLOCAGE_PIN_MINUTES,
      },
    };
  }

  /** Les écarts de l'agent sur les 10 derniers jours (cette session comprise). */
  private async historiqueAgent(s: SessionStockee) {
    const JOURS = 10;
    const depuis = versIsoDouala(debutJourDoualaMs(s.ouverteA) - (JOURS - 1) * MS_PAR_JOUR);
    const sessions = (await this.sessions.deAgent(s.agentId, depuis)).filter((x) => x.cloture);
    return {
      jours: JOURS,
      ecartsNegatifs: sessions.filter((x) => x.cloture!.ecart < 0).length,
      total: sessions.reduce((t, x) => t + x.cloture!.ecart, 0),
    };
  }

  /** Commentaire proposé au superviseur, visible par le patron : ce qui sort de l'ordinaire. */
  private commentaireProposé(s: SessionStockee): string | null {
    const c = s.cloture!;
    const notes: string[] = [];
    if (c.auto) {
      notes.push(
        c.comptageAbsent
          ? "Clôture automatique de minuit, caisse non comptée."
          : "Clôture automatique de minuit.",
      );
    }
    if (c.divergenceAppareil !== 0) {
      notes.push(
        `Le cash attendu annoncé par l'appareil différait de ${francs(Math.abs(c.divergenceAppareil))} (calcul du serveur retenu).`,
      );
    }
    if (s.refus.length > 0) notes.push(`Recomptée ${s.refus.length} fois après refus.`);
    return notes.length > 0 ? notes.join(" ") : null;
  }

  /* ------------------------------------------------------------------ valider ou refuser une clôture */

  async validerCaisse(corps: unknown, u: Utilisateur) {
    const e = lireValidationCaisse(corps);
    this.verifierAuteur(e, u);
    return this.idem.executer(e.id, async () => {
      const d = e.donnees;
      await this.exigerValidation(corps, d.validePar, u, e.type);
      const s = await this.sessionDeLaGare(d.sessionId, u);
      if (s.agentId === u.id) {
        throw interdit("AUTO_VALIDATION", "Vous ne pouvez pas valider votre propre caisse");
      }
      if (s.etat === "validee" && s.validation?.evenementId === e.id) {
        return this.resultatSession(s);
      }
      if (s.etat !== "cloturee" || !s.cloture) {
        throw conflit("TRANSITION_INTERDITE", "Seule une caisse clôturée peut être validée", {
          etat: s.etat,
        });
      }
      if (d.ecart !== s.cloture.ecart) {
        throw invalide("ECART_DIFFERENT", "L'écart signé ne correspond pas à la clôture", {
          cloture: s.cloture.ecart,
          signe: d.ecart,
        });
      }
      const superviseur = await this.personnes.trouverParId(u.id);
      const validee = await this.sessions.transiter(s.id, "cloturee", {
        etat: "validee",
        validation: {
          at: e.at,
          superviseurId: u.id,
          superviseurNom: superviseur?.nom || "Inconnu",
          ecart: d.ecart,
          commentaire: d.commentaire,
          evenementId: e.id,
        },
      });
      if (!validee) {
        const actuelle = await this.sessions.trouver(s.id);
        if (actuelle?.validation?.evenementId === e.id) return this.resultatSession(actuelle);
        throw conflit("TRANSITION_INTERDITE", "Cette caisse n'est plus à valider");
      }
      await this.journal.ecrire({
        evenement: { ...e, numeroPlage: null },
        auteurId: u.id,
        resume:
          `Validation de la caisse du guichet ${s.guichetRang} · ` +
          (d.ecart === 0 ? "écart nul" : `écart ${francs(d.ecart)} signé`) +
          ` par ${superviseur?.nom || "le superviseur"}`,
        validePar: d.validePar,
        gareId: s.gareId,
        compagnieId: s.compagnieId,
      });
      if (Math.abs(d.ecart) > s.tolerance) {
        await this.alertes.alerter({
          type: "ecart_hors_tolerance",
          compagnieId: s.compagnieId,
          gareId: s.gareId,
          message: `Caisse du guichet ${s.guichetRang} validée avec un écart de ${francs(d.ecart)} (tolérance ${francs(s.tolerance)}).`,
          details: { sessionId: s.id, agentId: s.agentId, ecart: d.ecart, tolerance: s.tolerance },
        });
      }
      return this.resultatSession(validee);
    });
  }

  async refuserCaisse(corps: unknown, u: Utilisateur) {
    const e = lireRefusCaisse(corps);
    this.verifierAuteur(e, u);
    return this.idem.executer(e.id, async () => {
      const d = e.donnees;
      await this.exigerValidation(corps, d.validePar, u, e.type);
      const s = await this.sessionDeLaGare(d.sessionId, u);
      if (s.refus.some((r) => r.evenementId === e.id)) return this.resultatSession(s);
      if (s.etat !== "cloturee" || !s.cloture) {
        throw conflit("TRANSITION_INTERDITE", "Seule une caisse clôturée peut être refusée", {
          etat: s.etat,
        });
      }
      const rouverte = await this.sessions.transiter(s.id, "cloturee", {
        etat: "ouverte",
        reouverteA: e.at,
        cloture: null,
        refus: [
          ...s.refus,
          {
            at: e.at,
            superviseurId: u.id,
            motif: d.motif,
            ecart: s.cloture.ecart,
            evenementId: e.id,
          },
        ],
      });
      if (!rouverte) {
        const actuelle = await this.sessions.trouver(s.id);
        if (actuelle?.refus.some((r) => r.evenementId === e.id)) {
          return this.resultatSession(actuelle);
        }
        throw conflit("TRANSITION_INTERDITE", "Cette caisse n'est plus à valider");
      }
      await this.journal.ecrire({
        evenement: { ...e, numeroPlage: null },
        auteurId: u.id,
        resume:
          `Recomptage demandé pour la caisse du guichet ${s.guichetRang} (écart ${francs(s.cloture.ecart)})` +
          (d.motif ? ` · « ${d.motif} »` : ""),
        validePar: d.validePar,
        gareId: s.gareId,
        compagnieId: s.compagnieId,
      });
      return this.resultatSession(rouverte);
    });
  }

  private async resultatSession(s: SessionStockee) {
    const vue = await this.caisse.vue(s);
    return { session: { sessionId: s.id, etat: s.etat, ecart: vue.ecart.montant } };
  }

  /* ------------------------------------------------------------------ annulations */

  /** Un guichetier demande l'annulation d'un billet ; il ne peut pas annuler seul. */
  async demanderAnnulation(corps: unknown, u: Utilisateur) {
    const e = lireDemandeAnnulation(corps);
    this.verifierAuteur(e, u);
    return this.idem.executer(e.id, async () => {
      const d = e.donnees;
      const billet = await this.registre.trouver(d.billetId);
      if (!billet || billet.gareId !== u.gareId) {
        throw introuvable("BILLET_INCONNU", "Billet inconnu");
      }
      if (!ETATS_ANNULABLES.includes(billet.etat) && !ETATS_REPORTABLES.includes(billet.etat)) {
        throw conflit("BILLET_NON_ANNULABLE", "Ce billet ne peut plus être annulé", {
          etat: billet.etat,
        });
      }
      const guichetRang = billet.vendu.guichetRang;
      const resultat = await this.demandes.creer({
        demandeId: d.demandeId,
        billetId: billet.billetId,
        gareId: billet.gareId,
        compagnieId: billet.compagnieId,
        demandeurId: u.id,
        guichetRang,
        motif: d.motif,
        demandeA: e.at,
        statut: "en_attente",
        decision: null,
        montant: null,
        decideeA: null,
        decideeParId: null,
        evenementDemandeId: e.id,
        evenementDecisionId: null,
      });
      if (resultat === "deja_en_attente") {
        const existante = await this.demandes.enAttenteDuBillet(billet.billetId);
        throw conflit(
          "DEMANDE_EXISTANTE",
          "Une demande d'annulation attend déjà le PIN d'un superviseur",
          {
            demandeId: existante?.demandeId,
          },
        );
      }
      if (resultat === "identifiant_pris") {
        const existante = await this.demandes.trouver(d.demandeId);
        if (existante?.evenementDemandeId !== e.id) {
          throw conflit("DEMANDE_EXISTANTE", "Cet identifiant de demande existe déjà");
        }
      }
      await this.journal.ecrire({
        evenement: { ...e, numeroPlage: null },
        auteurId: u.id,
        resume: `Demande d'annulation du billet ${sequence4(billet.sequence)} · « ${d.motif} »`,
        gareId: billet.gareId,
        compagnieId: billet.compagnieId,
      });
      return { demandeId: d.demandeId, statut: "en_attente_du_pin" as const };
    });
  }

  /** La demande d'annulation, avec tout ce que l'app a vérifié avant de demander le PIN. */
  async annulation(demandeId: string, u: Utilisateur) {
    const gareId = gareDe(u);
    const demande = await this.demandes.trouver(demandeId);
    if (!demande || demande.gareId !== gareId) {
      throw introuvable("DEMANDE_INCONNUE", "Demande inconnue");
    }
    const billet = await this.registre.trouver(demande.billetId);
    if (!billet) throw introuvable("BILLET_INCONNU", "Billet inconnu");
    const maintenant = versIsoDouala(this.horloge.maintenant());
    const demandeur = await this.personnes.trouverParId(demande.demandeurId);
    const regle = decisionAnnulation({
      etat: billet.etat,
      prix: billet.prix,
      classe: billet.classe,
      heureDepart: billet.depart.heureDepart,
      maintenant,
    });
    const stats = await this.source.annulationsAgent(demande.demandeurId, gareId, maintenant);
    const annulable = ETATS_ANNULABLES.includes(billet.etat);
    const reportable = ETATS_REPORTABLES.includes(billet.etat);
    const decisionsPossibles: DecisionAnnulation[] = [
      ...(annulable ? (["rembourser"] as const) : []),
      ...(reportable ? (["reporter"] as const) : []),
      ...(annulable ? (["avoir"] as const) : []),
      "refuser",
    ];
    return {
      demandeId: demande.demandeId,
      demandeA: demande.demandeA,
      guichetRang: demande.guichetRang,
      demandeur: { id: demande.demandeurId, nom: demandeur?.nom || "Inconnu" },
      billet: {
        billetId: billet.billetId,
        numero: billet.numero,
        sequence: billet.sequence,
        prix: billet.prix,
        etat: billet.etat,
        depart: {
          departId: billet.depart.departId,
          heureDepart: billet.depart.heureDepart,
          destination: billet.depart.destination,
          siege: billet.depart.siege,
        },
        voyageur: billet.voyageur,
        vendu: {
          at: billet.vendu.at,
          guichetRang: billet.vendu.guichetRang,
          mode: billet.vendu.mode,
          agent: { id: billet.vendu.agentId, nom: billet.vendu.agentNom },
        },
        motif: demande.motif,
      },
      verifications: {
        scanne: billet.scanne,
        siegeLiberable: annulable && !billet.scanne,
        remboursementIntegral: regle.autorise && regle.retenue === 0,
        retenue: regle.retenue,
        annulationsAgentAujourdhui: stats.aujourdhui,
        annulationsAgent10Jours: stats.dixJours,
        moyenneGuichets: stats.moyenneGuichets,
        // Ces deux vérifications se font au guichet et ne remontent pas dans la demande : voir README.
        clientPresent: false,
        pieceVue: false,
        aRendreCash: billet.vendu.mode === "cash" ? regle.remboursement : 0,
      },
      decisionsPossibles,
      decisionProposee: regle.autorise && !billet.scanne && annulable ? "rembourser" : "refuser",
    };
  }

  /**
   * Le superviseur décide : rembourser, reporter à demain, avoir, ou refuser. Aucune annulation sans
   * la preuve de son PIN. Le billet annulé garde son numéro et son siège est libéré tout de suite ;
   * un remboursement en cash sort de la caisse de l'agent (annulation validée).
   */
  async deciderAnnulation(corps: unknown, u: Utilisateur) {
    const e = lireDecisionAnnulation(corps);
    this.verifierAuteur(e, u);
    return this.idem.executer(e.id, async () => {
      const d = e.donnees;
      await this.exigerValidation(corps, d.validePar, u, e.type);
      const gareId = gareDe(u);
      const demande = await this.demandes.trouver(d.demandeId);
      if (!demande || demande.gareId !== gareId) {
        throw introuvable("DEMANDE_INCONNUE", "Demande inconnue");
      }
      if (demande.billetId !== d.billetId) {
        throw invalide("BILLET_DIFFERENT", "Le billet ne correspond pas à la demande");
      }
      const billet = await this.registre.trouver(d.billetId);
      if (!billet) throw introuvable("BILLET_INCONNU", "Billet inconnu");

      if (demande.statut === "decidee") {
        if (demande.evenementDecisionId === e.id)
          return this.resultatAnnulation(demande.decision!, demande.montant!, billet, false);
        throw conflit("DEJA_DECIDEE", "Cette demande a déjà reçu une décision");
      }
      const avecArgent = d.decision === "rembourser" || d.decision === "avoir";
      if (avecArgent && d.montant > billet.prix) {
        throw invalide("MONTANT_TROP_ELEVE", "Le montant dépasse le prix du billet", {
          prix: billet.prix,
          montant: d.montant,
        });
      }
      if (!avecArgent && d.montant !== 0) {
        throw invalide(
          "MONTANT_NON_NUL",
          "Un report ou un refus ne rembourse rien : montant 0 attendu",
        );
      }

      // On réserve la demande d'abord (compare-et-échange) : deux décisions simultanées ne passent pas
      // toutes les deux. Si le billet refuse ensuite la transition, on rouvre la demande.
      const reservee = await this.demandes.decider(demande.demandeId, {
        decision: d.decision,
        montant: d.montant,
        decideeA: e.at,
        decideeParId: u.id,
        evenementDecisionId: e.id,
      });
      if (!reservee) throw conflit("DEJA_DECIDEE", "Cette demande a déjà reçu une décision");

      let etat = billet.etat;
      let siegeLibere = false;
      if (d.decision !== "refuser") {
        const action = d.decision === "reporter" ? "reporter" : "annuler";
        const applique = await this.registre.appliquer(billet.billetId, action, {
          at: e.at,
          parId: u.id,
          motif: demande.motif,
        });
        if (!applique) {
          await this.demandes.rouvrir(demande.demandeId);
          throw conflit(
            "TRANSITION_INTERDITE",
            action === "annuler"
              ? "Ce billet ne peut plus être annulé (déjà embarqué, voyagé ou annulé)"
              : "Ce billet ne peut pas être reporté",
            { etat: billet.etat },
          );
        }
        etat = applique.etat;
        siegeLibere = applique.siegeLibere;
      }

      if (d.decision === "rembourser" && billet.vendu.mode === "cash" && d.montant > 0) {
        await this.rattacherALaCaisse(demande.demandeurId, demande.demandeId, d.montant, e.at);
      }
      const superviseur = await this.personnes.trouverParId(u.id);
      const num = sequence4(billet.sequence);
      const qui = superviseur?.nom || "le superviseur";
      const resume = {
        rembourser: `Annulation du billet ${num} · remboursement ${francs(d.montant)} · validée par ${qui}`,
        avoir: `Annulation du billet ${num} · avoir ${francs(d.montant)} · validée par ${qui}`,
        reporter: `Report du billet ${num} à demain · validé par ${qui}`,
        refuser: `Demande d'annulation du billet ${num} refusée par ${qui}`,
      }[d.decision];
      await this.journal.ecrire({
        evenement: { ...e, numeroPlage: null },
        auteurId: u.id,
        resume,
        validePar: d.validePar,
        gareId: demande.gareId,
        compagnieId: demande.compagnieId,
      });
      return this.resultatAnnulation(d.decision, d.montant, { ...billet, etat }, siegeLibere);
    });
  }

  private resultatAnnulation(
    decision: DecisionAnnulation,
    montant: number,
    billet: BilletAnnulable,
    siegeLibere: boolean,
  ) {
    return {
      billet: { billetId: billet.billetId, numero: billet.numero, etat: billet.etat },
      decision,
      montant,
      siegeLibere,
    };
  }

  /**
   * Un remboursement en cash est payé par le guichetier qui a fait la demande : il sort de sa caisse
   * ouverte (ou, à défaut, de sa dernière caisse encore à valider).
   */
  private async rattacherALaCaisse(
    agentId: string,
    demandeId: string,
    montant: number,
    at: string,
  ) {
    const ouverte = await this.sessions.ouverteDeAgent(agentId);
    const cible =
      ouverte ?? (await this.sessions.deAgent(agentId)).find((s) => s.etat === "cloturee") ?? null;
    if (!cible) return;
    await this.mouvements.enregistrerAnnulation({ demandeId, sessionId: cible.id, montant, at });
  }

  /* ------------------------------------------------------------------ gardes */

  private verifierAuteur(e: EvenementLu<unknown>, u: Utilisateur): void {
    this.validation.verifierAuteur(e, u);
  }

  private exigerValidation(
    corps: unknown,
    validePar: ValidationSuperviseurLue,
    u: Utilisateur,
    type: string,
  ): Promise<void> {
    return this.validation.exiger(corps, validePar, u, type);
  }

  private async sessionDeLaGare(sessionId: string, u: Utilisateur): Promise<SessionStockee> {
    const gareId = gareDe(u);
    const s = await this.sessions.trouver(sessionId);
    if (!s || s.gareId !== gareId)
      throw introuvable("SESSION_INCONNUE", "Session de caisse inconnue");
    return s;
  }
}
