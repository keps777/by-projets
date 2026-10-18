import { HttpException, Injectable, Logger } from "@nestjs/common";
import type { patron as c } from "@afrimove/contrats";
import { AssistantService } from "../assistant/assistant.service";
import { CaisseService, type CaisseSessionVue } from "../caisse/caisse.service";
import { introuvable, requeteInvalide } from "../caisse/erreurs";
import { francs, initiales, nomAbrege } from "../caisse/format";
import { SessionsCaisse, type SessionStockee } from "../caisse/ports";
import { ESSAIS_PIN_MAX, BLOCAGE_PIN_MINUTES, TOLERANCE_ECART_DEFAUT } from "../caisse/regles";
import { debutJourDoualaMs } from "../caisse/temps";
import { erreurApi } from "../modules/commande";
import { HEURE_RAPPORT } from "../rapport/regles";
import { pluriel } from "../rapport/regles";
import {
  heureDouala,
  jourDouala,
  MS_PAR_JOUR,
  MS_PAR_MINUTE,
  versIsoDouala,
} from "../rapport/temps";
import { DemandesAnnulation, SourceGare } from "../supervision/ports";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { ComptesService } from "../socle/comptes/comptes.service";
import { PersonnesRepository } from "../socle/comptes/personnes.repository";
import { Horloge } from "../socle/horloge";
import {
  PERIODE_FICHE_JOURS,
  etatDe,
  enActivite,
  indicateurDe,
  lectureEcarts,
  lieuDe,
  masquerNumero,
  montantCourt,
  partPct,
  prioriteDeSuivi,
  sansAccents,
  ventesParHeure,
  ecartsParJour,
  type EcartDeSession,
} from "./calculs";
import { FaitsDuJourService, ventesDatees, type FaitsDuJour } from "./jour.service";
import {
  ROLES_EQUIPE,
  estRoleEquipe,
  type CompagniePatron,
  type GarePatron,
  type MembrePatron,
  type RoleEquipe,
} from "./modele";
import {
  AlertesEcrites,
  EquipePatron,
  ExploitationPatron,
  ReferentielPatron,
  ReglesPatron,
} from "./ports";

const JOURS_ECARTS = 10;
const HEURES_ALERTES = 48;
const MINUTES_CORRESPONDANCE = 60;
const SEMAINES_PREVISION = 4;
const PERSONNES_A_SUIVRE = 10;

/** Un guichet de la caisse du jour : la session et sa vue (cash attendu, écart). */
interface CaisseDeGare {
  session: SessionStockee;
  vue: CaisseSessionVue;
}

/** L'équipe avec ce qu'il faut pour la résumer : états, écarts des dix derniers jours. */
interface VueEquipe {
  membres: MembrePatron[];
  etats: Map<string, c.EtatPersonne>;
  ecarts: Map<string, EcartDeSession[]>;
  /** Caisses clôturées et pas encore validées, par gare. */
  aValider: Map<string, number>;
}

/**
 * Les lectures de l'espace patron : tableau du jour, alertes, gares, équipe, fiche d'une personne, salle de
 * contrôle. Rien n'y est écrit : tout vient des ports des autres modules (rapport du soir, caisse,
 * supervision, assistant) et des ports du module (`ports.ts`).
 *
 * Une compagnie ne lit que ses données : l'identifiant de la compagnie vient du jeton, jamais de la requête.
 */
@Injectable()
export class LecturesPatronService {
  private readonly journal = new Logger("Patron");

  constructor(
    private readonly referentiel: ReferentielPatron,
    private readonly exploitation: ExploitationPatron,
    private readonly alertesEcrites: AlertesEcrites,
    private readonly equipe: EquipePatron,
    private readonly regles: ReglesPatron,
    private readonly jour: FaitsDuJourService,
    private readonly sessions: SessionsCaisse,
    private readonly caisse: CaisseService,
    private readonly source: SourceGare,
    private readonly demandes: DemandesAnnulation,
    private readonly assistant: AssistantService,
    private readonly comptes: ComptesService,
    private readonly personnes: PersonnesRepository,
    private readonly horloge: Horloge,
  ) {}

  /* ------------------------------------------------------------------ outils */

  private compagnieDe(u: Utilisateur): string {
    if (u.compagnieId === null) {
      throw erreurApi(403, "HORS_PERIMETRE", "Ce compte n'est rattaché à aucune compagnie");
    }
    return u.compagnieId;
  }

  /** Une source qui tombe en panne donne un 503 net, jamais des chiffres inventés ni une erreur 500 muette. */
  private async proteger<T>(lire: () => Promise<T>): Promise<T> {
    try {
      return await lire();
    } catch (e) {
      if (e instanceof HttpException) throw e;
      this.journal.error(`Source indisponible : ${e instanceof Error ? e.message : "erreur"}`);
      throw erreurApi(503, "SOURCE_INDISPONIBLE", "Une source de données ne répond pas");
    }
  }

  private async compagnie(u: Utilisateur): Promise<CompagniePatron> {
    const compagnie = await this.referentiel.compagnie(this.compagnieDe(u));
    if (!compagnie) throw erreurApi(403, "HORS_PERIMETRE", "Compagnie inconnue");
    return compagnie;
  }

  private async tolerance(compagnieId: string): Promise<number> {
    return (await this.regles.lire(compagnieId))?.caisse.toleranceEcart ?? TOLERANCE_ECART_DEFAUT;
  }

