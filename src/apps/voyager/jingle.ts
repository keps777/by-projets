// Sting sonore d'AfriMove (~1,2 s) joué au « moment de marque » de l'accueil : arpège de ré majeur montant (ré · fa♯ · la · ré aigu),
// timbres doux (sinus + octave en triangle très bas), pad grave sous la dernière note, léger écho. Distinct du jingle d'accueil (do-mi-sol-do, 2 s).
import type { Note } from '../entree/jingle.ts';

export const NOTES_STING: Note[] = [
  { hz: 587.33, debut: 0, duree: 0.34, volume: 0.15 },
  { hz: 739.99, debut: 0.13, duree: 0.34, volume: 0.15 },
  { hz: 880, debut: 0.26, duree: 0.38, volume: 0.15 },
  { hz: 1174.66, debut: 0.46, duree: 0.74, volume: 0.17 }
];
/** Pad grave sous la dernière note (ré 3). */
const PAD: Note = { hz: 146.83, debut: 0.4, duree: 0.8, volume: 0.1 };
export const DUREE_STING = Math.max(...[...NOTES_STING, PAD].map((n) => n.debut + n.duree));
type Ctor = typeof AudioContext;

/** Joue le sting ; renvoie false si le navigateur ne peut pas (pas d'AudioContext, lecture bloquée sans geste). Ne lève jamais. */
export async function jouerSting(): Promise<boolean> {
  try {
    const g = globalThis as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
    const Ctx = g.AudioContext ?? g.webkitAudioContext;
    if (!Ctx) return false;
    const ctx = new Ctx();
    if (ctx.state === 'suspended') await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 150))]);
    if (ctx.state !== 'running') { void ctx.close(); return false; }
    const sortie = ctx.createGain(); sortie.gain.value = 0.9;
    const filtre = ctx.createBiquadFilter(); filtre.type = 'lowpass'; filtre.frequency.value = 3800; filtre.Q.value = 0.4;
    const echo = ctx.createDelay(0.5); echo.delayTime.value = 0.19;
    const retour = ctx.createGain(); retour.gain.value = 0.3;
    const echoVol = ctx.createGain(); echoVol.gain.value = 0.38;
    sortie.connect(filtre); filtre.connect(ctx.destination);
    filtre.connect(echo); echo.connect(retour); retour.connect(echo); echo.connect(echoVol); echoVol.connect(ctx.destination);
    const t0 = ctx.currentTime + 0.02;
    const jouer = (n: Note, type: OscillatorType, mult = 1) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain(), v = n.volume * mult;
      osc.type = type; osc.frequency.value = n.hz;
      gain.gain.setValueAtTime(0, t0 + n.debut); gain.gain.linearRampToValueAtTime(v, t0 + n.debut + 0.025); gain.gain.exponentialRampToValueAtTime(0.0008, t0 + n.debut + n.duree);
      osc.connect(gain).connect(sortie); osc.start(t0 + n.debut); osc.stop(t0 + n.debut + n.duree + 0.05);
    };
    for (const n of NOTES_STING) { jouer(n, 'sine'); jouer({ ...n, hz: n.hz * 2 }, 'triangle', 0.18); }
    jouer(PAD, 'sine');
    setTimeout(() => void ctx.close(), (DUREE_STING + 1.4) * 1000);
    return true;
  } catch { return false; }
}
