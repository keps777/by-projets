/**
 * Jingle AfriMove de 10 s, joué derrière une interface remplaçable (`Jingle`).
 *
 * La maquette embarque un fichier audio ; il n'est pas disponible hors réseau, donc le jingle est synthétisé avec
 * l'API Web Audio (oscillateurs). Pour passer au vrai fichier, il suffit d'écrire une autre implémentation de
 * `Jingle` (un `HTMLAudioElement` : `jouer` = `play()`, `arreter` = `pause()` + `currentTime = 0`, `position` =
 * `currentTime`) et de la passer à `EcranSplash` (propriété `jingle`) : rien d'autre ne change.
 *
 * Règles de l'interface : rien ne sonne avant `jouer()`, qui n'est appelé que par un toucher (les navigateurs
 * refusent la lecture automatique) ; `arreter()` coupe tout de suite et peut être appelé à tout moment.
 */
export interface Jingle {
  /** Durée du jingle en secondes. */
  readonly duree: number;
  enLecture(): boolean;
  /** Position de lecture en secondes (0 à l'arrêt). */
  position(): number;
  /** Lance la lecture. Rejette si le son est indisponible sur l'appareil. */
  jouer(): Promise<void>;
  arreter(): void;
  /** S'abonne aux changements d'état (début, arrêt, fin naturelle). Renvoie la fonction de désabonnement. */
  abonner(rappel: () => void): () => void;
}

export const DUREE_JINGLE_S = 10;

/** Le son (Web Audio) n'existe pas sur cet appareil ou le navigateur l'a refusé. */
export class ErreurSonIndisponible extends Error {
  constructor(message = "Le son n'est pas disponible") {
    super(message);
    this.name = "ErreurSonIndisponible";
  }
}

export interface NoteJingle {
  /** Instant de début, en secondes depuis le début du jingle. */
  debut: number;
  duree: number;
  /** Numéro de note MIDI (69 = la 440 Hz). */
  midi: number;
  timbre: OscillatorType;
  /** Volume de crête, de 0 à 1. */
  volume: number;
}

const TEMPS = 0.5; // un temps = 0,5 s (120 à la noire), 20 temps = 10 s

function note(
  temps: number,
  dureeTemps: number,
  midi: number,
  timbre: OscillatorType,
  volume: number,
): NoteJingle {
  return { debut: temps * TEMPS, duree: dureeTemps * TEMPS, midi, timbre, volume };
}

const SOL2 = 43;
const DO3 = 48;
const MI4 = 64;
const SOL4 = 67;
const LA4 = 69;
const DO5 = 72;
const RE5 = 74;
const MI5 = 76;
const SOL5 = 79;

/**
 * Partition en do majeur pentatonique, sur les paroles « Où que tu sois, on te trouve : Afri… Move ! » :
 * deux phrases montantes, un appel sur « Afri… », puis l'accord de « Move ! » qui résonne jusqu'à la dixième seconde.
 */
export const PARTITION: readonly NoteJingle[] = [
  // « Où que tu sois, »
  note(0, 1, SOL4, "triangle", 0.5),
  note(1, 1, DO5, "triangle", 0.5),
  note(2, 1, MI5, "triangle", 0.5),
  note(3, 2, RE5, "triangle", 0.45),
  // « on te trouve : »
  note(6, 1, SOL4, "triangle", 0.5),
  note(7, 1, DO5, "triangle", 0.5),
  note(8, 1, MI5, "triangle", 0.5),
  note(9, 2, SOL5, "triangle", 0.45),
  // « Afri… »
  note(12, 1, LA4, "triangle", 0.5),
  note(13, 1, DO5, "triangle", 0.5),
  // basse
  note(0, 5, DO3, "sine", 0.5),
  note(6, 5, DO3, "sine", 0.5),
  note(12, 2, SOL2, "sine", 0.5),
  // « Move ! » : accord de do majeur tenu jusqu'à la fin
  note(14, 6, DO3, "sine", 0.55),
  note(14, 6, MI4, "triangle", 0.3),
  note(14, 6, SOL4, "triangle", 0.3),
  note(14, 6, DO5, "triangle", 0.35),
  note(14, 6, MI5, "sine", 0.25),
];