  /** L'équipe avec les états et les écarts de caisse des dix derniers jours (une lecture par guichetier). */
  private async vueEquipe(
    compagnieId: string,
    gares: readonly GarePatron[],
    maintenant: Date,
  ): Promise<VueEquipe> {
    const membres = await this.equipe.lister(compagnieId, maintenant);
    const depuis = versIsoDouala(debutJourDoualaMs(maintenant) - (JOURS_ECARTS - 1) * MS_PAR_JOUR);
    const ecarts = new Map<string, EcartDeSession[]>();
    await Promise.all(
      membres
        .filter((m) => m.role === "guichetier")
        .map(async (m) => {
          const sessions = await this.sessions.deAgent(m.id, depuis);
          ecarts.set(
            m.id,
            sessions
              .filter((s) => s.cloture !== null)
              .map((s) => ({ at: s.cloture!.at, ecart: s.cloture!.ecart })),
          );
        }),
    );
    const aValider = new Map<string, number>();
    await Promise.all(
      gares.map(async (g) => {
        const sessions = await this.sessions.deGare(g.id, depuis);
        aValider.set(g.id, sessions.filter((s) => s.etat === "cloturee").length);
      }),
    );
    return {
      membres,
      etats: new Map(membres.map((m) => [m.id, etatDe(m, maintenant)])),
      ecarts,
      aValider,
    };
  }

  private nbEcarts(vue: VueEquipe, m: MembrePatron): number {
    return (vue.ecarts.get(m.id) ?? []).filter((e) => e.ecart !== 0).length;
  }

  private resume(vue: VueEquipe, m: MembrePatron): c.PersonneResume {
    const etat = vue.etats.get(m.id) ?? "repos";
    return {
      id: m.id,
      nom: nomAbrege(m.nom),
      initiales: initiales(m.nom),
      role: m.role,
      lieu: lieuDe(m),
      indicateur: indicateurDe(m, etat, {
        ecarts10: this.nbEcarts(vue, m),
        validationsEnAttente: m.gareId === null ? 0 : (vue.aValider.get(m.gareId) ?? 0),
      }),
      etat,
    };
  }

  /** Les caisses ouvertes aujourd'hui dans la gare, avec leur cash attendu et leur écart. */
  private async caissesDeLaGare(gareId: string, jour: string): Promise<CaisseDeGare[]> {
    const debut = versIsoDouala(debutJourDoualaMs(`${jour}T12:00:00.000+01:00`));
    const sessions = (await this.sessions.deGare(gareId, debut)).filter(
      (s) => jourDouala(s.ouverteA) === jour,
    );
    return Promise.all(
      sessions.map(async (session) => ({ session, vue: await this.caisse.vue(session) })),
    );
  }

  private static ecartDe(c: CaisseDeGare): number {
    return c.session.cloture?.ecart ?? 0;
  }

  private static horsLigne(g: GarePatron): boolean {
    return g.appareils.total > 0 && g.appareils.synchronises === 0;
  }

  private static minutesHorsLigne(g: GarePatron, maintenant: Date): number | null {
    if (!LecturesPatronService.horsLigne(g) || g.appareils.derniereSyncA === null) return null;
    return Math.max(
      1,
      Math.floor((maintenant.getTime() - g.appareils.derniereSyncA.getTime()) / MS_PAR_MINUTE),
    );
  }

  /* ------------------------------------------------------------------ tableau du jour */

  /** `GET /patron/aujourdhui` : les chiffres du jour en direct, l'assistant, le nombre d'alertes. */
  async tableau(u: Utilisateur): Promise<c.TableauDuJour> {
    return this.proteger(async () => {
      const compagnie = await this.compagnie(u);
      const maintenant = this.horloge.maintenant();
      const jour = jourDouala(maintenant);
      const [gares, nbBus, faits, membres, alertes, patron, assistant] = await Promise.all([
        this.referentiel.gares(compagnie.id, maintenant),
        this.referentiel.nbBus(compagnie.id),
        this.jour.lire(compagnie, jour, maintenant),
        this.equipe.lister(compagnie.id, maintenant),
        this.construireAlertes(compagnie.id, maintenant),
        this.personnes.trouverParId(u.id),
        this.apercuAssistant(compagnie.id),
      ]);
      return {
        compagnie: compagnie.nom,
        patron: patron?.nom ?? "",
        nbGares: gares.length,
        nbBus,
        nbPersonnes: membres.length,
        instant: versIsoDouala(maintenant),
        jour: this.chiffresDuJour(faits),
        assistant,
        nbAlertes: alertes.length,
      };
    });
  }

  private chiffresDuJour(faits: FaitsDuJour): c.ChiffresDuJour {
    return {
      recette: faits.recette,
      variationPct: faits.variationPct,
      comparaison: faits.comparaison,
      billets: faits.billets.length,
      colis: faits.colis.length,
      remplissagePct: faits.remplissage.moyenPct,
      ecartTotal: faits.caisses.reduce((somme, k) => somme + (k.ecart ?? 0), 0),
    };
  }

  /** Ce que l'assistant a à dire : un aperçu, jamais une raison de ne pas afficher le tableau. */
  private async apercuAssistant(compagnieId: string): Promise<c.TableauDuJour["assistant"]> {
    try {
      const insights = await this.assistant.insights(compagnieId);
      const constats = [
        ...insights.fuites.map((f) => f.constat),
        ...insights.gains.map((g) => g.constat),
      ];
      return { nbInsights: constats.length, apercus: constats.slice(0, 2) };
    } catch (e) {
      this.journal.warn(
        `Assistant indisponible pour le tableau : ${e instanceof Error ? e.message : "erreur"}`,
      );
      return { nbInsights: 0, apercus: [] };
    }
  }

  /* ------------------------------------------------------------------ alertes */

  /** `GET /patron/alertes` : les alertes des dernières 48 heures et celles qui restent ouvertes, la plus récente d'abord. */
  async alertes(u: Utilisateur): Promise<c.ListeAlertes> {
    return this.proteger(async () => {
      const compagnieId = this.compagnieDe(u);
      return { alertes: await this.construireAlertes(compagnieId, this.horloge.maintenant()) };
    });
  }

