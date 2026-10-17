import { JournalSms, type FiltreComptage, type FiltreMessages } from "./journal";
import type { EssaiSms, MessageSms, StatutSms } from "./types";

/** Journal en mémoire (tests, développement). Les lectures rendent des copies, comme une base. */
export class JournalMemoire extends JournalSms {
  readonly durable = false;
  private readonly messages = new Map<string, MessageSms>();
  private readonly parCle = new Map<string, string>();
  private readonly journalEssais: EssaiSms[] = [];

  async creer(message: MessageSms): Promise<{ cree: boolean; message: MessageSms }> {
    const existantId = this.parCle.get(message.cle);
    const existant = existantId ? this.messages.get(existantId) : undefined;
    if (existant) return { cree: false, message: { ...existant } };
    this.messages.set(message.id, { ...message });
    this.parCle.set(message.cle, message.id);
    return { cree: true, message: { ...message } };
  }

  async trouver(id: string): Promise<MessageSms | null> {
    const m = this.messages.get(id);
    return m ? { ...m } : null;
  }

  async trouverParCle(cle: string): Promise<MessageSms | null> {
    const id = this.parCle.get(cle);
    return id ? this.trouver(id) : null;
  }

  async trouverParFournisseur(
    fournisseur: string,
    idFournisseur: string,
  ): Promise<MessageSms | null> {
    for (const m of this.messages.values()) {
      if (m.fournisseur === fournisseur && m.idFournisseur === idFournisseur) return { ...m };
    }
    return null;
  }

  async modifier(
    id: string,
    modifs: Partial<Omit<MessageSms, "id">>,
    seulementSi?: readonly StatutSms[],
  ): Promise<MessageSms | null> {
    const m = this.messages.get(id);
    if (!m) return null;
    if (seulementSi && !seulementSi.includes(m.statut)) return null;
    const maj = { ...m, ...modifs };
    this.messages.set(id, maj);
    return { ...maj };
  }

  async lister(filtre: FiltreMessages): Promise<MessageSms[]> {
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

  async ajouterEssai(essai: EssaiSms): Promise<void> {
    this.journalEssais.push({ ...essai });
  }

  async essais(messageId: string): Promise<EssaiSms[]> {
    return this.journalEssais.filter((e) => e.messageId === messageId).map((e) => ({ ...e }));
  }
}
