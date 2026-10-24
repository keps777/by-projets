<script lang="ts">
  import { untrack } from 'svelte';
  import { repondre, simulerPrix, type Action } from '../../core/assistant.ts';
  import { garesDe } from '../../core/indicateurs.ts';
  import { app } from '../../data/store.svelte.ts';
  import { param, aller } from '../../router.svelte.ts';
  import Icone from '../../ui/Icone.svelte';
  import Mobile from '../../ui/Mobile.svelte';
  import Colonne from './Colonne.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { appliquerPrix, noterQuestion } from './actions.ts';
  import { dockPatron } from './dockPatron.ts';
  import { contexte } from './lecture.ts';
  import { moduleActif } from './modules.ts';
  import ModuleMasque from './ModuleMasque.svelte';

  const q = $derived((param('q') ?? '').slice(0, 200));
  // La réponse est figée pour la question : appliquer un prix ne doit pas la réécrire sous les yeux du patron.
  const r = $derived.by(() => { const question = q; return untrack(() => { const c = contexte(); return { rep: repondre(c, question), c }; }); });
  $effect(() => { if (q) untrack(() => noterQuestion(q)); });
  const rep = $derived(r.rep);
  const nbGares = $derived(garesDe(app.monde, app.monde.personnes, r.c.compagnieId).length);
  const max = $derived(Math.max(1, ...(rep.serie?.valeurs ?? [0])));
  let ouvert = $state(false), confirmation = $state<Action | null>(null), appliques = $state<string[]>([]), saisie = $state('');
  $effect(() => { q; ouvert = false; confirmation = null; });
  const simulation = $derived(confirmation?.prix ? simulerPrix(r.c, confirmation.prix) : null);
  const cle = (a: Action) => (a.prix ? `${a.prix.ligneId}|${a.prix.heure}|${a.prix.prix}` : a.libelle);
  const lier = (e: MouseEvent, v: string) => { e.preventDefault(); aller(v); };
  const vers = (s: string) => `/assistant/reponse?q=${encodeURIComponent(s)}`;
  function appliquer() {
    const a = confirmation; if (!a?.prix) return;
    const res = appliquerPrix(a.prix.ligneId, a.prix.heure, a.prix.prix);
    montrer(res.message ?? res.raison ?? '', res.ok ? 'ok' : 'er');
    if (res.ok) appliques = [...appliques, cle(a)];
    confirmation = null;
  }
  function poser(e: SubmitEvent) { e.preventDefault(); const s = saisie.trim(); if (s) aller(vers(s)); saisie = ''; }
</script>

