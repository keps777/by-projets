<script lang="ts">
  import { ajouterJours, jourCourt } from '../../core/dates.ts';
  import { quaiDe } from '../../core/quai.ts';
  import { initiales, ETIQUETTE_ROLE } from '../../core/equipe.ts';
  import { caissesDe, etatRapport, ficheGare, quais, REF_PERIODE } from '../../core/fichegare.ts';
  import { libelleVariation, type Periode } from '../../core/indicateurs.ts';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { param, aller } from '../../router.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Colonne from './Colonne.svelte';
  import { etatPatron } from './etat.ts';
  import { dockPatron } from './dockPatron.ts';
  import { compagnieNom, contexte, francs, gareNom, pourcent, signe } from './lecture.ts';

  const now = maintenant();
  const ctx = $derived(contexte(now));
  const gare = $derived(app.monde.gares.find((g) => g.id === (param('gare') ?? 'mvan')));
  let periode = $state<Periode>(etatPatron().periode);
  const choisir = (p: Periode) => { periode = p; etatPatron().periode = p; };
  const fiche = $derived(gare ? ficheGare(app.monde, gare.id, { periode, jour: ctx.jour, now, compagnieId: ctx.compagnieId }) : null);
  const prochains = $derived(gare ? quais(app.monde, gare.id, { jour: ctx.jour, now, compagnieId: ctx.compagnieId }) : []);
  const equipe = $derived(gare ? app.monde.personnes.filter((p) => p.gareId === gare.id && p.compagnieId === ctx.compagnieId).sort((a, b) => a.role.localeCompare(b.role)) : []);
  const sup = $derived(equipe.find((p) => p.role === 'superviseur'));
  const caisses = $derived(gare ? caissesDe(app.monde, gare.id, ctx.jour) : []);
  const lignes = $derived(gare ? app.monde.lignes.filter((l) => l.gareDe === gare.id && l.compagnieId === ctx.compagnieId) : []);
  const horaires = $derived(lignes.flatMap((l) => l.horaires).sort());
  const rapport = $derived(etatRapport(caisses, now));
  const rapports = $derived(gare ? [0, 1, 2, 3, 4].map((i) => { const j = ajouterJours(ctx.jour, -i), cs = caissesDe(app.monde, gare.id, j); return { jour: j, etat: i === 0 ? rapport : etatRapport(cs, now), ecart: cs.reduce((s, c) => s + (c.ecart ?? 0), 0), n: cs.length }; }).filter((r) => r.n > 0) : []);
  const lier = (e: MouseEvent, vers: string) => { e.preventDefault(); aller(vers); };
  const PERIODES: [Periode, string][] = [['jour', 'Jour'], ['semaine', 'Semaine'], ['mois', 'Mois']];
  const statutCaisse = { ouverte: ['en cours', 'inf'], fermee: ['à valider', 'wa'], validee: ['validée', 'ok'], bloquee: ['bloquée', 'er'] } as const;
</script>

