<script lang="ts">
  import { aller } from '../../router.svelte.ts';
  import { ecole } from '../../screens/ecole/etat.ts';
  import Tableau from './Tableau.svelte';
  import Notes from './Notes.svelte';
  import Frais from './Frais.svelte';
  import Messages from './Messages.svelte';
  import Eleves from './Eleves.svelte';
  import type { Panneau } from './types.ts';

  const e = $derived(ecole());
  let ecoleId = $state('la-rochelle');
  const ec = $derived(e.ecoles.find((x) => x.id === ecoleId) ?? e.ecoles[0]);
  let panneau = $state<Panneau>('dash');
  /** Contexte transmis d'un panneau à l'autre (ex. « Voir les notes » depuis la fiche d'un élève). */
  let contexte = $state<{ classe?: string; cible?: { tous?: boolean; classe?: string; eleve?: string; libelle: string } }>({});
  const NAV: { id: Panneau; label: string; titre: string; sous: string }[] = [
    { id: 'dash', label: 'Tableau de bord', titre: 'Rentrée 2026-2027', sous: 'Les frais des familles AssureMe sont versés à l’école dès l’accord du plan.' },
    { id: 'notes', label: 'Notes et bulletins', titre: 'Notes et bulletins', sous: 'Saisissez les notes, puis publiez-les aux parents.' },
    { id: 'frais', label: 'Frais de scolarité', titre: 'Frais de scolarité', sous: 'Grille par niveau, familles avec plan AssureMe et paiements reçus.' },
    { id: 'messages', label: 'Messages aux parents', titre: 'Messages aux parents', sous: 'Dans l’app et par SMS.' },
    { id: 'eleves', label: 'Élèves et classes', titre: 'Élèves et classes', sous: 'Cliquez sur un élève pour sa fiche.' }
  ];
  const courant = $derived(NAV.find((n) => n.id === panneau)!);
  function va(p: Panneau, ctx: typeof contexte = {}) { panneau = p; contexte = ctx; }
</script>

