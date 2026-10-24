<script lang="ts">
  import { app } from '../../data/store.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Colonne from './Colonne.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { basculerModule } from './actions.ts';
  import { dockPatron } from './dockPatron.ts';
  import { MODULES, prixMensuel } from './modules.ts';

  const modules = $derived(app.monde.params.modules);
  const prix = $derived(prixMensuel(modules));
  const actif = (cle: string, socle?: boolean) => !!socle || modules[cle] !== false;
  function basculer(cle: string) {
    const r = basculerModule(cle, !actif(cle));
    montrer(r.message ?? r.raison ?? '', r.ok ? 'ok' : 'er');
  }
</script>

<Mobile titre="Modules" sous="ce que tes clients et agents voient" retourVers="/patron" dock={dockPatron('modules')}>
  {#snippet droite()}<span class="pl ac" aria-live="polite">{prix.toLocaleString('fr-FR')} F / mois</span>{/snippet}
<Colonne>

  {#each MODULES as m (m.cle)}
    {@const on = actif(m.cle, m.socle)}
    <div class="gl row g12" class:ac={on && !m.socle}>
      <span class="bub" class:aq={on} aria-hidden="true"><svg class="ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d={m.icone}></path></svg></span>
      <span class="col grow">
        <span class="t15 b7">{m.nom}</span><span class="t12 mut">{m.sous}</span>
        <span class="t12 {on ? 'okc' : 'mut3'}">{m.socle ? 'inclus · toujours actif' : on ? `actif · ${m.prix ? `${m.prix.toLocaleString('fr-FR')} F / mois` : 'inclus'}` : `masqué · ${m.prix ? `${m.prix.toLocaleString('fr-FR')} F / mois si activé` : 'inclus si activé'}`}</span>
      </span>
      <button type="button" class="sw" class:on role="switch" aria-checked={on} aria-label={m.nom} disabled={m.socle} onclick={() => basculer(m.cle)}></button>
    </div>
  {/each}
  <div class="toast" role="note"><span class="bub aq" aria-hidden="true">i</span><span class="t13 grow">Un module coupé disparaît des apps en 1 min. Les billets et colis déjà en cours continuent.</span></div>
</Colonne>
</Mobile>

<style>
  .sw::before { content: ''; position: absolute; inset: -8px -4px; } .sw:disabled { opacity: 0.5; cursor: default; }
  .sw:focus-visible { outline: 2px solid #7febff; outline-offset: 2px; }
  .t15 { font-size: 15px; }
</style>
