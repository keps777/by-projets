import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { PersonnesRepository } from "../socle/comptes/personnes.repository";
import { Horloge } from "../socle/horloge";
import { exigerSiegeExistant } from "../billetterie/controles";
import { conflit, inconnu, interdit, invalide } from "../billetterie/erreurs";
import type { DepartComplet } from "../billetterie/modeles";
import { Billets, Catalogue } from "../billetterie/ports";
import { MS_PAR_HEURE, versIsoDouala } from "../billetterie/temps";
import { DepartsBord, EvenementsBord, VentesBord } from "./commun.service";
import type { ControleStocke } from "./modeles";
import { ControlesBord, MessagesBord, PassagesRoute, VentesEnRoute } from "./ports";
import {
  ETATS_DEPART_CONTROLE,
  comptesDe,
  constatsEffectifs,
  convoyeurDuDepart,
  dernierArretAtteint,
  estBilletValide,
  montantDeclareProvisoire,
  tetesComptees,
  type ComptesControle,
} from "./regles";
import type {
  EvenementCloture,
  EvenementRegularise,
  EvenementSiegeVerifie,
  EvenementSignalement,
} from "./schemas";

/** Ce que le contrôleur voit d'un contrôle après chaque geste. */
export interface ResumeControle {
  controleId: string;
  comptes: ComptesControle;
  clos: boolean;
  envoyeAuPatron: boolean;
}

/**
 * Le contrôle inopiné à bord (planche « Controleur »). Le contrôleur compte les têtes siège par siège ; le
 * serveur garde le constat de chaque siège et compare avec la liste du départ. Un voyageur sans billet se
 * régularise (un billet est vendu sur place) ou se signale (le convoyeur n'a pas enregistré sa vente).
 * À la clôture, les trois comptes sont figés et le constat est remis au patron.
 */
@Injectable()
export class ControleService {
  constructor(
    private readonly evenements: EvenementsBord,
    private readonly departs: DepartsBord,
    private readonly ventesBord: VentesBord,
    private readonly catalogue: Catalogue,
    private readonly billets: Billets,
    private readonly controles: ControlesBord,
    private readonly ventes: VentesEnRoute,
    private readonly passages: PassagesRoute,
    private readonly messages: MessagesBord,
    private readonly personnes: PersonnesRepository,
    private readonly horloge: Horloge,
  ) {}

  /* -------------------------------------------------------------- contrôle ouvert */

  /** Le contrôle d'un contrôleur : il n'existe pas pour les autres. */
  private async controleDe(u: Utilisateur, controleId: string): Promise<ControleStocke> {
    const c = await this.controles.trouver(controleId);
    if (!c || c.controleurId !== u.id) throw inconnu("CONTROLE_INCONNU", "Contrôle introuvable");
    return c;
  }

  private async controleOuvert(
    u: Utilisateur,
    controleId: string,
    departId: string,
  ): Promise<ControleStocke> {
    const c = await this.controleDe(u, controleId);
    if (c.clotureA !== null) throw conflit("CONTROLE_CLOS", "Ce contrôle est déjà clos");
    if (c.departId !== departId) {
      throw invalide("DEPART_INCOHERENT", "Ce n'est pas le départ de ce contrôle");
    }
    return c;
  }

  /** Le bus à contrôler : celui demandé, sinon le bus en route le plus récent de la compagnie. */
  private async departAControler(
    u: Utilisateur,
    departId: string | undefined,
  ): Promise<DepartComplet> {
    if (departId) {
      const dc = await this.departs.deLAgence(u, departId);
      this.departs.exigerEtat(
        dc,
        ETATS_DEPART_CONTROLE,
        "Ce bus n'est ni à l'embarquement ni en route",
      );
      return dc;
    }
    if (!u.compagnieId)
      throw interdit("COMPAGNIE_REQUISE", "Ce compte n'est rattaché à aucune compagnie");
    const maintenant = this.horloge.maintenant().getTime();
    const candidats = (
      await this.catalogue.departs({
        compagnieId: u.compagnieId,
        etats: ETATS_DEPART_CONTROLE,
        de: versIsoDouala(maintenant - 24 * MS_PAR_HEURE),
        avant: versIsoDouala(maintenant + 2 * MS_PAR_HEURE),
      })
    ).filter((c) => c.bus !== null);
    const choix = candidats.filter((c) => c.depart.etat === "parti").reverse()[0] ?? candidats[0];
    if (!choix) throw inconnu("AUCUN_DEPART", "Aucun bus à contrôler pour le moment");
    return choix;
  }

  /* -------------------------------------------------------------- lecture */

