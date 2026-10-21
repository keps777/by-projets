/**
 * Le canal par lequel les octets ESC/POS arrivent à l'imprimante. La file d'impression et les gabarits ne
 * connaissent que cette interface : Web Bluetooth sur le téléphone du guichet, un transport factice dans
 * les tests et la démo, un greffon natif plus tard (AM-184) avec le même gabarit.
 */

/**
 * - `indisponible` : ce navigateur ne sait pas parler à une imprimante Bluetooth (Safari iOS, Firefox).
 * - `non_appairee` : aucune imprimante choisie sur cet appareil.
 * - `deconnectee` : une imprimante a été choisie mais elle ne répond pas (éteinte, hors de portée).
 * - `connexion` : connexion en cours.
 * - `ok` : prête à recevoir (« imprimante OK »).
 * - `erreur` : la dernière écriture a échoué.
 */
export type EtatLiaison =
  | "indisponible"
  | "non_appairee"
  | "deconnectee"
  | "connexion"
  | "ok"
  | "erreur";

export interface InfosImprimante {
  /** Identifiant Bluetooth de l'appareil, tel que le navigateur le donne. */
  id: string | null;
  nom: string | null;
}

/** État observable du transport. L'objet est remplacé à chaque changement : on peut le comparer par identité. */
export interface InstantaneLiaison {
  etat: EtatLiaison;
  imprimante: InfosImprimante | null;
  /** Message de la dernière erreur ; null si tout va bien. */
  erreur: string | null;
}

export type CodeErreurTransport =
  | "indisponible"
  | "annule"
  | "absente"
  | "connexion"
  | "ecriture"
  | "protocole";

export class ErreurTransport extends Error {
  constructor(
    readonly code: CodeErreurTransport,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ErreurTransport";
  }
}

export interface Transport {
  /** Vrai si ce navigateur peut utiliser ce transport. Faux sur Safari iOS pour Web Bluetooth. */
  readonly disponible: boolean;
  instantane(): InstantaneLiaison;
  /** S'abonne aux changements d'état ; renvoie la fonction qui se désabonne. */
  abonner(ecouteur: () => void): () => void;
  /** Choisit une imprimante. À appeler depuis un geste de l'utilisateur (touche), le navigateur l'exige. */
  appairer(): Promise<void>;
  /** Se reconnecte à l'imprimante déjà choisie, sans geste. Vrai si elle répond. */
  reconnecter(): Promise<boolean>;
  /** Envoie les octets, dans l'ordre. Échoue avec `ErreurTransport` si l'imprimante ne répond pas. */
  envoyer(octets: Uint8Array): Promise<void>;
  /** Oublie l'imprimante choisie. */
  oublier(): Promise<void>;
}

/** Stockage clé -> texte injecté (localStorage en production, mémoire dans les tests). */
export interface StockageCle {
  lire(cle: string): string | null | Promise<string | null>;
  ecrire(cle: string, valeur: string): void | Promise<void>;
  retirer(cle: string): void | Promise<void>;
}

/** Stockage en mémoire : tests, démo, navigateur sans stockage. */
export class StockageMemoire implements StockageCle {
  private readonly valeurs = new Map<string, string>();
  lire(cle: string): string | null {
    return this.valeurs.get(cle) ?? null;
  }
  ecrire(cle: string, valeur: string): void {
    this.valeurs.set(cle, valeur);
  }
  retirer(cle: string): void {
    this.valeurs.delete(cle);
  }
}

/** Petit observable partagé par les implémentations. */
export class EtatObservable {
  private courant: InstantaneLiaison;
  private readonly ecouteurs = new Set<() => void>();

  constructor(initial: InstantaneLiaison) {
    this.courant = initial;
  }

  instantane(): InstantaneLiaison {
    return this.courant;
  }

  changer(partiel: Partial<InstantaneLiaison>): void {
    const suivant = { ...this.courant, ...partiel };
    if (
      suivant.etat === this.courant.etat &&
      suivant.erreur === this.courant.erreur &&
      suivant.imprimante === this.courant.imprimante
    ) {
      return;
    }
    this.courant = suivant;
    for (const ecouteur of [...this.ecouteurs]) ecouteur();
  }

  abonner(ecouteur: () => void): () => void {
    this.ecouteurs.add(ecouteur);
    return () => {
      this.ecouteurs.delete(ecouteur);
    };
  }
}

/** Découpe en paquets d'au plus `taille` octets (MTU Bluetooth Low Energy). */
export function decouperEnPaquets(octets: Uint8Array, taille: number): Uint8Array[] {
  if (!Number.isInteger(taille) || taille < 1) throw new Error("Taille de paquet invalide");
  const paquets: Uint8Array[] = [];
  for (let debut = 0; debut < octets.length; debut += taille) {
    paquets.push(octets.subarray(debut, Math.min(octets.length, debut + taille)));
  }
  return paquets;
}
