import { Injectable } from "@nestjs/common";
import type {
  DemandeCovoit,
  DossierConducteur,
  NoteCovoit,
  Proposition,
  Reservation,
  ResultatPaiementReservation,
  ResultatReservation,
  RoleNote,
  StatutDemande,
  StatutReservation,
  StatutTrajet,
  StatutVersement,
  Trajet,
  TrajetRegulierPassager,
  Versement,
} from "./modeles";
import {
  AnnuaireCovoiturage,
  Demandes,
  Dossiers,
  NotifieurCovoiturage,
  Notes,
  PasserelleVersements,
  ReferentielCovoiturage,
  RemboursementsCovoiturage,
  Reservations,
  Trajets,
  TrajetsReguliersPassagers,
  Versements,
  type ConseilTrajet,
  type DemandeRemboursementCovoiturage,
  type DemandeVersement,
  type FiltreRecherche,
  type FiltreVersements,
  type IdentitePersonne,
  type IssueRemboursement,
  type NotificationCovoiturage,
  type StockageCovoiturage,
} from "./ports";
import { arriveePrevue, normaliser } from "./regles";

/**
 * Adaptateurs en mémoire : développement et tests. Ils copient ce qu'ils rendent (comme une ligne
 * relue en base) et tiennent les mêmes garanties que les index et les transactions de PostgreSQL.
 */

const copie = <T>(valeur: T): T => structuredClone(valeur);

const OCCUPENT = ["en_attente_paiement", "payee"] as const satisfies readonly StatutReservation[];

/* ------------------------------------------------------------------ trajets */

@Injectable()
export class TrajetsMemoire extends Trajets implements StockageCovoiturage {
  readonly durable = false;
  private readonly lignes = new Map<string, Trajet>();
  private readonly vues = new Map<string, Set<string>>();

  async creer(trajet: Trajet): Promise<void> {
    if (this.lignes.has(trajet.id)) throw new Error("Trajet déjà enregistré");
    this.lignes.set(trajet.id, copie(trajet));
  }

  async trouver(id: string) {
    const t = this.lignes.get(id);
    return t ? copie(t) : null;
  }

  async transitionner(
    id: string,
    de: readonly StatutTrajet[],
    changement: Partial<Omit<Trajet, "id">>,
  ) {
    const t = this.lignes.get(id);
    if (!t || !de.includes(t.statut)) return null;
    const apres = { ...t, ...copie(changement) };
    this.lignes.set(id, apres);
    return copie(apres);
  }

  async rechercher(f: FiltreRecherche) {
    return [...this.lignes.values()]
      .filter(
        (t) =>
          t.statut === "publie" &&
          t.type === f.type &&
          t.departA.getTime() >= f.du.getTime() &&
          (f.jusqua === undefined || t.departA.getTime() < f.jusqua.getTime()) &&
          (f.departVille === undefined || normaliser(t.departVille) === f.departVille) &&
          (f.arriveeVille === undefined || normaliser(t.arriveeVille) === f.arriveeVille) &&
          (f.ville === undefined || normaliser(t.departVille) === f.ville),
      )
      .sort((a, b) => a.departA.getTime() - b.departA.getTime())
      .slice(0, f.limite)
      .map(copie);
  }

  async duConducteur(
    conducteurId: string,
    filtre: { statuts?: readonly StatutTrajet[]; depuis?: Date } = {},
  ) {
    return [...this.lignes.values()]
      .filter(
        (t) =>
          t.conducteurId === conducteurId &&
          (filtre.statuts === undefined || filtre.statuts.includes(t.statut)) &&
          (filtre.depuis === undefined || t.departA.getTime() >= filtre.depuis.getTime()),
      )
      .sort((a, b) => a.departA.getTime() - b.departA.getTime())
      .map(copie);
  }

  async aTerminer(maintenant: Date, limite: number) {
    return [...this.lignes.values()]
      .filter(
        (t) =>
          t.statut === "publie" &&
          arriveePrevue(t.departA, t.dureeMinutes).getTime() <= maintenant.getTime(),
      )
      .sort((a, b) => a.departA.getTime() - b.departA.getTime())
      .slice(0, limite)
      .map(copie);
  }

