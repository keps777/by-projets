<script lang="ts">
  import './guichet.css';
  import { aller, param } from '../../router.svelte.ts';
  import { departParId } from '../../domain/actions.ts';
  import { etatMontee } from '../../core/guichet.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Lecture from './Lecture.svelte';
  import { dockAgent } from './dock.ts';
  import { compterMontee, contexte, departsDeLaGare, enregistrerComptage, nomDepart, vendusDuDepart } from './actions.ts';
  import { etat } from './etat.ts';

  const ctx = $derived(contexte());
  const demande = param('depart');
  const depart = $derived((demande ? departParId(demande) : undefined) ?? (ctx.agent?.gareId ? departsDeLaGare(ctx.agent.gareId, 1)[0] : undefined));
  const montes = $derived(depart ? (etat().montes[depart.id] ?? 0) : 0);
  const vendus = $derived(depart ? vendusDuDepart(depart) : 0);
  const etatQuai = $derived(depart ? etatMontee(montes, vendus, depart.capacite) : null);
  let enregistre = $state(false);
  function plus(delta: number) { if (!depart || ctx.lecture) return; compterMontee(depart.id, delta, depart.capacite); enregistre = false; }
  function clore() { if (!depart || !ctx.agent || ctx.lecture) return; enregistrerComptage(ctx.agent.id, depart); enregistre = true; montrer('Comptage enregistré dans le journal'); }
  const lien = (e: MouseEvent, vers: string) => { e.preventDefault(); aller(vers); };
</script>

<Mobile titre={depart ? `${depart.heure} ${nomDepart(depart)}` : 'Comptage au quai'} sous="placement libre · compter les montées" retourVers="/cadence" dock={dockAgent()}>
  {#snippet droite()}{#if etatQuai}<span class="pl {etatQuai.ton}">{etatQuai.texte}</span>{/if}{/snippet}
  {#if ctx.lecture}<Lecture agent={ctx.agent} />{/if}
  {#if !depart || !etatQuai}
    <div class="gl col g8"><span class="t16 b7">Aucun départ à compter</span><a class="b p" href="/guichet" onclick={(e) => lien(e, '/guichet')}>Retour au guichet</a></div>
  {:else}
    <div class="gl ac row sp">
      <span class="kp"><span class="k">Montés</span><span class="cnt" aria-live="polite">{montes}</span></span>
      <span class="kp" style="align-items: flex-end"><span class="k">Vendus</span><span class="ttl t24">{vendus}</span></span>
    </div>
    <p class="t14 b7 c" class:erc={etatQuai.ton === 'er'} class:okc={etatQuai.ton === 'ok'} aria-live="polite">{etatQuai.message}</p>
    <div class="grid" role="img" aria-label="{montes} places occupées sur {depart.capacite}">{#each Array(depart.capacite) as _, i (i)}<i class:f={i < montes}></i>{/each}</div>
    <button type="button" class="tap" disabled={ctx.lecture || montes >= depart.capacite} onclick={() => plus(1)}>+1 montée</button>
    <div class="row g8"><button type="button" class="b s" disabled={ctx.lecture || montes <= 0} onclick={() => plus(-1)}>−1</button><button type="button" class="b s" disabled={ctx.lecture} onclick={clore}>{enregistre ? 'Comptage enregistré' : 'Enregistrer le comptage'}</button></div>
    <a class="b s" href="/quai" onclick={(e) => lien(e, '/quai')}>Scanner un billet app</a>
    <a class="b g" href="/chauffeur?depart={depart.id}" onclick={(e) => lien(e, `/chauffeur?depart=${depart.id}`)}>Donner le départ au chauffeur</a>
    <span class="t12 mut3 c">{depart.retardMin ? `Retard +${depart.retardMin} min` : 'À l’heure'} · capacité {depart.capacite} places</span>
  {/if}
</Mobile>

<style>
  .cnt { font: 700 72px/1 'Unbounded Variable', 'Unbounded', sans-serif; letter-spacing: -0.05em; }
  .tap { width: 100%; min-height: 150px; border-radius: 30px; border: 0; cursor: pointer; color: #06080f; font: 700 22px 'Sora Variable', 'Sora', sans-serif; background: linear-gradient(135deg, #8b7cff, #3de0ff); box-shadow: 0 30px 60px -24px rgba(124, 108, 255, 0.9); }
  .tap:active:not(:disabled) { transform: scale(0.985); }
  .tap:disabled { opacity: 0.45; cursor: default; }
  .grid { display: grid; grid-template-columns: repeat(10, 1fr); gap: 5px; }
  .grid i { aspect-ratio: 1; border-radius: 4px; background: rgba(255, 255, 255, 0.1); }
  .grid i.f { background: #3de0ff; box-shadow: 0 0 8px #3de0ff; }
</style>