  /** Les comptes du contrôle : figés à la clôture, sinon calculés sur l'état du bus à l'instant. */
  private async etatDuBus(c: ControleStocke, dc: DepartComplet) {
    const [billets, constats] = await Promise.all([
      this.billets.duDepart(dc.depart.id),
      this.controles.constats(c.id),
    ]);
    const valides = billets.filter(estBilletValide);
    const poses = new Map(constats.map((x) => [x.siege, x.constat] as const));
    const sieges = constatsEffectifs(dc.bus?.capacite ?? 0, valides, poses);
    const vivants = comptesDe(valides.length, tetesComptees(sieges));
    const comptes: ComptesControle =
      c.clotureA !== null && c.liste !== null && c.tetes !== null && c.ecart !== null
        ? { liste: c.liste, tetes: c.tetes, ecart: c.ecart }
        : vivants;
    return { billets, valides, constats, sieges, comptes };
  }

  private async resume(c: ControleStocke, dc: DepartComplet): Promise<ResumeControle> {
    const frais = (await this.controles.trouver(c.id)) ?? c;
    const { comptes } = await this.etatDuBus(frais, dc);
    return {
      controleId: frais.id,
      comptes,
      clos: frais.clotureA !== null,
      envoyeAuPatron: frais.envoyeAuPatron,
    };
  }

