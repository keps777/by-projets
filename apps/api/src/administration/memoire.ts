import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type {
  ArretLigne,
  BusAdmin,
  ChangementEquipage,
  ClasseDepart,
  CommandeAppareil,
  CompagnieAdmin,
  DepartListe,
  EnrolementAppareil,
  FiltreDeparts,
  GareAdmin,
  HoraireLigne,
  LigneAdmin,
  NouveauBus,
  NouveauDepart,
  PlanLigne,
  OptionsLigne,
  RapportEffacement,
  ReglageLigne,
  SectionsLigne,
} from "./modeles";
import {
  AnnuaireAdmin,
  HoraireEnDouble,
  HoraireInconnu,
  Lignes,
  OrdresAppareils,
  ParcBus,
  Programme,
  RegistreAppareils,
  type DeclarationAppareil,
  type LigneEchue,
  type NouvelleLigne,
  type PublicationLigne,
  type ResultatAcquittement,
  type ResultatCreationDepart,
  type ResultatEnrolement,
  type ResultatEquipage,
  type StockageAdministration,
} from "./ports";
import {
  ETATS_LIBERANT,
  ETATS_MODIFIABLES,
  chercherConflit,
  dureeEffective,
  instantMs,
  type OccupationDepart,
} from "./regles";

/** Adaptateurs en mémoire de l'administration (tests, développement). Le garde-fou de production les refuse. */

const copie = <T>(valeur: T): T => structuredClone(valeur);

@Injectable()
export class AnnuaireAdminMemoire extends AnnuaireAdmin implements StockageAdministration {
  readonly durable = false;
  private readonly compagnies = new Map<string, CompagnieAdmin>();
  private readonly lesGares = new Map<string, GareAdmin>();

  declarerCompagnie(compagnie: CompagnieAdmin): void {
    this.compagnies.set(compagnie.id, { ...compagnie });
  }

  declarerGare(gare: GareAdmin): void {
    this.lesGares.set(gare.id, { ...gare });
  }

  async compagnie(id: string): Promise<CompagnieAdmin | null> {
    return copie(this.compagnies.get(id) ?? null);
  }

  async gare(id: string): Promise<GareAdmin | null> {
    return copie(this.lesGares.get(id) ?? null);
  }

  async gares(compagnieId: string): Promise<GareAdmin[]> {
    return [...this.lesGares.values()]
      .filter((g) => g.compagnieId === compagnieId)
      .sort((a, b) => a.ville.localeCompare(b.ville) || a.nom.localeCompare(b.nom))
      .map(copie);
  }
}

@Injectable()
export class LignesMemoire extends Lignes implements StockageAdministration {
  readonly durable = false;
  private readonly lignes = new Map<string, LigneAdmin>();
  private readonly lesHoraires = new Map<string, HoraireLigne[]>();
  private readonly reglages = new Map<string, ReglageLigne>();

  async trouver(id: string): Promise<LigneAdmin | null> {
    return copie(this.lignes.get(id) ?? null);
  }

  async lister(compagnieId: string): Promise<LigneAdmin[]> {
    return [...this.lignes.values()]
      .filter((l) => l.compagnieId === compagnieId)
      .sort((a, b) => a.code.localeCompare(b.code))
      .map(copie);
  }

  async creer(ligne: NouvelleLigne): Promise<LigneAdmin | null> {
    const pris = [...this.lignes.values()].some(
      (l) => l.compagnieId === ligne.compagnieId && l.code === ligne.code,
    );
    if (pris) return null;
    const creee: LigneAdmin = {
      id: randomUUID(),
      compagnieId: ligne.compagnieId,
      code: ligne.code,
      origineGareId: ligne.origineGareId,
      destinationGareId: ligne.destinationGareId,
      tarifs: { ...ligne.tarifs },
      dureeMinutes: ligne.dureeMinutes,
      arrets: copie(ligne.arrets),
    };
    this.lignes.set(creee.id, creee);
    this.lesHoraires.set(creee.id, []);
    this.reglages.set(creee.id, {
      ligneId: creee.id,
      plan: { ...ligne.plan },
      options: { ...ligne.options },
      brouillon: null,
      effetDu: null,
    });
    return copie(creee);
  }

