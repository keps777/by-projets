import type { CanalCommandes, CommandeAppareil, RapportEffacement } from "./canal";
import { effacerDonneesLocales, type EnvEffacement } from "./effacement";
import {
  ecrireRepere,
  lireRepere,
  memoriserConservees,
  restaurerConservees,
  type RepereEffacement,
} from "./etat";

/** Intervalle entre deux consultations des ordres : l'effacement part au plus tard 30 s après l'ordre, en ligne. */
export const INTERVALLE_PAR_DEFAUT_MS = 30_000;

export type EtatKiosque =
  | { phase: "libre" }
  | {
      phase: "efface";
      /** Faux tant que l'effacement n'est pas fini (l'écran de verrouillage est déjà affiché). */
      termine: boolean;
      complet: boolean;
      acquitte: boolean;
      effaceA: string;
    };

export interface OptionsSurveillant {
  appareilId: string;
  canal: CanalCommandes;
  intervalleMs?: number;
  /** Environnement à effacer (navigateur par défaut) ; les tests passent un faux. */
  env?: EnvEffacement;
  /**
   * Dernière chance de sauver du travail avant l'effacement, par exemple une synchronisation. Attendue
   * au plus `delaiAvantEffacementMs` : un appareil volé ne doit pas rester utilisable. Par défaut : rien.
   */
  avantEffacement?: () => Promise<void>;
  delaiAvantEffacementMs?: number;
  /** Planificateur (tests) : appelle `f` toutes les `ms` et renvoie la fonction qui arrête. */
  planifier?: (f: () => void, ms: number) => () => void;
}

function planifierParDefaut(f: () => void, ms: number): () => void {
  const id = setInterval(f, ms);
  return () => clearInterval(id);
}

function etatDepuisRepere(repere: RepereEffacement | null): EtatKiosque {
  if (repere?.phase === "efface") {
    return {
      phase: "efface",
      termine: true,
      complet: repere.rapport?.complet ?? true,
      acquitte: repere.acquitte,
      effaceA: repere.rapport?.effaceA ?? repere.commande.emiseA,
    };
  }
  // Pas de repère, ou effacement interrompu : tant qu'il n'est pas fini, l'application ne s'ouvre pas.
  if (!repere) return { phase: "libre" };
  return {
    phase: "efface",
    termine: false,
    complet: false,
    acquitte: false,
    effaceA: repere.commande.emiseA,
  };
}

/**
 * Surveille les ordres du serveur et exécute l'effacement à distance.
 *
 * Déroulé d'un ordre « effacer » :
 *  1. le repère `en_cours` est écrit (si l'application est tuée en route, l'effacement reprend au démarrage) ;
 *  2. `avantEffacement` (facultatif, borné) ;
 *  3. les données locales sont effacées, sauf la langue et le drapeau kiosque ;
 *  4. le repère `efface` est écrit : l'application ne se rouvrira plus tant qu'un superviseur n'a pas remis
 *     l'appareil en service ;
 *  5. l'accusé de réception part au serveur ; en cas d'échec il est retenté à chaque consultation suivante,
 *     y compris après un redémarrage.
 */
export class SurveillantKiosque {
  private readonly options: OptionsSurveillant;
  private arret: (() => void) | null = null;
  private enCours = false;
  /** Un effacement incomplet n'est repris qu'une fois par chargement de page : pas de boucle sur une étape qui échoue toujours. */
  private reprisIncomplet = false;
  private etatCourant: EtatKiosque;
  private readonly abonnes = new Set<() => void>();

  constructor(options: OptionsSurveillant) {
    this.options = options;
    this.etatCourant = etatDepuisRepere(lireRepere());
  }

  etat(): EtatKiosque {
    return this.etatCourant;
  }

  /** Pour `useSyncExternalStore`. */
  abonner = (rappel: () => void): (() => void) => {
    this.abonnes.add(rappel);
    return () => this.abonnes.delete(rappel);
  };

  private changer(etat: EtatKiosque) {
    this.etatCourant = etat;
    for (const rappel of this.abonnes) rappel();
  }

  demarrer(): void {
    if (this.arret) return;
    const planifier = this.options.planifier ?? planifierParDefaut;
    this.arret = planifier(
      () => void this.verifier(),
      this.options.intervalleMs ?? INTERVALLE_PAR_DEFAUT_MS,
    );
    void this.verifier();
  }

  arreter(): void {
    this.arret?.();
    this.arret = null;
  }

  /** Une consultation. Ne lève jamais : un serveur injoignable est le cas normal d'un téléphone sans réseau. */
  async verifier(): Promise<void> {
    if (this.enCours) return;
    this.enCours = true;
    try {
      const repere = lireRepere();
      if (repere?.phase === "en_cours") {
        await this.executer(repere.commande);
      } else if (repere?.phase === "efface") {
        if (repere.rapport && !repere.rapport.complet && !this.reprisIncomplet) {
          this.reprisIncomplet = true;
          await this.executer(repere.commande);
        } else if (!repere.acquitte) {
          await this.acquitter(repere);
        }
      } else {
        const commande = await this.options.canal.prochaineCommande(this.options.appareilId);
        if (commande) await this.executer(commande);
      }
    } catch {
      // Réseau coupé ou serveur en panne : on réessaiera à la prochaine consultation.
    } finally {
      this.enCours = false;
    }
    // Effacé et confirmé au serveur : plus rien à surveiller.
    const etat = this.etatCourant;
    if (etat.phase === "efface" && etat.acquitte && (etat.complet || this.reprisIncomplet))
      this.arreter();
  }

  private async executer(commande: CommandeAppareil): Promise<void> {
    const reprise = lireRepere();
    ecrireRepere({ phase: "en_cours", commande, acquitte: false });
    // Le repère est écrit avant tout : il verrouille déjà l'application pendant l'effacement.
    this.changer({
      phase: "efface",
      termine: false,
      complet: false,
      acquitte: false,
      effaceA: commande.emiseA,
    });

    // Pas de dernière chance quand on reprend un effacement déjà commencé.
    if (this.options.avantEffacement && !reprise) {
      let minuteur: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        this.options.avantEffacement().catch(() => undefined),
        new Promise<void>((resolve) => {
          minuteur = setTimeout(resolve, this.options.delaiAvantEffacementMs ?? 0);
        }),
      ]);
      clearTimeout(minuteur);
    }

    const gardees = memoriserConservees();
    const rapport: RapportEffacement = await effacerDonneesLocales(this.options.env);
    restaurerConservees(gardees);

    const repere: RepereEffacement = { phase: "efface", commande, rapport, acquitte: false };
    ecrireRepere(repere);
    this.changer(etatDepuisRepere(repere));
    await this.acquitter(repere);
  }

  private async acquitter(repere: RepereEffacement): Promise<void> {
    if (!repere.rapport) return;
    await this.options.canal.acquitter(this.options.appareilId, repere.commande, repere.rapport);
    const acquitte = { ...repere, acquitte: true };
    ecrireRepere(acquitte);
    this.changer(etatDepuisRepere(acquitte));
  }
}
