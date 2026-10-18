import { Injectable, Logger } from "@nestjs/common";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { BilletsService } from "../billetterie/billets.service";
import { conflit, inconnu, invalide } from "../billetterie/erreurs";
import type { Billet, DepartComplet } from "../billetterie/modeles";
import { Passagers } from "../billetterie/passagers";
import { Billets, ColisDuDepart, SignataireQr } from "../billetterie/ports";
import { SiegesService } from "../billetterie/sieges.service";
import { DepartsBord, EvenementsBord, VentesBord, exigerUuid } from "./commun.service";
import { MessagesBord, PassagesRoute, VentesEnRoute } from "./ports";
import {
  ETATS_DEPART_ROUTE,
  arretDeMonteeProposee,
  arretNomme,
  estBilletAbord,
  prixDuTrajetPartiel,
  verifierTrajetPartiel,
} from "./regles";
import type { EvenementRouteScan, EvenementRouteVente } from "./schemas";

/** Les ventes en route du jour : combien, pour quel montant (billets non annulés vendus par le convoyeur). */
export interface TotalVentesRoute {
  nombre: number;
  montant: number;
}

/**
 * Le convoyeur à bord : sa vue (scans, places libres, ventes en route, colis à décharger), la vente d'un
 * billet en route et le scan des voyageurs qui montent à un arrêt. Les colis qu'il décharge sont traités
 * par le module colis (`POST /agence/bus/dechargements`).
 */
@Injectable()
export class ConvoyeurService {
  private readonly journal = new Logger("ConvoyeurService");

  constructor(
    private readonly evenements: EvenementsBord,
    private readonly departs: DepartsBord,
    private readonly ventesBord: VentesBord,
    private readonly billets: Billets,
    private readonly billetsService: BilletsService,
    private readonly sieges: SiegesService,
    private readonly signataire: SignataireQr,
    private readonly colis: ColisDuDepart,
    private readonly ventes: VentesEnRoute,
    private readonly passages: PassagesRoute,
    private readonly messages: MessagesBord,
    private readonly passagers: Passagers,
  ) {}

  /* -------------------------------------------------------------- lecture */

  /** Total des ventes en route d'un départ. */
  async totalVentes(departId: string, billets?: readonly Billet[]): Promise<TotalVentesRoute> {
    const [ventes, tous] = await Promise.all([
      this.ventes.duDepart(departId),
      billets ? Promise.resolve(billets) : this.billets.duDepart(departId),
    ]);
    const ids = new Set(ventes.map((v) => v.billetId));
    const valides = tous.filter((b) => ids.has(b.id) && b.etat !== "annule");
    return {
      nombre: valides.length,
      montant: valides.reduce((somme, b) => somme + b.prix + b.bagage, 0),
    };
  }

  /** `GET /agence/bus/convoyeur` : la feuille du convoyeur (planche « Convoyeur »). */
  async etat(u: Utilisateur, departId: string | undefined) {
    const dc = await this.departs.deLEquipage(u, "convoyeur", departId);
    if (!dc.bus || !dc.depart.convoyeur) {
      throw conflit("EQUIPAGE_INCOMPLET", "Le bus ou le convoyeur de ce départ n'est pas affecté");
    }
    const [billets, passages, libres, colis] = await Promise.all([
      this.billets.duDepart(dc.depart.id),
      this.passages.duDepart(dc.depart.id),
      this.sieges.libres(dc),
      this.colis.etat(dc.depart.id),
    ]);
    const aBord = billets.filter(estBilletAbord);
    const nominatifs = aBord.filter((b) => this.passagers.dechiffrer(b.passagerChiffre).nom);

    const arrets = [...dc.ligne.arrets].sort((a, b) => a.ordre - b.ordre);
    const destination = arrets[arrets.length - 1] ?? null;
    const montee = arretDeMonteeProposee(dc, passages);
    const descente = destination ?? montee;
    let prix = dc.ligne.tarifs[dc.depart.classe];
    if (montee.ordre < descente.ordre) prix = prixDuTrajetPartiel(dc, montee, descente);

    return {
      convoyeur: { id: dc.depart.convoyeur.id, nom: dc.depart.convoyeur.nom },
      bus: { id: dc.bus.id, immatriculation: dc.bus.immatriculation },
      departId: dc.depart.id,
      trajet: {
        origine: dc.origine.ville,
        destination: dc.destination.ville,
        partiA: partiA(dc),
      },
      reseau: "en_ligne" as const,
      compteurs: {
        scannesABord: aBord.length,
        sieges: {
          libres: libres.length,
          // Provisoire : les places gardées pour un arrêt (montée en route réservée) ne sont pas encore
          // décrites côté serveur.
          reservees: 0,
          arretReservees: null,
        },
        ventesEnRoute: await this.totalVentes(dc.depart.id, billets),
      },
      vente: {
        arretMontee: montee.nom,
        destination: descente.nom,
        places: 1,
        siege: libres[0] ?? 1,
        prix,
        modes: ["cash", "momo"] as ("cash" | "momo")[],
        saisie: { nom: "", telephone: null },
      },
      colisADecharger: colis.charges,
      listeNominative: { aBord: nominatifs.length },
    };
  }

  /* -------------------------------------------------------------- vente en route */