  /**
   * `GET /agence/controle/inopine` : le contrôle ouvert du contrôleur, ou un nouveau sur le bus en route.
   * `controleId` relit un contrôle précis (clos compris) ; `departId` (en plus du contrat) choisit le bus.
   */
  async lire(u: Utilisateur, controleId: string | undefined, departId: string | undefined) {
    let controle: ControleStocke;
    if (controleId) {
      controle = await this.controleDe(u, controleId);
    } else {
      const ouvert = await this.controles.ouvertDe(u.id);
      if (ouvert) {
        controle = ouvert;
      } else {
        const dc = await this.departAControler(u, departId);
        const passages = await this.passages.duDepart(dc.depart.id);
        const ouverture = await this.controles.ouvrir({
          id: randomUUID(),
          departId: dc.depart.id,
          controleurId: u.id,
          lieu: dernierArretAtteint(dc, passages).nom,
          ouvertA: this.evenements.maintenant(),
          clotureA: null,
          liste: null,
          tetes: null,
          ecart: null,
          envoyeAuPatron: false,
        });
        controle = ouverture.controle;
      }
    }
    const dc = await this.catalogue.depart(controle.departId);
    if (!dc) throw inconnu("DEPART_INCONNU", "Départ introuvable");
    if (!dc.bus) throw conflit("EQUIPAGE_INCOMPLET", "Aucun bus n'est affecté à ce départ");
    const { valides, constats, sieges, comptes } = await this.etatDuBus(controle, dc);

    // Le voyageur sans billet en cours de traitement : le dernier siège constaté « occupé sans billet ».
    let sansBillet = null;
    if (controle.clotureA === null) {
      const dernier = [...constats]
        .filter((x) => x.constat === "sans_billet")
        .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.siege - a.siege)[0];
      if (dernier) {
        const ventes = new Set((await this.ventes.duDepart(dc.depart.id)).map((v) => v.billetId));
        sansBillet = {
          siege: dernier.siege,
          lieu: controle.lieu,
          at: dernier.at,
          montantDeclare: montantDeclareProvisoire(dc),
          venteEnRouteTrouvee: valides.some((b) => b.siege === dernier.siege && ventes.has(b.id)),
        };
      }
    }
    const personne = await this.personnes.trouverParId(controle.controleurId);
    return {
      controleId: controle.id,
      controleur: { id: controle.controleurId, nom: personne?.nom || "Contrôleur" },
      bus: { id: dc.bus.id, immatriculation: dc.bus.immatriculation },
      departId: dc.depart.id,
      lieu: controle.lieu,
      at: controle.ouvertA,
      comptes,
      sieges,
      sansBillet,
    };
  }

  /* -------------------------------------------------------------- gestes */

  /** `controle.siege_verifie` : le constat d'un siège (billet scanné, occupé sans billet, libre). */
  siegeVerifie(u: Utilisateur, evt: EvenementSiegeVerifie) {
    return this.evenements.executer(u, evt, async () => {
      const d = evt.donnees;
      const controle = await this.controleOuvert(u, d.controleId, d.departId);
      const dc = await this.departs.deLAgence(u, controle.departId);
      exigerSiegeExistant(dc, d.siege);
      await this.controles.constater(controle.id, d.siege, d.constat, evt.at);
      return { controle: await this.resume(controle, dc) };
    });
  }

  /** `controle.regularise` : un voyageur sans billet est régularisé, un billet est vendu sur place. */
  regulariser(u: Utilisateur, evt: EvenementRegularise) {
    return this.evenements.executer(u, evt, async () => {
      const d = evt.donnees;
      const controle = await this.controleOuvert(u, d.controleId, d.departId);
      const dc = await this.departs.deLAgence(u, controle.departId);
      const plein = montantDeclareProvisoire(dc);
      if (d.prix > plein) {
        throw invalide("PRIX_INCOHERENT", "Le prix dépasse le tarif de la ligne", {
          attendu: { prixMax: plein },
        });
      }
      const billet = await this.ventesBord.vendre(
        u,
        {
          id: evt.id,
          at: evt.at,
          appareilId: evt.appareilId,
          numeroPlage: evt.numeroPlage as number,
        },
        {
          dc,
          billetId: d.billetId,
          siege: d.siege,
          prix: d.prix,
          passager: {
            nom: d.passager.nom,
            telephone: null,
            pieceQuatreDerniers: d.passager.pieceQuatreDerniers,
          },
          paiement: d.paiement,
          codeBillet: d.codeBillet,
        },
      );
      await this.controles.regulariser({
        billetId: billet.id,
        controleId: controle.id,
        siege: d.siege,
        prix: billet.prix,
        at: evt.at,
      });
      // Le voyageur a maintenant son billet : son siège est « scanné » dans le constat.
      await this.controles.constater(controle.id, d.siege, "scanne", evt.at);
      return {
        controle: await this.resume(controle, dc),
        billet: { billetId: billet.id, numero: billet.numero, prix: billet.prix },
      };
    });
  }

  /** `controle.convoyeur_signale` : une vente en route que le convoyeur n'a pas enregistrée. */
  signaler(u: Utilisateur, evt: EvenementSignalement) {
    return this.evenements.executer(u, evt, async () => {
      const d = evt.donnees;
      const controle = await this.controleOuvert(u, d.controleId, d.departId);
      const dc = await this.departs.deLAgence(u, controle.departId);
      const convoyeur = dc.depart.convoyeur;
      if (!convoyeur)
        throw conflit("EQUIPAGE_INCOMPLET", "Aucun convoyeur n'est affecté à ce départ");
      // L'écran du contrôleur ne connaît pas le convoyeur : il le désigne par son départ.
      if (d.convoyeurId !== convoyeur.id && d.convoyeurId !== convoyeurDuDepart(dc.depart.id)) {
        throw invalide("CONVOYEUR_INCOHERENT", "Ce n'est pas le convoyeur de ce départ");
      }
      exigerSiegeExistant(dc, d.siege);
      await this.controles.signaler({
        evenementId: evt.id,
        controleId: controle.id,
        departId: dc.depart.id,
        convoyeurId: convoyeur.id,
        siege: d.siege,
        montantDeclare: d.montantDeclare,
        note: d.note,
        at: evt.at,
        patronPrevenu: false,
      });
      const prevenu = await this.messages.prevenirPatron({
        compagnieId: dc.compagnie.id,
        gareId: dc.origine.id,
        texte:
          `AfriMove : contrôle inopiné du bus ${dc.bus?.immatriculation ?? ""} ` +
          `(${dc.origine.ville} > ${dc.destination.ville}). ${convoyeur.nom} est signalé : ` +
          `le voyageur du siège ${d.siege} dit avoir payé ${d.montantDeclare} F sans billet enregistré.`,
      });
      if (prevenu) await this.controles.marquerPatronPrevenu(evt.id);
      return { controle: await this.resume(controle, dc) };
    });
  }

  /**
   * `controle.cloture` : le contrôle est clos, les trois comptes sont figés. Les comptes figés sont ceux du
   * serveur (constats reçus et billets valides à cet instant) : l'écart est toujours `têtes − liste`. Le
   * constat est alors remis au patron (lu dans `controle_inopine`) ; un SMS part en plus quand l'écart n'est
   * pas nul ou qu'un convoyeur a été signalé.
   */
  cloturer(u: Utilisateur, evt: EvenementCloture) {
    return this.evenements.executer(u, evt, async () => {
      const d = evt.donnees;
      const controle = await this.controleOuvert(u, d.controleId, d.departId);
      const dc = await this.departs.deLAgence(u, controle.departId);
      const { comptes } = await this.etatDuBus(controle, dc);
      const clos = await this.controles.clore(controle.id, {
        clotureA: evt.at,
        liste: comptes.liste,
        tetes: comptes.tetes,
        ecart: comptes.ecart,
      });
      if (!clos) throw conflit("CONTROLE_CLOS", "Ce contrôle est déjà clos");
      await this.controles.marquerEnvoye(clos.id);
      const signalements = await this.controles.signalements(clos.id);
      if (comptes.ecart !== 0 || signalements.length > 0) {
        await this.messages.prevenirPatron({
          compagnieId: dc.compagnie.id,
          gareId: dc.origine.id,
          texte:
            `AfriMove : contrôle inopiné du bus ${dc.bus?.immatriculation ?? ""} ` +
            `(${dc.origine.ville} > ${dc.destination.ville}) : ${comptes.tetes} têtes pour ` +
            `${comptes.liste} billets, écart ${comptes.ecart > 0 ? "+" : ""}${comptes.ecart}.` +
            (signalements.length > 0 ? ` Convoyeur signalé ${signalements.length} fois.` : ""),
        });
      }
      return { controle: await this.resume(clos, dc) };
    });
  }
}
