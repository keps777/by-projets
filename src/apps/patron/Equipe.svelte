<script lang="ts">
  import { activite, ETIQUETTE_ROLE, gens, initiales, ageActivite } from '../../core/equipe.ts';
  import { etatRapport, caissesDe } from '../../core/fichegare.ts';
  import { garesDe, libelleVariation, tableau } from '../../core/indicateurs.ts';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Colonne from './Colonne.svelte';
  import { etatPatron } from './etat.ts';
  import { dockPatron } from './dockPatron.ts';
  import { contexte, francs, gareNom, signe } from './lecture.ts';

  const etat = etatPatron();
  let vue = $state<'gares' | 'personnes'>(etat.vue);
  const now = maintenant();
  const ctx = $derived(contexte(now));
  const t = $derived(tableau(app.monde, { jour: ctx.jour, now, compagnieId: ctx.compagnieId }));
  const ids = $derived(garesDe(app.monde, app.monde.personnes, ctx.compagnieId));
  const personnes = $derived(gens(app.monde.personnes, ctx.compagnieId, ids));
  const pick = (v: 'gares' | 'personnes') => { vue = v; etatPatron().vue = v; };
  const lier = (e: MouseEvent, vers: string) => { e.preventDefault(); aller(vers); };

  const garesCartes = $derived(ids.map((id) => {
    const equipe = personnes.filter((p) => p.gareId === id), stat = t.gares.find((g) => g.gareId === id), sup = equipe.find((p) => p.role === 'superviseur');
    const rapport = etatRapport(caissesDe(app.monde, id, ctx.jour), now), guichets = equipe.filter((p) => p.role === 'guichet').length, quais = equipe.filter((p) => p.role === 'quai').length;
    return { id, nom: gareNom(id), equipe, recette: stat?.recette ?? 0, variation: stat?.variation ?? null, sup, rapport, guichets, quais, hot: (stat?.variation ?? 0) <= -10 };
  }));
  function resume(id: string) {
    const p = app.monde.personnes.find((x) => x.id === id)!, a = activite({ billets: app.monde.billets, caisses: app.monde.caisses, evenements: app.monde.evenements }, id, { jour: ctx.jour, now });
    if (!p.actif) return { v: 'accès coupé', pl: 'suspendu', plc: 'er' };
    switch (p.role) {
      case 'guichet': return { v: `${a.billets30} billets · 30 j`, pl: a.sommeEcarts ? signe(a.sommeEcarts) : 'fiable', plc: a.sommeEcarts ? 'wa' : 'ok' };
      case 'quai': return { v: `${a.scans30} scans · 30 j`, pl: 'fiable', plc: 'ok' };
      case 'chauffeur': { const n = app.monde.evenements.filter((e) => e.acteurId === id && e.type === 'securite').length; return { v: n ? `${n} excès de vitesse` : 'RAS', pl: n ? 'à voir' : 'fiable', plc: n ? 'er' : 'ok' }; }
      case 'controleur': return { v: `${app.monde.evenements.filter((e) => e.acteurId === id && e.type === 'controle').length} contrôles`, pl: 'mission', plc: 'ac' };
      case 'superviseur': { const r = etatRapport(caissesDe(app.monde, p.gareId ?? '', ctx.jour), now); return { v: r.libelle, pl: r.code === 'retard' ? 'en retard' : 'fiable', plc: r.code === 'retard' ? 'wa' : 'ok' }; }
      default: return { v: ageActivite(a.derniere?.ts, now), pl: 'actif', plc: 'ok' };
    }
  }
</script>

<Mobile dock={dockPatron('gares')} sansRetour>
  {#snippet enteteLibre()}
    <header class="hd"><span class="ttl t18">Gares et équipes</span><a class="pl ac lien" href="/siege/config" onclick={(e) => lier(e, '/siege/config')}>configurer</a></header>
  {/snippet}
<Colonne>

  <div class="seg2" role="group" aria-label="Vue">
    <button type="button" class:on={vue === 'gares'} aria-pressed={vue === 'gares'} onclick={() => pick('gares')}>Gares</button>
    <button type="button" class:on={vue === 'personnes'} aria-pressed={vue === 'personnes'} onclick={() => pick('personnes')}>Personnes</button>
  </div>

  {#if vue === 'gares'}
    {#each garesCartes as g (g.id)}
      <a class="gr" class:hot={g.hot} href="/patron/gare?gare={g.id}" onclick={(e) => lier(e, `/patron/gare?gare=${g.id}`)}>
        <div class="row sp">
          <span class="col"><span class="t16 b7">{g.nom}</span><span class="t12 mut">{g.equipe.length ? `${g.guichets} guichet${g.guichets > 1 ? 's' : ''} · ${g.quais} quai${g.quais > 1 ? 's' : ''}${g.sup ? ` · ${g.sup.prenom}` : ''}` : 'aucune équipe rattachée'}</span></span>
          <span class="col" style="align-items: flex-end"><span class="ttl t18 nowrap">{francs(g.recette)}</span><span class="t12 {g.variation !== null && g.variation < 0 ? 'erc' : g.variation === null ? 'mut' : 'okc'}">{libelleVariation(g.variation)}</span></span>
        </div>
        <div class="row sp">
          <span class="avs" aria-label="{g.equipe.length} personnes">{#each g.equipe.slice(0, 3) as p, i (p.id)}<span class="av" class:hot={i === 1}>{initiales(p)}</span>{/each}{#if g.equipe.length > 3}<span class="av">+{g.equipe.length - 3}</span>{/if}</span>
          <span class="pl {g.rapport.code === 'envoye' ? 'ok' : g.rapport.code === 'retard' ? 'wa' : ''}">{g.rapport.libelle}</span>
        </div>
      </a>
    {:else}
      <div class="gl t14 mut">Aucune gare n’est rattachée à ta compagnie.</div>
    {/each}
  {:else}
    <div class="gl col" style="gap: 0">
      {#each personnes as p, i (p.id)}
        {@const r = resume(p.id)}
        <a class="li" href="/patron/personne?personne={p.id}" onclick={(e) => lier(e, `/patron/personne?personne=${p.id}`)}>
          <span class="av" class:hot={i % 3 === 1} aria-hidden="true">{initiales(p)}</span>
          <span class="col grow"><span class="t14 b7 ell">{p.prenom} · {ETIQUETTE_ROLE[p.role]}</span><span class="t12 mut ell">{p.gareId ? gareNom(p.gareId) : 'tournante'}</span></span>
          <span class="col" style="align-items: flex-end; gap: 2px"><span class="t13 b7 nowrap">{r.v}</span><span class="pl {r.plc}">{r.pl}</span></span>
        </a>
      {:else}
        <span class="t14 mut" style="padding: 14px 0">Personne n’est encore rattaché à ta compagnie.</span>
      {/each}
    </div>
  {/if}
</Colonne>
</Mobile>

<style>
  .gr { display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: 22px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); text-decoration: none; color: inherit; min-height: 44px; }
  .gr.hot { border-color: rgba(255, 91, 222, 0.4); background: linear-gradient(135deg, rgba(255, 91, 222, 0.16), rgba(139, 124, 255, 0.1)); }
  .avs { display: flex; } .avs .av { width: 30px; height: 30px; font-size: 11px; border: 2px solid #05070d; margin-left: -8px; } .avs .av:first-child { margin-left: 0; }
  .lien { text-decoration: none; min-height: 44px; padding: 0 14px; } .nowrap { white-space: nowrap; }
</style>