  async aRenouveler(maintenant: Date, limite: number) {
    return [...this.lignes.values()]
      .filter(
        (t) => t.regulier && t.suivantCreeA === null && t.departA.getTime() <= maintenant.getTime(),
      )
      .sort((a, b) => a.departA.getTime() - b.departA.getTime())
      .slice(0, limite)
      .map(copie);
  }

  async marquerSuivant(id: string, at: Date) {
    const t = this.lignes.get(id);
    if (!t || t.suivantCreeA !== null) return false;
    this.lignes.set(id, { ...t, suivantCreeA: at });
    return true;
  }

  async enregistrerVues(trajetIds: readonly string[], voyageurId: string) {
    for (const id of trajetIds) {
      const ensemble = this.vues.get(id) ?? new Set<string>();
      ensemble.add(voyageurId);
      this.vues.set(id, ensemble);
    }
  }

  async nombreVues(trajetId: string) {
    return this.vues.get(trajetId)?.size ?? 0;
  }

  async nombreAnnules(conducteurId: string) {
    return [...this.lignes.values()].filter(
      (t) => t.conducteurId === conducteurId && t.statut === "annule",
    ).length;
  }
}

/* ------------------------------------------------------------------ réservations */

@Injectable()
export class ReservationsMemoire extends Reservations implements StockageCovoiturage {
  readonly durable = false;
  private readonly lignes = new Map<string, Reservation>();

  private prises(trajetId: string, maintenant: Date, sauf?: string): number {
    return [...this.lignes.values()]
      .filter(
        (r) =>
          r.trajetId === trajetId &&
          r.id !== sauf &&
          (r.statut === "payee" ||
            r.statut === "terminee" ||
            (r.statut === "en_attente_paiement" && r.expireA.getTime() > maintenant.getTime())),
      )
      .reduce((s, r) => s + r.places, 0);
  }

  async reserver(
    reservation: Reservation,
    capacite: number,
    maintenant: Date,
  ): Promise<ResultatReservation> {
    const existante = [...this.lignes.values()].find(
      (r) =>
        r.trajetId === reservation.trajetId &&
        r.passagerId === reservation.passagerId &&
        (OCCUPENT as readonly StatutReservation[]).includes(r.statut),
    );
    if (existante) return { ok: false, raison: "deja_reservee", existante: copie(existante) };
    if (this.prises(reservation.trajetId, maintenant) + reservation.places > capacite) {
      return { ok: false, raison: "complet" };
    }
    this.lignes.set(reservation.id, copie(reservation));
    return { ok: true };
  }

  async trouver(id: string) {
    const r = this.lignes.get(id);
    return r ? copie(r) : null;
  }

  async transitionner(
    id: string,
    de: readonly StatutReservation[],
    changement: Partial<Omit<Reservation, "id">>,
  ) {
    const r = this.lignes.get(id);
    if (!r || !de.includes(r.statut)) return null;
    const apres = { ...r, ...copie(changement) };
    this.lignes.set(id, apres);
    return copie(apres);
  }

  async payer(
    id: string,
    capacite: number,
    maintenant: Date,
    changement: Partial<Omit<Reservation, "id">>,
  ): Promise<ResultatPaiementReservation> {
    const r = this.lignes.get(id);
    if (!r) return { ok: false, raison: "inconnue" };
    if (r.statut === "payee" || r.statut === "terminee") {
      return { ok: true, reservation: copie(r), dejaPayee: true };
    }
    if (r.statut === "annulee") return { ok: false, raison: "annulee" };
    const retenueActive =
      r.statut === "en_attente_paiement" && r.expireA.getTime() > maintenant.getTime();
    if (!retenueActive) {
      const autreActive = [...this.lignes.values()].some(
        (x) =>
          x.id !== r.id &&
          x.trajetId === r.trajetId &&
          x.passagerId === r.passagerId &&
          (OCCUPENT as readonly StatutReservation[]).includes(x.statut),
      );
      if (autreActive || this.prises(r.trajetId, maintenant, r.id) + r.places > capacite) {
        return { ok: false, raison: "complet" };
      }
    }
    const apres: Reservation = { ...r, ...copie(changement), statut: "payee" };
    this.lignes.set(id, apres);
    return { ok: true, reservation: copie(apres), dejaPayee: false };
  }

