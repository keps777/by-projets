<script lang="ts">
  import { LIBELLE } from '../../core/colis.ts';
  import { jourLong } from '../../core/dates.ts';
  import { aRegler, bilanMois, couvre, libelleStatut, lignesCouvertes, repartition, villesDuColis } from '../../core/interagences.ts';
  import { app } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Colonne from './Colonne.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { confierColis, proposerConvention, reglerPartenaire } from './actions.ts';
  import { dockPatron } from './dockPatron.ts';
  import { etatInterAgences } from './etat.ts';
  import { compagnieNom, contexte, francs } from './lecture.ts';
  import { moduleActif } from './modules.ts';
  import ModuleMasque from './ModuleMasque.svelte';

  const ctx = $derived(contexte());
  const ia = $derived(app.tranches.interAgences ? etatInterAgences() : { conventions: [], liens: [] });
  const ordre = ['active', 'signee', 'brouillon', 'demandee'];
  const lignes = $derived(app.monde.compagnies.filter((c) => c.id !== ctx.compagnieId).map((c) => {
    const conv = ia.conventions.find((x) => x.partenaireId === c.id);
    return { c, conv, n: bilanMois(ia.liens, ctx.jour, c.id).colis, dus: aRegler(ia.liens, c.id), zones: lignesCouvertes(app.monde.lignes, c.id) };
  }).sort((a, b) => (a.conv ? ordre.indexOf(a.conv.statut) : 9) - (b.conv ? ordre.indexOf(b.conv.statut) : 9)));
  const bilan = $derived(bilanMois(ia.liens, ctx.jour));
  const nbConventions = $derived(ia.conventions.filter((c) => c.statut === 'active' || c.statut === 'signee').length);
  const actifs = $derived(lignes.filter((l) => l.conv?.statut === 'active'));
  const dejaConfies = $derived(new Set(ia.liens.map((l) => l.colisId)));
  const aConfier = $derived(app.monde.colis.filter((c) => (c.statut === 'cree' || c.statut === 'depose') && !dejaConfies.has(c.id)).map((c) => {
    const [a, b] = villesDuColis(c.depart, c.arrivee);
    return { c, a, b, possibles: actifs.filter((l) => couvre(app.monde.lignes, l.c.id, a, b)).map((l) => l.c) };
  }));
  const confies = $derived(ia.liens.map((l) => ({ l, colis: app.monde.colis.find((c) => c.id === l.colisId), nom: compagnieNom(l.partenaireId) })).filter((x) => x.colis));
  const noeuds = $derived(actifs.slice(0, 2).map((l, i) => ({ nom: l.c.nom, y: i === 0 ? 40 : 110 })));
  const lier = (e: MouseEvent, v: string) => { e.preventDefault(); aller(v); };
  function confier(colisId: string, partenaireId: string) { const r = confierColis(colisId, partenaireId); montrer(r.message ?? r.raison ?? '', r.ok ? 'ok' : 'er'); }
  function regler(id: string) { const r = reglerPartenaire(id); montrer(r.message ?? r.raison ?? '', r.ok ? 'ok' : 'er'); }
  function proposer(id: string) { const r = proposerConvention(id); montrer(r.message ?? r.raison ?? '', r.ok ? 'ok' : 'er'); if (r.ok) aller(`/inter-agences/convention?partenaire=${id}`); }
</script>

