<script lang="ts">
  /** Durée en heures, minutes et secondes (valeur en secondes) : « 3 h 07 min 36 s » se corrige champ par champ, sans décimales. */
  let { valeur, onchange, label, pas = 300, max = 99 * 3600 }: { valeur: number | null; onchange: (secondes: number | null) => void; label: string; pas?: number; max?: number } = $props();

  const total = $derived(Math.max(0, Math.round(valeur ?? 0)));
  const h = $derived(Math.floor(total / 3600));
  const m = $derived(Math.floor((total % 3600) / 60));
  const s = $derived(total % 60);
  const deux = (n: number) => String(n).padStart(2, '0');

  /** Un champ modifié : on recompose le total, les débordements se reportent (75 min → 1 h 15). Un champ vidé vaut 0 ; tout vide : aucune valeur. */
  function lire(champ: 'h' | 'm' | 's', texte: string) {
    const n = Math.max(0, Math.floor(Number(texte.replace(',', '.').replace(/[^\d.]/g, '')) || 0));
    const t = (champ === 'h' ? n : h) * 3600 + (champ === 'm' ? n : m) * 60 + (champ === 's' ? n : s);
    onchange(Math.min(max, t));
  }
  const bouger = (signe: 1 | -1) => onchange(Math.min(max, Math.max(0, total + signe * pas)));
  const choisir = (e: FocusEvent) => (e.currentTarget as HTMLInputElement).select();
</script>

<div class="temps" role="group" aria-label={label}>
  <button type="button" aria-label="Moins" onclick={() => bouger(-1)}>−</button>
  <label><input class="mono" inputmode="numeric" value={h} aria-label="Heures" onfocus={choisir} onchange={(e) => lire('h', e.currentTarget.value)} /><span>h</span></label>
  <label><input class="mono" inputmode="numeric" value={deux(m)} aria-label="Minutes" onfocus={choisir} onchange={(e) => lire('m', e.currentTarget.value)} /><span>min</span></label>
  <label><input class="mono" inputmode="numeric" value={deux(s)} aria-label="Secondes" onfocus={choisir} onchange={(e) => lire('s', e.currentTarget.value)} /><span>s</span></label>
  <button type="button" aria-label="Plus" onclick={() => bouger(1)}>+</button>
</div>

<style>
  .temps { display: flex; align-items: center; height: 56px; border-radius: 14px; border: 1px solid var(--ligne); background: var(--champ); }
  button { flex: none; width: 48px; height: 54px; border: 0; background: transparent; font-size: 22px; }
  label { flex: 1; min-width: 0; display: flex; align-items: baseline; justify-content: center; gap: 3px; }
  input { width: 3ch; min-width: 0; height: 44px; border: 0; background: transparent; text-align: right; font-size: 20px; font-weight: 600; padding: 0; color: inherit; }
  span { font-size: 13px; font-weight: 500; color: var(--muted); }
</style>
