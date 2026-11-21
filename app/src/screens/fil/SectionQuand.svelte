<script lang="ts">
  import { ajouterJours, JOURS_LONGS } from '@core/dates.ts';
  import { disponibilite, journeeTresChargee } from '@core/disponibilite.ts';
  import { idOccurrence } from '@core/ids.ts';
  import { blocsDuJour, creneauxDuJour } from '../../data/requetes.ts';
  import type { FormulaireTache } from './formulaire-tache.svelte.ts';
  import Disponibilite from './Disponibilite.svelte';
  import { cap, dateCourte, dateLongue, dureeMin, hm } from './format.ts';
  import { choixMensuels, optionsDuree, optionsJours, REPETITIONS, texteJours, type Repetition, type TypeFin } from './tache.ts';

  /** Étape « Quand » (spec §7, simplifié en nov. 2026) : une carte, quatre menus (jour, heure, durée, répétition) ; le reste n'apparaît que si le choix l'exige. */
  let { f, numero, aujourdhui, tacheId }: { f: FormulaireTache; numero: number; aujourdhui: string; tacheId?: string } = $props();

  const LETTRES = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const HEURES = Array.from({ length: 24 }, (_, i) => i);
  const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

  const jours = $derived(optionsJours(aujourdhui, f.debut, ajouterJours));
  const libelleJour = (j: string) => (j === aujourdhui ? 'Aujourd’hui · ' : j === ajouterJours(aujourdhui, 1) ? 'Demain · ' : '') + cap(dateLongue(j));
  const durees = $derived(optionsDuree(f.duree));
  const minutes = $derived(f.heure % 5 ? [...MINUTES, f.heure % 60].sort((a, b) => a - b) : MINUTES);
  const fins = $derived<{ valeur: TypeFin; label: string }[]>([
    { valeur: 'aucune', label: 'Sans fin' }, { valeur: 'date', label: `Jusqu’au ${dateCourte(f.finDate || f.debut)}` }, { valeur: 'fois', label: `Après ${f.finFois} fois` }
  ]);

  let autreDate = $state(false);
  const creneaux = $derived(f.debut ? creneauxDuJour(f.debut, tacheId ? idOccurrence(tacheId, f.debut) : undefined) : []);
  const dispo = $derived(disponibilite(creneaux, f.heure, f.duree));
  const occupant = $derived(dispo.occupePar ? blocsDuJour(f.debut).find((b) => b.occ.id === dispo.occupePar!.id) : undefined);
  const chargee = $derived(journeeTresChargee([...creneaux, { debut: f.heure, fin: f.heure + f.duree, titre: f.titre }]));

  const borner = (m: number) => Math.max(0, Math.min(1440 - f.duree, m));
  const lire = (e: Event) => (e.currentTarget as HTMLSelectElement).value;
  function choisirJour(e: Event) {
    const v = lire(e);
    if (v === 'autre') { autreDate = true; return; }
    autreDate = false;
    f.choisirDebut(v);
  }
  function choisirDate(e: Event) { const v = lire(e); if (v) f.choisirDebut(v); }
  /** Change la durée ; si la tâche débordait minuit, elle commence plus tôt. */
  function regler(d: number) { f.duree = d; f.heure = Math.min(f.heure, 1440 - f.duree); }
  function basculerJour(i: number) {
    if (f.jours.includes(i)) { if (f.jours.length > 1) f.jours = f.jours.filter((x) => x !== i); }
    else f.jours = [...f.jours, i];
  }
</script>

