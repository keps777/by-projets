<script lang="ts">
  import { onMount } from 'svelte';
  import { quaiDe } from '../../core/quai.ts';
  import { app } from '../../data/store.svelte.ts';
  import { param } from '../../router.svelte.ts';
  import { personneCourante } from '../../domain/actions.ts';
  import { departsGare, construireRapport, recetteDuJour } from '../../core/gare.ts';
  import { ajouterJours, jourDe } from '../../core/dates.ts';
  import { fcfa } from '../../core/money.ts';
  import { evolution, fmtEvolution } from '../../core/rapport.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { alertesGare } from './alertes.ts';
  import { amorcerDemo } from './demo.ts';
  import { dockSuperviseur } from './dock.ts';
  import { gareSuivie, horloge, rafraichir } from './etat.svelte.ts';
  import { hhmm, initiales, va } from './nav.ts';

  const moi = $derived(personneCourante());
  const gareId = $derived(gareSuivie(moi, param('gare')));
  const gare = $derived(app.monde.gares.find((g) => g.id === gareId));
  const now = $derived(horloge.t);
  const jour = $derived(jourDe(new Date(now)));
  const departs = $derived(departsGare(app.monde, gareId, jour, now, moi?.compagnieId));
  const rapport = $derived(construireRapport(app.monde, { gareId, jour, now, superviseur: moi?.prenom ?? '', compagnieId: moi?.compagnieId }));
  const alertes = $derived(alertesGare(app.monde, gareId, now, moi?.compagnieId));
  const veille = $derived(recetteDuJour(app.monde, gareId, ajouterJours(jour, -1), moi?.compagnieId));
  const deltaVeille = $derived(evolution(rapport.recette, veille));
  const nbGuichets = $derived(app.monde.personnes.filter((p) => p.role === 'guichet' && p.gareId === gareId && p.actif).length);
  const equipe = $derived(app.monde.personnes.filter((p) => p.gareId === gareId && p.actif && p.role !== 'superviseur').length);
  type Filtre = 'avenir' | 'partis' | 'tous';
  let filtre = $state<Filtre>('avenir');
  const vus = $derived(departs.filter((d) => (filtre === 'tous' ? true : filtre === 'avenir' ? d.statut === 'prevu' || d.statut === 'embarquement' : d.statut === 'parti' || d.statut === 'arrive')));
  const quais = $derived.by(() => {
    const prochains = departs.filter((d) => d.statut === 'embarquement' || d.statut === 'prevu').slice(0, 4);
    return Array.from({ length: 4 }, (_, i) => prochains[i] ?? null);
  });
  const STATUT = { prevu: { t: 'prévu', c: '' }, embarquement: { t: 'embarquement', c: 'ac' }, parti: { t: 'parti', c: 'inf' }, arrive: { t: 'arrivé', c: 'ok' }, annule: { t: 'annulé', c: 'er' } } as const;
  const CAISSE = { ouverte: { t: 'ouverte', c: 'ok' }, fermee: { t: 'à valider', c: 'wa' }, validee: { t: 'validée', c: '' }, bloquee: { t: 'bloquée', c: 'er' } } as const;

  onMount(() => {
    if (moi && gare) amorcerDemo(gareId);
    rafraichir(); const t = setInterval(rafraichir, 15_000); return () => clearInterval(t);
  });
</script>