  async duTrajet(trajetId: string) {
    return [...this.lignes.values()]
      .filter((r) => r.trajetId === trajetId)
      .sort((a, b) => a.creeA.getTime() - b.creeA.getTime())
      .map(copie);
  }

  async duPassager(passagerId: string) {
    return [...this.lignes.values()]
      .filter((r) => r.passagerId === passagerId)
      .sort((a, b) => b.departA.getTime() - a.departA.getTime())
      .map(copie);
  }

  async duConducteur(conducteurId: string, statuts?: readonly StatutReservation[]) {
    return [...this.lignes.values()]
      .filter(
        (r) =>
          r.conducteurId === conducteurId && (statuts === undefined || statuts.includes(r.statut)),
      )
      .sort((a, b) => a.creeA.getTime() - b.creeA.getTime())
      .map(copie);
  }

  async placesPrises(trajetId: string, maintenant: Date) {
    return this.prises(trajetId, maintenant);
  }

  async aExpirer(maintenant: Date, limite: number) {
    return [...this.lignes.values()]
      .filter(
        (r) => r.statut === "en_attente_paiement" && r.expireA.getTime() <= maintenant.getTime(),
      )
      .sort((a, b) => a.expireA.getTime() - b.expireA.getTime())
      .slice(0, limite)
      .map(copie);
  }

  async aLiberer(maintenant: Date, limite: number) {
    return [...this.lignes.values()]
      .filter((r) => r.statut === "payee" && r.liberationAutoA.getTime() <= maintenant.getTime())
      .sort((a, b) => a.liberationAutoA.getTime() - b.liberationAutoA.getTime())
      .slice(0, limite)
      .map(copie);
  }
}

/* ------------------------------------------------------------------ conducteurs */

@Injectable()
export class DossiersMemoire extends Dossiers implements StockageCovoiturage {
  readonly durable = false;
  private readonly lignes = new Map<string, DossierConducteur>();

  async trouver(conducteurId: string) {
    const d = this.lignes.get(conducteurId);
    return d ? copie(d) : null;
  }

  async enregistrer(dossier: DossierConducteur) {
    this.lignes.set(dossier.conducteurId, copie(dossier));
  }

  async aVerifier(limite: number) {
    return [...this.lignes.values()]
      .filter((d) => Object.values(d.pieces).some((p) => p?.statut === "a_verifier"))
      .sort((a, b) => a.modifieA.getTime() - b.modifieA.getTime())
      .slice(0, limite)
      .map(copie);
  }

  async tous(limite: number) {
    return [...this.lignes.values()]
      .sort((a, b) => b.modifieA.getTime() - a.modifieA.getTime())
      .slice(0, limite)
      .map(copie);
  }
}

/* ------------------------------------------------------------------ versements */

@Injectable()
export class VersementsMemoire extends Versements implements StockageCovoiturage {
  readonly durable = false;
  private readonly lignes = new Map<string, Versement>();

  async creer(versement: Versement) {
    if ([...this.lignes.values()].some((v) => v.reservationId === versement.reservationId)) {
      return false;
    }
    this.lignes.set(versement.id, copie(versement));
    return true;
  }

  async deLaReservation(reservationId: string) {
    const v = [...this.lignes.values()].find((x) => x.reservationId === reservationId);
    return v ? copie(v) : null;
  }

  async transitionner(
    id: string,
    de: readonly StatutVersement[],
    changement: Partial<Omit<Versement, "id">>,
  ) {
    const v = this.lignes.get(id);
    if (!v || !de.includes(v.statut)) return null;
    const apres = { ...v, ...copie(changement) };
    this.lignes.set(id, apres);
    return copie(apres);
  }

  async aReprendre(maintenant: Date, limite: number) {
    return [...this.lignes.values()]
      .filter(
        (v) =>
          v.statut === "a_faire" &&
          v.prochainEssaiA !== null &&
          v.prochainEssaiA.getTime() <= maintenant.getTime(),
      )
      .sort((a, b) => a.creeA.getTime() - b.creeA.getTime())
      .slice(0, limite)
      .map(copie);
  }

  async duConducteur(conducteurId: string, depuis: Date) {
    return [...this.lignes.values()]
      .filter(
        (v) =>
          v.conducteurId === conducteurId &&
          v.statut === "fait" &&
          v.faitA !== null &&
          v.faitA.getTime() >= depuis.getTime(),
      )
      .map(copie);
  }

