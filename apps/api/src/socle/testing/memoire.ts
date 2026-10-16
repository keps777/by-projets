import { randomUUID } from "node:crypto";
import { AuditRepository, type FiltreAudit } from "../audit/audit.repository";
import { EMPREINTE_INITIALE, type LigneAudit } from "../audit/chaine";
import { DefisRepository, type Defi, type ObjetDefi } from "../auth/defis.repository";
import {
  PersonnesRepository,
  TelephoneDejaUtilise,
  type NouvellePersonne,
  type PersonneEnregistree,
} from "../comptes/personnes.repository";
import { EvenementsRepository, type EvenementMetier } from "../evenements/evenements.service";
import { Horloge } from "../horloge";

/** Implémentations en mémoire des ports de persistance : tests unitaires et HTTP sans base. */

export class PersonnesMemoire extends PersonnesRepository {
  readonly lignes = new Map<string, PersonneEnregistree>();

  async trouverParId(id: string) {
    return this.lignes.get(id) ?? null;
  }

  async trouverParTelephoneIndex(index: string) {
    return [...this.lignes.values()].find((p) => p.telephoneIndex === index) ?? null;
  }

  async creer(personne: NouvellePersonne) {
    if ([...this.lignes.values()].some((p) => p.telephoneIndex === personne.telephoneIndex)) {
      throw new TelephoneDejaUtilise();
    }
    const cree: PersonneEnregistree = {
      ...personne,
      id: personne.id ?? randomUUID(),
      roles: [...personne.roles],
      echecsConnexion: 0,
      bloqueJusqua: null,
    };
    this.lignes.set(cree.id, cree);
    return cree;
  }

  async enregistrerEchec(id: string, echecs: number, bloqueJusqua: Date | null) {
    const p = this.lignes.get(id);
    if (p) this.lignes.set(id, { ...p, echecsConnexion: echecs, bloqueJusqua });
  }

  async enregistrerSucces(id: string) {
    const p = this.lignes.get(id);
    if (p) this.lignes.set(id, { ...p, echecsConnexion: 0, bloqueJusqua: null });
  }

  /** Test : modifie un compte (désactivation, retrait de rôle…). */
  modifier(id: string, changement: Partial<PersonneEnregistree>): void {
    const p = this.lignes.get(id);
    if (!p) throw new Error("personne inconnue");
    this.lignes.set(id, { ...p, ...changement });
  }
}

export class DefisMemoire extends DefisRepository {
  readonly lignes = new Map<string, Defi>();

  async creer(defi: Omit<Defi, "essais" | "consommeA" | "creeA"> & { creeA?: Date }) {
    const cree: Defi = { ...defi, essais: 0, consommeA: null, creeA: defi.creeA ?? new Date() };
    this.lignes.set(cree.id, cree);
    return cree;
  }

  async trouver(id: string) {
    const d = this.lignes.get(id);
    return d ? { ...d } : null; // copie : comme une ligne relue en base
  }

  async compterDepuis(objet: ObjetDefi, telephoneIndex: string, depuis: Date) {
    return [...this.lignes.values()].filter(
      (d) => d.objet === objet && d.telephoneIndex === telephoneIndex && d.creeA >= depuis,
    ).length;
  }

  async incrementerEssais(id: string) {
    const d = this.lignes.get(id);
    if (!d) return 0;
    d.essais += 1;
    return d.essais;
  }

  async consommer(id: string, at: Date) {
    const d = this.lignes.get(id);
    if (!d || d.consommeA) return false;
    d.consommeA = at;
    d.telephoneChiffre = null;
    return true;
  }
}

export class AuditMemoire extends AuditRepository {
  readonly lignes: LigneAudit[] = [];
  private prochain = 1n;

  async ajouter(construire: (empreinte: string) => LigneAudit) {
    const derniere = this.lignes[this.lignes.length - 1];
    const ligne = { ...construire(derniere?.hash ?? EMPREINTE_INITIALE), seq: this.prochain++ };
    this.lignes.push(ligne);
    return ligne;
  }

  async lister(filtre: FiltreAudit) {
    return this.lignes
      .filter((l) => filtre.compagnieId === undefined || l.compagnieId === filtre.compagnieId)
      .filter((l) => filtre.avantSeq === undefined || (l.seq ?? 0n) < filtre.avantSeq)
      .sort((a, b) => Number((b.seq ?? 0n) - (a.seq ?? 0n)))
      .slice(0, filtre.limite);
  }

  async lireParLots(apresSeq: bigint, taille: number) {
    return this.lignes.filter((l) => (l.seq ?? 0n) > apresSeq).slice(0, taille);
  }
}

export class EvenementsMemoire extends EvenementsRepository {
  readonly lignes = new Map<string, EvenementMetier>();

  async ajouter(e: EvenementMetier) {
    if (this.lignes.has(e.id)) return false;
    this.lignes.set(e.id, e);
    return true;
  }

  async listerPourCible(cible: EvenementMetier["cible"]) {
    return [...this.lignes.values()].filter(
      (e) => e.cible.type === cible.type && e.cible.id === cible.id,
    );
  }
}

/** Horloge réglable. */
export class HorlogeFixe extends Horloge {
  constructor(private instant = new Date("2026-11-02T08:00:00.000Z")) {
    super();
  }

  maintenant(): Date {
    return new Date(this.instant);
  }

  avancer(ms: number): void {
    this.instant = new Date(this.instant.getTime() + ms);
  }
}