export function frequenceMidi(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export interface OptionsJingleWebAudio {
  /** Fabrique du contexte audio (tests, ou son indisponible). Par défaut `AudioContext` du navigateur. */
  creerContexte?: () => AudioContext;
}

function contexteDuNavigateur(): AudioContext {
  const global = globalThis as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const fabrique = global.AudioContext ?? global.webkitAudioContext;
  if (!fabrique) throw new ErreurSonIndisponible();
  return new fabrique();
}

/** Volume général : laisse de la marge pour que les cinq notes de l'accord ne saturent pas. */
const VOLUME_GENERAL = 0.35;
const ATTAQUE_S = 0.015;
const COUPURE_S = 0.02;

/** Jingle synthétisé avec des oscillateurs Web Audio. Le contexte audio n'est créé qu'au `jouer()`. */
export function creerJingleWebAudio(options: OptionsJingleWebAudio = {}): Jingle {
  const creerContexte = options.creerContexte ?? contexteDuNavigateur;
  const abonnes = new Set<() => void>();
  let contexte: AudioContext | null = null;
  let general: GainNode | null = null;
  let oscillateurs: OscillatorNode[] = [];
  let debut = 0;
  let minuterie: ReturnType<typeof setTimeout> | null = null;

  const notifier = () => abonnes.forEach((rappel) => rappel());

  function nettoyer() {
    if (minuterie !== null) clearTimeout(minuterie);
    minuterie = null;
    const ctx = contexte;
    const sortie = general;
    const sons = oscillateurs;
    contexte = null;
    general = null;
    oscillateurs = [];
    if (!ctx) return;
    // Coupure en fondu pour éviter le claquement, puis libération du contexte audio.
    try {
      const t = ctx.currentTime;
      if (sortie) {
        sortie.gain.cancelScheduledValues(t);
        sortie.gain.setTargetAtTime(0, t, COUPURE_S / 3);
      }
      for (const son of sons) {
        try {
          son.stop(t + COUPURE_S * 2);
        } catch {
          // Déjà arrêté.
        }
      }
    } catch {
      // Contexte déjà fermé.
    }
    setTimeout(() => void Promise.resolve(ctx.close()).catch(() => undefined), COUPURE_S * 5000);
  }

  function programmer(ctx: AudioContext, sortie: GainNode) {
    const t0 = ctx.currentTime;
    for (const n of PARTITION) {
      const oscillateur = ctx.createOscillator();
      const enveloppe = ctx.createGain();
      oscillateur.type = n.timbre;
      oscillateur.frequency.value = frequenceMidi(n.midi);
      const debutNote = t0 + n.debut;
      const finNote = debutNote + n.duree;
      // Attaque courte, puis décroissance douce jusqu'à la fin de la note.
      enveloppe.gain.setValueAtTime(0, debutNote);
      enveloppe.gain.linearRampToValueAtTime(n.volume, debutNote + ATTAQUE_S);
      enveloppe.gain.exponentialRampToValueAtTime(0.0001, finNote);
      oscillateur.connect(enveloppe);
      enveloppe.connect(sortie);
      oscillateur.start(debutNote);
      oscillateur.stop(finNote + 0.05);
      oscillateurs.push(oscillateur);
    }
  }

  return {
    duree: DUREE_JINGLE_S,
    enLecture: () => contexte !== null,
    position() {
      if (!contexte) return 0;
      return Math.min(DUREE_JINGLE_S, Math.max(0, contexte.currentTime - debut));
    },
    async jouer() {
      if (contexte) return;
      // Le contexte se crée ici, pendant le geste de l'utilisateur : c'est ce qui autorise le son.
      const ctx = creerContexte();
      const sortie = ctx.createGain();
      sortie.gain.value = VOLUME_GENERAL;
      sortie.connect(ctx.destination);
      contexte = ctx;
      general = sortie;
      notifier();
      try {
        await ctx.resume();
      } catch (erreur) {
        if (contexte === ctx) {
          nettoyer();
          notifier();
        }
        throw new ErreurSonIndisponible(erreur instanceof Error ? erreur.message : undefined);
      }
      // Arrêté (ou écran quitté) pendant l'attente : on ne lance rien.
      if (contexte !== ctx) return;
      debut = ctx.currentTime;
      programmer(ctx, sortie);
      minuterie = setTimeout(
        () => {
          nettoyer();
          notifier();
        },
        DUREE_JINGLE_S * 1000 + 100,
      );
    },
    arreter() {
      if (!contexte) return;
      nettoyer();
      notifier();
    },
    abonner(rappel) {
      abonnes.add(rappel);
      return () => abonnes.delete(rappel);
    },
  };
}