<Mobile dock={dockSuperviseur('gare')}>
  {#snippet enteteLibre()}
    <header class="hd">
      <div class="row g12">
        <span class="av" aria-hidden="true">{moi ? initiales(moi) : '··'}</span>
        <div class="col"><span class="ttl t14 ell">{moi?.prenom ?? '—'} · superviseur</span><span class="t13 mut">Gare de {gare?.nom ?? gareId} · <span class="mono">{hhmm(now)}</span></span></div>
      </div>
      {#if alertes.length}<span class="pl er" role="status"><span class="dot"></span>{alertes.length} à traiter</span>{:else}<span class="pl ok" role="status">tout est traité</span>{/if}
    </header>
  {/snippet}

  <div class="row g8">
    <div class="gl grow col g4"><span class="lab">Ventes du jour</span><span class="ttl t20">{fcfa(rapport.recette)} F</span>
      <span class="t12" class:okc={deltaVeille !== null && deltaVeille >= 0} class:wac={deltaVeille !== null && deltaVeille < 0} class:mut3={deltaVeille === null}>{deltaVeille === null ? `${rapport.billets} billet${rapport.billets > 1 ? 's' : ''}` : `${fmtEvolution(deltaVeille)} vs hier`}</span></div>
    <div class="gl grow col g4"><span class="lab">Caisses</span><span class="ttl t20">{rapport.caisses.ouvertes} / {nbGuichets}</span>
      <span class="t12" class:wac={rapport.caisses.bloquees + rapport.caisses.aValider > 0} class:okc={rapport.caisses.bloquees + rapport.caisses.aValider === 0}>{#if rapport.caisses.bloquees}{rapport.caisses.bloquees} guichet{rapport.caisses.bloquees > 1 ? 's' : ''} bloqué{rapport.caisses.bloquees > 1 ? 's' : ''}{:else if rapport.caisses.aValider}{rapport.caisses.aValider} à valider{:else if nbGuichets === 0}aucun guichet{:else}toutes à jour{/if}</span></div>
  </div>

  <span class="lab">Quais</span>
  <div class="quais">
    {#each quais as q, i (i)}
      {#if q}
        <a class="q" class:hot={q.statut === 'embarquement'} href="/quai?depart={q.id}" onclick={va(`/quai?depart=${q.id}`)} aria-label="Quai {quaiDe(q.id)} : {q.heureReelle} {q.vers}, {q.statut === 'embarquement' ? 'embarquement' : 'prévu'}, rempli à {Math.round(q.remplissage * 100)} %">
          <span class="lab">Q{quaiDe(q.id)}</span><span class="t14 b7 mono">{q.heureReelle}</span><span class="t12 mut ell">{q.vers}{q.classe === 'VIP' ? ' VIP' : ''}</span>
          <div class="bar" aria-hidden="true"><i class:wa={q.remplissage >= 0.9} style="width: {Math.round(q.remplissage * 100)}%"></i></div>
        </a>
      {:else}
        <div class="q libre"><span class="lab">Q—</span><span class="t14 b7">—</span><span class="t12 mut">libre</span><div class="bar" aria-hidden="true"><i style="width: 0%"></i></div></div>
      {/if}
    {/each}
  </div>

  <span class="lab">À traiter</span>
  <div class="gl col" style="gap: 0">
    {#each alertes as a (a.id)}
      <a class="al" href={a.href} onclick={va(a.href)}><span class="pl {a.ton}">{a.etiquette}</span><span class="col grow"><span class="t14 b7">{a.titre}</span><span class="t12 mut">{a.sous}</span></span><span class="t13 aq">décider</span></a>
    {:else}
      <div class="row g12" style="padding: 8px 0"><span class="bub" style="color: #4ade80"><Icone nom="ok" /></span><span class="col"><span class="t14 b7">Rien à traiter</span><span class="t12 mut">La gare est à jour, bon service.</span></span></div>
    {/each}
  </div>

  <div class="row sp"><span class="lab">Départs du jour</span><span class="t12 mut3 row g6"><span class="dot okc" aria-hidden="true"></span>en direct</span></div>
  <div class="seg2" role="group" aria-label="Filtrer les départs">
    <button type="button" class:on={filtre === 'avenir'} aria-pressed={filtre === 'avenir'} onclick={() => (filtre = 'avenir')}>À venir</button>
    <button type="button" class:on={filtre === 'partis'} aria-pressed={filtre === 'partis'} onclick={() => (filtre = 'partis')}>Partis</button>
    <button type="button" class:on={filtre === 'tous'} aria-pressed={filtre === 'tous'} onclick={() => (filtre = 'tous')}>Tous</button>
  </div>
  <div class="gl col" style="gap: 0">
    {#each vus as d (d.id)}
      <a class="li dep" href="/superviseur/voir?depart={d.id}" onclick={va(`/superviseur/voir?depart=${d.id}`)}>
        <span class="col" style="min-width: 54px"><span class="t14 b7 mono" class:wac={d.retardMin > 0}>{d.heureReelle}</span>{#if d.retardMin > 0}<span class="t12 wac mono">+{d.retardMin} min</span>{/if}</span>
        <span class="col grow"><span class="t14 b7 ell">{d.vers} <span class="cie" style="color: {d.couleur}">{d.compagnie}{d.classe === 'VIP' ? ' VIP' : ''}</span></span>
          <span class="t12 mut">{#if d.statut === 'annule'}départ annulé{:else if d.statut === 'parti' || d.statut === 'arrive'}{d.occupes} à bord · {d.capacite} places{:else}{d.scannes}/{d.occupes} à bord · {d.capacite} places{/if}</span></span>
        <span class="pl {STATUT[d.statut].c}">{STATUT[d.statut].t}</span>
      </a>
    {:else}
      <div class="t13 mut c" style="padding: 12px 0">{departs.length === 0 ? 'Aucun départ aujourd’hui dans cette gare.' : filtre === 'avenir' ? 'Plus de départ à venir aujourd’hui.' : 'Aucun bus parti pour le moment.'}</div>
    {/each}
  </div>

  <span class="lab">Ventes par guichet</span>
  {#if rapport.guichets.length === 0 && rapport.convoyeurs.billets === 0 && rapport.enLigne.billets === 0}
    <div class="gl t13 mut c">Aucune vente enregistrée aujourd’hui.</div>
  {:else}
    <div class="gl">
      <table class="tbl"><thead><tr><th scope="col">Guichet</th><th scope="col" class="r">Billets</th><th scope="col" class="r">Espèces</th><th scope="col" class="r">Caisse</th></tr></thead>
        <tbody>
          {#each rapport.guichets as g (g.cle)}
            {@const st = CAISSE[g.statut as keyof typeof CAISSE]}
            <tr><td>{g.libelle}</td><td class="r mono">{g.billets}</td><td class="r mono">{fcfa(g.especes)}</td><td class="r"><span class="pl {st?.c}">{st?.t}</span></td></tr>
          {/each}
          {#if rapport.convoyeurs.billets}<tr><td>Convoyeurs</td><td class="r mono">{rapport.convoyeurs.billets}</td><td class="r mono">{fcfa(rapport.convoyeurs.especes)}</td><td class="r mut3">—</td></tr>{/if}
          {#if rapport.enLigne.billets}<tr><td>En ligne</td><td class="r mono">{rapport.enLigne.billets}</td><td class="r mono">{fcfa(rapport.enLigne.total)}</td><td class="r mut3">—</td></tr>{/if}
        </tbody></table>
    </div>
  {/if}

  <div class="bento">
    <a class="tile" href="/superviseur/equipe" onclick={va('/superviseur/equipe')}><span class="t15 b7">Équipe</span><span class="t12 mut">{equipe} agent{equipe > 1 ? 's' : ''} · PIN, comptes</span></a>
    <a class="tile" href="/rapport-soir" onclick={va('/rapport-soir')}><span class="t15 b7">Rapport du soir</span><span class="t12 mut">prêt à 19:00 · WhatsApp</span></a>
  </div>
</Mobile>

<style>
  .quais { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; perspective: 600px; }
  .q { display: flex; flex-direction: column; gap: 4px; padding: 10px 8px; border-radius: 16px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); text-decoration: none; color: inherit; transform: rotateX(14deg); transform-origin: 50% 100%; min-width: 0; min-height: 88px; }
  .q.hot { background: linear-gradient(135deg, rgba(139, 124, 255, 0.25), rgba(61, 224, 255, 0.15)); border-color: #8b7cff; }
  .q.libre { opacity: 0.7; }
  .al { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); text-decoration: none; color: inherit; min-height: 56px; }
  .al:last-child { border: 0; }
  .dep { min-height: 60px; }
  .cie { font: 600 11px 'Geist Mono', monospace; letter-spacing: 0.06em; }
  .seg2 button.on { background: rgba(255, 255, 255, 0.16); color: #f2f4ff; }
  .t15 { font-size: 15px; }
  @media (prefers-reduced-motion: reduce) { .q { transform: none; } }
</style>
