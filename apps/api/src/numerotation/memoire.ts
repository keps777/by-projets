import { Injectable } from "@nestjs/common";
import type { AlerteSync } from "../sync/ports";
import {
  AlertesNumerotation,
  PlagesAttribuees,
  RegistreNumeros,
  type AttributionPlage,
  type EntreeRegistre,
  type ResultatAttribution,
  type ResultatReservation,
  type StockageNumerotation,
} from "./ports";
import { plagesSeChevauchent, porteeDe, type GenreNumero, type Plage } from "./regles";

/**
 * Implémentations en mémoire des ports : tests, développement, démonstration. Rien n'y survit à un
 * redémarrage : `NumerotationModule` refuse de démarrer en production avec elles.
 *
 * Chaque méthode vérifie puis écrit sans `await` entre les deux : en JavaScript, c'est atomique,
 * comme l'index unique et la contrainte d'exclusion le seront en PostgreSQL.
 */

@Injectable()
export class PlagesAttribueesMemoire extends PlagesAttribuees implements StockageNumerotation {
  readonly durable = false;
  private readonly lignes = new Map<string, AttributionPlage>();

  async trouver(appareilId: string) {
    const a = this.lignes.get(appareilId);
    return a && a.libereeA === null ? copie(a) : null;
  }

  async lister(filtre: { gareId?: string | null; compagnieId?: string | null } = {}) {
    return [...this.lignes.values()]
      .filter(
        (a) =>
          a.libereeA === null &&
          (filtre.gareId === undefined || a.gareId === filtre.gareId) &&
          (filtre.compagnieId === undefined || a.compagnieId === filtre.compagnieId),
      )
      .map(copie);
  }

  async attribuer(attribution: AttributionPlage): Promise<ResultatAttribution> {
    const portee = porteeDe(attribution);
    for (const autre of this.lignes.values()) {
      if (autre.libereeA !== null || autre.appareilId === attribution.appareilId) continue;
      if (porteeDe(autre) === portee && plagesSeChevauchent(autre.plage, attribution.plage)) {
        return { ok: false, enConflitAvec: copie(autre) };
      }
    }
    this.lignes.set(attribution.appareilId, copie(attribution));
    return { ok: true, attribution: copie(attribution) };
  }

  async liberer(appareilId: string, libereeA: string) {
    const a = this.lignes.get(appareilId);
    if (!a || a.libereeA !== null) return null;
    a.libereeA = libereeA;
    return copie(a);
  }
}

const copie = (a: AttributionPlage): AttributionPlage => ({
  ...a,
  plage: { ...a.plage },
  titulaire: a.titulaire ? { ...a.titulaire } : null,
});

@Injectable()
export class RegistreNumerosMemoire extends RegistreNumeros implements StockageNumerotation {
  readonly durable = false;
  /** `portee|jour|genre|numero` → ligne : la clé est l'index unique. */
  private readonly lignes = new Map<string, EntreeRegistre>();
  private readonly curseurs = new Map<string, number>();
  /** Numéros pris par `prendreSuivant`, par référence : le réessai rend le même numéro. */
  private readonly parReference = new Map<string, number>();

  private static cle(e: Pick<EntreeRegistre, "portee" | "jour" | "genre" | "numero">): string {
    return `${e.portee}|${e.jour}|${e.genre}|${e.numero}`;
  }

  async reserver(entree: EntreeRegistre): Promise<ResultatReservation> {
    const cle = RegistreNumerosMemoire.cle(entree);
    const existante = this.lignes.get(cle);
    if (existante) {
      return existante.evenementId === entree.evenementId
        ? { statut: "rejeu" }
        : { statut: "doublon", evenementIdExistant: existante.evenementId };
    }
    this.lignes.set(cle, { ...entree });
    return { statut: "reserve" };
  }

  async prendreSuivant(demande: Omit<EntreeRegistre, "numero"> & { plage: Plage }) {
    const { plage, ...base } = demande;
    const cleReference = `${base.portee}|${base.jour}|${base.genre}|${base.evenementId}`;
    const dejaPris = this.parReference.get(cleReference);
    if (dejaPris !== undefined) return { numero: dejaPris, nouveau: false };
    // Tout ce qui précède le curseur est déjà pris : on n'a pas à reparcourir la plage depuis le début.
    const cleCurseur = `${base.portee}|${base.jour}|${base.genre}|${plage.debut}`;
    let numero = Math.max(plage.debut, this.curseurs.get(cleCurseur) ?? plage.debut);
    while (
      numero <= plage.fin &&
      this.lignes.has(RegistreNumerosMemoire.cle({ ...base, numero }))
    ) {
      numero += 1;
    }
    if (numero > plage.fin) return null;
    this.lignes.set(RegistreNumerosMemoire.cle({ ...base, numero }), { ...base, numero });
    this.curseurs.set(cleCurseur, numero + 1);
    this.parReference.set(cleReference, numero);
    return { numero, nouveau: true };
  }

  async entrees(portee: string, jour: string, genre: GenreNumero) {
    return [...this.lignes.values()]
      .filter((e) => e.portee === portee && e.jour === jour && e.genre === genre)
      .map((e) => ({ ...e }));
  }

  async duJour(jour: string) {
    return [...this.lignes.values()].filter((e) => e.jour === jour).map((e) => ({ ...e }));
  }
}

@Injectable()
export class AlertesNumerotationMemoire
  extends AlertesNumerotation
  implements StockageNumerotation
{
  readonly durable = false;
  readonly lignes = new Map<string, AlerteSync>();

  async enregistrer(alerte: AlerteSync) {
    this.lignes.set(alerte.id, { ...alerte, details: { ...alerte.details } });
  }

  async lister(filtre: {
    gareId?: string | null;
    compagnieId?: string | null;
    jour?: string;
    ouvertesSeulement?: boolean;
  }) {
    return [...this.lignes.values()]
      .filter(
        (a) =>
          (filtre.gareId === undefined || a.gareId === filtre.gareId) &&
          (filtre.compagnieId === undefined || a.compagnieId === filtre.compagnieId) &&
          (filtre.jour === undefined || a.details["jour"] === filtre.jour) &&
          (!filtre.ouvertesSeulement || a.resolueA === null),
      )
      .map((a) => ({ ...a, details: { ...a.details } }));
  }

  async resoudre(id: string, resolueA: string) {
    const a = this.lignes.get(id);
    if (a && a.resolueA === null) a.resolueA = resolueA;
  }
}
