import {
  creerAppAgenceTest,
  COMPAGNIE,
  GARE,
  DEBUT,
  type AppAgenceTest,
} from "../../caisse/testing/app-agence-test";
import { evenement, envoyer, type EvenementBrut } from "../../caisse/testing/outils";
import { MS_PAR_HEURE, versIsoDouala } from "../../caisse/temps";
import {
  DemandesAnnulationMemoire,
  EquipeMemoire,
  PinsEquipeMemoire,
  RegistreBilletsMemoire,
  SourceGareMemoire,
} from "../memoire";
import { DemandesAnnulation, EquipeGare, PinsEquipe, RegistreBillets, SourceGare } from "../ports";
import type { BilletAnnulable, MembreEquipe, RoleEquipe } from "../ports";
import { SupervisionModule } from "../supervision.module";

/** Le PIN du superviseur dans les tests (six chiffres, ni suite ni chiffres identiques). */
export const PIN_SUPERVISEUR = "739104";

export interface CompteTest {
  id: string;
  jeton: string;
}

export interface SuperviseurTest extends CompteTest {
  pin: string;
}

/** Un billet payé en cash, pour un départ dans quatre heures (donc annulable sans retenue). */
export function billet(o: Partial<BilletAnnulable> = {}): BilletAnnulable {
  return {
    billetId: "billet-171",
    numero: "AFRI-DLA-261102-0171",
    sequence: 171,
    prix: 7_500,
    classe: "classique",
    etat: "paye",
    gareId: GARE,
    compagnieId: COMPAGNIE,
    depart: {
      departId: "dep-1",
      heureDepart: versIsoDouala(DEBUT.getTime() + 4 * MS_PAR_HEURE),
      destination: "Yaoundé",
      siege: 14,
    },
    voyageur: { nom: "Paul Essomba", pieceQuatreDerniers: "4821" },
    vendu: {
      at: versIsoDouala(DEBUT.getTime() - 30 * 60_000),
      guichetRang: 2,
      mode: "cash",
      agentId: "agent-vendeur",
      agentNom: "Joseph Mbarga",
    },
    scanne: false,
    ...o,
  };
}

/**
 * L'application de l'agence avec la supervision : mêmes comptes et adaptateurs en mémoire que la
 * caisse, plus le registre des billets, l'équipe et les PIN. Les liaisons avec le socle (désactiver
 * un compte, écrire le haché d'un PIN) sont branchées sur les comptes en mémoire.
 */
