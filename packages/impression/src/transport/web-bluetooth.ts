import {
  ErreurTransport,
  EtatObservable,
  decouperEnPaquets,
  type InstantaneLiaison,
  type StockageCle,
  type Transport,
} from "./transport";

/* Types minimaux de Web Bluetooth : le DOM de TypeScript ne les fournit pas, et les tests y branchent un faux GATT. */

export interface CaracteristiqueGatt {
  uuid: string;
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValueWithResponse?(valeur: Uint8Array): Promise<void>;
  writeValueWithoutResponse?(valeur: Uint8Array): Promise<void>;
  writeValue?(valeur: Uint8Array): Promise<void>;
}

export interface ServiceGatt {
  uuid: string;
  getCharacteristics(): Promise<CaracteristiqueGatt[]>;
}

export interface ServeurGatt {
  connected: boolean;
  connect(): Promise<ServeurGatt>;
  disconnect(): void;
  getPrimaryServices(): Promise<ServiceGatt[]>;
}

export interface PeripheriqueBluetooth {
  id: string;
  name?: string | undefined;
  gatt?: ServeurGatt | undefined;
  addEventListener(type: "gattserverdisconnected", ecouteur: () => void): void;
  removeEventListener(type: "gattserverdisconnected", ecouteur: () => void): void;
}

export interface Bluetooth {
  requestDevice(options: {
    acceptAllDevices?: boolean;
    filters?: Array<{ services?: string[]; namePrefix?: string }>;
    optionalServices?: string[];
  }): Promise<PeripheriqueBluetooth>;
  /** Absent de certains navigateurs : sans lui, il faut réappairer à chaque rechargement. */
  getDevices?(): Promise<PeripheriqueBluetooth[]>;
}

/**
 * Services GATT d'écriture que les imprimantes thermiques Bluetooth Low Energy du marché exposent (puces
 * Zhuhai/JieLi/ISSC/Microchip). Web Bluetooth n'ouvre que les services déclarés à l'appairage.
 */
export const SERVICES_IMPRIMANTES_BLE = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000fff0-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
];

export const CLE_IMPRIMANTE_APPAIREE = "afrimove.impression.imprimante";

export interface OptionsWebBluetooth {
  /** Pile Bluetooth ; par défaut `navigator.bluetooth`. `null` : indisponible. */
  bluetooth?: Bluetooth | null;
  stockage?: StockageCle;
  services?: string[];
  /** Octets par écriture GATT. 20 est la valeur sûre du MTU de base, 100 à 180 la valeur courante après négociation. */
  taillePaquet?: number;
  /** Pause entre deux écritures : les petites imprimantes ont un tampon réduit et perdent des octets sinon. */
  delaiEntrePaquetsMs?: number;
  attendre?: (ms: number) => Promise<void>;
  /** Programme `action` dans `ms` millisecondes ; renvoie l'annulation. */
  planifier?: (action: () => void, ms: number) => () => void;
  /** Attentes successives entre deux tentatives de reconnexion ; la dernière se répète. */
  delaisReconnexionMs?: number[];
}

/** Web Bluetooth existe-t-il ? Faux sur Safari iOS, sur Firefox et hors contexte sécurisé. */
export function bluetoothDisponible(
  nav: object | undefined = typeof navigator === "undefined" ? undefined : navigator,
): boolean {
  return Boolean(nav && (nav as { bluetooth?: unknown }).bluetooth);
}

const attendreParDefaut = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const planifierParDefaut = (action: () => void, ms: number) => {
  const t = setTimeout(action, ms);
  return () => clearTimeout(t);
};