  private async construireAlertes(compagnieId: string, maintenant: Date): Promise<c.Alerte[]> {
    const depuis = new Date(maintenant.getTime() - HEURES_ALERTES * 3_600_000);
    const [ecrites, arrets, pannes, correspondance, dossiers, membres] = await Promise.all([
      this.alertesEcrites.depuis(compagnieId, depuis),
      this.exploitation.arretsOuverts(compagnieId),
      this.exploitation.pannesDepuis(compagnieId, depuis),
      this.exploitation.colisEnCorrespondance(compagnieId),
      this.exploitation.dossiersFinancementEnAttente(compagnieId),
      this.equipe.lister(compagnieId, maintenant),
    ]);

    const alertes: c.Alerte[] = [];
    const personnesDejaAlertees = new Set<string>();
    for (const a of ecrites) {
      const categorie: c.CategorieAlerte =
        a.type === "ecart_hors_tolerance"
          ? "ecart_caisse"
          : a.type === "pin_bloque"
            ? "pin_bloque"
            : "autre";
      const cible =
        typeof a.details["sessionId"] === "string"
          ? a.details["sessionId"]
          : typeof a.details["personneId"] === "string"
            ? a.details["personneId"]
            : null;
      if (a.type === "pin_bloque" && cible !== null) personnesDejaAlertees.add(cible);
      alertes.push({
        id: `alerte-${a.id}`,
        categorie,
        texte: a.message,
        quand: versIsoDouala(a.creeA),
        cibleId: cible,
      });
    }
    // Un compte bloqué après trois PIN faux (connexion au guichet) n'écrit pas d'alerte : on la déduit du compte.
    for (const m of membres) {
      if (m.bloqueJusqua === null || m.bloqueJusqua.getTime() <= maintenant.getTime()) continue;
      if (personnesDejaAlertees.has(m.id)) continue;
      const bloqueA = new Date(m.bloqueJusqua.getTime() - BLOCAGE_PIN_MINUTES * MS_PAR_MINUTE);
      alertes.push({
        id: `pin-bloque-${m.id}`,
        categorie: "pin_bloque",
        texte: `${lieuDe(m) === "" ? "" : `${lieuDe(m)} · `}${nomAbrege(m.nom)} bloqué après ${ESSAIS_PIN_MAX} PIN faux`,
        quand: versIsoDouala(bloqueA),
        cibleId: m.id,
      });
    }
    for (const a of arrets) {
      const minutes = Math.max(
        0,
        Math.floor((maintenant.getTime() - a.arretDepuis.getTime()) / MS_PAR_MINUTE),
      );
      alertes.push({
        id: `arret-${a.id}`,
        categorie: a.soupcon === "panne" ? "panne_bus" : "autre",
        texte:
          `${a.immatriculation} arrêté ${minutes} min après ${a.apres}` +
          (a.aBord !== null ? ` · ${a.aBord} à bord` : "") +
          (a.soupcon === "panne" ? " · panne ?" : ""),
        quand: versIsoDouala(a.arretDepuis),
        cibleId: a.departId,
      });
    }
    for (const p of pannes) {
      alertes.push({
        id: `panne-${p.id}`,
        categorie: "panne_bus",
        texte: `${p.immatriculation} · panne signalée : ${p.description}`,
        quand: versIsoDouala(p.signaleA),
        cibleId: p.departId,
      });
    }
    if (
      correspondance.nombre > 0 &&
      correspondance.depuis !== null &&
      maintenant.getTime() - correspondance.depuis.getTime() >=
        MINUTES_CORRESPONDANCE * MS_PAR_MINUTE
    ) {
      alertes.push({
        id: "correspondance-colis",
        categorie: "correspondance",
        texte: `${pluriel(correspondance.nombre, "colis", "colis")} en correspondance · scan « reçu » manquant`,
        quand: versIsoDouala(correspondance.depuis),
        cibleId: null,
      });
    }
    for (const d of dossiers) {
      alertes.push({
        id: `financement-${d.id}`,
        categorie: "financement",
        texte: `Avance ${montantCourt(d.montant)} · dossier ${d.id} ${d.statut === "en_analyse" ? "en analyse" : "envoyé"}`,
        quand: versIsoDouala(d.envoyeA),
        cibleId: d.id,
      });
    }
    return alertes.sort((a, b) => b.quand.localeCompare(a.quand) || a.id.localeCompare(b.id));
  }

  /* ------------------------------------------------------------------ gares */