  /** `route.billet_vendu` : une place vendue en route, numérotée dans la plage du bord. */
  vendre(u: Utilisateur, evt: EvenementRouteVente) {
    return this.evenements.executer(u, evt, async () => {
      const d = evt.donnees;
      exigerUuid(d.billetId, "billetId");
      const dc = await this.departs.deLAgence(u, d.departId);
      this.departs.exigerEquipage(dc, "convoyeur", u);
      this.departs.exigerEtat(
        dc,
        ETATS_DEPART_ROUTE,
        "Ce bus n'est ni à l'embarquement ni en route",
      );
      if (!dc.bus) throw conflit("BUS_NON_AFFECTE", "Aucun bus n'est affecté à ce départ");

      const trajet = verifierTrajetPartiel(dc, d.arretMontee, d.arretDescente);
      if ("probleme" in trajet) {
        const messages = {
          ARRET_INCONNU: "Cet arrêt n'est pas sur la ligne de ce départ",
          ARRETS_INVALIDES: "L'arrêt de montée doit précéder l'arrêt de descente",
          ARRET_SANS_MONTEE: "On ne monte pas à cet arrêt",
        } as const;
        throw invalide(trajet.probleme, messages[trajet.probleme]);
      }
      const attendu = prixDuTrajetPartiel(dc, trajet.montee, trajet.descente);
      if (d.prix !== attendu) {
        throw invalide("PRIX_INCOHERENT", "Le prix ne correspond pas au tarif du tronçon", {
          attendu: { prix: attendu },
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
            telephone: d.passager.telephone,
            pieceQuatreDerniers: null,
          },
          paiement: d.paiement,
          codeBillet: d.codeBillet,
        },
      );
      await this.ventes.ajouter({
        billetId: billet.id,
        departId: dc.depart.id,
        convoyeurId: u.id,
        arretMontee: trajet.montee.nom,
        arretDescente: trajet.descente.nom,
        position: d.gps,
        venduA: evt.at,
      });

      let smsEnvoye = billet.smsEnvoye;
      if (!smsEnvoye && d.passager.telephone) {
        smsEnvoye = await this.messages.envoyerBillet({
          billetId: billet.id,
          numero: billet.numero,
          telephone: d.passager.telephone,
          compagnie: dc.compagnie.nom,
          compagnieId: dc.compagnie.id,
          origine: dc.origine.ville,
          destination: dc.destination.ville,
          departA: dc.depart.heureDepart,
          siege: billet.siege,
          code: billet.codeBillet,
          convoyeurId: u.id,
        });
        if (smsEnvoye) await this.billetsService.marquerSmsEnvoye(billet.id);
      }
      return {
        billet: {
          billetId: billet.id,
          numero: billet.numero,
          siege: d.siege,
          prix: billet.prix,
          smsEnvoye,
        },
        ventesEnRoute: await this.totalVentes(dc.depart.id),
      };
    });
  }

  /* -------------------------------------------------------------- scan à un arrêt */

  /**
   * `route.scanne` : un voyageur monte à un arrêt, le convoyeur scanne son QR. Le QR est vérifié par sa
   * signature. Un billet déjà à bord est reconnu (« déjà à bord ») sans rien changer ; un billet inconnu,
   * annulé ou d'un autre départ est refusé (le contrat ne porte que le compte à bord en réponse).
   */
  scanner(u: Utilisateur, evt: EvenementRouteScan) {
    return this.evenements.executer(u, evt, async () => {
      const d = evt.donnees;
      const dc = await this.departs.deLAgence(u, d.departId);
      this.departs.exigerEquipage(dc, "convoyeur", u);
      this.departs.exigerEtat(
        dc,
        ETATS_DEPART_ROUTE,
        "Ce bus n'est ni à l'embarquement ni en route",
      );
      const arret = arretNomme(dc, d.arret);
      if (!arret) throw invalide("ARRET_INCONNU", "Cet arrêt n'est pas sur la ligne de ce départ");

      // Un QR modifié ou fabriqué n'a pas de signature valide : refusé sans autre indice.
      const contenu = await this.signataire.verifier(d.qr);
      const billet = contenu ? await this.billets.parNumero(contenu.numero) : null;
      if (
        !contenu ||
        !billet ||
        billet.codeBillet !== contenu.code ||
        billet.compagnieId !== dc.compagnie.id
      ) {
        throw inconnu("BILLET_INCONNU", "QR illisible ou billet inconnu");
      }
      if (billet.departId !== dc.depart.id || billet.etat === "reporte") {
        throw conflit("AUTRE_DEPART", "Ce billet n'est pas pour ce départ");
      }
      if (billet.etat === "annule") throw conflit("BILLET_ANNULE", "Ce billet est annulé");

      let resultat: "monte" | "deja_a_bord";
      if (estBilletAbord(billet)) {
        resultat = "deja_a_bord";
      } else if (billet.etat === "paye") {
        const monte = await this.billetsService.embarquer(billet, evt.at, u.id);
        // Un autre appareil vient de scanner ce billet : c'est un double scan.
        resultat = monte ? "monte" : "deja_a_bord";
      } else {
        throw conflit("BILLET_NON_VALIDE", "Ce billet n'est plus valable pour monter", {
          etat: billet.etat,
        });
      }
      const ajoute = await this.passages.ajouter({
        id: evt.id,
        genre: "scan",
        departId: dc.depart.id,
        auteurId: u.id,
        arret: arret.nom,
        billetId: billet.id,
        resultat,
        position: null,
        at: evt.at,
      });
      if (!ajoute) this.journal.debug(`Scan ${evt.id} déjà écrit`);
      const tous = await this.billets.duDepart(dc.depart.id);
      return { scannesABord: tous.filter(estBilletAbord).length };
    });
  }
}

/** Heure réelle du départ du bus (action « partir » de l'historique), sinon l'heure prévue. */
export function partiA(dc: DepartComplet): string {
  const entree = [...dc.depart.historique].reverse().find((h) => h.action === "partir");
  return entree?.at ?? dc.depart.heureDepart;
}
