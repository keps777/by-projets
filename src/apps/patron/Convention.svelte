<script lang="ts">
  import { jourLong } from '../../core/dates.ts';
  import { CONDITIONS, JOUR_REGLEMENT, PART_MAX, PART_MIN, libelleStatut, lignesCouvertes, repartition } from '../../core/interagences.ts';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { personneCourante } from '../../domain/actions.ts';
  import { param, aller } from '../../router.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Colonne from './Colonne.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { accepterDemande, changerPart, envoyerContreSignature, signerConvention, simulerContreSignature } from './actions.ts';
  import { dockPatron } from './dockPatron.ts';
  import { etatInterAgences } from './etat.ts';
  import { compagnieNom, contexte, francs } from './lecture.ts';
  import { moduleActif } from './modules.ts';
  import ModuleMasque from './ModuleMasque.svelte';

  const ctx = $derived(contexte());
  const id = $derived(param('partenaire') ?? 'AV');
  const partenaire = $derived(app.monde.compagnies.find((c) => c.id === id));
  const conv = $derived(app.tranches.interAgences ? etatInterAgences().conventions.find((c) => c.partenaireId === id) : undefined);
  const moi = $derived(personneCourante());
  const zones = $derived(lignesCouvertes(app.monde.lignes, id));
  const exemple = $derived(conv ? repartition(2500, conv.partBetaPct) : null);
  const modifiable = $derived(conv?.statut === 'brouillon');
  const question = $derived(conv && partenaire ? `Est-ce que le partage ${conv.partBetaPct} / ${100 - conv.partBetaPct} avec ${partenaire.nom} est juste ?` : '');
  let accord = $state(false), traits = $state<[number, number][][]>([]), dessin: [number, number][] | null = null, canvas = $state<HTMLCanvasElement>();
  const lier = (e: MouseEvent, v: string) => { e.preventDefault(); aller(v); };
  const rapport = (r: { ok: boolean; message?: string; raison?: string }) => montrer(r.message ?? r.raison ?? '', r.ok ? 'ok' : 'er');

  // Signature au doigt : le tracé est gardé en points (0 à 100) et redessiné à l'identique
  function point(e: PointerEvent): [number, number] { const r = canvas!.getBoundingClientRect(); return [Math.round(((e.clientX - r.left) / r.width) * 1000) / 10, Math.round(((e.clientY - r.top) / r.height) * 1000) / 10]; }
  function tracer() {
    const c = canvas; if (!c) return; const ctx2 = c.getContext('2d'); if (!ctx2) return;
    ctx2.clearRect(0, 0, c.width, c.height); ctx2.lineWidth = 3; ctx2.lineCap = 'round'; ctx2.lineJoin = 'round'; ctx2.strokeStyle = '#7febff';
    for (const t of traits) { ctx2.beginPath(); t.forEach(([x, y], i) => (i ? ctx2.lineTo((x / 100) * c.width, (y / 100) * c.height) : ctx2.moveTo((x / 100) * c.width, (y / 100) * c.height))); ctx2.stroke(); }
  }
  function debut(e: PointerEvent) { if (!modifiable) return; canvas!.setPointerCapture(e.pointerId); dessin = [point(e)]; traits = [...traits, dessin]; }
  function bouge(e: PointerEvent) { if (!dessin) return; dessin.push(point(e)); traits = [...traits.slice(0, -1), dessin]; tracer(); }
  function fin() { dessin = null; }
  function effacer() { traits = []; tracer(); }
  function toucheClavier(e: KeyboardEvent) { if (e.key === 'Escape') effacer(); }
  function signer(mode: 'doigt' | 'visage') { rapport(signerConvention(id, { accord, mode, traits: mode === 'doigt' ? traits : [] })); }
  $effect(() => { if (canvas) { canvas.width = canvas.clientWidth * 2; canvas.height = canvas.clientHeight * 2; tracer(); } });
</script>

