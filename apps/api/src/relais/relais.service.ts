import { Injectable, Logger } from "@nestjs/common";
import { ColisService, normaliserNumero } from "../colis/colis.service";
import { ErreurColis, colisIntrouvable } from "../colis/erreurs";
import type { ColisStocke, RelaisRef } from "../colis/modele";
import type { EtatColis } from "../colis/regles";
import { repartitionRelais } from "../colis/regles";
import { RE_UUID } from "../colis/validation";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import { AnnuairePersonnes } from "./annuaire";
import { CONSIGNE_REMISE_RELAIS, RELAIS_PROCHES } from "./contenu";
import type { PointRelaisStocke, ReceptionRelais } from "./modele";
import { ColisDuRelais, Lieux, Portefeuille, ReceptionsRelais, RelaisRepository } from "./ports";
import {
  CAPACITE_PAR_DEFAUT,
  GAIN_REMISE_RELAIS,
  GARDE_RELAIS_JOURS,
  distanceM,
  estOuvert,
  fermeBientot,
  lireHoraires,
  lireTailleMaxKg,
  libelleMoyen,
  LIBELLE_VERSEMENT_RELAIS,
  normaliser,
  type Point,
} from "./regles";
import { debutDeSemaine, enMs, joursEcoules, versIsoDouala } from "./temps";
import { particulariteRelais, vueColisPartenaire } from "./vues";

/** Colis gardés chez le relais : « en relais », ou « non retiré » en attendant d'être repris. */
export const ETATS_EN_GARDE: readonly EtatColis[] = ["en_relais", "non_retire"];
/** Colis destinés au relais, encore en route ou à la gare. */
export const ETATS_ATTENDUS: readonly EtatColis[] = [
  "charge",
  "en_route",
  "decharge",
  "disponible",
];

const DEBUT_DES_TEMPS = versIsoDouala(0);

/** La réception du colis chez le relais : date de l'étape « en relais » de l'historique du colis. */
export function recuLe(colis: ColisStocke, reception: ReceptionRelais | null): string {
  if (reception) return reception.recuA;
  const etape = [...colis.historique].reverse().find((h) => h.action === "envoyer_en_relais");
  return etape?.at ?? colis.creeA;
}

@Injectable()
export class RelaisService {
  private readonly logger = new Logger("RelaisService");

  constructor(
    readonly repo: RelaisRepository,
    readonly receptions: ReceptionsRelais,
    private readonly colisDuRelais: ColisDuRelais,
    readonly colis: ColisService,
    private readonly portefeuille: Portefeuille,
    private readonly lieux: Lieux,
    private readonly annuaire: AnnuairePersonnes,
    readonly horloge: Horloge,
    private readonly audit: AuditService,
  ) {}

  maintenant(): string {
    return versIsoDouala(this.horloge.maintenant());
  }

  /** Le point relais du compte connecté. */
  async moi(utilisateur: Pick<Utilisateur, "id">): Promise<PointRelaisStocke> {
    const relais = await this.repo.parPersonne(utilisateur.id);
    if (!relais) throw new ErreurColis(404, "relais_introuvable", "Point relais introuvable");
    if (!relais.actif) {
      throw new ErreurColis(403, "relais_suspendu", "Votre point relais est suspendu");
    }
    return relais;
  }

  /** Ce que `ReferentielColis.relais` doit répondre : le coordinateur l'appelle depuis son adaptateur. */
  async reference(id: string): Promise<RelaisRef | null> {
    const relais = await this.repo.trouver(id);
    return relais
      ? { id: relais.id, nom: relais.nom, ville: relais.ville, actif: relais.actif }
      : null;
  }

  /* -------------------------------------------------------------- voyageur : trouver et choisir un relais */

  private async colisDeLExpediteur(utilisateurId: string, colisId: string): Promise<ColisStocke> {
    const { colis, role } = await this.colis.colisDuVoyageur(utilisateurId, colisId);
    // Seul celui qui paie choisit le mode de retrait.
    if (role !== "expediteur") throw colisIntrouvable();
    return colis;
  }