  /** `GET /patron/gares` : « Mes gares, mes gens ». */
  async gares(u: Utilisateur): Promise<c.VueGares> {
    return this.proteger(async () => {
      const compagnieId = this.compagnieDe(u);
      const maintenant = this.horloge.maintenant();
      const jour = jourDouala(maintenant);
      const [gares, nbBus] = await Promise.all([
        this.referentiel.gares(compagnieId, maintenant),
        this.referentiel.nbBus(compagnieId),
      ]);
      const vue = await this.vueEquipe(compagnieId, gares, maintenant);
      const lignes = await Promise.all(
        gares.map(async (g): Promise<c.GareResume> => {
          const caisses = await this.caissesDeLaGare(g.id, jour);
          const horsLigne = LecturesPatronService.horsLigne(g);
          const responsable = vue.membres.find(
            (m) => m.role === "superviseur" && m.gareId === g.id,
          );
          return {
            id: g.id,
            nom: g.nom,
            ville: g.ville,
            responsable: responsable?.nom ?? "",
            nbGuichets: g.guichets.length,
            nbQuais: g.nbQuais,
            caisse: caisses.reduce((somme, k) => somme + k.vue.cashAttendu, 0),
            synchro: {
              guichetsSynchronises: g.appareils.synchronises,
              guichets: g.appareils.total > 0 ? g.appareils.total : g.guichets.length,
            },
            ecartTotal: horsLigne
              ? null
              : caisses.reduce((somme, k) => somme + LecturesPatronService.ecartDe(k), 0),
            horsLigneDepuisMinutes: LecturesPatronService.minutesHorsLigne(g, maintenant),
          };
        }),
      );

      const effectifs: c.EffectifRole[] = ROLES_EQUIPE.flatMap((role) => {
        const duRole = vue.membres.filter((m) => m.role === role);
        return duRole.length === 0
          ? []
          : [
              {
                role,
                nombre: duRole.length,
                enService: duRole.filter((m) => enActivite(vue.etats.get(m.id) ?? "repos")).length,
              },
            ];
      });
      const aSuivre = [...vue.membres]
        .sort(
          (a, b) =>
            prioriteDeSuivi(vue.etats.get(a.id) ?? "repos", a, this.nbEcarts(vue, a)) -
              prioriteDeSuivi(vue.etats.get(b.id) ?? "repos", b, this.nbEcarts(vue, b)) ||
            a.nom.localeCompare(b.nom, "fr"),
        )
        .slice(0, PERSONNES_A_SUIVRE)
        .map((m) => this.resume(vue, m));

      return {
        instant: versIsoDouala(maintenant),
        nbPersonnes: vue.membres.length,
        nbBus,
        enService: vue.membres.filter((m) => enActivite(vue.etats.get(m.id) ?? "repos")).length,
        gares: lignes,
        effectifs,
        personnes: aSuivre,
        reperes: this.reperes(vue),
        paie: this.paie(vue.membres, jour),
      };
    });
  }

