<script lang="ts">
  import type { Croisade } from '@core/croisade.ts';
  import type { Jour } from '@core/types.ts';
  import Volet from '../../ui/Volet.svelte';
  import { dire } from '../../ui/toast.svelte.ts';
  import { basculerSuivi, croisadeConfiguree, croisadeParDefaut, enregistrerCroisade, suiviDuJour, supprimerCroisade } from '../../data/actions/croisade.ts';
  import { magasin } from '../../data/magasin.svelte.ts';

  /** Croisade du rapport (ex. 40 jours) : le bloc du jour tel qu'il part dans le rapport, le suivi oui / non du jour, et ses réglages. */
  let { jour, bloc }: { jour: Jour; bloc: string | null } = $props();

  const c = $derived(croisadeConfiguree());
  const lignes = $derived(bloc ? bloc.split('\n') : []);
  const fait = $derived(suiviDuJour(jour));
  const codes = $derived(magasin.lignes.points_rapport.filter((p) => p.actif).sort((a, b) => a.ordre - b.ordre).map((p) => p.code));

  let ouvert = $state(false);
  // svelte-ignore state_referenced_locally
  let f = $state<Croisade>(croisadeParDefaut(jour));
  function regler() { f = c ? { ...c, codes: [...c.codes] } : croisadeParDefaut(jour); ouvert = true; }
  const bascule = (code: string) => { f.codes = f.codes.includes(code) ? f.codes.filter((x) => x !== code) : [...f.codes, code]; };
  function valider() {
    if (!f.titre.trim()) { dire('Donne un titre à la croisade'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.debut)) { dire('Choisis le jour de début'); return; }
    enregistrerCroisade({ ...f, titre: f.titre.trim(), jours: Math.max(1, Math.round(+f.jours) || 1), heures: Math.max(0.5, +f.heures || 1) });
    ouvert = false; dire('Croisade enregistrée');
  }
</script>

{#if !c}
  <button type="button" class="ajout" onclick={regler}>+ Ajouter une croisade (40 jours…)</button>
{:else}
  <section class="carte croisade" aria-label="Croisade">
    {#if bloc}
      <p class="t">{lignes[0]?.replace(/\*_|_\*/g, '')}</p>
      {#each lignes.slice(1) as l (l)}<p class="l">{l.replace(/^\* /, '')}</p>{/each}
      {#if c.suivi.trim()}<button type="button" class="suivi" class:on={fait} aria-pressed={fait} onclick={() => basculerSuivi(jour)}>{fait ? '✓ ' : ''}{c.suivi}</button>{/if}
    {:else}<p class="muted">Croisade « {c.titre} » : ce jour est hors de ses {c.jours} jours.</p>{/if}
    <button type="button" class="regler" onclick={regler}>Régler la croisade</button>
  </section>
{/if}

<Volet {ouvert} onfermer={() => (ouvert = false)} label="Croisade">
  <form class="form" onsubmit={(e) => { e.preventDefault(); valider(); }}>
    <h2 class="titre">Croisade</h2>
    <label class="champ">Titre<input type="text" bind:value={f.titre} aria-label="Titre de la croisade" /></label>
    <label class="champ">Règle en plus du temps (facultatif)<input type="text" bind:value={f.regle} aria-label="Règle de la croisade" /></label>
    <label class="champ">Suivi oui / non du jour (facultatif)<input type="text" bind:value={f.suivi} aria-label="Suivi quotidien" /></label>
    <div class="trois">
      <label class="champ">Début<input type="date" bind:value={f.debut} aria-label="Jour de début" /></label>
      <label class="champ">Jours<input type="number" inputmode="numeric" bind:value={f.jours} aria-label="Nombre de jours" /></label>
      <label class="champ">Heures / jour<input type="number" inputmode="decimal" step="0.5" bind:value={f.heures} aria-label="Heures par jour" /></label>
    </div>
    <div class="champ">Points dont le temps compte<span class="puces">{#each codes as code (code)}<button type="button" class="puce" class:on={f.codes.includes(code)} aria-pressed={f.codes.includes(code)} onclick={() => bascule(code)}>{code}</button>{/each}</span></div>
    <button type="submit" class="ok">Enregistrer la croisade</button>
    {#if c}<button type="button" class="danger" onclick={() => { supprimerCroisade(); ouvert = false; dire('Croisade retirée'); }}>Retirer la croisade</button>{/if}
  </form>
</Volet>

<style>
  .ajout { min-height: 48px; border-radius: 16px; border: 1px dashed var(--ligne); background: transparent; color: var(--muted); font-size: 14px; font-weight: 600; }
  .croisade { border-radius: 20px; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; }
  .t { font-family: var(--serif, Georgia, serif); font-style: italic; font-size: 16px; margin: 0 0 4px; } .l { margin: 0; font-size: 15px; font-weight: 600; }
  .suivi { margin-top: 8px; min-height: 44px; border-radius: 14px; border: 1px solid var(--ligne); background: transparent; color: var(--texte); font-size: 14px; font-weight: 600; } .suivi.on { background: var(--inverse); color: var(--inverse-texte); border-color: var(--inverse); }
  .regler { align-self: flex-start; border: 0; background: transparent; color: var(--muted); font-size: 12px; text-decoration: underline; min-height: 36px; padding: 0; }
  .form { display: flex; flex-direction: column; gap: 14px; } .titre { margin: 0; font-size: 22px; }
  .champ { display: flex; flex-direction: column; gap: 6px; font-size: 12px; font-weight: 600; color: var(--muted); } .champ input { height: 48px; border-radius: 14px; border: 1px solid var(--ligne); background: var(--surface); color: var(--texte); font-size: 16px; padding: 0 12px; min-width: 0; }
  .trois { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 8px; }
  .puces { display: flex; flex-wrap: wrap; gap: 6px; } .puce { min-height: 40px; padding: 0 14px; border-radius: 20px; border: 1px solid var(--ligne); background: transparent; color: var(--texte); font-size: 14px; font-weight: 600; } .puce.on { background: var(--inverse); color: var(--inverse-texte); border-color: var(--inverse); }
  .ok, .danger { min-height: 52px; border-radius: 16px; border: 0; font-size: 16px; font-weight: 600; } .ok { background: var(--inverse); color: var(--inverse-texte); } .danger { background: transparent; border: 1px solid var(--mauvais); color: var(--mauvais); }
</style>