<div class="pt">
  <aside>
    <div class="logo"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m3 9 9-5 9 5-9 5zM7 11.5V16c1.5 1.5 3.2 2 5 2s3.5-.5 5-2v-4.5" /></svg><span>Assure<b>Me</b></span></div>
    <label class="choix"><span>Établissement</span>
      <select bind:value={ecoleId} aria-label="Établissement">{#each e.ecoles as x (x.id)}<option value={x.id}>{x.nom}</option>{/each}</select>
    </label>
    <p class="lieu">{ec.ville} · Espace école</p>
    <nav aria-label="Portail école">
      {#each NAV as n (n.id)}<button class:on={panneau === n.id} aria-current={panneau === n.id ? 'page' : undefined} onclick={() => va(n.id)}>{n.label}</button>{/each}
    </nav>
    <a class="sortie" href="/" onclick={(ev) => { ev.preventDefault(); aller('/'); }}>Se déconnecter</a>
  </aside>
  <main>
    <header><h1>{courant.titre}</h1><p>{courant.sous}</p></header>
    {#key ec.id}
      {#if panneau === 'dash'}<Tableau {ec} va={va} />
      {:else if panneau === 'notes'}<Notes {ec} classeInitiale={contexte.classe} />
      {:else if panneau === 'frais'}<Frais {ec} />
      {:else if panneau === 'messages'}<Messages {ec} cibleInitiale={contexte.cible} />
      {:else}<Eleves {ec} va={va} />{/if}
    {/key}
  </main>
</div>

<style>
  .pt { display: grid; grid-template-columns: 250px 1fr; min-height: 100dvh; background: var(--fond); color: var(--texte); }
  aside { background: #3050ff; color: #ebeeff; padding: 24px 16px; display: flex; flex-direction: column; gap: 14px; position: sticky; top: 0; height: 100dvh; }
  .logo { display: flex; gap: 10px; align-items: center; font-size: 20px; color: #fff; } .logo b { font-weight: 800; }
  .choix { display: flex; flex-direction: column; gap: 4px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; } select { min-height: 44px; border-radius: 10px; padding: 0 10px; background: #fff; color: #0f1422; font-size: 14px; width: 100%; }
  .lieu { font-size: 13px; opacity: 0.85; } nav { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
  nav button { min-height: 44px; text-align: left; padding: 0 14px; border-radius: 10px; color: #ebeeff; font-size: 14.5px; } nav button.on { background: #fff; color: #3050ff; font-weight: 700; } nav button:not(.on):hover { background: rgba(255, 255, 255, 0.14); }
  .sortie { margin-top: auto; min-height: 44px; display: flex; align-items: center; padding: 0 14px; border-radius: 10px; font-size: 14px; opacity: 0.9; }
  main { padding: 28px 32px 48px; display: flex; flex-direction: column; gap: 20px; min-width: 0; }
  header h1 { font-size: 26px; } header p { color: var(--muted); margin-top: 4px; }
  @media (max-width: 760px) {
    .pt { grid-template-columns: minmax(0, 1fr); } aside { min-width: 0; position: static; height: auto; padding: 14px 16px; } nav { flex-direction: row; overflow-x: auto; } nav button { white-space: nowrap; } .sortie { margin: 0; }
    main { padding: 18px 16px 40px; }
  }

  /* Styles partagés des panneaux (le portail est en thème clair). */
  .pt :global(.carte) { background: var(--carte); border: 1px solid var(--ligne); border-radius: 16px; padding: 18px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  .pt :global(.carte h2) { font-size: 17px; } .pt :global(.grille3) { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; }
  .pt :global(.kpi) { text-align: left; background: var(--carte); border: 1px solid var(--ligne); border-radius: 16px; padding: 18px; display: flex; flex-direction: column; gap: 4px; min-height: 44px; }
  .pt :global(.kpi small) { color: var(--muted); font-size: 13px; } .pt :global(.kpi b) { font-size: 28px; font-weight: 700; font-variant-numeric: tabular-nums; } .pt :global(.kpi span) { color: var(--muted); font-size: 13px; }
  .pt :global(.btn) { min-height: 44px; padding: 0 20px; border-radius: 12px; background: #3050ff; color: #fff; font-weight: 650; font-size: 14.5px; align-self: flex-start; } .pt :global(.btn.sec) { background: var(--carte2); color: var(--texte); border: 1px solid var(--ligne-forte); }
  .pt :global(.btn:disabled) { opacity: 0.45; cursor: not-allowed; } .pt :global(.btn.noir) { background: #0b0f1a; }
  .pt :global(table) { width: 100%; border-collapse: collapse; font-size: 14px; } .pt :global(th) { text-align: left; font-size: 11.5px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); font-weight: 600; padding: 8px 10px; border-bottom: 1px solid var(--ligne-forte); }
  .pt :global(td) { padding: 8px 10px; border-bottom: 1px solid var(--ligne); vertical-align: middle; } .pt :global(td.num), .pt :global(th.num) { text-align: right; font-variant-numeric: tabular-nums; }
  .pt :global(input[type='text']), .pt :global(input:not([type])), .pt :global(select.champ), .pt :global(textarea) { min-height: 44px; padding: 0 12px; border-radius: 10px; background: #fff; border: 1px solid #cdd2de; color: var(--texte); font-size: 14.5px; width: 100%; outline: none; }
  .pt :global(textarea) { padding: 10px 12px; min-height: 96px; } .pt :global(input:focus), .pt :global(select.champ:focus), .pt :global(textarea:focus) { border-color: #3050ff; } .pt :global(.invalide) { border-color: #d6453d !important; }
  .pt :global(.err) { color: #c0392b; font-size: 13px; } .pt :global(.muted) { color: var(--muted); } .pt :global(.tag) { display: inline-block; padding: 3px 10px; border-radius: 99px; font-size: 12px; font-weight: 600; background: #ebeeff; color: #3050ff; } .pt :global(.tag.warn) { background: #fff1e6; color: #8a3c05; } .pt :global(.tag.ok) { background: #e3f6ed; color: #12684a; }
  .pt :global(.puces) { display: flex; flex-wrap: wrap; gap: 8px; } .pt :global(.puce) { min-height: 44px; padding: 0 16px; border-radius: 22px; border: 1px solid #cdd2de; background: #fff; color: #2a3142; font-size: 14px; } .pt :global(.puce.on) { border-color: #3050ff; background: #ebeeff; color: #3050ff; font-weight: 650; }
  .pt :global(.barre) { height: 8px; border-radius: 4px; background: var(--carte2); overflow: hidden; } .pt :global(.barre span) { display: block; height: 100%; background: #3050ff; } .pt :global(.barre.warn span) { background: #ff7a2f; }
  .pt :global(.defile) { overflow-x: auto; } .pt :global(label.et) { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; color: var(--doux); }
</style>