  /** Le point de départ des distances : l'adresse du destinataire si on la connaît, sinon la gare. */
  private async pointDeReference(colis: ColisStocke): Promise<Point | null> {
    if (colis.adresseLivraison) {
      const adresse = await this.lieux.pointDeLAdresse(
        colis.adresseLivraison,
        colis.gareDestination.ville,
      );
      if (adresse) return adresse;
    }
    return this.lieux.pointDeLaGare(colis.gareDestination.id);
  }

  private async relaisDeLaVille(ville: string): Promise<PointRelaisStocke[]> {
    const tous = await this.repo.lister({ actif: true });
    return tous.filter((r) => normaliser(r.ville) === normaliser(ville));
  }

  /** Relais triés du plus proche au plus éloigné ; sans coordonnées, par note puis par nom. */
  private trier(
    liste: PointRelaisStocke[],
    reference: Point | null,
  ): { relais: PointRelaisStocke; distanceM: number | null }[] {
    const avecDistance = liste.map((relais) => ({
      relais,
      distanceM: reference && relais.position ? distanceM(reference, relais.position) : null,
    }));
    return avecDistance.sort((a, b) => {
      if (a.distanceM !== null && b.distanceM !== null) {
        return a.distanceM - b.distanceM || a.relais.code.localeCompare(b.relais.code);
      }
      if (a.distanceM !== null) return -1;
      if (b.distanceM !== null) return 1;
      return b.relais.note - a.relais.note || a.relais.nom.localeCompare(b.relais.nom, "fr");
    });
  }

  /** `SchemaRelaisProches` : les points relais de la ville du destinataire, du plus proche au plus loin. */
  async proches(utilisateur: Utilisateur, colisId: string, recherche: string | undefined) {
    const colis = await this.colisDeLExpediteur(utilisateur.id, colisId);
    const maintenant = this.maintenant();
    const reference = await this.pointDeReference(colis);
    const motif = recherche ? normaliser(recherche) : "";
    const candidats = (await this.relaisDeLaVille(colis.gareDestination.ville)).filter(
      (r) => motif === "" || normaliser(`${r.nom} ${r.quartier} ${r.repere ?? ""}`).includes(motif),
    );
    const tries = this.trier(candidats, reference).slice(0, 10);

    const points = [];
    for (const [i, { relais, distanceM: distance }] of tries.entries()) {
      const horaires = lireHoraires(relais.ouvert);
      const remis = (await this.portefeuille.credits("relais", relais.id, DEBUT_DES_TEMPS)).filter(
        (c) => c.motif === "remise",
      ).length;
      points.push({
        id: relais.id,
        rang: i + 1,
        nom: relais.nom,
        ouvert: horaires ? estOuvert(horaires, maintenant) : false,
        fermeLe: horaires ? fermeBientot(horaires, maintenant) : null,
        distanceM: distance ?? 0,
        horaires: horaires?.libelle ?? relais.ouvert,
        jours: horaires?.libelleJours ?? null,
        note: relais.note,
        colisRemis: remis > 0 ? remis : null,
        particularite: particulariteRelais(relais),
        supplement: repartitionRelais().voyageur,
      });
    }
    const surnom = colis.destinataire.surnom ?? colis.destinataire.nom;
    return {
      ville: colis.gareDestination.ville,
      reperes: [
        ...points.map((p) => ({ type: "relais" as const, libelle: p.nom, rang: p.rang })),
        { type: "destinataire" as const, libelle: `Chez ${surnom}`, rang: null },
        { type: "gare" as const, libelle: `Gare ${colis.gareDestination.nom}`, rang: null },
      ],
      destinataire: { surnom },
      relais: points,
      devenir: { ...RELAIS_PROCHES.devenir, partParColis: GAIN_REMISE_RELAIS },
    };
  }

  /** Nombre de colis du relais, gardés ou attendus : sa capacité s'apprécie avec les deux. */
  private async occupation(relaisId: string, sauf?: string): Promise<number> {
    const colis = await this.colisDuRelais.parEtats(
      [...ETATS_EN_GARDE, ...ETATS_ATTENDUS],
      relaisId,
    );
    return colis.filter((c) => c.id !== sauf).length;
  }