<Mobile titre={gare ? gareNom(gare.id) : 'Gare introuvable'} sous={gare ? `${sup ? `superviseur ${sup.prenom}` : 'sans superviseur'}${horaires.length ? ` · dès ${horaires[0]}` : ''}` : ''} retourVers="/patron/equipe" dock={dockPatron('gares')}>
  {#snippet droite()}
    {#if gare}<a class="pl lien {rapport.code === 'envoye' ? 'ok' : rapport.code === 'retard' ? 'wa' : ''}" href="/rapport-soir?gare={gare.id}" onclick={(e) => lier(e, `/rapport-soir?gare=${gare!.id}`)}>rapport</a>{/if}
  {/snippet}
<Colonne>

  {#if !gare || !fiche}
    <div class="center"><span class="ttl t20">Cette gare n’existe pas</span><span class="t14 mut">Reviens à la liste de tes gares.</span><a class="b p" href="/patron/equipe" onclick={(e) => lier(e, '/patron/equipe')}>Mes gares</a></div>
  {:else}
    <div class="seg2" role="group" aria-label="Période">
      {#each PERIODES as [p, nom] (p)}<button type="button" class:on={periode === p} aria-pressed={periode === p} onclick={() => choisir(p)}>{nom}</button>{/each}
    </div>
    <div class="row g8">
      <div class="gl grow ac col g4"><span class="lab">Recette</span><span class="ttl t20 nowrap">{francs(fiche.recette)}</span><span class="t12 {fiche.variation !== null && fiche.variation < 0 ? 'erc' : fiche.variation === null ? 'mut' : 'okc'}">{libelleVariation(fiche.variation)} {fiche.variation === null ? '' : REF_PERIODE[periode]}</span></div>
      <div class="gl grow col g4"><span class="lab">Billets</span><span class="ttl t20">{fiche.billets}</span><span class="t12 mut">{fiche.bus} bus · {pourcent(fiche.remplissage)}</span></div>
    </div>
    <div class="gl">
      <div class="row sp" style="margin-bottom: 8px"><span class="lab">{fiche.legendeSerie}</span><span class="t12 mut">{fiche.paiements.length ? fiche.paiements.map((p) => `${p.moyen} ${p.part} %`).join(' · ') : 'aucun paiement'}</span></div>
      {#if fiche.recette > 0}
        <div class="spark" role="img" aria-label="Recette {fiche.legendeSerie.toLowerCase()}">{#each fiche.serie as h, i (i)}<i class:hi={h === 100} style="height: {Math.max(3, h)}%"></i>{/each}</div>
      {:else}
        <span class="t13 mut">Aucune vente sur cette période.</span>
      {/if}
    </div>

    <span class="lab">Quais maintenant</span>
    <div class="quais">
      {#each [0, 1, 2, 3] as i (i)}
        {@const q = prochains[i]}
        <div class="q"><span class="lab">{q ? `Q${quaiDe(q.departId)}` : 'Q—'}</span><span class="t13 b7 ell">{q ? q.vers : 'libre'}</span><span class="t12 mut">{q ? q.heure : '—'}</span><div class="bar" role="img" aria-label="Remplissage {q ? pourcent(q.remplissage) : '0 %'}"><i class:wa={q && q.remplissage >= 0.9} style="width: {q ? Math.round(q.remplissage * 100) : 0}%"></i></div></div>
      {/each}
    </div>

    <span class="lab">Caisses du jour</span>
    <div class="gl col" style="gap: 0">
      {#each caisses as c (c.id)}
        {@const agent = app.monde.personnes.find((p) => p.id === c.agentId)}
        <a class="li" href={c.statut === 'fermee' ? '/superviseur/valider' : '/superviseur'} onclick={(e) => lier(e, c.statut === 'fermee' ? '/superviseur/valider' : '/superviseur')}>
          <span class="pl {statutCaisse[c.statut][1]}">{statutCaisse[c.statut][0]}</span>
          <span class="col grow"><span class="t14 b7">{agent?.prenom ?? c.agentId}</span><span class="t12 mut">fond {francs(c.fond)}{c.ecart ? ` · écart ${signe(c.ecart)}` : ''}</span></span>
        </a>
      {:else}
        <span class="t13 mut" style="padding: 12px 0">Aucune caisse ouverte aujourd’hui dans cette gare.</span>
      {/each}
    </div>

    {#if rapports.length}
      <span class="lab">Rapports du soir</span>
      <div class="gl col" style="gap: 0">
        {#each rapports as r (r.jour)}
          <a class="li" href="/rapport-soir?gare={gare.id}&jour={r.jour}" onclick={(e) => lier(e, `/rapport-soir?gare=${gare!.id}&jour=${r.jour}`)}><span class="pl {r.etat.code === 'envoye' ? 'ok' : r.etat.code === 'retard' ? 'wa' : ''}">{r.etat.libelle}</span><span class="grow t14">{jourCourt(r.jour)}</span><span class="t13 {r.ecart < 0 ? 'wac' : 'mut'}">{r.ecart ? `écart ${signe(r.ecart)}` : 'sans écart'}</span></a>
        {/each}
      </div>
    {/if}

    <span class="lab">Équipe · {equipe.length} personne{equipe.length > 1 ? 's' : ''}</span>
    <div class="gl col" style="gap: 0">
      {#each equipe as p (p.id)}
        <a class="li" href="/patron/personne?personne={p.id}" onclick={(e) => lier(e, `/patron/personne?personne=${p.id}`)}><span class="av sm" aria-hidden="true">{initiales(p)}</span><span class="grow t14">{p.prenom} {p.nom}</span><span class="t12 mut">{ETIQUETTE_ROLE[p.role]}{p.actif ? '' : ' · suspendu'}</span></a>
      {:else}
        <span class="t13 mut" style="padding: 12px 0">{compagnieNom(ctx.compagnieId)} n’a personne dans cette gare.</span>
      {/each}
    </div>
    <div class="gl col" style="gap: 0">
      <a class="li" href="/superviseur/equipe" onclick={(e) => lier(e, '/superviseur/equipe')}><span class="grow t14">Équipe de la gare</span><span class="t13 aq">voir</span></a>
      <a class="li" href="/siege/analyses/ligne" onclick={(e) => lier(e, '/siege/analyses/ligne')}><span class="grow t14">Lignes depuis {gare.nom} · {lignes.length}</span><span class="t13 aq">analyser</span></a>
      <a class="li" href="/siege/config/ligne" onclick={(e) => lier(e, '/siege/config/ligne')}><span class="grow t14">Tarifs et horaires</span><span class="t13 aq">modifier</span></a>
    </div>
  {/if}
</Colonne>
</Mobile>

<style>
  .quais { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .q { display: flex; flex-direction: column; gap: 4px; padding: 10px 8px; border-radius: 16px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); min-width: 0; }
  .lien { text-decoration: none; min-height: 44px; padding: 0 14px; } .nowrap { white-space: nowrap; }
  .spark { height: 56px; }
</style>