<Mobile dock={dockPatron('')} sansRetour>
  {#snippet enteteLibre()}
    <header class="hd">
      <a class="ib" href="/assistant" aria-label="Retour à l’assistant" onclick={(e) => lier(e, '/assistant')}><Icone nom="retour" /></a>
      <span class="ttl t18 grow">Assistant</span>
      <span class="pl ac ell src">sources : {nbGares} gare{nbGares > 1 ? 's' : ''}</span>
    </header>
  {/snippet}
<Colonne>

  {#if !moduleActif('assistant')}
    <ModuleMasque cle="assistant" />
  {:else}
    {#if q}<div class="msg me">{q}</div>{/if}
    <div class="msg" aria-live="polite">
      <span><b>{rep.titre}</b>{#if rep.texte}. {rep.texte}{/if}</span>

      {#if rep.serie}
        <div class="cmp" role="img" aria-label="Billets par jour : {rep.serie.libelles.map((l, i) => `${l} ${rep.serie!.valeurs[i]}`).join(', ')}">
          {#each rep.serie.valeurs as v, i (i)}<i class:lo={rep.serie.creux[i]} style="height: {Math.max(6, Math.round((v / max) * 100))}%"></i>{/each}
        </div>
        <div class="cmp-l t12 mut" aria-hidden="true">{#each rep.serie.libelles as l, i (i)}<span class:erc={rep.serie.creux[i]}>{l}</span>{/each}</div>
        <div class="cmp-l t12 mono" aria-hidden="true">{#each rep.serie.valeurs as v, i (i)}<span class:erc={rep.serie.creux[i]}>{v}</span>{/each}</div>
      {/if}

      {#if rep.chiffres.length}
        <div class="col" style="gap: 0">
          {#each rep.chiffres as c (c.libelle)}<div class="row sp t13 chiffre"><span class="mut">{c.libelle}</span><span class="b7 nowrap {c.ton === 'er' ? 'erc' : c.ton === 'ok' ? 'okc' : c.ton === 'wa' ? 'wac' : ''}">{c.valeur}</span></div>{/each}
        </div>
      {/if}

      {#if rep.points.length}
        <span class="lab">{rep.pointsTitre || 'Pistes'}</span>
        {#each rep.points as p, i (i)}
          {#if rep.intention === 'inconnue'}
            <a class="cause" href={vers(p.titre)} onclick={(e) => lier(e, vers(p.titre))}><span class="bub aq pastille">?</span><span class="col grow"><span class="t14 b7">{p.titre}</span></span></a>
          {:else}
            <div class="cause"><span class="bub pastille" class:aq={i === 0}>{i + 1}</span><span class="col grow"><span class="t14 b7">{p.titre}</span>{#if p.detail}<span class="t12 mut">{p.detail}</span>{/if}</span></div>
          {/if}
        {/each}
      {/if}
      {#if rep.intention !== 'inconnue'}<span class="t12 mut3">Je ne change rien sans toi. Les chiffres viennent des caisses et des scans, pas d’estimations. {rep.sources}.</span>{/if}
    </div>

    {#if rep.actions.length}
      <span class="lab">Actions proposées</span>
      <div class="row g8 wrapf">
        {#each rep.actions as a (cle(a))}
          {#if a.prix}
            {#if appliques.includes(cle(a))}<span class="b s sm grow fait" role="status"><Icone nom="ok" taille={18} /> Prix appliqué</span>
            {:else}<button type="button" class="b {a.style} sm grow" aria-expanded={confirmation === a} onclick={() => (confirmation = confirmation === a ? null : a)}>{a.libelle}</button>{/if}
          {:else if a.lien}
            <a class="b {a.style} sm grow" href={a.lien} onclick={(e) => lier(e, a.lien!)}>{a.libelle}</a>
          {/if}
        {/each}
      </div>
    {/if}

    {#if confirmation?.prix}
      <div class="gl ac col g12" role="group" aria-label="Confirmer le changement de prix">
        <span class="t14 b7">{confirmation.libelle} ?</span>
        <span class="t13 mut">{simulation ? simulation.texte : 'Le prix change pour les prochains départs à cette heure. Les billets déjà vendus gardent leur prix.'}</span>
        <div class="row g8"><button type="button" class="b s" onclick={() => (confirmation = null)}>Non, garder</button><button type="button" class="b p" onclick={appliquer}>Oui, appliquer</button></div>
      </div>
    {/if}

    {#if rep.suite}
      <button type="button" class="inp suite" aria-expanded={ouvert} onclick={() => (ouvert = !ouvert)}><span class="grow">{rep.suite.question}</span></button>
      {#if ouvert}<div class="msg" role="status">{rep.suite.reponse}</div>{/if}
    {/if}

    <form class="row g8 compose" onsubmit={poser}>
      <label class="grow" style="display: flex"><span class="sr">Une autre question</span><input class="inp grow" type="text" bind:value={saisie} placeholder="Une autre question…" autocomplete="off" maxlength="200" enterkeyhint="send" /></label>
      <button class="ib" type="submit" aria-label="Envoyer la question" disabled={!saisie.trim()}><Icone nom="suivant" /></button>
    </form>
  {/if}
</Colonne>
</Mobile>

<style>
  .src { max-width: 45%; display: inline-block; line-height: 26px; }
  .msg { padding: 12px 14px; border-radius: 20px 20px 20px 4px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.12); font-size: 14px; display: flex; flex-direction: column; gap: 10px; }
  .msg.me { align-self: flex-end; max-width: 85%; border-radius: 20px 20px 4px 20px; background: linear-gradient(135deg, rgba(139, 124, 255, 0.35), rgba(61, 224, 255, 0.25)); }
  .cmp { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; align-items: end; height: 80px; }
  .cmp i { border-radius: 4px 4px 2px 2px; background: linear-gradient(180deg, #3de0ff, rgba(61, 224, 255, 0.2)); } .cmp i.lo { background: linear-gradient(180deg, #ff6b6b, rgba(255, 107, 107, 0.2)); }
  .cmp-l { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; text-align: center; margin-top: -6px; }
  .cause { display: flex; gap: 10px; align-items: flex-start; padding: 8px 0; border-top: 1px solid rgba(255, 255, 255, 0.08); text-decoration: none; color: inherit; }
  .pastille { width: 30px; height: 30px; font-size: 13px; }
  .chiffre { padding: 6px 0; border-top: 1px solid rgba(255, 255, 255, 0.06); gap: 12px; } .nowrap { white-space: nowrap; }
  .suite { margin-top: 4px; cursor: pointer; min-height: 52px; height: auto; padding-top: 10px; padding-bottom: 10px; }
  .compose { margin-top: auto; padding-top: 8px; } .ib:disabled { opacity: 0.4; } .fait { color: #7cf0a6; cursor: default; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  input.inp { outline: none; } input.inp:focus { border-color: #3de0ff; }
</style>
