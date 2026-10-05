<script lang="ts">
  import { ajouterJours, jourSemaine, JOURS_LONGS } from '@core/dates.ts';
  import { disponibilite, journeeTresChargee } from '@core/disponibilite.ts';
  import { idOccurrence } from '@core/ids.ts';
  import { blocsDuJour, creneauxDuJour } from '../../data/requetes.ts';
  import type { FormulaireTache } from './formulaire-tache.svelte.ts';
  import Disponibilite from './Disponibilite.svelte';
  import { dateCourte, dureeMin, hm, puceJour } from './format.ts';
  import { choixMensuels, texteJours, type Recurrence, type TypeFin } from './tache.ts';

  /** Étape « Quand » : jour de début, récurrence, heure, durée et vérification de disponibilité (spec §7.1, §7.3). */
  let { f, numero, aujourdhui, tacheId }: { f: FormulaireTache; numero: number; aujourdhui: string; tacheId?: string } = $props();

  const LETTRES = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const RECS: { valeur: Recurrence; label: string }[] = [
    { valeur: 'une_fois', label: 'Ce jour seulement' }, { valeur: 'quotidien', label: 'Tous les jours' },
    { valeur: 'hebdo', label: 'Chaque semaine' }, { valeur: 'mensuel', label: 'Chaque mois' }
  ];
  const DUREES = [15, 30, 45, 60, 90];

  const debuts = $derived.by(() => {
    const l = Array.from({ length: 9 }, (_, i) => ajouterJours(aujourdhui, i));
    return f.debut && !l.includes(f.debut) ? [f.debut, ...l] : l;
  });
  const fins = $derived<{ valeur: TypeFin; label: string }[]>([
    { valeur: 'aucune', label: 'Sans fin' }, { valeur: 'date', label: `Jusqu’au ${dateCourte(f.finDate || f.debut)}` }, { valeur: 'fois', label: `Après ${f.finFois} fois` }
  ]);

  const creneaux = $derived(f.debut ? creneauxDuJour(f.debut, tacheId ? idOccurrence(tacheId, f.debut) : undefined) : []);
  const dispo = $derived(disponibilite(creneaux, f.heure, f.duree));
  const occupant = $derived(dispo.occupePar ? blocsDuJour(f.debut).find((b) => b.occ.id === dispo.occupePar!.id) : undefined);
  const chargee = $derived(journeeTresChargee([...creneaux, { debut: f.heure, fin: f.heure + f.duree, titre: f.titre }]));

  function basculerJour(i: number) {
    if (f.jours.includes(i)) { if (f.jours.length > 1) f.jours = f.jours.filter((x) => x !== i); }
    else f.jours = [...f.jours, i];
  }
  function choisirRec(r: Recurrence) {
    f.rec = r;
    if (r === 'hebdo' && !f.jours.length) f.jours = [jourSemaine(f.debut)];
  }
  const RACCOURCIS = [{ l: 'Matin', m: 8 * 60 }, { l: 'Midi', m: 12 * 60 }, { l: 'Après-midi', m: 15 * 60 }, { l: 'Soir', m: 18 * 60 }, { l: 'Nuit', m: 21 * 60 }];
  const borner = (m: number) => Math.max(0, Math.min(1440 - f.duree, m));
  /** Heure choisie dans le sélecteur natif (roue de l'iPhone) : « HH:MM ». */
  function choisirHeure(e: Event) {
    const [h, m] = (e.currentTarget as HTMLInputElement).value.split(':').map(Number);
    if (Number.isFinite(h) && Number.isFinite(m)) f.heure = borner(h * 60 + m);
  }
  const valeurHeure = $derived(`${String(Math.floor(f.heure / 60)).padStart(2, '0')}:${String(f.heure % 60).padStart(2, '0')}`);
  const deplacer = (d: number) => { f.heure = Math.max(0, Math.min(1440 - f.duree, f.heure + d)); };
</script>