  private reperes(vue: VueEquipe): c.VueGares["reperes"] {
    const reperes: c.VueGares["reperes"] = [];
    const guichetiers = vue.membres.filter((m) => m.role === "guichetier");
    // Le plus régulier : le guichetier qui a le plus vendu sans aucun écart sur la période.
    const reguliers = guichetiers
      .filter((m) => (vue.ecarts.get(m.id) ?? []).every((e) => e.ecart === 0) && m.billets90 > 0)
      .sort((a, b) => b.billets90 - a.billets90 || a.nom.localeCompare(b.nom, "fr"));
    if (reguliers[0]) {
      reperes.push({
        code: "plus_regulier",
        libelle: "Le plus régulier",
        valeur: `${nomAbrege(reguliers[0].nom)} · 0 écart en ${JOURS_ECARTS} j`,
      });
    }
    const aVoir = guichetiers
      .map((m) => ({ m, n: this.nbEcarts(vue, m) }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n || a.m.nom.localeCompare(b.m.nom, "fr"))[0];
    if (aVoir) {
      reperes.push({
        code: "a_voir",
        libelle: "À voir cette semaine",
        valeur: `${nomAbrege(aVoir.m.nom)} · ${pluriel(aVoir.n, "écart", "écarts")}`,
      });
    }
    return reperes.concat(this.reperePaie(vue.membres));
  }

  private reperePaie(membres: readonly MembrePatron[]): c.VueGares["reperes"] {
    const { nbSalaires, jourDuMois } = this.resumePaie(membres);
    return [
      {
        code: "paie_du_mois",
        libelle: "Paie du mois",
        valeur: `${pluriel(nbSalaires, "salaire", "salaires")} · le ${jourDuMois} · MoMo`,
      },
    ];
  }

  private resumePaie(membres: readonly MembrePatron[]): { nbSalaires: number; jourDuMois: number } {
    const payes = membres.filter((m) => m.salaire > 0);
    // Le jour de paie le plus courant (le plus tardif en cas d'égalité) ; le 30 sans salaire réglé.
    const comptes = new Map<number, number>();
    for (const m of payes) comptes.set(m.jourDePaie, (comptes.get(m.jourDePaie) ?? 0) + 1);
    const jour = [...comptes.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 30;
    return { nbSalaires: payes.length, jourDuMois: jour };
  }

  private paie(membres: readonly MembrePatron[], _jour: string): c.VueGares["paie"] {
    return { ...this.resumePaie(membres), mode: "momo" };
  }

  /* ------------------------------------------------------------------ une gare */

  /** `GET /patron/gares/:gareId` : une gare en détail. */
  async gare(u: Utilisateur, gareId: string): Promise<c.DetailGare> {
    return this.proteger(async () => {
      const compagnieId = this.compagnieDe(u);
      const maintenant = this.horloge.maintenant();
      const jour = jourDouala(maintenant);
      const gares = await this.referentiel.gares(compagnieId, maintenant);
      const gare = gares.find((g) => g.id === gareId);
      if (!gare) throw introuvable("GARE_INCONNUE", "Gare inconnue");
      const compagnie = await this.compagnie(u);

      const [vueGare, caisses, faits, departs, colisAuRelais, evenements, enAttente, vue] =
        await Promise.all([
          this.source.gare(gare.id),
          this.caissesDeLaGare(gare.id, jour),
          this.jour.lire(compagnie, jour, maintenant),
          this.exploitation.departsDuJour(compagnieId, jour),
          this.exploitation.colisAuRelais(gare.id),
          this.exploitation.journalDeGare(gare.id, new Date(debutJourDoualaMs(maintenant)), 15),
          this.demandes.enAttenteDeGare(gare.id),
          this.vueEquipe(compagnieId, [gare], maintenant),
        ]);

      const superviseur = vue.membres.find((m) => m.role === "superviseur" && m.gareId === gare.id);
      const billetsParRang = new Map((vueGare?.guichets ?? []).map((k) => [k.rang, k.billets]));
      const debutJour = new Date(debutJourDoualaMs(maintenant));

      const guichets: c.DetailGare["guichets"] = [];
      for (const g of gare.guichets) {
        const duGuichet = caisses.filter((k) => k.session.guichetRang === g.rang);
        const retenue =
          duGuichet.find((k) => k.session.etat === "ouverte") ??
          duGuichet.find((k) => k.session.etat === "cloturee") ??
          duGuichet.filter((k) => k.session.etat === "validee").pop();
        const agentId =
          retenue?.session.agentId ??
          vue.membres.find(
            (m) => m.role === "guichetier" && m.gareId === gare.id && m.guichetRang === g.rang,
          )?.id;
        if (!agentId) continue;
        const agent =
          vue.membres.find((m) => m.id === agentId) ??
          (await this.equipe.trouver(compagnieId, agentId, maintenant));
        if (!agent) continue;
        const appareil = gare.appareils.parRang.find((a) => a.rang === g.rang);
        const bloque = (vue.etats.get(agent.id) ?? etatDe(agent, maintenant)) === "bloquee";
        const synchroRecente =
          appareil?.derniereSyncA != null &&
          maintenant.getTime() - appareil.derniereSyncA.getTime() <= 15 * MS_PAR_MINUTE;
        const colis = (await this.equipe.activite(agent.id, debutJour)).colis;
        guichets.push({
          rang: g.rang,
          personne: { id: agent.id, nom: nomAbrege(agent.nom), initiales: initiales(agent.nom) },
          sessionId: retenue?.session.id ?? null,
          billets: billetsParRang.get(g.rang) ?? 0,
          colis,
          caisse: retenue?.vue.cashAttendu ?? 0,
          ecart: retenue ? LecturesPatronService.ecartDe(retenue) : 0,
          etat: bloque ? "bloque" : appareil && !synchroRecente ? "hors_ligne" : "synchronise",
          derniereSyncA: appareil?.derniereSyncA ? versIsoDouala(appareil.derniereSyncA) : null,
          bloqueDepuis:
            bloque && agent.bloqueJusqua
              ? versIsoDouala(agent.bloqueJusqua.getTime() - BLOCAGE_PIN_MINUTES * MS_PAR_MINUTE)
              : null,
          clotureAttendPin: retenue?.session.etat === "cloturee",
        });
      }

      const quais: c.DetailGare["quais"] = departs
        .filter((d) => d.gareId === gare.id && d.etat !== "annule" && d.etat !== "fusionne")
        .sort((a, b) => a.heureDepart.getTime() - b.heureDepart.getTime())
        .map((d) => ({
          departId: d.departId,
          heureDepart: versIsoDouala(d.heureDepart),
          origine: d.origine,
          destination: d.destination,
          bus: d.bus ?? "",
          chauffeur: d.chauffeur ?? "",
          convoyeur: d.convoyeur,
          remplis: d.vendus,
          capacite: Math.max(d.capacite, d.vendus, 1),
          embarquementA: d.embarquementA ? versIsoDouala(d.embarquementA) : null,
          note: d.note,
        }));

      const journal: c.DetailGare["journal"] = [
        ...enAttente.map((d) => ({
          at: versIsoDouala(d.demandeA),
          texte: `Annulation demandée au guichet ${d.guichetRang} · ${d.motif}`,
          etat: "ouvert" as const,
          cibleId: d.billetId,
        })),
        ...caisses
          .filter((k) => k.session.etat === "cloturee" && k.session.cloture)
          .map((k) => ({
            at: k.session.cloture!.at,
            texte:
              `Clôture guichet ${k.session.guichetRang} · écart ${francs(k.session.cloture!.ecart)}` +
              " · attend le PIN du superviseur",
            etat: "attend_pin" as const,
            cibleId: k.session.id,
          })),
        ...evenements.map((e) => ({
          at: versIsoDouala(e.at),
          texte: e.resume,
          etat: "trace" as const,
          cibleId: e.cibleId,
        })),
      ]
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 15);

      const departsGare = faits.departs.filter((d) => d.gareId === gare.id);
      const ecartParGuichet = guichets
        .filter((k) => k.ecart !== 0)
        .sort((a, b) => Math.abs(b.ecart) - Math.abs(a.ecart))[0];
      const debutCaisse = caisses
        .map((k) => Date.parse(k.session.ouverteA))
        .sort((a, b) => a - b)[0];
      return {
        gare: { id: gare.id, nom: gare.nom, ville: gare.ville },
        superviseur: superviseur?.nom ?? "",
        nbGuichets: gare.guichets.length,
        nbQuais: gare.nbQuais,
        instant: versIsoDouala(maintenant),
        synchro: {
          guichetsSynchronises: gare.appareils.synchronises,
          guichets: gare.appareils.total > 0 ? gare.appareils.total : gare.guichets.length,
        },
        chiffres: {
          caisse: caisses.reduce((somme, k) => somme + k.vue.cashAttendu, 0),
          caisseDepuis: versIsoDouala(debutCaisse ?? debutJour),
          billets: faits.billets.filter((b) => b.gareId === gare.id).length,
          remplissagePct: partPct(
            departsGare
              .filter((d) => d.etat !== "annule" && d.etat !== "fusionne")
              .reduce((somme, d) => somme + d.vendus, 0),
            departsGare
              .filter((d) => d.etat !== "annule" && d.etat !== "fusionne")
              .reduce((somme, d) => somme + d.capacite, 0),
          ),
          colis: faits.colis.filter((k) => k.gareId === gare.id).length,
          colisAuRelais,
          ecart: caisses.reduce((somme, k) => somme + LecturesPatronService.ecartDe(k), 0),
          ecartGuichet: ecartParGuichet?.rang ?? null,
        },
        guichets,
        quais,
        journal,
      };
    });
  }

  /* ------------------------------------------------------------------ équipe */

  /** `GET /patron/equipe` : la liste de l'équipe, filtrable par rôle, par nom ou lieu, par gare. */
  async equipeListe(u: Utilisateur, requete: Record<string, unknown>): Promise<c.ListeEquipe> {
    const filtre = lireFiltreEquipe(requete);
    return this.proteger(async () => {
      const compagnieId = this.compagnieDe(u);
      const maintenant = this.horloge.maintenant();
      const gares = await this.referentiel.gares(compagnieId, maintenant);
      if (filtre.gareId !== undefined && !gares.some((g) => g.id === filtre.gareId)) {
        throw introuvable("GARE_INCONNUE", "Gare inconnue");
      }
      const vue = await this.vueEquipe(compagnieId, gares, maintenant);
      const recherche = filtre.recherche ? sansAccents(filtre.recherche.trim()) : "";
      const personnes = vue.membres
        .filter((m) => filtre.role === undefined || m.role === filtre.role)
        .filter((m) => filtre.gareId === undefined || m.gareId === filtre.gareId)
        .filter((m) => recherche === "" || sansAccents(`${m.nom} ${lieuDe(m)}`).includes(recherche))
        .sort(
          (a, b) =>
            ROLES_EQUIPE.indexOf(a.role) - ROLES_EQUIPE.indexOf(b.role) ||
            a.nom.localeCompare(b.nom, "fr"),
        )
        .map((m) => this.resume(vue, m));
      const roles = ROLES_EQUIPE.flatMap((role) => {
        const nombre = vue.membres.filter((m) => m.role === role).length;
        return nombre === 0 ? [] : [{ role, nombre }];
      });
      return {
        total: vue.membres.length,
        roles,
        personnes,
        resume: {
          role: filtre.role ?? null,
          total: filtre.role
            ? (roles.find((r) => r.role === filtre.role)?.nombre ?? 0)
            : vue.membres.length,
          enService: personnes.filter((p) => enActivite(p.etat)).length,
          bloquees: personnes.filter((p) => p.etat === "bloquee").length,
        },
      };
    });
  }

  /**
   * L'équipe en raccourci pour l'accueil des réglages : l'effectif par rôle et les personnes qui demandent
   * le plus d'attention (compte bloqué, écarts, PIN à renouveler) d'abord, puis l'ordre des rôles.
   */
  async apercuEquipe(
    compagnieId: string,
    limite: number,
  ): Promise<{
    total: number;
    effectifs: Array<{ role: RoleEquipe; nombre: number }>;
    apercu: c.PersonneResume[];
  }> {
    const maintenant = this.horloge.maintenant();
    const gares = await this.referentiel.gares(compagnieId, maintenant);
    const vue = await this.vueEquipe(compagnieId, gares, maintenant);
    const effectifs = ROLES_EQUIPE.flatMap((role) => {
      const nombre = vue.membres.filter((m) => m.role === role).length;
      return nombre === 0 ? [] : [{ role, nombre }];
    });
    const apercu = [...vue.membres]
      .sort(
        (a, b) =>
          prioriteDeSuivi(vue.etats.get(a.id) ?? "repos", a, this.nbEcarts(vue, a)) -
            prioriteDeSuivi(vue.etats.get(b.id) ?? "repos", b, this.nbEcarts(vue, b)) ||
          ROLES_EQUIPE.indexOf(a.role) - ROLES_EQUIPE.indexOf(b.role) ||
          a.nom.localeCompare(b.nom, "fr"),
      )
      .slice(0, limite)
      .map((m) => this.resume(vue, m));
    return { total: vue.membres.length, effectifs, apercu };
  }

  /** `GET /patron/personnes/:personneId` : la fiche d'une personne de l'équipe. */
  async personne(u: Utilisateur, personneId: string): Promise<c.FichePersonne> {
    return this.proteger(async () => {
      const compagnieId = this.compagnieDe(u);
      const maintenant = this.horloge.maintenant();
      const m = await this.equipe.trouver(compagnieId, personneId, maintenant);
      if (!m) throw introuvable("PERSONNE_INCONNUE", "Personne inconnue");
      const [membres, tolerance, activite] = await Promise.all([
        this.equipe.lister(compagnieId, maintenant),
        this.tolerance(compagnieId),
        this.equipe.activite(
          m.id,
          new Date(maintenant.getTime() - PERIODE_FICHE_JOURS * MS_PAR_JOUR),
        ),
      ]);
      const jour = jourDouala(maintenant);
      const depuis = versIsoDouala(
        debutJourDoualaMs(maintenant) - (PERIODE_FICHE_JOURS - 1) * MS_PAR_JOUR,
      );
      const sessions =
        m.role === "guichetier"
          ? (await this.sessions.deAgent(m.id, depuis)).filter((s) => s.cloture !== null)
          : [];
      const ecartsNonNuls = sessions.filter((s) => s.cloture!.ecart !== 0);
      const dixJours = versIsoDouala(
        debutJourDoualaMs(maintenant) - (JOURS_ECARTS - 1) * MS_PAR_JOUR,
      );
      const recents = ecartsNonNuls.filter((s) => s.cloture!.at >= dixJours);
      const superviseur = membres.find((x) => x.role === "superviseur" && x.gareId === m.gareId);
      let telephone = "";
      try {
        telephone = masquerNumero(this.comptes.telephoneEnClair(m));
      } catch {
        // Un numéro qui ne se déchiffre pas ne bloque pas la fiche.
      }
      const etat = etatDe(m, maintenant);
      return {
        personne: {
          id: m.id,
          nom: m.nom,
          initiales: initiales(m.nom),
          role: m.role,
          lieu: lieuDe(m),
          depuis: jourDouala(m.creeA),
          telephoneMasque: telephone,
          operateur: m.operateur,
          salaire: m.salaire,
          jourDePaie: m.jourDePaie,
          superviseur: superviseur?.nom ?? "",
          etat,
          enServiceDepuis:
            enActivite(etat) && m.enServiceDepuis ? versIsoDouala(m.enServiceDepuis) : null,
        },
        chiffres: {
          periodeJours: PERIODE_FICHE_JOURS,
          billets: activite.billets,
          colis: activite.colis,
          litiges: activite.litiges,
          annulations: activite.annulations,
          tauxAnnulationPct: partPct(activite.annulations, activite.billets),
          ecarts: {
            nombre: recents.length,
            total: recents.reduce((somme, s) => somme + s.cloture!.ecart, 0),
            sur: JOURS_ECARTS,
          },
        },
        ecarts: {
          tolerance,
          jours: ecartsParJour(
            recents.map((s) => ({ at: s.cloture!.at, ecart: s.cloture!.ecart })),
            jour,
            JOURS_ECARTS,
          ),
          lecture: lectureEcarts(
            recents.map((s) => s.cloture!.ecart),
            JOURS_ECARTS,
            tolerance,
          ),
        },
        journal: ecartsNonNuls
          .sort((a, b) => b.cloture!.at.localeCompare(a.cloture!.at))
          .slice(0, 3)
          .map((s) => ({
            quand: s.cloture!.at,
            cashCompte: s.cloture!.cashCompte,
            cashAttendu: s.cloture!.cashAttendu,
            ecart: s.cloture!.ecart,
            validePar: s.validation?.superviseurNom ?? "à valider",
          })),
      };
    });
  }

  /* ------------------------------------------------------------------ salle de contrôle */

  /** `GET /patron/controle` : le direct de toutes les gares de la compagnie. */
  async controle(u: Utilisateur): Promise<c.SalleDeControle> {
    return this.proteger(async () => {
      const compagnie = await this.compagnie(u);
      const maintenant = this.horloge.maintenant();
      const jour = jourDouala(maintenant);
      const [
        gares,
        nbBus,
        faits,
        departs,
        busEnRoute,
        arrets,
        correspondance,
        propositions,
        membres,
        precedents,
      ] = await Promise.all([
        this.referentiel.gares(compagnie.id, maintenant),
        this.referentiel.nbBus(compagnie.id),
        this.jour.lire(compagnie, jour, maintenant),
        this.exploitation.departsDuJour(compagnie.id, jour),
        this.exploitation.busEnRoute(compagnie.id),
        this.exploitation.arretsOuverts(compagnie.id),
        this.exploitation.colisEnCorrespondance(compagnie.id),
        this.exploitation.propositionsEnAttente(compagnie.id, maintenant),
        this.equipe.lister(compagnie.id, maintenant),
        this.jour.memesJoursPrecedents(compagnie.id, jour, SEMAINES_PREVISION),
      ]);
      const caissesParGare = new Map<string, CaisseDeGare[]>();
      await Promise.all(
        gares.map(async (g) => caissesParGare.set(g.id, await this.caissesDeLaGare(g.id, jour))),
      );
      const aValider = new Map<string, CaisseDeGare[]>();
      await Promise.all(
        gares.map(async (g) => {
          const debut = versIsoDouala(debutJourDoualaMs(maintenant) - JOURS_ECARTS * MS_PAR_JOUR);
          const attente = (await this.sessions.deGare(g.id, debut)).filter(
            (s) => s.etat === "cloturee",
          );
          aValider.set(
            g.id,
            await Promise.all(
              attente.map(async (session) => ({ session, vue: await this.caisse.vue(session) })),
            ),
          );
        }),
      );
      const toutesCaisses = [...caissesParGare.values()].flat();

      const lignesGares = gares.map((g): c.GareControle => {
        const caisses = caissesParGare.get(g.id) ?? [];
        const prochain = departs
          .filter(
            (d) =>
              d.gareId === g.id &&
              d.heureDepart.getTime() >= maintenant.getTime() &&
              !["annule", "fusionne", "arrive", "parti"].includes(d.etat),
          )
          .sort((a, b) => a.heureDepart.getTime() - b.heureDepart.getTime())[0];
        const superviseur = membres.find((m) => m.role === "superviseur" && m.gareId === g.id);
        const horsLigne = LecturesPatronService.horsLigne(g);
        return {
          gareId: g.id,
          nom: g.nom,
          billets: faits.billets.filter((b) => b.gareId === g.id).length,
          colis: faits.colis.filter((k) => k.gareId === g.id).length,
          cashAttendu: caisses.reduce((somme, k) => somme + k.vue.cashAttendu, 0),
          ecart: caisses.reduce((somme, k) => somme + LecturesPatronService.ecartDe(k), 0),
          prochainDepart: prochain
            ? {
                heure: heureDouala(prochain.heureDepart),
                destination: prochain.destination,
                remplis: prochain.vendus,
                capacite: Math.max(prochain.capacite, prochain.vendus, 1),
              }
            : null,
          superviseur: {
            nom: superviseur?.nom ?? "",
            enLigne: !horsLigne,
            horsLigneDepuisMinutes: LecturesPatronService.minutesHorsLigne(g, maintenant),
          },
        };
      });

      const aTraiter: c.ATraiter[] = [];
      for (const g of gares) {
        const superviseur = membres.find((m) => m.role === "superviseur" && m.gareId === g.id);
        for (const k of aValider.get(g.id) ?? []) {
          aTraiter.push({
            id: `cloture-${k.session.id}`,
            type: "cloture_en_attente",
            texte:
              `Clôture guichet ${k.session.guichetRang} ${g.nom} · écart ${francs(k.session.cloture?.ecart ?? 0)}` +
              (superviseur
                ? ` · attend le PIN de ${nomAbrege(superviseur.nom)}`
                : " · attend le PIN du superviseur"),
            quand: k.session.cloture?.at ?? versIsoDouala(maintenant),
          });
        }
      }
      for (const a of arrets) {
        const minutes = Math.max(
          0,
          Math.floor((maintenant.getTime() - a.arretDepuis.getTime()) / MS_PAR_MINUTE),
        );
        aTraiter.push({
          id: `arret-${a.id}`,
          type: "bus_arrete",
          texte:
            `${a.immatriculation} arrêté ${minutes} min après ${a.apres}` +
            (a.aBord !== null ? ` · ${a.aBord} à bord` : ""),
          quand: versIsoDouala(a.arretDepuis),
        });
      }
      if (correspondance.nombre > 0) {
        aTraiter.push({
          id: "correspondance-colis",
          type: "correspondance",
          texte: `${pluriel(correspondance.nombre, "colis", "colis")} en correspondance · scan « reçu » manquant`,
          quand: versIsoDouala(correspondance.depuis ?? maintenant),
        });
      }
      for (const p of propositions) {
        aTraiter.push({
          id: `proposition-${p.actionId}`,
          type: "proposition_assistant",
          texte: `L'assistant propose : ${p.libelle}`,
          quand: versIsoDouala(p.proposeeLe),
        });
      }
      aTraiter.sort((a, b) => b.quand.localeCompare(a.quand) || a.id.localeCompare(b.id));

      const hors = gares.filter((g) => LecturesPatronService.horsLigne(g)).length;
      const departsActifs = faits.departs.filter((d) => d.etat !== "annule");
      const arretLong = [...arrets].sort(
        (a, b) => a.arretDepuis.getTime() - b.arretDepuis.getTime(),
      )[0];
      const superviseurs = membres.filter((m) => m.role === "superviseur").length;
      const patron = await this.personnes.trouverParId(u.id);
      const villes = [...new Set(gares.map((g) => g.ville))].map((ville) => {
        const guichets = gares
          .filter((g) => g.ville === ville)
          .reduce((n, g) => n + g.guichets.length, 0);
        return guichets > 1 ? `${ville} · ${guichets} guichets` : ville;
      });
      return {
        compagnie: compagnie.nom,
        jour,
        instant: versIsoDouala(maintenant),
        nbGares: gares.length,
        nbBus,
        synchro: { garesSynchronisees: gares.length - hors, gares: gares.length },
        chiffres: {
          recette: faits.recette,
          variationPct: faits.variationPct,
          billets: faits.billets.length,
          billetsEnLigne: faits.billets.filter((b) => b.canal === "en_ligne").length,
          billetsEnRoute: faits.billets.filter((b) => b.canal === "convoyeur").length,
          colis: faits.colis.length,
          colisEnCorrespondance: correspondance.nombre,
          litiges: faits.litiges,
          remplissagePct: faits.remplissage.moyenPct,
          departs: departsActifs.length,
          departsFusionnes: faits.departs.filter((d) => d.etat === "fusionne").length,
          ecartsDeCaisse: {
            total: toutesCaisses.reduce((somme, k) => somme + LecturesPatronService.ecartDe(k), 0),
            caissesEnEcart: toutesCaisses.filter((k) => LecturesPatronService.ecartDe(k) !== 0)
              .length,
            caisses: toutesCaisses.length,
          },
        },
        carte: {
          busEnRoute,
          villes,
          alerte: arretLong
            ? {
                immatriculation: arretLong.immatriculation,
                arretMinutes: Math.max(
                  0,
                  Math.floor(
                    (maintenant.getTime() - arretLong.arretDepuis.getTime()) / MS_PAR_MINUTE,
                  ),
                ),
                soupcon: arretLong.soupcon,
              }
            : null,
        },
        gares: lignesGares,
        aTraiter,
        ventesParHeure: ventesParHeure(
          ventesDatees(faits.billets, faits.colis),
          precedents,
          maintenant,
        ),
        rapport: {
          envoiA: versIsoDouala(new Date(`${jour}T${HEURE_RAPPORT}:00.000+01:00`)),
          destinataires: { patron: patron?.nom ?? "", superviseurs },
          caissesAValider: [...aValider.values()].reduce((n, l) => n + l.length, 0),
        },
      };
    });
  }
}

/** Les paramètres de `GET /patron/equipe` : `role`, `recherche`, `gareId`, rien d'autre. */
export function lireFiltreEquipe(requete: Record<string, unknown>): c.FiltreEquipe {
  const inconnus = Object.keys(requete).filter((k) => !["role", "recherche", "gareId"].includes(k));
  if (inconnus.length > 0) {
    throw requeteInvalide("REQUETE_INVALIDE", `Paramètres inconnus : ${inconnus.join(", ")}`);
  }
  const filtre: c.FiltreEquipe = {};
  const role = requete["role"];
  if (role !== undefined && role !== "") {
    if (!estRoleEquipe(role)) {
      throw requeteInvalide(
        "REQUETE_INVALIDE",
        "role : guichetier, superviseur, convoyeur, chauffeur, relais ou comptable",
      );
    }
    filtre.role = role as RoleEquipe;
  }
  const recherche = requete["recherche"];
  if (recherche !== undefined && recherche !== "") {
    if (typeof recherche !== "string" || recherche.length > 100) {
      throw requeteInvalide("REQUETE_INVALIDE", "recherche : texte de 100 caractères au plus");
    }
    filtre.recherche = recherche;
  }
  const gareId = requete["gareId"];
  if (gareId !== undefined && gareId !== "") {
    if (typeof gareId !== "string" || gareId.length > 100) {
      throw requeteInvalide("REQUETE_INVALIDE", "gareId invalide");
    }
    filtre.gareId = gareId;
  }
  return filtre;
}