export async function creerAppSupervisionTest() {
  const base = await creerAppAgenceTest({ modules: [SupervisionModule] });
  const registre = base.app.get(RegistreBillets) as RegistreBilletsMemoire;
  const demandes = base.app.get(DemandesAnnulation) as DemandesAnnulationMemoire;
  const source = base.app.get(SourceGare) as SourceGareMemoire;
  const equipe = base.app.get(EquipeGare) as EquipeMemoire;
  const pins = base.app.get(PinsEquipe) as PinsEquipeMemoire;

  equipe.surDesactivation = (id) => base.personnes.modifier(id, { actif: false });
  pins.surDefinition = (id, pinHache) => base.personnes.modifier(id, { pinHache });

  source.definirGare({
    id: GARE,
    nom: "Gare de Douala",
    quais: 4,
    synchro: { synchronises: 5, total: 5 },
    guichets: [
      { rang: 1, billets: 3 },
      { rang: 2, billets: 41 },
      { rang: 3, billets: 5 },
    ],
    departsApresMidi: [
      {
        departId: "dep-1",
        heureDepart: versIsoDouala(DEBUT.getTime() + 4 * MS_PAR_HEURE),
        destination: "Yaoundé",
        quai: 2,
        bus: "LT 412 AB",
        vendus: 30,
        capacite: 70,
        fusionProposeeAvec: null,
      },
    ],
  });

  /** Un superviseur de Douala qui a défini son PIN. */
  async function superviseur(
    o: { gareId?: string | null; compagnieId?: string | null; nom?: string; pin?: string } = {},
  ): Promise<SuperviseurTest> {
    const pin = o.pin ?? PIN_SUPERVISEUR;
    const c = await base.compte("superviseur", {
      ...(o.gareId !== undefined ? { gareId: o.gareId } : {}),
      ...(o.compagnieId !== undefined ? { compagnieId: o.compagnieId } : {}),
      nom: o.nom ?? "Marie Ngo Bayiha",
      pin,
    });
    return { ...c, pin };
  }

  /** Un membre de l'équipe de Douala : un compte du socle et sa ligne dans l'annuaire. */
  async function membre(
    role: RoleEquipe,
    o: {
      nom?: string;
      gareId?: string;
      guichetId?: string | null;
      affectation?: string | null;
      situationDuJour?: MembreEquipe["situationDuJour"];
      situation?: string | null;
      billets?: number;
      depuis?: string;
    } = {},
  ): Promise<CompteTest> {
    const gareId = o.gareId ?? GARE;
    const c = await base.compte(role, { gareId, ...(o.nom ? { nom: o.nom } : {}) });
    equipe.ajouter({
      personneId: c.id,
      role,
      gareId,
      compagnieId: COMPAGNIE,
      guichetId: o.guichetId ?? null,
      affectation: o.affectation ?? null,
      situationDuJour: o.situationDuJour ?? "en_service",
      situation: o.situation ?? null,
      billets: o.billets ?? 0,
      depuis: o.depuis ?? "2026-01-05T08:00:00.000+01:00",
      actif: true,
    });
    return c;
  }

  /** Les données `validePar` d'un événement, avant d'avoir mis le PIN (sans signature). */
  const sansPreuve = (sup: Pick<CompteTest, "id">) => ({
    superviseurId: sup.id,
    methode: "pin" as const,
  });

  /**
   * Met le PIN : demande la preuve à `POST /agence/superviseur/pin` pour cet événement et renvoie
   * l'événement prêt à envoyer, avec la signature dans `validePar`.
   */
  async function signer(
    sup: SuperviseurTest,
    evt: EvenementBrut,
    pin: string = sup.pin,
  ): Promise<EvenementBrut> {
    const rep = await envoyer(base, "/agence/superviseur/pin", sup.jeton, { pin, evenement: evt });
    if (rep.status !== 200) {
      throw new Error(`Preuve refusée (${rep.status}) : ${JSON.stringify(rep.body)}`);
    }
    return avecPreuve(evt, rep.body.signature as string);
  }

  /** Le même événement avec une signature donnée dans `validePar`. */
  function avecPreuve(evt: EvenementBrut, signature: string): EvenementBrut {
    const donnees = evt.donnees as { validePar: Record<string, unknown> };
    return { ...evt, donnees: { ...evt.donnees, validePar: { ...donnees.validePar, signature } } };
  }

  /** Un événement du superviseur, prêt à faire signer (le `validePar` sans signature y est déjà). */
  function evenementSuperviseur(
    type: string,
    sup: Pick<CompteTest, "id">,
    donnees: Record<string, unknown>,
    o: { at?: string; id?: string } = {},
  ): EvenementBrut {
    return evenement(
      type,
      sup.id,
      { ...donnees, validePar: sansPreuve(sup) },
      { at: o.at ?? base.iso(), appareilId: "SUP-DLA", ...(o.id ? { id: o.id } : {}) },
    );
  }

  /** Dépose une demande d'annulation de la part d'un guichetier et renvoie son identifiant. */
  async function demanderAnnulation(
    guichetier: CompteTest,
    b: BilletAnnulable,
    o: { demandeId?: string; motif?: string } = {},
  ): Promise<string> {
    registre.ajouter(b);
    const demandeId = o.demandeId ?? `dem-${b.billetId}`;
    const rep = await envoyer(
      base,
      "/agence/annulations",
      guichetier.jeton,
      evenement(
        "annulation.demandee",
        guichetier.id,
        { demandeId, billetId: b.billetId, motif: o.motif ?? "Le client a changé d'avis" },
        { at: base.iso() },
      ),
    );
    if (rep.status !== 200) throw new Error(`Demande refusée : ${JSON.stringify(rep.body)}`);
    return demandeId;
  }

  /** Repart d'une gare sans caisse, sans billet, sans demande, alerte ni journal, à 09:00 (Douala). */
  function reinitialiser(): void {
    base.sessions.lignes.clear();
    base.mouvements.vider();
    registre.lignes.clear();
    registre.transitions.length = 0;
    demandes.lignes.clear();
    base.alertes.lignes.length = 0;
    base.journalRepo.lignes.length = 0;
    base.horloge.avancer(DEBUT.getTime() - base.horloge.maintenant().getTime());
  }

  return {
    ...base,
    reinitialiser,
    registre,
    demandes,
    source,
    equipe,
    pins,
    superviseur,
    membre,
    signer,
    avecPreuve,
    evenementSuperviseur,
    demanderAnnulation,
  };
}

export type AppSupervisionTest = Awaited<ReturnType<typeof creerAppSupervisionTest>>;
export type { AppAgenceTest };
