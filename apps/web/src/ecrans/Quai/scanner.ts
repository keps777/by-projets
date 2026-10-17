/**
 * Caméra du quai, isolée derrière une interface : l'écran ne connaît que `ScannerQr`. Le vrai scanner lit les QR avec
 * `BarcodeDetector` (Chrome Android) ; sans lui, ou sans caméra, l'écran se replie sur la saisie du code à 4 chiffres.
 * Les tests installent un scanner factice (`creerScannerFactice`) et lui font « lire » des QR.
 */
export interface ScannerQr {
  /**
   * Ouvre la caméra, l'affiche dans `video` et appelle `surCode` une fois par QR présenté devant l'objectif.
   * Rejette si la caméra ou le détecteur sont indisponibles (refus de l'agent, pas de caméra).
   */
  demarrer(video: HTMLVideoElement, surCode: (contenu: string) => void): Promise<void>;
  /** Coupe la caméra et la lecture. */
  arreter(): void;
}

/** Crée un scanner, ou `null` quand cet appareil ne sait pas lire de QR (pas de `BarcodeDetector`, pas de caméra). */
export type FabriqueScanner = () => ScannerQr | null;

interface Detecteur {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}
type ConstructeurDetecteur = new (options: { formats: string[] }) => Detecteur;

/** Intervalle de lecture d'une image de la caméra. */
const PERIODE_LECTURE_MS = 150;
/** Un même QR gardé devant l'objectif n'est annoncé qu'une fois dans ce délai. */
const DELAI_MEME_CODE_MS = 3000;

/** Scanner réel : caméra arrière + `BarcodeDetector`. `null` si le navigateur n'a pas les deux. */
export function scannerNavigateur(): ScannerQr | null {
  if (typeof window === "undefined" || typeof navigator === "undefined") return null;
  const Detecteur = (window as unknown as { BarcodeDetector?: ConstructeurDetecteur })
    .BarcodeDetector;
  if (!Detecteur || !navigator.mediaDevices?.getUserMedia) return null;

  let flux: MediaStream | null = null;
  let minuterie: ReturnType<typeof setTimeout> | null = null;
  let arrete = true;

  const couper = () => {
    arrete = true;
    if (minuterie !== null) clearTimeout(minuterie);
    minuterie = null;
    flux?.getTracks().forEach((piste) => piste.stop());
    flux = null;
  };

  return {
    async demarrer(video, surCode) {
      const detecteur = new Detecteur({ formats: ["qr_code"] });
      const obtenu = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      arrete = false;
      flux = obtenu;
      video.srcObject = obtenu;
      video.muted = true;
      await video.play();

      const vus = new Map<string, number>();
      const lire = async () => {
        if (arrete) return;
        try {
          if (video.readyState >= 2) {
            for (const code of await detecteur.detect(video)) {
              const maintenant = performance.now();
              const avant = vus.get(code.rawValue);
              if (avant === undefined || maintenant - avant > DELAI_MEME_CODE_MS) {
                surCode(code.rawValue);
              }
              vus.set(code.rawValue, maintenant);
            }
          }
        } catch {
          // une image illisible n'arrête pas le scan continu
        }
        if (!arrete) minuterie = setTimeout(() => void lire(), PERIODE_LECTURE_MS);
      };
      void lire();
    },
    arreter: couper,
  };
}

/** Scanner pour les tests : `emettre(qr)` simule un QR lu par la caméra. */
export interface ScannerFactice extends ScannerQr {
  /** Vrai entre `demarrer` et `arreter`. */
  readonly demarre: boolean;
  emettre(contenu: string): void;
}

export function creerScannerFactice(options: { refuse?: boolean } = {}): ScannerFactice {
  let surCode: ((contenu: string) => void) | null = null;
  return {
    get demarre() {
      return surCode !== null;
    },
    async demarrer(_video, rappel) {
      if (options.refuse) throw new Error("Caméra refusée");
      surCode = rappel;
    },
    arreter() {
      surCode = null;
    },
    emettre(contenu) {
      if (!surCode) throw new Error("Le scanner factice n'est pas démarré");
      surCode(contenu);
    },
  };
}

let fabrique: FabriqueScanner = scannerNavigateur;

/** Remplace le scanner de l'application (tests) ; sans argument, remet le scanner réel. */
export function installerScanner(suivante: FabriqueScanner = scannerNavigateur): void {
  fabrique = suivante;
}

export function creerScanner(): ScannerQr | null {
  return fabrique();
}
