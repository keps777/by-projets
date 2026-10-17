import { JournalWhatsApp, type FiltreComptage, type FiltreMessages } from "./journal";
import type { EssaiWhatsApp, MessageEntrant, MessageWhatsApp, StatutWhatsApp } from "./types";

/** Journal en mémoire (tests, développement). Les lectures rendent des copies, comme une base. */
export class JournalWhatsAppMemoire extends JournalWhatsApp {
  readonly durable = false;
  private readonly messages = new Map<string, MessageWhatsApp>();
  private readonly parCle = new Map<string, string>();
  private readonly journalEssais: EssaiWhatsApp[] = [];
  private readonly entrants = new Map<string, MessageEntrant>();

  async creer(message: MessageWhatsApp): Promise<{ cree: boolean; message: MessageWhatsApp }> {
    const existantId = this.parCle.get(message.cle);
    const existant = existantId ? this.messages.get(existantId) : undefined;
    if (existant) return { cree: false, message: { ...existant } };
    this.messages.set(message.id, { ...message });
    this.parCle.set(message.cle, message.id);
    return { cree: true, message: { ...message } };
  }

  async trouver(id: string): Promise<MessageWhatsApp | null> {
    const m = this.messages.get(id);
    return m ? { ...m } : null;
  }

  async trouverParCle(cle: string): Promise<MessageWhatsApp | null> {
    const id = this.parCle.get(cle);
    return id ? this.trouver(id) : null;
  }

  async trouverParFournisseur(idFournisseur: string): Promise<MessageWhatsApp | null> {
    for (const m of this.messages.values()) {
      if (m.idFournisseur === idFournisseur) return { ...m };
    }
    return null;
  }

  async modifier(
    id: string,
    modifs: Partial<Omit<MessageWhatsApp, "id">>,
    seulementSi?: readonly StatutWhatsApp[],
  ): Promise<MessageWhatsApp | null> {
    const m = this.messages.get(id);
    if (!m) return null;
    if (seulementSi && !seulementSi.includes(m.statut)) return null;
    const maj = { ...m, ...modifs };
    this.messages.set(id, maj);
    return { ...maj };
  }

  async reserverSecours(id: string): Promise<MessageWhatsApp | null> {
    const m = this.messages.get(id);
    if (!m || m.secours !== "aucun") return null;
    const maj: MessageWhatsApp = { ...m, secours: "en_cours" };
    this.messages.set(id, maj);
    return { ...maj };
  }

  async effacerSecoursAvant(avant: Date): Promise<number> {
    let n = 0;
    for (const [id, m] of this.messages) {
      if (m.secoursChiffre !== null && m.creeA < avant) {
        this.messages.set(id, { ...m, secoursChiffre: null });
        n += 1;
      }
    }
    return n;
  }

  async lister(filtre: FiltreMessages): Promise<MessageWhatsApp[]> {
    const lignes = [...this.messages.values()]
      .filter((m) => filtre.compagnieId === undefined || m.compagnieId === filtre.compagnieId)
      .filter((m) => !filtre.type || m.type === filtre.type)
      .filter((m) => !filtre.statut || m.statut === filtre.statut)
      .filter((m) => !filtre.demandeurId || m.demandeurId === filtre.demandeurId)
      .filter(
        (m) =>
          !filtre.reference ||
          (m.reference?.type === filtre.reference.type && m.reference.id === filtre.reference.id),
      )
      .filter((m) => !filtre.du || m.creeA >= filtre.du)
      .filter((m) => !filtre.au || m.creeA < filtre.au)
      .sort((a, b) => b.creeA.getTime() - a.creeA.getTime())
      .map((m) => ({ ...m }));
    return filtre.limite === undefined ? lignes : lignes.slice(0, filtre.limite);
  }

  async compter(filtre: FiltreComptage): Promise<number> {
    return [...this.messages.values()].filter(
      (m) =>
        m.creeA >= filtre.depuis &&
        (!filtre.demandeurId || m.demandeurId === filtre.demandeurId) &&
        (!filtre.destinataireIndex || m.destinataireIndex === filtre.destinataireIndex) &&
        (!filtre.types || filtre.types.includes(m.type)),
    ).length;
  }

  async ajouterEssai(essai: EssaiWhatsApp): Promise<void> {
    this.journalEssais.push({ ...essai });
  }

  async essais(messageId: string): Promise<EssaiWhatsApp[]> {
    return this.journalEssais.filter((e) => e.messageId === messageId).map((e) => ({ ...e }));
  }

  async enregistrerEntrant(entrant: MessageEntrant): Promise<boolean> {
    for (const e of this.entrants.values()) {
      if (e.idFournisseur === entrant.idFournisseur) return false;
    }
    this.entrants.set(entrant.id, { ...entrant });
    return true;
  }

  async dernierEntrant(expediteurIndex: string): Promise<MessageEntrant | null> {
    const liste = [...this.entrants.values()]
      .filter((e) => e.expediteurIndex === expediteurIndex)
      .sort((a, b) => b.recuA.getTime() - a.recuA.getTime());
    return liste[0] ? { ...liste[0] } : null;
  }

  async marquerReponse(
    expediteurIndex: string,
    at: Date,
    fenetreMs: number,
  ): Promise<MessageEntrant | null> {
    const attente = [...this.entrants.values()]
      .filter(
        (e) =>
          e.expediteurIndex === expediteurIndex &&
          e.repondueA === null &&
          e.recuA <= at &&
          at.getTime() - e.recuA.getTime() <= fenetreMs,
      )
      .sort((a, b) => a.recuA.getTime() - b.recuA.getTime())[0];
    if (!attente) return null;
    const maj: MessageEntrant = {
      ...attente,
      repondueA: at,
      delaiReponseMs: at.getTime() - attente.recuA.getTime(),
    };
    this.entrants.set(attente.id, maj);
    return { ...maj };
  }

  async delaisReponse(depuis: Date): Promise<number[]> {
    return [...this.entrants.values()]
      .filter((e) => e.recuA >= depuis && e.delaiReponseMs !== null)
      .map((e) => e.delaiReponseMs as number);
  }
}
