// Jingle de 2 s à la première ouverture, synthétisé avec WebAudio (aucun fichier). Coupé si la personne a réglé « silencieux » (Réglages → sons).
export interface Note { hz: number; debut: number; duree: number; volume: number }
/** Quatre notes montantes (do-mi-sol-do) : tout tient en 2 secondes. */
export const NOTES_JINGLE: Note[] = [
  { hz: 523.25, debut: 0, duree: 0.4, volume: 0.18 }, { hz: 659.25, debut: 0.22, duree: 0.4, volume: 0.18 }, { hz: 783.99, debut: 0.44, duree: 0.45, volume: 0.18 }, { hz: 1046.5, debut: 0.72, duree: 1.28, volume: 0.2 }
];
export const DUREE_JINGLE = Math.max(...NOTES_JINGLE.map((n) => n.debut + n.duree));
type Ctor = typeof AudioContext;
/** Joue le jingle ; renvoie false si le navigateur ne peut pas (pas d'AudioContext, lecture bloquée sans geste). */
export async function jouerJingle(): Promise<boolean> {
  try {
    const Ctx: Ctor | undefined = (globalThis as { AudioContext?: Ctor; webkitAudioContext?: Ctor }).AudioContext ?? (globalThis as { webkitAudioContext?: Ctor }).webkitAudioContext;
    if (!Ctx) return false;
    const ctx = new Ctx();
    if (ctx.state === 'suspended') await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 150))]);
    if (ctx.state !== 'running') { void ctx.close(); return false; }
    const t0 = ctx.currentTime + 0.02;
    for (const n of NOTES_JINGLE) {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = n.hz;
      gain.gain.setValueAtTime(0, t0 + n.debut); gain.gain.linearRampToValueAtTime(n.volume, t0 + n.debut + 0.03); gain.gain.exponentialRampToValueAtTime(0.0008, t0 + n.debut + n.duree);
      osc.connect(gain).connect(ctx.destination); osc.start(t0 + n.debut); osc.stop(t0 + n.debut + n.duree + 0.05);
    }
    setTimeout(() => void ctx.close(), (DUREE_JINGLE + 0.3) * 1000);
    return true;
  } catch { return false; }
}
