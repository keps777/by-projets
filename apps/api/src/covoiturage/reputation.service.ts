import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { conflit, inconnu } from "../billetterie/erreurs";
import { Horloge } from "../socle/horloge";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Notes, Reservations } from "./ports";
import { moyenneNotes } from "./regles";

export interface Reputation {
  /** Moyenne sur 5 (une décimale), `null` tant qu'aucune note n'a été donnée. */
  note: number | null;
  /** Trajets menés à leur terme : au moins un passager dont l'argent a été libéré. */
  trajets: number;
}

/**
 * Notes et réputation. Après un trajet terminé (l'argent est libéré), le passager note le conducteur
 * et le conducteur note le passager, une fois chacun, de 1 à 5. Les trajets comptés sont ceux qui ont
 * été menés à leur terme.
 */
@Injectable()
export class ReputationService {
  constructor(
    private readonly notes: Notes,
    private readonly reservations: Reservations,
    private readonly horloge: Horloge,
  ) {}

  async conducteur(conducteurId: string): Promise<Reputation> {
    const [notes, terminees] = await Promise.all([
      this.notes.deLaPersonne(conducteurId, "conducteur"),
      this.reservations.duConducteur(conducteurId, ["terminee"]),
    ]);
    return {
      note: moyenneNotes(notes),
      trajets: new Set(terminees.map((r) => r.trajetId)).size,
    };
  }

  async notePassager(passagerId: string): Promise<number | null> {
    return moyenneNotes(await this.notes.deLaPersonne(passagerId, "passager"));
  }

  /** A-t-il déjà noté cette réservation ? */
  async aNote(reservationId: string, roleNote: "conducteur" | "passager"): Promise<boolean> {
    return (await this.notes.deLaReservation(reservationId)).some((n) => n.roleNote === roleNote);
  }

  /**
   * `qui` note l'autre partie de la réservation. Lève 404 si la personne n'est pas dans la
   * réservation, 409 `PAS_ENCORE_TERMINEE` tant que l'argent n'est pas libéré, 409 `DEJA_NOTE`.
   */
  async noter(
    auteur: Utilisateur,
    reservationId: string,
    valeur: number,
    commentaire: string | undefined,
  ): Promise<{ reservationId: string; note: number }> {
    const r = await this.reservations.trouver(reservationId);
    if (!r || (r.passagerId !== auteur.id && r.conducteurId !== auteur.id)) {
      throw inconnu("RESERVATION_INCONNUE", "Réservation introuvable");
    }
    if (r.statut !== "terminee") {
      throw conflit("PAS_ENCORE_TERMINEE", "Tu pourras noter une fois le trajet terminé");
    }
    const parLePassager = r.passagerId === auteur.id;
    const ajoutee = await this.notes.ajouter({
      id: randomUUID(),
      reservationId,
      noteId: parLePassager ? r.conducteurId : r.passagerId,
      roleNote: parLePassager ? "conducteur" : "passager",
      auteurId: auteur.id,
      valeur,
      commentaire: commentaire ?? null,
      creeA: this.horloge.maintenant(),
    });
    if (!ajoutee) throw conflit("DEJA_NOTE", "Tu as déjà donné ta note pour ce trajet");
    return { reservationId, note: valeur };
  }
}