  /**
   * Déclare une ligne telle que le seed de développement ou la recette la pose (sans réglage, sauf si `reglage`
   * est donné) ; redéclarer une ligne repart de cet état, brouillon compris.
   */
  declarer(ligne: LigneAdmin, horaires: HoraireLigne[] = [], reglage?: ReglageLigne): void {
    this.lignes.set(ligne.id, copie(ligne));
    this.lesHoraires.set(ligne.id, copie(horaires));
    if (reglage) this.reglages.set(ligne.id, copie(reglage));
    else this.reglages.delete(ligne.id);
  }

  async horaires(ligneId: string): Promise<HoraireLigne[]> {
    return copie(this.lesHoraires.get(ligneId) ?? []).sort((a, b) =>
      a.heure.localeCompare(b.heure),
    );
  }

  async reglage(ligneId: string): Promise<ReglageLigne | null> {
    return copie(this.reglages.get(ligneId) ?? null);
  }

  async publier(ligneId: string, p: PublicationLigne): Promise<void> {
    const ligne = this.lignes.get(ligneId);
    if (!ligne) throw new Error(`Ligne inconnue : ${ligneId}`);
    const existants = this.lesHoraires.get(ligneId) ?? [];
    const connus = new Set(existants.map((h) => h.id));
    for (const h of p.horaires)
      if (h.id !== null && !connus.has(h.id)) throw new HoraireInconnu(h.id);
    const heures = new Set<string>();
    for (const h of p.horaires) {
      if (!h.actif) continue;
      if (heures.has(h.heure)) throw new HoraireEnDouble(h.heure);
      heures.add(h.heure);
    }
    this.lesHoraires.set(
      ligneId,
      p.horaires.map((h) => ({
        id: h.id ?? randomUUID(),
        ligneId,
        heure: h.heure,
        classe: h.classe,
        actif: h.actif,
        note: h.note,
        jours: [...h.jours],
      })),
    );
    ligne.tarifs = { ...p.tarifs };
    ligne.arrets = copie(p.arrets);
    this.reglages.set(ligneId, {
      ligneId,
      plan: { ...p.plan },
      options: { ...p.options },
      brouillon: null,
      effetDu: null,
    });
  }

  async programmer(
    ligneId: string,
    sections: SectionsLigne,
    effetDu: string,
    plan: PlanLigne,
    options: OptionsLigne,
  ): Promise<void> {
    const actuel = this.reglages.get(ligneId);
    this.reglages.set(ligneId, {
      ligneId,
      plan: actuel ? { ...actuel.plan } : { ...plan },
      options: actuel ? { ...actuel.options } : { ...options },
      brouillon: copie(sections),
      effetDu,
    });
  }

  async echues(jour: string): Promise<LigneEchue[]> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return [];
    return [...this.reglages.values()]
      .filter((r) => r.brouillon !== null && r.effetDu !== null && r.effetDu <= jour)
      .flatMap((r) => {
        const ligne = this.lignes.get(r.ligneId);
        return ligne ? [{ ligne, effetDu: r.effetDu! }] : [];
      })
      .sort((a, b) => a.effetDu.localeCompare(b.effetDu) || a.ligne.id.localeCompare(b.ligne.id))
      .map(({ ligne }) => ({ compagnieId: ligne.compagnieId, ligneId: ligne.id }));
  }

  async abandonnerBrouillon(ligneId: string): Promise<void> {
    const actuel = this.reglages.get(ligneId);
    if (actuel) this.reglages.set(ligneId, { ...actuel, brouillon: null, effetDu: null });
  }
}

@Injectable()
export class ParcBusMemoire extends ParcBus implements StockageAdministration {
  readonly durable = false;
  private readonly parc = new Map<string, BusAdmin>();

  async trouver(id: string): Promise<BusAdmin | null> {
    return copie(this.parc.get(id) ?? null);
  }

  async lister(compagnieId: string): Promise<BusAdmin[]> {
    return [...this.parc.values()]
      .filter((b) => b.compagnieId === compagnieId)
      .sort((a, b) => a.immatriculation.localeCompare(b.immatriculation))
      .map(copie);
  }