<div class="section">
  <span class="etiquette">{numero} · Quand</span>

  <div class="carte quand">
    <label class="rang"><span class="nom">{f.rec === 'une_fois' ? 'Jour' : 'À partir du'}</span>
      <select aria-label={f.rec === 'une_fois' ? 'Quel jour ?' : 'À partir de quel jour ?'} value={f.debut} onchange={choisirJour}>
        {#each jours as j (j)}<option value={j}>{libelleJour(j)}</option>{/each}
        <option value="autre">Autre date…</option>
      </select>
    </label>
    {#if autreDate}
      <label class="rang"><span class="nom">Date</span><input type="date" value={f.debut} onchange={choisirDate} aria-label="Choisir une date" /></label>
    {/if}

    <div class="rang"><span class="nom">Heure</span>
      <span class="paire">
        <select aria-label="Heure de début" value={Math.floor(f.heure / 60)} onchange={(e) => (f.heure = borner(+lire(e) * 60 + (f.heure % 60)))}>
          {#each HEURES as h (h)}<option value={h}>{String(h).padStart(2, '0')} h</option>{/each}
        </select>
        <select aria-label="Minutes de début" value={f.heure % 60} onchange={(e) => (f.heure = borner(Math.floor(f.heure / 60) * 60 + +lire(e)))}>
          {#each minutes as n (n)}<option value={n}>{String(n).padStart(2, '0')}</option>{/each}
        </select>
      </span>
    </div>

    <label class="rang"><span class="nom">Durée</span>
      <select aria-label="Durée de la tâche" value={f.duree} onchange={(e) => regler(+lire(e))}>
        {#each durees as d (d)}<option value={d}>{dureeMin(d)}</option>{/each}
      </select>
    </label>
    <p class="muted petit fin-heure">{hm(f.heure)} – {hm(f.heure + f.duree)}</p>

    <label class="rang"><span class="nom">Répéter</span>
      <select aria-label="Répétition" value={f.repetition} onchange={(e) => (f.repetition = lire(e) as Repetition)}>
        {#each REPETITIONS as r (r.valeur)}<option value={r.valeur}>{r.label}</option>{/each}
      </select>
    </label>

    {#if f.repetition === 'hebdo'}
      <div class="semaine">
        <div class="jours" role="group" aria-label="Jours de la semaine">
          {#each LETTRES as l, i (i)}
            <button type="button" class="puce" class:couleur={f.jours.includes(i)} aria-pressed={f.jours.includes(i)} aria-label={JOURS_LONGS[i]} onclick={() => basculerJour(i)}>{l}</button>
          {/each}
        </div>
        <span class="fort">{texteJours(f.jours)}</span>
      </div>
    {:else if f.rec === 'mensuel'}
      <label class="rang"><span class="nom">Le</span>
        <select aria-label="Jour du mois" value={f.mensuel} onchange={(e) => (f.mensuel = lire(e) as 'jour_du_mois' | 'rang')}>
          {#each choixMensuels(f.debut) as m (m.valeur)}<option value={m.valeur}>{m.label}</option>{/each}
        </select>
      </label>
    {/if}

    {#if f.rec !== 'une_fois'}
      <label class="rang"><span class="nom">Jusqu’à</span>
        <select aria-label="Jusqu’à quand ?" value={f.fin} onchange={(e) => (f.fin = lire(e) as TypeFin)}>
          {#each fins as e (e.valeur)}<option value={e.valeur}>{e.label}</option>{/each}
        </select>
      </label>
      {#if f.fin === 'date'}
        <label class="rang"><span class="nom">Dernier jour</span><input type="date" min={f.debut} bind:value={f.finDate} /></label>
      {:else if f.fin === 'fois'}
        <label class="rang"><span class="nom">Nombre de fois</span>
          <input class="nombre" type="number" inputmode="numeric" min="1" max="999" value={f.finFois} aria-label="Nombre de fois"
            onchange={(e) => (f.finFois = Math.max(1, Math.min(999, Math.round(+e.currentTarget.value) || 1)))} />
        </label>
      {/if}
    {/if}
  </div>

  <Disponibilite {dispo} duree={f.duree} {occupant} onchoisir={(m) => (f.heure = m)} />
  {#if chargee}<p class="chargee">Journée très chargée : plus de 12 h sont déjà planifiées ce jour-là. Garde du temps pour souffler.</p>{/if}
</div>

<style>
  .section { display: flex; flex-direction: column; gap: 8px; }
  .quand { border-radius: 20px; padding: 4px 14px; display: flex; flex-direction: column; }
  .rang { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 56px; border-bottom: 1px solid var(--ligne); }
  .rang:last-child { border-bottom: 0; }
  .nom { font-size: 14px; font-weight: 600; flex: none; }
  .paire { display: flex; gap: 6px; }
  select, input[type='date'], .nombre { height: 44px; min-width: 0; max-width: 100%; border-radius: 12px; border: 1px solid var(--ligne); background: var(--surface-2); color: var(--texte); font-size: 16px; font-weight: 600; padding: 0 10px; }
  .rang > select { flex: 1; max-width: 230px; text-align-last: right; }
  .nombre { width: 90px; text-align: center; }
  select:focus-visible, input:focus-visible, .puce:focus-visible { outline: 2px solid var(--c, var(--accent)); outline-offset: 1px; }
  .rang:has(+ .fin-heure) { border-bottom: 0; min-height: 48px; }
  .fin-heure { text-align: right; margin: 0; padding: 0 0 10px; border-bottom: 1px solid var(--ligne); font-size: 12px; }
  .petit { font-size: 12px; }
  .fort { font-size: 13px; font-weight: 600; }
  .semaine { display: flex; flex-direction: column; gap: 8px; padding: 4px 0 12px; border-bottom: 1px solid var(--ligne); }
  .jours { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
  .puce { height: 44px; padding: 0; border-radius: 12px; border: 1px solid var(--ligne); background: transparent; font-size: 14px; font-weight: 600; }
  .puce.couleur { background: var(--c); border-color: var(--c); color: var(--c-sur); }
  .chargee { font-size: 12px; color: var(--alerte); background: var(--alerte-fond); border-radius: 12px; padding: 10px 12px; }
</style>