  async lister(f: FiltreVersements) {
    return [...this.lignes.values()]
      .filter(
        (v) =>
          (f.statut === undefined || v.statut === f.statut) &&
          (f.depuis === undefined || v.creeA.getTime() >= f.depuis.getTime()),
      )
      .sort((a, b) => b.creeA.getTime() - a.creeA.getTime())
      .slice(0, f.limite)
      .map(copie);
  }
}

/**
 * Versements simulés : rien ne part vers un opérateur. Garde chaque envoi pour les tests, refuse les
 * clés déjà vues (même référence rendue, comme le ferait l'agrégateur) et peut tomber en panne.
 */
@Injectable()
export class PasserelleVersementsSimulee
  extends PasserelleVersements
  implements StockageCovoiturage
{
  readonly durable = false;
  readonly envois: DemandeVersement[] = [];
  /** Nombre d'appels à faire échouer avant de réussir. */
  echecsRestants = 0;
  private readonly references = new Map<string, string>();

  async verser(demande: DemandeVersement) {
    if (this.echecsRestants > 0) {
      this.echecsRestants -= 1;
      throw new Error("Versement simulé en panne");
    }
    const connue = this.references.get(demande.cle);
    if (connue) return { reference: connue };
    const reference = `VERS-${this.references.size + 1}`;
    this.references.set(demande.cle, reference);
    this.envois.push(copie(demande));
    return { reference };
  }
}

/* ------------------------------------------------------------------ demandes, notes, trajet régulier */

@Injectable()
export class DemandesMemoire extends Demandes implements StockageCovoiturage {
  readonly durable = false;
  private readonly lignes = new Map<string, DemandeCovoit>();
  private readonly propositions: Proposition[] = [];

  async creer(demande: DemandeCovoit) {
    this.lignes.set(demande.id, copie(demande));
  }

  async trouver(id: string) {
    const d = this.lignes.get(id);
    return d ? copie(d) : null;
  }

  async transitionner(
    id: string,
    de: readonly StatutDemande[],
    changement: Partial<Omit<DemandeCovoit, "id">>,
  ) {
    const d = this.lignes.get(id);
    if (!d || !de.includes(d.statut)) return null;
    const apres = { ...d, ...copie(changement) };
    this.lignes.set(id, apres);
    return copie(apres);
  }

  async duPassager(passagerId: string) {
    return [...this.lignes.values()]
      .filter((d) => d.passagerId === passagerId)
      .sort((a, b) => a.creeA.getTime() - b.creeA.getTime())
      .map(copie);
  }

  async ouvertes(f: { du: string; au: string; limite: number }) {
    return [...this.lignes.values()]
      .filter((d) => d.statut === "ouverte" && d.jour >= f.du && d.jour <= f.au)
      .sort((a, b) => a.jour.localeCompare(b.jour) || a.creeA.getTime() - b.creeA.getTime())
      .slice(0, f.limite)
      .map(copie);
  }

  async ajouterProposition(p: Proposition) {
    if (
      this.propositions.some(
        (x) =>
          x.demandeId === p.demandeId &&
          x.conducteurId === p.conducteurId &&
          x.trajetId === p.trajetId,
      )
    ) {
      return false;
    }
    this.propositions.push(copie(p));
    return true;
  }

  async propositionsDuConducteur(conducteurId: string) {
    return this.propositions.filter((p) => p.conducteurId === conducteurId).map(copie);
  }

  async propositionsDeLaDemande(demandeId: string) {
    return this.propositions.filter((p) => p.demandeId === demandeId).map(copie);
  }

  async aExpirer(avantJour: string, limite: number) {
    return [...this.lignes.values()]
      .filter((d) => d.statut === "ouverte" && d.jour < avantJour)
      .slice(0, limite)
      .map(copie);
  }
}

@Injectable()
export class NotesMemoire extends Notes implements StockageCovoiturage {
  readonly durable = false;
  private readonly lignes: NoteCovoit[] = [];

  async ajouter(note: NoteCovoit) {
    if (
      this.lignes.some(
        (n) => n.reservationId === note.reservationId && n.roleNote === note.roleNote,
      )
    ) {
      return false;
    }
    this.lignes.push(copie(note));
    return true;
  }