<div class="section">
  <span class="etiquette">{numero} · Quand</span>

  <div class="col g6">
    <span class="muted petit">{f.rec === 'une_fois' ? 'Quel jour ?' : 'À partir de quel jour ?'}</span>
    <div class="defile-h">
      {#each debuts as j (j)}
        <button type="button" class="puce" class:couleur={j === f.debut} aria-pressed={j === f.debut} onclick={() => f.choisirDebut(j)}>{puceJour(j, aujourdhui)}</button>
      {/each}
    </div>
  </div>

  <div class="grille2">
    {#each RECS as r (r.valeur)}
      <button type="button" class="puce" class:inverse={r.valeur === f.rec} aria-pressed={r.valeur === f.rec} onclick={() => choisirRec(r.valeur)}>{r.label}</button>
    {/each}
  </div>

  {#if f.rec === 'hebdo'}
    <div class="carte semaine">
      <div class="jours">
        {#each LETTRES as l, i (i)}
          <button type="button" class="puce" class:couleur={f.jours.includes(i)} aria-pressed={f.jours.includes(i)} aria-label={JOURS_LONGS[i]} onclick={() => basculerJour(i)}>{l}</button>
        {/each}
      </div>
      <div class="raccourcis">
        <button type="button" onclick={() => (f.jours = [0, 1, 2, 3, 4])}>Lun. – Ven.</button>
        <button type="button" onclick={() => (f.jours = [5, 6])}>Week-end</button>
        <button type="button" onclick={() => (f.jours = [0, 1, 2, 3, 4, 5, 6])}>Tous les jours</button>
      </div>
      <span class="fort">{texteJours(f.jours)}</span>
    </div>
  {:else if f.rec === 'mensuel'}
    <div class="grille2">
      {#each choixMensuels(f.debut) as m (m.valeur)}
        <button type="button" class="puce haute" class:couleur={m.valeur === f.mensuel} aria-pressed={m.valeur === f.mensuel} onclick={() => (f.mensuel = m.valeur)}>{m.label}</button>
      {/each}
    </div>
  {/if}

  {#if f.rec !== 'une_fois'}
    <div class="col g6">
      <span class="muted petit">Jusqu’à quand ?</span>
      <div class="grille3">
        {#each fins as e (e.valeur)}
          <button type="button" class="puce petite" class:inverse={e.valeur === f.fin} aria-pressed={e.valeur === f.fin} onclick={() => (f.fin = e.valeur)}>{e.label}</button>
        {/each}
      </div>
      {#if f.fin === 'date'}
        <label class="rang-fin">Dernier jour<input type="date" min={f.debut} bind:value={f.finDate} /></label>
      {:else if f.fin === 'fois'}
        <div class="rang-fin">Nombre de fois
          <span class="pas"><button type="button" aria-label="Moins de fois" onclick={() => (f.finFois = Math.max(1, f.finFois - 1))}>−</button><span class="mono">{f.finFois}</span><button type="button" aria-label="Plus de fois" onclick={() => (f.finFois += 1)}>+</button></span>
        </div>
      {/if}
    </div>
  {/if}

  <div class="heure">
    <button type="button" aria-label="15 minutes plus tôt" onclick={() => deplacer(-15)}>−15</button>
    <div class="col centre choix-heure">
      <span class="mono debut">{hm(f.heure)}</span>
      <span class="muted fin">jusqu’à {hm(f.heure + f.duree)}</span>
      <span class="indice">toucher pour choisir l’heure</span>
      <input class="natif" type="time" step="300" value={valeurHeure} onchange={choisirHeure} aria-label="Choisir l’heure de début" />
    </div>
    <button type="button" aria-label="15 minutes plus tard" onclick={() => deplacer(15)}>+15</button>
  </div>
  <div class="raccourcis" role="group" aria-label="Aller à">
    {#each RACCOURCIS as r (r.m)}
      <button type="button" class="puce petite" class:inverse={f.heure === borner(r.m)} aria-pressed={f.heure === borner(r.m)} onclick={() => (f.heure = borner(r.m))}>{r.l} · {hm(r.m)}</button>
    {/each}
  </div>
  <div class="durees">
    {#each DUREES as d (d)}
      <button type="button" class="puce" class:inverse={d === f.duree} aria-pressed={d === f.duree} onclick={() => { f.duree = d; f.heure = Math.min(f.heure, 1440 - d); }}>{dureeMin(d)}</button>
    {/each}
  </div>

  <Disponibilite {dispo} duree={f.duree} {occupant} onchoisir={(m) => (f.heure = m)} />
  {#if chargee}<p class="chargee">Journée très chargée : plus de 12 h sont déjà planifiées ce jour-là. Garde du temps pour souffler.</p>{/if}
</div>

<style>
  .section { display: flex; flex-direction: column; gap: 10px; }
  .col { display: flex; flex-direction: column; }
  .g6 { gap: 6px; }
  .centre { align-items: center; }
  .petit { font-size: 12px; }
  .fort { font-size: 13px; font-weight: 600; }
  .defile-h { display: flex; gap: 6px; overflow-x: auto; margin: 0 -16px; padding: 0 16px; }
  .puce { flex: none; height: 44px; padding: 0 14px; border-radius: 14px; border: 1px solid var(--ligne); background: transparent; font-size: 13px; font-weight: 600; }
  .puce.petite { min-height: 44px; height: auto; border-radius: 12px; font-size: 12px; padding: 0 6px; }
  .puce.haute { height: auto; min-height: 52px; padding: 6px 10px; }
  .puce.couleur { background: var(--c); border-color: var(--c); color: var(--c-sur); }
  .puce.inverse { background: var(--inverse); border-color: var(--inverse); color: var(--inverse-texte); }
  .grille2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .grille2 .puce { font-size: 14px; }
  .grille3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
  .semaine { display: flex; flex-direction: column; gap: 8px; border-radius: 18px; padding: 12px; }
  .jours { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
  .jours .puce { padding: 0; border-radius: 12px; font-size: 14px; }
  .raccourcis { display: flex; gap: 6px; flex-wrap: wrap; }
  .raccourcis button { position: relative; height: 36px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--ligne); background: transparent; font-size: 12px; font-weight: 600; }
  .rang-fin { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; color: var(--muted); }
  .rang-fin input { height: 44px; border-radius: 12px; border: 1px solid var(--ligne); background: var(--surface); padding: 0 10px; }
  .pas { display: flex; align-items: center; gap: 8px; color: var(--texte); }
  .pas button { width: 44px; height: 44px; border-radius: 14px; border: 1px solid var(--ligne); background: var(--surface); font-size: 20px; }
  .heure { display: flex; align-items: center; justify-content: space-between; background: var(--surface-2); border-radius: 18px; padding: 8px; }
  .choix-heure { position: relative; flex: 1; align-self: stretch; justify-content: center; border-radius: 12px; }
  .choix-heure .indice { font-size: 11px; color: var(--faint); margin-top: 1px; }
  /* Sélecteur natif posé, invisible, sur toute la zone de l'heure : un toucher ouvre la roue de l'iPhone (16 px : pas de zoom). */
  .natif { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; font-size: 16px; border: 0; padding: 0; cursor: pointer; }
  .raccourcis { display: flex; gap: 6px; overflow-x: auto; margin: 0 -16px; padding: 0 16px; }
  .raccourcis .puce { flex: none; }
  .heure button { width: 52px; height: 44px; border-radius: 14px; border: 0; background: var(--surface); font-size: 13px; font-weight: 600; }
  .debut { font-size: 26px; letter-spacing: -0.02em; }
  .fin { font-size: 11px; }
  .durees { display: flex; gap: 6px; }
  .durees .puce { flex: 1; padding: 0; }
  .chargee { font-size: 12px; color: var(--alerte); background: var(--alerte-fond); border-radius: 12px; padding: 10px 12px; }
  /* Dessin de la maquette (40 px ou 36 px), zone d'appui portée à 44 px (spec §14). */
  .raccourcis button::after { content: ''; position: absolute; inset: -4px 0; }
</style>