  private immatriculationPrise(
    compagnieId: string,
    immatriculation: string,
    sauf?: string,
  ): boolean {
    return [...this.parc.values()].some(
      (b) =>
        b.compagnieId === compagnieId && b.immatriculation === immatriculation && b.id !== sauf,
    );
  }

  async creer(bus: NouveauBus): Promise<BusAdmin | null> {
    if (this.immatriculationPrise(bus.compagnieId, bus.immatriculation)) return null;
    const cree: BusAdmin = { id: randomUUID(), ...bus };
    this.parc.set(cree.id, cree);
    return copie(cree);
  }

  async modifier(
    id: string,
    changement: Partial<Omit<NouveauBus, "compagnieId">>,
  ): Promise<BusAdmin | "immatriculation_prise" | null> {
    const bus = this.parc.get(id);
    if (!bus) return null;
    if (
      changement.immatriculation !== undefined &&
      this.immatriculationPrise(bus.compagnieId, changement.immatriculation, id)
    ) {
      return "immatriculation_prise";
    }
    Object.assign(bus, changement);
    return copie(bus);
  }

  async capaciteMax(compagnieId: string, classe: ClasseDepart): Promise<number | null> {
    const capacites = [...this.parc.values()]
      .filter((b) => b.compagnieId === compagnieId && b.classe === classe)
      .map((b) => b.capacite);
    return capacites.length > 0 ? Math.max(...capacites) : null;
  }
}

interface DepartStocke extends NouveauDepart {
  compagnieId: string;
}

@Injectable()
export class ProgrammeMemoire extends Programme implements StockageAdministration {
  readonly durable = false;
  private readonly departs = new Map<string, DepartStocke>();
  private readonly billets = new Map<string, number>();

  constructor(private readonly lignes: Lignes) {
    super();
  }

  /** Test : le départ a déjà vendu ce nombre de billets (la billetterie est un autre module). */
  poserBilletsVendus(departId: string, n: number): void {
    this.billets.set(departId, n);
  }

  private async vue(d: DepartStocke): Promise<DepartListe & { compagnieId: string }> {
    const ligne = await this.lignes.trouver(d.ligneId);
    const { historique: _historique, ...depart } = d;
    return {
      ...copie(depart),
      ligneCode: ligne?.code ?? "",
      origineGareId: ligne?.origineGareId ?? "",
      billetsVendus: this.billets.get(d.id) ?? 0,
    };
  }

  private async occupation(d: DepartStocke): Promise<OccupationDepart> {
    const ligne = await this.lignes.trouver(d.ligneId);
    return {
      numero: d.numero,
      debutMs: instantMs(d.heureDepart),
      dureeMinutes: dureeEffective(ligne?.dureeMinutes ?? 0),
      busId: d.busId,
      chauffeurId: d.chauffeurId,
      convoyeurId: d.convoyeurId,
    };
  }

  private async conflit(candidat: DepartStocke) {
    const autres: OccupationDepart[] = [];
    for (const d of this.departs.values()) {
      if (d.id === candidat.id) continue;
      if (d.compagnieId !== candidat.compagnieId) continue;
      if ((ETATS_LIBERANT as readonly string[]).includes(d.etat)) continue;
      autres.push(await this.occupation(d));
    }
    return chercherConflit(await this.occupation(candidat), autres);
  }

  async trouver(id: string): Promise<(DepartListe & { compagnieId: string }) | null> {
    const d = this.departs.get(id);
    return d ? this.vue(d) : null;
  }

  async lister(filtre: FiltreDeparts): Promise<DepartListe[]> {
    const sortie: DepartListe[] = [];
    for (const d of this.departs.values()) {
      if (d.compagnieId !== filtre.compagnieId) continue;
      if (filtre.ligneId && d.ligneId !== filtre.ligneId) continue;
      if (filtre.du && instantMs(d.heureDepart) < instantMs(filtre.du)) continue;
      if (filtre.au && instantMs(d.heureDepart) >= instantMs(filtre.au)) continue;
      const v = await this.vue(d);
      if (filtre.origineGareId && v.origineGareId !== filtre.origineGareId) continue;
      sortie.push(v);
    }
    return sortie.sort(
      (a, b) =>
        instantMs(a.heureDepart) - instantMs(b.heureDepart) || a.numero.localeCompare(b.numero),
    );
  }