  async deLaPersonne(noteId: string, roleNote: RoleNote) {
    return this.lignes.filter((n) => n.noteId === noteId && n.roleNote === roleNote).map(copie);
  }

  async deLaReservation(reservationId: string) {
    return this.lignes.filter((n) => n.reservationId === reservationId).map(copie);
  }
}

@Injectable()
export class TrajetsReguliersMemoire
  extends TrajetsReguliersPassagers
  implements StockageCovoiturage
{
  readonly durable = false;
  private readonly lignes = new Map<string, TrajetRegulierPassager>();

  async trouver(voyageurId: string) {
    const t = this.lignes.get(voyageurId);
    return t ? copie(t) : null;
  }

  async enregistrer(trajet: TrajetRegulierPassager) {
    this.lignes.set(trajet.voyageurId, copie(trajet));
  }
}

/* ------------------------------------------------------------------ référentiel */

interface VilleConnue {
  code: string;
  nom: string;
}

/** Quelques villes du réseau, avec leur code ; la liste complète vient du référentiel des lignes. */
const VILLES: readonly VilleConnue[] = [
  { code: "DLA", nom: "Douala" },
  { code: "YDE", nom: "Yaoundé" },
  { code: "KRB", nom: "Kribi" },
  { code: "BAF", nom: "Bafoussam" },
  { code: "LBE", nom: "Limbé" },
  { code: "BUE", nom: "Buéa" },
  { code: "EDE", nom: "Édéa" },
  { code: "BTA", nom: "Bertoua" },
  { code: "EBO", nom: "Ebolowa" },
  { code: "BDA", nom: "Bamenda" },
  { code: "NKS", nom: "Nkongsamba" },
];

/**
 * Conseils de prix et de durée. Seul Douala ↔ Kribi vient d'une maquette (« prix conseillé 3 500 à
 * 4 500 », « 2 h 30 ») ; les autres trajets sont inconnus et reçoivent le plafond général.
 */
const CONSEILS: ReadonlyArray<{ a: string; b: string; conseil: ConseilTrajet }> = [
  { a: "douala", b: "kribi", conseil: { prix: { min: 3500, max: 4500 }, dureeMinutes: 150 } },
];

@Injectable()
export class ReferentielMemoire extends ReferentielCovoiturage implements StockageCovoiturage {
  readonly durable = false;

  async ville(codeOuNom: string) {
    const cle = normaliser(codeOuNom);
    const trouvee = VILLES.find((v) => normaliser(v.nom) === cle || v.code.toLowerCase() === cle);
    return trouvee?.nom ?? null;
  }

  async conseil(departVille: string, arriveeVille: string) {
    const d = normaliser(departVille);
    const a = normaliser(arriveeVille);
    const c = CONSEILS.find((x) => (x.a === d && x.b === a) || (x.a === a && x.b === d));
    return c ? copie(c.conseil) : null;
  }
}

/* ------------------------------------------------------------------ comptes, SMS, remboursements (tests) */

@Injectable()
export class AnnuaireMemoire extends AnnuaireCovoiturage {
  private readonly personnes = new Map<string, IdentitePersonne>();

  ajouter(id: string, nom: string, telephone: string | null): void {
    this.personnes.set(id, { nom, telephone });
  }

  async identite(personneId: string) {
    return this.personnes.get(personneId) ?? null;
  }
}

@Injectable()
export class NotifieurMemoire extends NotifieurCovoiturage {
  readonly envoyes: NotificationCovoiturage[] = [];

  async notifier(notification: NotificationCovoiturage) {
    if (this.envoyes.some((n) => n.cle === notification.cle)) return;
    this.envoyes.push(copie(notification));
  }

  /** Textes reçus par une personne, dans l'ordre. */
  pour(personneId: string): string[] {
    return this.envoyes.filter((n) => n.personneId === personneId).map((n) => n.texte);
  }
}

@Injectable()
export class RemboursementsMemoire extends RemboursementsCovoiturage {
  readonly demandes: DemandeRemboursementCovoiturage[] = [];
  issue: IssueRemboursement = "demande";

  async rembourser(demande: DemandeRemboursementCovoiturage) {
    if (!this.demandes.some((d) => d.cle === demande.cle)) this.demandes.push(copie(demande));
    return this.issue;
  }
}
