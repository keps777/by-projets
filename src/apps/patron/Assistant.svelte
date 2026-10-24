<script lang="ts">
  import { SUGGESTIONS } from '../../core/assistant.ts';
  import { libelleVariation, tableau } from '../../core/indicateurs.ts';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import Icone from '../../ui/Icone.svelte';
  import Mobile from '../../ui/Mobile.svelte';
  import Colonne from './Colonne.svelte';
  import { dockPatron } from './dockPatron.ts';
  import { etatAssistant } from './etat.ts';
  import { contexte, francs, gareNom } from './lecture.ts';
  import { moduleActif } from './modules.ts';
  import ModuleMasque from './ModuleMasque.svelte';
  import { noterQuestion } from './actions.ts';
  import { personneCourante } from '../../domain/actions.ts';

  const now = maintenant();
  const ctx = $derived(contexte(now));
  const t = $derived(tableau(app.monde, { jour: ctx.jour, now, compagnieId: ctx.compagnieId }));
  const pire = $derived([...t.gares].filter((g) => (g.variation ?? 0) <= -10).sort((a, b) => (a.variation ?? 0) - (b.variation ?? 0))[0]);
  const salut = $derived(new Date(now).getHours() >= 17 || new Date(now).getHours() < 4 ? 'Bonsoir' : 'Bonjour');
  const recentes = $derived(etatAssistant().questions.slice(0, 3));
  let saisie = $state(''), envoyee = $state(''), minuteur: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(minuteur));
  const vers = (q: string) => `/assistant/reponse?q=${encodeURIComponent(q)}`;
  function poser(e: SubmitEvent) {
    e.preventDefault();
    const q = saisie.trim(); if (!q) return;
    envoyee = q; noterQuestion(q);
    minuteur = setTimeout(() => aller(vers(q)), 450);
  }
  const lier = (e: MouseEvent, v: string) => { e.preventDefault(); aller(v); };
</script>

<Mobile dock={dockPatron('')} sansRetour>
  {#snippet enteteLibre()}
    <div class="halo" aria-hidden="true"></div>
    <header class="hd">
      <a class="ib" href="/patron" aria-label="Retour au tableau" onclick={(e) => lier(e, '/patron')}><Icone nom="retour" /></a>
      <div class="col grow"><span class="ttl t18">Assistant</span><span class="t13 mut">lit tes {t.gares.length} gares en direct · ne décide rien seul</span></div>
      <span class="pl ok"><span class="dot"></span>à jour</span>
    </header>
  {/snippet}
<Colonne>

  {#if !moduleActif('assistant')}
    <ModuleMasque cle="assistant" />
  {:else}
    <div class="msg">
      {salut} {personneCourante()?.prenom ?? ''}. Journée à <b class="nowrap">{francs(t.recette)}</b> (<span class="nowrap">{libelleVariation(t.variation)}</span>).
      {#if pire}Un point à regarder : <b>{gareNom(pire.gareId)}</b> est à <span class="nowrap">{libelleVariation(pire.variation)}</span>. <a href={vers(`Pourquoi ${gareNom(pire.gareId)} baisse ?`)} onclick={(e) => lier(e, vers(`Pourquoi ${gareNom(pire.gareId)} baisse ?`))}>Je te montre ?</a>
      {:else}Rien d’inquiétant dans tes gares pour l’instant.{/if}
    </div>
    {#if envoyee}<div class="msg me">{envoyee}</div><div class="msg" role="status">Je prépare la réponse avec tes chiffres…</div>{/if}

    {#if recentes.length}
      <span class="lab">Tes dernières questions</span>
      <div class="sug">{#each recentes as r (r.ts)}<a href={vers(r.q)} onclick={(e) => lier(e, vers(r.q))}><span class="bub" style="width: 32px; height: 32px"><Icone nom="horloge" taille={16} /></span>{r.q}</a>{/each}</div>
    {/if}
    <span class="lab">Questions fréquentes</span>
    <div class="sug">
      {#each SUGGESTIONS as s, i (s)}
        <a href={vers(s)} onclick={(e) => lier(e, vers(s))}><span class="bub" class:aq={i === 0} style="width: 32px; height: 32px">?</span>{s}</a>
      {/each}
    </div>
    <form class="row g8 compose" onsubmit={poser}>
      <label class="grow" style="display: flex"><span class="sr">Ta question</span><input class="inp grow" type="text" bind:value={saisie} placeholder="Pose ta question…" autocomplete="off" enterkeyhint="send" maxlength="200" /></label>
      <button class="ib envoi" type="submit" aria-label="Envoyer la question" disabled={!saisie.trim() || !!envoyee}><Icone nom="suivant" /></button>
      <a class="ib" href="/voix" aria-label="Parler" onclick={(e) => lier(e, '/voix')}><Icone nom="micro" taille={20} /></a>
    </form>
  {/if}
</Colonne>
</Mobile>

<style>
  .nowrap { white-space: nowrap; }
  .msg { max-width: 88%; padding: 12px 14px; border-radius: 20px 20px 20px 4px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.12); font-size: 14px; }
  .msg.me { align-self: flex-end; border-radius: 20px 20px 4px 20px; background: linear-gradient(135deg, rgba(139, 124, 255, 0.35), rgba(61, 224, 255, 0.25)); }
  .sug { display: flex; flex-direction: column; gap: 8px; }
  .sug a { display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 8px 14px; border-radius: 16px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); text-decoration: none; color: #f2f4ff; font-size: 14px; }
  .halo { position: absolute; left: 50%; top: 60px; width: min(360px, 100%); height: 360px; margin-left: calc(min(360px, 100%) / -2); border-radius: 50%; background: radial-gradient(circle, rgba(139, 124, 255, 0.3), transparent 60%); pointer-events: none; }
  .compose { margin-top: auto; padding-top: 8px; } .envoi:disabled { opacity: 0.4; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  input.inp { outline: none; } input.inp:focus { border-color: #3de0ff; }
</style>
