// Sonnerie de l'alarme dans l'app (Web Audio, sans fichier). Sur iPhone le son ne démarre qu'après un premier toucher dans l'app :
// `debloquer()` est appelé au premier appui, puis `jouer()` peut sonner quand l'alarme arrive.

type FabriqueContexte = typeof AudioContext;

class Sonnerie {
  #ctx: AudioContext | null = null;
  #t: ReturnType<typeof setInterval> | null = null;

  /** À appeler depuis un geste de l'utilisateur (toucher, clic) : crée et réveille le contexte audio. */
  debloquer(): void {
    if (typeof window === 'undefined') return;
    const Contexte = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: FabriqueContexte }).webkitAudioContext) as FabriqueContexte | undefined;
    if (!Contexte) return;
    this.#ctx ??= new Contexte();
    if (this.#ctx.state === 'suspended') void this.#ctx.resume();
  }

  /** Vrai quand le son peut réellement sortir (contexte réveillé par un geste). */
  get pret(): boolean { return this.#ctx?.state === 'running'; }

  #bip(freq: number, debut: number, duree: number): void {
    const ctx = this.#ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, debut);
    gain.gain.exponentialRampToValueAtTime(0.5, debut + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, debut + duree);
    osc.connect(gain).connect(ctx.destination);
    osc.start(debut);
    osc.stop(debut + duree + 0.05);
  }

  /** Motif « ding-ding-ding… » qui se répète chaque seconde et demie jusqu'à `arreter()`. */
  jouer(): void {
    if (this.#t) return;
    const motif = () => {
      if (!this.pret || !this.#ctx) return;
      const t = this.#ctx.currentTime + 0.02;
      this.#bip(988, t, 0.22);
      this.#bip(1319, t + 0.28, 0.22);
      this.#bip(988, t + 0.56, 0.22);
      this.#bip(1319, t + 0.84, 0.3);
    };
    motif();
    this.#t = setInterval(motif, 1800);
  }

  arreter(): void {
    if (this.#t) clearInterval(this.#t);
    this.#t = null;
  }
}

export const sonnerie = new Sonnerie();