<Mobile titre={partenaire ? 'Convention' : 'Convention introuvable'} sous={partenaire ? `Bêta – ${partenaire.nom} · colis` : ''} retourVers="/inter-agences" dock={dockPatron('')}>
  {#snippet droite()}{#if conv}<span class="pl {libelleStatut[conv.statut].ton}">{libelleStatut[conv.statut].texte}</span>{/if}{/snippet}
<Colonne>

  {#if !moduleActif('interAgences')}
    <ModuleMasque cle="interAgences" />
  {:else if !partenaire || partenaire.id === ctx.compagnieId}
    <div class="center"><span class="ttl t20">Cette compagnie n’existe pas</span><a class="b p" href="/inter-agences" onclick={(e) => lier(e, '/inter-agences')}>Inter-agences</a></div>
  {:else if !conv}
    <div class="center"><span class="ttl t20">Pas de convention avec {partenaire.nom}</span><span class="t14 mut">Propose-lui une convention depuis la liste des partenaires.</span><a class="b p" href="/inter-agences" onclick={(e) => lier(e, '/inter-agences')}>Inter-agences</a></div>
  {:else}
    {#if conv.statut === 'demandee'}
      <div class="gl ac col g12"><span class="t14 b7">{partenaire.nom} a demandé une convention</span><span class="t13 mut">Accepte la demande pour préparer le brouillon, puis signe-le.</span><button type="button" class="b p" onclick={() => rapport(accepterDemande(id))}>Accepter la demande</button></div>
    {/if}
    <div class="gl col g12">
      <span class="lab">Partage du prix client</span>
      <span class="t16 b7" aria-live="polite">Bêta {conv.partBetaPct} % · {partenaire.nom} {100 - conv.partBetaPct} %</span>
      <div class="split" role="img" aria-label="Bêta {conv.partBetaPct} %, {partenaire.nom} {100 - conv.partBetaPct} %"><i style="width: {conv.partBetaPct}%"></i><b style="width: {100 - conv.partBetaPct}%"></b></div>
      <div class="row g8">
        <button type="button" class="b s sm" disabled={!modifiable || conv.partBetaPct <= PART_MIN} onclick={() => changerPart(id, -5)}>− 5 % pour Bêta</button>
        <button type="button" class="b s sm" disabled={!modifiable || conv.partBetaPct >= PART_MAX} onclick={() => changerPart(id, 5)}>+ 5 % pour Bêta</button>
      </div>
      {#if exemple}<span class="t12 mut">Exemple, colis M à 2 500 F : Bêta {francs(exemple.beta)} · {partenaire.nom} {francs(exemple.partenaire)}.{modifiable ? '' : ' Les conditions ne changent plus après signature.'}</span>{/if}
    </div>

    <div class="gl col" style="gap: 0">
      <div class="li"><span class="grow t14 mut">Renouvellement</span><span class="t14 b7 droite">{jourLong(conv.renouvellement)}</span></div>
      <div class="li"><span class="grow t14 mut">Lignes couvertes</span><span class="t14 b7 droite">{zones.length ? zones.join(', ') : 'aucune ligne active'}</span></div>
      {#each CONDITIONS as [nom, valeur] (nom)}<div class="li"><span class="grow t14 mut">{nom}</span><span class="t14 b7 droite">{nom === 'Règlement' ? `le ${JOUR_REGLEMENT} du mois suivant · MoMo Business` : valeur}</span></div>{/each}
    </div>

    <span class="lab">Signature du gérant</span>
    {#if conv.signee}
      <div class="sig ok" role="img" aria-label="Signée par {moi?.prenom} {moi?.nom}">
        {#if conv.signee.mode === 'doigt' && conv.signee.traits.length}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="trace" aria-hidden="true">{#each conv.signee.traits as t, i (i)}<polyline points={t.map((p) => p.join(',')).join(' ')} fill="none" stroke="#4ade80" stroke-width="2.4" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"></polyline>{/each}</svg>
        {:else}{moi?.prenom} {moi?.nom[0]}.{/if}
      </div>
      <span class="t12 mut">Signée le {jourLong(new Date(conv.signee.ts).toISOString().slice(0, 10))} à {new Date(conv.signee.ts).toTimeString().slice(0, 5)} · {conv.signee.mode === 'visage' ? 'par le visage' : conv.signee.mode === 'doigt' ? 'au doigt' : 'par accord'}</span>
    {:else if conv.statut === 'brouillon'}
      <div class="signature">
        <canvas bind:this={canvas} class="sig tracer" aria-label="Zone de signature : trace ta signature au doigt" tabindex="0" onpointerdown={debut} onpointermove={bouge} onpointerup={fin} onpointercancel={fin} onkeydown={toucheClavier}></canvas>
        {#if !traits.length}<span class="indice t13 mut" aria-hidden="true">Signe ici avec ton doigt</span>{/if}
      </div>
      <div class="row g8"><button type="button" class="b g sm" disabled={!traits.length} onclick={effacer}>Effacer</button></div>
      <label class="row g12 accord"><input type="checkbox" bind:checked={accord} /><span class="t14">J’ai lu la convention et je l’accepte au nom de {compagnieNom(ctx.compagnieId)}.</span></label>
      <button type="button" class="b p" disabled={!accord || !traits.length} onclick={() => signer('doigt')}>Signer avec ma signature</button>
      {#if moi?.visage}<button type="button" class="b s" disabled={!accord} onclick={() => signer('visage')}>Ou signer avec mon visage</button>{/if}
      {#if !accord}<span class="t12 mut3">Coche la case d’accord pour pouvoir signer.</span>{/if}
    {:else}
      <div class="sig"><span class="t13">En attente de ta signature</span></div>
    {/if}

    {#if conv.statut === 'signee'}
      {#if conv.envoyeeLe}
        <div class="gl ac col g8" role="status"><span class="t14 b7">Envoyée à {partenaire.nom}</span><span class="t13 mut">En attente de sa contre-signature depuis {new Date(conv.envoyeeLe).toTimeString().slice(0, 5)}.</span></div>
        <button type="button" class="b s" onclick={() => rapport(simulerContreSignature(id))}>{partenaire.nom} contre-signe (démo)</button>
      {:else}
        <button type="button" class="b p" onclick={() => rapport(envoyerContreSignature(id))}>Envoyer à {partenaire.nom} pour contre-signature</button>
      {/if}
    {:else if conv.statut === 'active'}
      <div class="gl col g8" role="status"><span class="t14 b7 okc">Convention active</span><span class="t13 mut">Contre-signée le {jourLong(new Date(conv.activeLe ?? maintenant()).toISOString().slice(0, 10))}. Tu peux confier des colis à {partenaire.nom}.</span></div>
      <a class="b p" href="/inter-agences" onclick={(e) => lier(e, '/inter-agences')}>Confier un colis</a>
    {/if}
    <a class="b g" href="/assistant/reponse?q={encodeURIComponent(question)}" onclick={(e) => lier(e, `/assistant/reponse?q=${encodeURIComponent(question)}`)}>Demander à l’assistant si {conv.partBetaPct} / {100 - conv.partBetaPct} est juste</a>
  {/if}
</Colonne>
</Mobile>

<style>
  .split { display: flex; height: 14px; border-radius: 7px; overflow: hidden; } .split i { background: #3de0ff; } .split b { background: #ff5bde; }
  .sig { height: 110px; border-radius: 18px; border: 1px dashed rgba(255, 255, 255, 0.3); display: grid; place-items: center; color: #a1accb; background: rgba(255, 255, 255, 0.04); width: 100%; font: inherit; position: relative; flex: none; }
  .sig.ok { border-style: solid; border-color: #4ade80; color: #4ade80; font: italic 700 22px 'Unbounded Variable', 'Unbounded', sans-serif; }
  canvas.tracer { touch-action: none; cursor: crosshair; display: block; } canvas.tracer:focus-visible { outline: 2px solid #7febff; outline-offset: 2px; }
  .signature { position: relative; flex: none; } .indice { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; }
  .trace { width: 100%; height: 100%; padding: 8px; }
  .accord { min-height: 44px; } .accord input { width: 24px; height: 24px; accent-color: #3de0ff; flex: none; }
  .droite { text-align: right; max-width: 60%; } .b:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