  /** `SchemaRelaisChoisi` : l'expéditeur choisit le point relais (supplément de 300 F la première fois). */
  async choisir(utilisateur: Utilisateur, colisId: string, relaisId: string) {
    const colis = await this.colisDeLExpediteur(utilisateur.id, colisId);
    const relais = await this.repo.trouver(relaisId);
    if (!relais?.actif)
      throw new ErreurColis(404, "relais_introuvable", "Point relais introuvable");
    if (normaliser(relais.ville) !== normaliser(colis.gareDestination.ville)) {
      throw new ErreurColis(
        422,
        "relais_hors_ville",
        "Ce point relais n'est pas dans la ville du destinataire",
      );
    }
    const tailleMax = lireTailleMaxKg(relais.tailleMax);
    if (tailleMax !== null && colis.poidsKg > tailleMax) {
      throw new ErreurColis(
        422,
        "colis_trop_lourd",
        `Ce point relais ne prend pas les colis de plus de ${tailleMax} kg`,
      );
    }
    if ((await this.occupation(relais.id, colis.id)) >= relais.capacite) {
      throw new ErreurColis(
        409,
        "relais_complet",
        "Ce point relais ne peut plus recevoir de colis",
      );
    }

    const { supplement } = await this.colis.changerMode(utilisateur.id, colisId, {
      mode: "relais",
      relaisId: relais.id,
      adresse: undefined,
    });

    const destinatairePrevenu = await this.annuaire.prevenir(
      colis.destinataire.telephone,
      `AfriMove : ${colis.expediteur.nom} a choisi ${relais.nom} (${relais.quartier}, ${relais.ville}) ` +
        `pour votre colis ${colis.numero}. Vous serez prévenu quand il y arrive.`,
    );
    await this.audit.enregistrer({
      acteur: { id: utilisateur.id, role: "voyageur", compagnieId: null },
      action: "relais.choisi",
      resultat: "succes",
      cible: { type: "colis", id: colis.id },
      details: { colis: colis.numero, relais: relais.code, supplement },
    });
    return {
      colisId,
      relais: { id: relais.id, nom: relais.nom },
      supplement,
      destinatairePrevenu,
    };
  }

  /**
   * Le point relais où déposer un colis quand le destinataire est absent : le plus proche de l'adresse
   * (ou de la gare) parmi ceux qui prennent ce colis et ont de la place. `null` s'il n'y en a aucun.
   */
  async relaisDeRepli(colis: ColisStocke): Promise<PointRelaisStocke | null> {
    const reference = await this.pointDeReference(colis);
    const dansLaVille = (await this.relaisDeLaVille(colis.gareDestination.ville)).filter((r) => {
      const max = lireTailleMaxKg(r.tailleMax);
      return max === null || colis.poidsKg <= max;
    });
    for (const { relais } of this.trier(dansLaVille, reference)) {
      if ((await this.occupation(relais.id, colis.id)) < relais.capacite) return relais;
    }
    return null;
  }

  /* -------------------------------------------------------------- relais : son espace, réceptions, remises */

  /** Un colis par son identifiant ou par le numéro de son étiquette. */
  private async trouverColis(idOuNumero: string): Promise<ColisStocke> {
    const trouve = RE_UUID.test(idOuNumero)
      ? await this.colis.repo.trouver(idOuNumero)
      : await this.colis.repo.trouverParNumero(normaliserNumero(idOuNumero) ?? idOuNumero);
    if (!trouve) throw colisIntrouvable();
    return trouve;
  }

  /** Un relais ne touche qu'aux colis qui lui sont destinés. */
  private verifierDestinataire(colis: ColisStocke, relais: PointRelaisStocke): void {
    if (colis.relaisId !== relais.id) {
      throw new ErreurColis(403, "autre_relais", "Ce colis n'est pas destiné à votre point relais");
    }
  }

  private acteur(utilisateur: Utilisateur) {
    return {
      id: utilisateur.id,
      role: "relais",
      compagnieId: null,
      gareId: null,
    };
  }

