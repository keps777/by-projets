import { SecoursIndisponible } from "./erreurs";
import {
  AnnuaireRapport,
  GestionnaireEntrants,
  SecoursSms,
  SourceRapportSoir,
  type CompagnieRapport,
  type DemandeSecoursSms,
  type DestinataireRapport,
  type EntrantRecu,
} from "./ports";
import type { RapportSoirEntree } from "./rapport";

/** Adaptateurs en mémoire des ports : développement et tests. */

export class SourceRapportMemoire extends SourceRapportSoir {
  readonly reel = false;
  private readonly liste: CompagnieRapport[] = [];
  private readonly rapports = new Map<string, RapportSoirEntree>();
  /** Test : la prochaine lecture lève cette erreur. */
  panne: Error | null = null;

  ajouter(compagnie: CompagnieRapport, rapport?: RapportSoirEntree): this {
    this.liste.push(compagnie);
    if (rapport) this.rapports.set(`${compagnie.id}:${rapport.jour}`, rapport);
    return this;
  }

  definirRapport(compagnieId: string, rapport: RapportSoirEntree): this {
    this.rapports.set(`${compagnieId}:${rapport.jour}`, rapport);
    return this;
  }

  async compagnies(): Promise<CompagnieRapport[]> {
    return [...this.liste];
  }

  async compagnie(id: string): Promise<CompagnieRapport | null> {
    return this.liste.find((c) => c.id === id) ?? null;
  }

  async rapport(compagnieId: string, jour: string): Promise<RapportSoirEntree | null> {
    if (this.panne) throw this.panne;
    return this.rapports.get(`${compagnieId}:${jour}`) ?? null;
  }
}

export class AnnuaireRapportMemoire extends AnnuaireRapport {
  readonly reel = false;
  private readonly parCompagnie = new Map<string, DestinataireRapport[]>();

  definir(compagnieId: string, destinataires: DestinataireRapport[]): this {
    this.parCompagnie.set(compagnieId, destinataires);
    return this;
  }

  async destinataires(compagnieId: string): Promise<DestinataireRapport[]> {
    return [...(this.parCompagnie.get(compagnieId) ?? [])];
  }
}

/** Repli SMS qui note les demandes ; peut être mis en panne. */
export class SecoursSmsMemoire extends SecoursSms {
  readonly branche = true;
  readonly demandes: DemandeSecoursSms[] = [];
  enPanne = false;
  private readonly parCle = new Map<string, string>();

  async envoyer(demande: DemandeSecoursSms): Promise<{ messageId: string }> {
    if (this.enPanne) throw new SecoursIndisponible("passerelle SMS indisponible");
    const connu = this.parCle.get(demande.cle);
    if (connu) return { messageId: connu };
    const messageId = `sms-${this.parCle.size + 1}`;
    this.parCle.set(demande.cle, messageId);
    this.demandes.push(demande);
    return { messageId };
  }
}

export class GestionnaireEntrantsMemoire extends GestionnaireEntrants {
  readonly recus: EntrantRecu[] = [];
  erreur: Error | null = null;

  async traiter(entrant: EntrantRecu): Promise<void> {
    this.recus.push(entrant);
    if (this.erreur) throw this.erreur;
  }
}