  /** Les contrôles de conflit attendent (lecture des lignes) : sans file, deux créations croisées passeraient toutes deux. */
  private file: Promise<unknown> = Promise.resolve();

  private exclusif<T>(travail: () => Promise<T>): Promise<T> {
    const suite = this.file.then(travail, travail);
    this.file = suite.catch(() => undefined);
    return suite;
  }

  creer(depart: NouveauDepart, compagnieId: string): Promise<ResultatCreationDepart> {
    return this.exclusif(() => this.creerSousVerrou(depart, compagnieId));
  }

  equiper(id: string, changement: ChangementEquipage): Promise<ResultatEquipage> {
    return this.exclusif(() => this.equiperSousVerrou(id, changement));
  }

  private async creerSousVerrou(
    depart: NouveauDepart,
    compagnieId: string,
  ): Promise<ResultatCreationDepart> {
    if ([...this.departs.values()].some((d) => d.numero === depart.numero)) {
      return { ok: false, raison: "numero_pris" };
    }
    const stocke: DepartStocke = { ...copie(depart), compagnieId };
    const conflit = await this.conflit(stocke);
    if (conflit) return { ok: false, raison: "occupe", ...conflit };
    this.departs.set(stocke.id, stocke);
    return { ok: true };
  }

  private async equiperSousVerrou(
    id: string,
    changement: ChangementEquipage,
  ): Promise<ResultatEquipage> {
    const d = this.departs.get(id);
    if (!d) return { ok: false, raison: "inconnu" };
    if (!(ETATS_MODIFIABLES as readonly string[]).includes(d.etat)) {
      return { ok: false, raison: "etat", etat: d.etat };
    }
    const billets = this.billets.get(id) ?? 0;
    if (changement.busId !== undefined && changement.busId !== d.busId && billets > 0) {
      return { ok: false, raison: "billets_vendus", billets };
    }
    const suivant: DepartStocke = {
      ...d,
      ...(changement.busId !== undefined ? { busId: changement.busId } : {}),
      ...(changement.chauffeurId !== undefined ? { chauffeurId: changement.chauffeurId } : {}),
      ...(changement.convoyeurId !== undefined ? { convoyeurId: changement.convoyeurId } : {}),
      ...(changement.quai !== undefined ? { quai: changement.quai } : {}),
    };
    const conflit = await this.conflit(suivant);
    if (conflit) return { ok: false, raison: "occupe", ...conflit };
    this.departs.set(id, suivant);
    return { ok: true, depart: await this.vue(suivant) };
  }

  async departsAVenirDuBus(busId: string): Promise<number> {
    return [...this.departs.values()].filter(
      (d) => d.busId === busId && (ETATS_MODIFIABLES as readonly string[]).includes(d.etat),
    ).length;
  }
}

interface EnrolementStocke extends Omit<EnrolementAppareil, "actif" | "codeExpireA"> {
  codeHache: string | null;
  codeExpireA: string | null;
  secretHache: string | null;
}

@Injectable()
export class RegistreAppareilsMemoire extends RegistreAppareils implements StockageAdministration {
  readonly durable = false;
  private readonly appareils = new Map<string, EnrolementStocke>();

  private vue(e: EnrolementStocke): EnrolementAppareil {
    return {
      appareilId: e.appareilId,
      compagnieId: e.compagnieId,
      gareId: e.gareId,
      libelle: e.libelle,
      codeExpireA: e.codeExpireA,
      enroleA: e.enroleA,
      actif: e.secretHache !== null,
      creeA: e.creeA,
    };
  }

  private readonly files = new Map<string, Promise<unknown>>();

  async exclusif<T>(compagnieId: string, travail: () => Promise<T>): Promise<T> {
    const avant = this.files.get(compagnieId) ?? Promise.resolve();
    const suite = avant.then(travail, travail);
    const fin = suite.catch(() => undefined);
    this.files.set(compagnieId, fin);
    try {
      return await suite;
    } finally {
      if (this.files.get(compagnieId) === fin) this.files.delete(compagnieId);
    }
  }