  /** `SchemaEspaceRelais` : l'écran d'accueil du point relais. */
  async espace(utilisateur: Utilisateur) {
    const relais = await this.moi(utilisateur);
    const maintenant = this.maintenant();
    const gardes = await this.colisDuRelais.parEtats(ETATS_EN_GARDE, relais.id);
    const attendus = await this.colisDuRelais.parEtats(ETATS_ATTENDUS, relais.id);
    const receptions = new Map(
      (await this.receptions.lister(relais.id)).map((r) => [r.colisId, r]),
    );
    const horaires = lireHoraires(relais.ouvert);
    const ouvert = horaires ? estOuvert(horaires, maintenant) : false;

    const enGarde = gardes
      .map((colis) => {
        const reception = receptions.get(colis.id) ?? null;
        const depuisJours = joursEcoules(recuLe(colis, reception), maintenant);
        return {
          colis: vueColisPartenaire(colis),
          depuisJours,
          joursRestants: Math.max(0, GARDE_RELAIS_JOURS - depuisJours),
          rappelEnvoye: reception?.rappelEnvoyeA != null,
        };
      })
      .sort(
        (a, b) => b.depuisJours - a.depuisJours || a.colis.numero.localeCompare(b.colis.numero),
      );

    const enCours = gardes
      .filter((c) => c.etat === "en_relais")
      .map((c) => ({ colis: c, ouverteA: receptions.get(c.id)?.remiseOuverteA ?? null }))
      .filter((x): x is { colis: ColisStocke; ouverteA: string } => x.ouverteA !== null)
      .sort((a, b) => enMs(b.ouverteA) - enMs(a.ouverteA))[0];

    const arrivees = attendus
      .map((c) => c.arriveePrevue)
      .filter((a): a is string => a !== null && enMs(a) >= enMs(maintenant))
      .sort((a, b) => enMs(a) - enMs(b));

    const credits = await this.portefeuille.credits(
      "relais",
      relais.id,
      debutDeSemaine(maintenant),
    );
    return {
      boutique: {
        id: relais.id,
        nom: relais.nom,
        detail: `Point relais AfriMove · ${relais.ville} · ${ouvert ? "ouvert" : "fermé"}`,
        ouvert,
        note: relais.note,
      },
      resume: {
        enGarde: gardes.length,
        capacite: relais.capacite || CAPACITE_PAR_DEFAUT,
        arrivent: { nombre: attendus.length, vers: arrivees[0] ?? null },
        semaine: {
          gain: credits.reduce((somme, c) => somme + c.montant, 0),
          remis: credits.filter((c) => c.motif === "remise").length,
          versement: { jour: LIBELLE_VERSEMENT_RELAIS, moyen: libelleMoyen(relais.momo.operateur) },
        },
      },
      gainParRemise: GAIN_REMISE_RELAIS,
      remiseEnCours: enCours
        ? { colis: vueColisPartenaire(enCours.colis), consigne: CONSIGNE_REMISE_RELAIS }
        : null,
      enGarde,
      gardeJours: GARDE_RELAIS_JOURS,
    };
  }

  /**
   * `SchemaColisPartenaire` : le colis dont l'étiquette vient d'être scannée. Si le colis est en garde
   * ici, la remise est ouverte (« Remise en cours » sur l'écran d'accueil).
   */
  async colisParScan(utilisateur: Utilisateur, idOuNumero: string) {
    const relais = await this.moi(utilisateur);
    const colis = await this.trouverColis(idOuNumero);
    this.verifierDestinataire(colis, relais);
    if (colis.etat === "en_relais") {
      await this.receptionDe(colis, relais);
      await this.receptions.ouvrirRemise(colis.id, this.maintenant());
    }
    return vueColisPartenaire(colis);
  }

  /** La réception du colis, créée à la première fois (un colis déposé par un livreur n'a pas été scanné). */
  private async receptionDe(
    colis: ColisStocke,
    relais: PointRelaisStocke,
  ): Promise<ReceptionRelais> {
    const existante = await this.receptions.trouver(colis.id);
    if (existante) return existante;
    const reception: ReceptionRelais = {
      colisId: colis.id,
      relaisId: relais.id,
      recuA: recuLe(colis, null),
      rappelEnvoyeA: null,
      remiseOuverteA: null,
    };
    await this.receptions.ajouter(reception);
    return (await this.receptions.trouver(colis.id)) ?? reception;
  }