function messageDe(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

/**
 * Transport Web Bluetooth (Chrome Android, Chrome et Edge de bureau). L'« état imprimante OK » signifie : la
 * liaison GATT est ouverte et une caractéristique d'écriture a été trouvée. Ces imprimantes ne renvoient
 * pas leur état de papier par Bluetooth, « papier vide » ne peut donc pas être détecté ici.
 */
export class TransportWebBluetooth implements Transport {
  readonly disponible: boolean;
  private readonly bluetooth: Bluetooth | null;
  private readonly etat: EtatObservable;
  private readonly stockage: StockageCle | undefined;
  private readonly services: string[];
  private readonly taillePaquet: number;
  private readonly delaiEntrePaquetsMs: number;
  private readonly attendre: (ms: number) => Promise<void>;
  private readonly planifier: (action: () => void, ms: number) => () => void;
  private readonly delaisReconnexionMs: number[];

  private peripherique: PeripheriqueBluetooth | null = null;
  private caracteristique: CaracteristiqueGatt | null = null;
  private annulerReconnexion: (() => void) | null = null;
  private connexionEnCours: Promise<void> | null = null;
  private fileEcriture: Promise<void> = Promise.resolve();
  private oublie = false;

  private readonly surDeconnexion = () => {
    this.caracteristique = null;
    if (this.oublie) return;
    this.etat.changer({ etat: "deconnectee" });
    this.programmerReconnexion(0);
  };

  constructor(options: OptionsWebBluetooth = {}) {
    this.bluetooth =
      options.bluetooth !== undefined
        ? options.bluetooth
        : bluetoothDisponible()
          ? (navigator as unknown as { bluetooth: Bluetooth }).bluetooth
          : null;
    this.disponible = this.bluetooth !== null;
    this.stockage = options.stockage;
    this.services = options.services ?? SERVICES_IMPRIMANTES_BLE;
    this.taillePaquet = options.taillePaquet ?? 100;
    this.delaiEntrePaquetsMs = options.delaiEntrePaquetsMs ?? 10;
    this.attendre = options.attendre ?? attendreParDefaut;
    this.planifier = options.planifier ?? planifierParDefaut;
    this.delaisReconnexionMs = options.delaisReconnexionMs ?? [1000, 2000, 5000, 10_000, 30_000];
    this.etat = new EtatObservable({
      etat: this.disponible ? "non_appairee" : "indisponible",
      imprimante: null,
      erreur: null,
    });
  }

  instantane(): InstantaneLiaison {
    return this.etat.instantane();
  }

  abonner(ecouteur: () => void): () => void {
    return this.etat.abonner(ecouteur);
  }

  async appairer(): Promise<void> {
    const bluetooth = this.exiger();
    let choisi: PeripheriqueBluetooth;
    try {
      choisi = await bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: this.services,
      });
    } catch (erreur) {
      const nom = (erreur as { name?: string } | null)?.name;
      if (nom === "NotFoundError" || nom === "AbortError") {
        throw new ErreurTransport("annule", "Appairage annulé", { cause: erreur });
      }
      throw new ErreurTransport("connexion", messageDe(erreur), { cause: erreur });
    }
    this.oublie = false;
    this.adopter(choisi);
    await this.memoriser(choisi);
    await this.connecter();
  }

  async reconnecter(): Promise<boolean> {
    if (!this.disponible || this.oublie) return false;
    if (this.etat.instantane().etat === "ok" && this.caracteristique) return true;
    if (!this.peripherique) {
      const retrouve = await this.retrouver();
      if (!retrouve) return false;
      this.adopter(retrouve);
    }
    try {
      await this.connecter();
      return true;
    } catch {
      this.programmerReconnexion(0);
      return false;
    }
  }

  async envoyer(octets: Uint8Array): Promise<void> {
    this.exiger();
    const suite = this.fileEcriture.then(() => this.ecrire(octets));
    this.fileEcriture = suite.catch(() => undefined);
    return suite;
  }

  async oublier(): Promise<void> {
    this.oublie = true;
    this.annulerReconnexion?.();
    this.annulerReconnexion = null;
    const peripherique = this.peripherique;
    this.peripherique = null;
    this.caracteristique = null;
    if (peripherique) {
      peripherique.removeEventListener("gattserverdisconnected", this.surDeconnexion);
      if (peripherique.gatt?.connected) peripherique.gatt.disconnect();
    }
    try {
      await this.stockage?.retirer(CLE_IMPRIMANTE_APPAIREE);
    } catch {
      // Stockage indisponible : l'appareil sera simplement ré-proposé à la prochaine reconnexion.
    }
    this.etat.changer({
      etat: this.disponible ? "non_appairee" : "indisponible",
      imprimante: null,
      erreur: null,
    });
  }

  private exiger(): Bluetooth {
    if (!this.bluetooth) {
      throw new ErreurTransport("indisponible", "Web Bluetooth n'existe pas sur ce navigateur");
    }
    return this.bluetooth;
  }

  private adopter(peripherique: PeripheriqueBluetooth): void {
    if (this.peripherique && this.peripherique !== peripherique) {
      this.peripherique.removeEventListener("gattserverdisconnected", this.surDeconnexion);
    }
    this.peripherique = peripherique;
    peripherique.addEventListener("gattserverdisconnected", this.surDeconnexion);
    this.etat.changer({
      imprimante: { id: peripherique.id, nom: peripherique.name ?? null },
    });
  }

  private async memoriser(peripherique: PeripheriqueBluetooth): Promise<void> {
    try {
      await this.stockage?.ecrire(
        CLE_IMPRIMANTE_APPAIREE,
        JSON.stringify({ id: peripherique.id, nom: peripherique.name ?? null }),
      );
    } catch {
      // Sans mémoire, il faudra réappairer après un rechargement : rien de plus.
    }
  }

  /** Retrouve, sans geste, l'imprimante autorisée lors d'une session précédente. */
  private async retrouver(): Promise<PeripheriqueBluetooth | null> {
    const bluetooth = this.bluetooth;
    if (!bluetooth?.getDevices) return null;
    let memorise: { id?: string } | null = null;
    try {
      const brut = await this.stockage?.lire(CLE_IMPRIMANTE_APPAIREE);
      memorise = brut ? (JSON.parse(brut) as { id?: string }) : null;
    } catch {
      memorise = null;
    }
    if (!memorise?.id) return null;
    try {
      const connus = await bluetooth.getDevices();
      return connus.find((p) => p.id === memorise?.id) ?? null;
    } catch {
      return null;
    }
  }

  private connecter(): Promise<void> {
    if (this.connexionEnCours) return this.connexionEnCours;
    const travail = this.ouvrirLiaison().finally(() => {
      this.connexionEnCours = null;
    });
    this.connexionEnCours = travail;
    return travail;
  }

  private async ouvrirLiaison(): Promise<void> {
    const peripherique = this.peripherique;
    if (!peripherique?.gatt) {
      throw new ErreurTransport("connexion", "Cet appareil n'a pas de profil GATT");
    }
    this.etat.changer({ etat: "connexion", erreur: null });
    try {
      const serveur = await peripherique.gatt.connect();
      const services = await serveur.getPrimaryServices();
      let trouvee: CaracteristiqueGatt | null = null;
      for (const service of services) {
        const caracteristiques = await service.getCharacteristics();
        trouvee =
          caracteristiques.find((c) => c.properties.writeWithoutResponse) ??
          caracteristiques.find((c) => c.properties.write) ??
          null;
        if (trouvee) break;
      }
      if (!trouvee) {
        serveur.disconnect();
        throw new ErreurTransport(
          "protocole",
          "Aucune caractéristique d'écriture sur cet appareil",
        );
      }
      this.caracteristique = trouvee;
      this.annulerReconnexion?.();
      this.annulerReconnexion = null;
      this.etat.changer({ etat: "ok", erreur: null });
    } catch (erreur) {
      this.caracteristique = null;
      this.etat.changer({ etat: "deconnectee", erreur: messageDe(erreur) });
      throw erreur instanceof ErreurTransport
        ? erreur
        : new ErreurTransport("connexion", messageDe(erreur), { cause: erreur });
    }
  }

  private programmerReconnexion(rang: number): void {
    if (this.oublie || !this.peripherique) return;
    this.annulerReconnexion?.();
    const attente =
      this.delaisReconnexionMs[Math.min(rang, this.delaisReconnexionMs.length - 1)] ?? 5000;
    this.annulerReconnexion = this.planifier(() => {
      this.annulerReconnexion = null;
      this.connecter().catch(() => this.programmerReconnexion(rang + 1));
    }, attente);
  }

  private async ecrire(octets: Uint8Array): Promise<void> {
    const caracteristique = this.caracteristique;
    if (!caracteristique) throw new ErreurTransport("absente", "Imprimante absente");
    const sansReponse = caracteristique.properties.writeWithoutResponse;
    try {
      const paquets = decouperEnPaquets(octets, this.taillePaquet);
      for (let i = 0; i < paquets.length; i += 1) {
        const paquet = paquets[i];
        if (!paquet) continue;
        if (sansReponse && caracteristique.writeValueWithoutResponse) {
          await caracteristique.writeValueWithoutResponse(paquet);
        } else if (caracteristique.writeValueWithResponse) {
          await caracteristique.writeValueWithResponse(paquet);
        } else if (caracteristique.writeValue) {
          await caracteristique.writeValue(paquet);
        } else {
          throw new ErreurTransport("protocole", "Caractéristique sans méthode d'écriture");
        }
        if (this.delaiEntrePaquetsMs > 0 && i < paquets.length - 1) {
          await this.attendre(this.delaiEntrePaquetsMs);
        }
      }
      if (this.etat.instantane().etat !== "ok") this.etat.changer({ etat: "ok", erreur: null });
    } catch (erreur) {
      const connecte = this.peripherique?.gatt?.connected ?? false;
      if (!connecte) {
        this.caracteristique = null;
        this.etat.changer({ etat: "deconnectee", erreur: messageDe(erreur) });
        this.programmerReconnexion(0);
      } else {
        this.etat.changer({ etat: "erreur", erreur: messageDe(erreur) });
      }
      throw erreur instanceof ErreurTransport
        ? erreur
        : new ErreurTransport("ecriture", messageDe(erreur), { cause: erreur });
    }
  }
}