  async declarer(d: DeclarationAppareil): Promise<void> {
    this.appareils.set(d.appareilId, {
      appareilId: d.appareilId,
      compagnieId: d.compagnieId,
      gareId: d.gareId,
      libelle: d.libelle,
      codeHache: d.codeHache,
      codeExpireA: d.codeExpireA,
      secretHache: null,
      enroleA: null,
      creeA: d.creeA,
    });
  }

  async trouver(appareilId: string): Promise<EnrolementAppareil | null> {
    const e = this.appareils.get(appareilId);
    return e ? this.vue(e) : null;
  }

  async lister(filtre: { compagnieId: string; gareId?: string }): Promise<EnrolementAppareil[]> {
    return [...this.appareils.values()]
      .filter(
        (e) =>
          e.compagnieId === filtre.compagnieId && (!filtre.gareId || e.gareId === filtre.gareId),
      )
      .sort((a, b) => a.creeA.localeCompare(b.creeA) || a.appareilId.localeCompare(b.appareilId))
      .map((e) => this.vue(e));
  }

  async nouveauCode(appareilId: string, codeHache: string, expireA: string): Promise<boolean> {
    const e = this.appareils.get(appareilId);
    if (!e) return false;
    e.codeHache = codeHache;
    e.codeExpireA = expireA;
    return true;
  }

  async enroler(codeHache: string, secretHache: string, at: string): Promise<ResultatEnrolement> {
    const e = [...this.appareils.values()].find((x) => x.codeHache === codeHache);
    if (!e || e.codeExpireA === null) return { ok: false, raison: "inconnu" };
    if (instantMs(e.codeExpireA) <= instantMs(at)) return { ok: false, raison: "expire" };
    e.codeHache = null;
    e.codeExpireA = null;
    e.secretHache = secretHache;
    e.enroleA = at;
    return { ok: true, enrolement: this.vue(e) };
  }

  async secretValide(appareilId: string, secretHache: string): Promise<boolean> {
    return this.appareils.get(appareilId)?.secretHache === secretHache;
  }

  async retirer(appareilId: string): Promise<void> {
    const e = this.appareils.get(appareilId);
    if (!e) return;
    e.codeHache = null;
    e.codeExpireA = null;
    e.secretHache = null;
  }
}

interface OrdreStocke extends CommandeAppareil {
  rapport: RapportEffacement | null;
}

@Injectable()
export class OrdresAppareilsMemoire extends OrdresAppareils implements StockageAdministration {
  readonly durable = false;
  private readonly ordres = new Map<string, OrdreStocke>();

  async emettre(ordre: CommandeAppareil): Promise<CommandeAppareil | "deja_en_attente"> {
    const attend = [...this.ordres.values()].some(
      (o) => o.appareilId === ordre.appareilId && o.type === ordre.type && o.acquitteeA === null,
    );
    if (attend) return "deja_en_attente";
    this.ordres.set(ordre.id, { ...ordre, rapport: null });
    return { ...ordre };
  }

  private nu(o: OrdreStocke): CommandeAppareil {
    const { rapport: _rapport, ...ordre } = o;
    return ordre;
  }

  async enAttente(appareilId: string): Promise<CommandeAppareil | null> {
    const o = [...this.ordres.values()]
      .filter((x) => x.appareilId === appareilId && x.acquitteeA === null)
      .sort((a, b) => a.emiseA.localeCompare(b.emiseA))[0];
    return o ? this.nu(o) : null;
  }

  async trouver(id: string): Promise<CommandeAppareil | null> {
    const o = this.ordres.get(id);
    return o ? this.nu(o) : null;
  }

  async dernier(appareilId: string): Promise<CommandeAppareil | null> {
    const o = [...this.ordres.values()]
      .filter((x) => x.appareilId === appareilId)
      .sort((a, b) => b.emiseA.localeCompare(a.emiseA))[0];
    return o ? this.nu(o) : null;
  }

  async acquitter(
    id: string,
    at: string,
    rapport: RapportEffacement,
  ): Promise<ResultatAcquittement> {
    const o = this.ordres.get(id);
    if (!o) return "inconnue";
    if (o.acquitteeA !== null) return "deja_acquittee";
    o.acquitteeA = at;
    o.rapport = copie(rapport);
    return "ok";
  }
}

export type { ArretLigne };