  /** `SchemaColisRecuRelais` : le relais scanne l'étiquette à l'arrivée du colis. */
  async recevoir(utilisateur: Utilisateur, numeroColis: string) {
    const relais = await this.moi(utilisateur);
    const colis = await this.trouverColis(numeroColis);
    this.verifierDestinataire(colis, relais);
    const a = this.maintenant();

    if (colis.etat === "en_relais") {
      const reception = await this.receptionDe(colis, relais);
      return { colis: vueColisPartenaire(colis), recuLe: reception.recuA };
    }
    if (colis.etat !== "disponible") {
      throw new ErreurColis(409, "etat_incompatible", "Ce colis ne peut pas être reçu maintenant");
    }
    const gardes = await this.colisDuRelais.parEtats(ETATS_EN_GARDE, relais.id);
    if (gardes.length >= relais.capacite) {
      throw new ErreurColis(409, "capacite_atteinte", "Votre point relais est plein");
    }

    const recu = await this.colis.executer({
      acteur: this.acteur(utilisateur),
      colis: { id: colis.id },
      action: "envoyer_en_relais",
      relaisId: relais.id,
    });
    await this.receptions.ajouter({
      colisId: recu.id,
      relaisId: relais.id,
      recuA: a,
      rappelEnvoyeA: null,
      remiseOuverteA: null,
    });
    if (relais.premierColisA === null) await this.noterPremierColis(relais, a);
    return { colis: vueColisPartenaire(recu), recuLe: a };
  }

  private async noterPremierColis(relais: PointRelaisStocke, a: string): Promise<void> {
    const actuel = await this.repo.trouver(relais.id);
    if (actuel && actuel.premierColisA === null) {
      await this.repo.remplacer({ ...actuel, premierColisA: a }, actuel.version);
    }
  }

  /**
   * `SchemaColisRemisRelais` : remise au destinataire contre son code et sa pièce. Le code est vérifié
   * par `ColisService.executer` (trois essais faux bloquent le colis), jamais ici : sans code valide, le
   * colis ne change pas d'état et le relais ne gagne rien.
   */
  async remettre(
    utilisateur: Utilisateur,
    demande: { colisId: string; code: string; photoRef: string },
  ) {
    const relais = await this.moi(utilisateur);
    const lu = await this.trouverColis(demande.colisId);
    this.verifierDestinataire(lu, relais);
    if (lu.etat !== "en_relais") {
      throw new ErreurColis(409, "etat_incompatible", "Ce colis n'est pas en garde chez vous");
    }

    const remis = await this.colis.executer({
      acteur: this.acteur(utilisateur),
      colis: { id: lu.id },
      action: "remettre",
      code: demande.code,
      pieceVerifiee: true,
      photoRef: demande.photoRef,
    });
    const remisLe = remis.remise?.a ?? this.maintenant();
    await this.receptions.ouvrirRemise(remis.id, null);
    await this.crediter(
      relais,
      `remise:${remis.id}`,
      "remise",
      GAIN_REMISE_RELAIS,
      remis.id,
      remisLe,
    );
    if (relais.premierColisA === null) await this.noterPremierColis(relais, remisLe);
    return { colis: vueColisPartenaire(remis), remisLe, gain: GAIN_REMISE_RELAIS };
  }

  /** Crédite le relais. Un échec ne défait pas la remise : il est noté pour être rattrapé à la main. */
  async crediter(
    relais: PointRelaisStocke,
    cle: string,
    motif: "remise" | "reprise",
    montant: number,
    reference: string,
    at: string,
  ): Promise<void> {
    try {
      await this.portefeuille.crediter({
        cle,
        type: "relais",
        partenaireId: relais.id,
        montant,
        motif,
        reference,
        at,
      });
    } catch (e) {
      this.logger.error(`Gain ${cle} non crédité (${(e as Error).name})`);
      await this.audit.enregistrer({
        action: "relais.gain_non_credite",
        resultat: "echec",
        cible: { type: "relais", id: relais.id },
        details: { cle, montant },
      });
    }
  }
}