<Mobile titre="Inter-agences" sous="tes colis voyagent sur les lignes des autres" retourVers="/patron" dock={dockPatron('')}>
  {#snippet droite()}<span class="pl ac">{nbConventions} convention{nbConventions > 1 ? 's' : ''}</span>{/snippet}
<Colonne>

  {#if !moduleActif('interAgences')}
    <ModuleMasque cle="interAgences" />
  {:else}
    <div class="flow" role="img" aria-label="Flux de colis entre {compagnieNom(ctx.compagnieId)} et {actifs.length ? actifs.map((a) => a.c.nom).join(', ') : 'ses partenaires'}">
      <svg viewBox="0 0 358 150" aria-hidden="true">
        {#if noeuds.length}
          {#each noeuds as n, i (n.nom)}<path d="M60 75 L180 {n.y} L300 75" stroke={i === 0 ? 'rgba(61,224,255,.6)' : 'rgba(255,91,222,.6)'} stroke-width="3" fill="none" stroke-dasharray="8 6"></path>{/each}
        {:else}<path d="M60 75 L300 75" stroke="rgba(255,255,255,.25)" stroke-width="3" fill="none" stroke-dasharray="4 8"></path>{/if}
      </svg>
      <span class="nd" style="left: 60px; top: 75px"><i></i>Bêta · Yaoundé</span>
      {#each noeuds as n (n.nom)}<span class="nd" style="left: 180px; top: {n.y}px"><i class="o"></i>{n.nom}</span>{/each}
      <span class="nd" style="left: 300px; top: 75px"><i></i>Bêta · Douala</span>
      {#if !noeuds.length}<span class="vide t12 mut">aucune convention active</span>{/if}
    </div>
    <div class="row g8">
      <div class="gl grow col g4"><span class="lab">Ce mois</span><span class="ttl t20">{bilan.colis} colis</span><span class="t12 mut">{bilan.colis} confiés · 0 reçu</span></div>
      <div class="gl grow col g4"><span class="lab">Solde net</span><span class="ttl t20 {bilan.net < 0 ? 'wac' : 'okc'} nowrap">{bilan.net === 0 ? '0 F' : `${bilan.net < 0 ? '−' : '+'}${francs(Math.abs(bilan.net))}`}</span><span class="t12 mut">à régler le {jourLong(bilan.echeance)}</span></div>
    </div>

    <span class="lab">Partenaires</span>
    {#each lignes as l (l.c.id)}
      {#if l.conv}
        {@const st = libelleStatut[l.conv.statut]}
        <a class="bn" href="/inter-agences/convention?partenaire={l.c.id}" onclick={(e) => lier(e, `/inter-agences/convention?partenaire=${l.c.id}`)}>
          <span class="av hot" aria-hidden="true">{l.c.abrev}</span>
          <span class="col grow"><span class="t15 b7">{l.c.nom}</span><span class="t12 mut">{l.zones.join(', ') || 'aucune ligne'} · {l.conv.statut === 'demandee' ? 'a demandé une convention' : `partage ${l.conv.partBetaPct} / ${100 - l.conv.partBetaPct} · ${l.n} colis ce mois`}</span></span>
          <span class="pl {st.ton}">{st.texte}</span>
        </a>
      {:else}
        <div class="gl row g12"><span class="av" aria-hidden="true">{l.c.abrev}</span><span class="col grow"><span class="t15 b7">{l.c.nom}</span><span class="t12 mut">{l.zones.length ? l.zones.join(', ') : 'aucune ligne'} · pas de convention</span></span><button type="button" class="b s sm" onclick={() => proposer(l.c.id)}>Proposer</button></div>
      {/if}
    {/each}

    <span class="lab">Colis à confier</span>
    {#each aConfier as x (x.c.id)}
      <div class="gl col g8">
        <div class="row sp"><span class="col"><span class="t14 b7">{x.c.code} · {x.a} → {x.b}</span><span class="t12 mut">taille {x.c.taille} · {francs(x.c.prix)} · {LIBELLE[x.c.statut]}</span></span></div>
        {#if x.possibles.length}
          <div class="row g8 wrapf">{#each x.possibles as p (p.id)}<button type="button" class="b p sm grow" onclick={() => confier(x.c.id, p.id)}>Confier à {p.nom}</button>{/each}</div>
        {:else}
          <span class="t12 wac">{actifs.length ? `Aucun partenaire sous convention ne dessert ${x.a} → ${x.b}.` : 'Signe d’abord une convention avec un partenaire.'}</span>
        {/if}
      </div>
    {:else}
      <div class="gl t13 mut">Aucun colis en attente de départ. Ceux déposés au guichet apparaîtront ici.</div>
    {/each}

    {#if confies.length}
      <span class="lab">Colis confiés</span>
      <div class="gl col" style="gap: 0">
        {#each confies as x (x.l.colisId)}
          {@const part = repartition(x.l.prix, x.l.partBetaPct)}
          <div class="li"><span class="col grow"><span class="t14 b7">{x.colis!.code} · {x.nom}</span><span class="t12 mut">{LIBELLE[x.colis!.statut]} · {francs(x.l.prix)} · {x.nom} reçoit {francs(part.partenaire)}</span></span><span class="pl {x.l.regleLe ? 'ok' : 'wa'}">{x.l.regleLe ? 'réglé' : 'à régler'}</span></div>
        {/each}
      </div>
      {#each lignes.filter((l) => l.dus > 0) as l (l.c.id)}
        <button type="button" class="b s" onclick={() => regler(l.c.id)}>Régler {l.c.nom} · {francs(l.dus)}<small>MoMo Business · prévu le {jourLong(bilan.echeance)}</small></button>
      {/each}
    {/if}

    <div class="toast" role="note"><span class="bub aq" aria-hidden="true">i</span><span class="t13 grow">Le client ne voit qu’un seul code : AfriMove fait le relais entre compagnies et répartit l’argent.</span></div>
  {/if}
</Colonne>
</Mobile>

<style>
  .flow { position: relative; height: 150px; border-radius: 22px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.12); background: #0a0e1c; flex: none; }
  .flow svg { position: absolute; inset: 0; width: 100%; height: 100%; }
  .nd { position: absolute; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 3px; font: 600 11px 'Geist Mono', monospace; white-space: nowrap; }
  .nd i { width: 14px; height: 14px; border-radius: 50%; background: #3de0ff; box-shadow: 0 0 12px #3de0ff; } .nd i.o { background: #ff5bde; box-shadow: 0 0 12px #ff5bde; }
  .vide { position: absolute; left: 50%; top: 100px; transform: translateX(-50%); }
  .t15 { font-size: 15px; } .nowrap { white-space: nowrap; }
  .bn { min-height: 60px; }
</style>
