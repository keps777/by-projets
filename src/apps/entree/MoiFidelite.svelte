<script lang="ts">
    import { personneCourante } from '../../domain/actions.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import { dockVoyageur } from '../../ui/dockVoyageur.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { fcfa } from '../../core/money.ts';
  import { nbPaliers, PALIERS, palierDe, palierSuivant, POINTS_BILLET_OFFERT, POINTS_BON, POINTS_PARRAINAGE, pointsAvantBilletOffert, pourcentBilletOffert, VALEUR_BON } from '../../core/fidelite.ts';
  import { bonsDisponibles, codeParrainDe, dateMouvement, preparerFidelite, utiliserPoints } from './actions.ts';
  import { fideliteLue } from './etat.ts';
  import { cagnotteDe } from '../route/etat.ts';
  import { nav } from './lien.ts';

  /** Fidélité et parrainage : 1 point par 100 F de billet payé, quatre paliers, code parrain, bons et historique. */
  const moi = $derived(personneCourante());
  { const m = personneCourante(); if (m) preparerFidelite(m.id); }
  const f = $derived(moi ? fideliteLue(moi.id) : undefined);
  const points = $derived(moi?.points ?? 0);
  const palier = $derived(palierDe(f?.cumul ?? 0));
  const suivant = $derived(palierSuivant(f?.cumul ?? 0));
  const reste = $derived(pointsAvantBilletOffert(points));
  const bons = $derived(moi ? bonsDisponibles(moi.id) : []);
  const cagnotte = $derived(cagnotteDe(moi?.id));
  const code = $derived(moi ? codeParrainDe(moi) : '');

  async function partager() {
    const texte = `Voyage avec AfriMove ! Mon code parrain : ${code} — ${POINTS_PARRAINAGE} points pour nous deux à ta première inscription.`;
    try {
      if (navigator.share) { await navigator.share({ title: 'AfriMove', text: texte }); return; }
      await navigator.clipboard.writeText(texte); montrer('Message de parrainage copié');
    } catch (e) { if ((e as { name?: string })?.name !== 'AbortError') montrer(`Ton code : ${code}`, 'wa'); }
  }
  function utiliser() {
    if (!moi) return; const r = utiliserPoints(moi.id);
    if (r.ok) montrer(`Bon de ${fcfa(r.montant)} F ajouté · il sera proposé au paiement`); else montrer(r.raison, 'er');
  }
</script>

<Mobile titre="Fidélité" retourVers="/moi" dock={dockVoyageur('moi')}>
  {#snippet droite()}<span class="pl ac">{palier.nom}</span>{/snippet}
  <div class="gl ac row g12">
    <span class="ringp" style="--p: {pourcentBilletOffert(points)}%; width: 110px; height: 110px" role="img" aria-label="{fcfa(points)} points, {pourcentBilletOffert(points)} % du billet offert"><span class="col c"><span class="ttl t24" data-testid="points">{fcfa(points)}</span><span class="t12 mut">points</span></span></span>
    <span class="col grow">
      {#if reste > 0}<span class="t16 b7">Encore {fcfa(reste)} points</span><span class="t13 mut">et ton prochain billet est offert</span>
      {:else}<span class="t16 b7">Billet offert disponible</span><span class="t13 mut">tes {fcfa(POINTS_BILLET_OFFERT)} points sont atteints</span>{/if}
      <div class="lvl" style="margin-top: 8px" aria-hidden="true">{#each PALIERS as p, i (p.id)}<span class:on={i < nbPaliers(f?.cumul ?? 0)}></span>{/each}</div>
      <span class="t12 mut3" style="margin-top: 4px">{#each PALIERS as p, i (p.id)}{#if i}{' · '}{/if}<span class:b7={p.id === palier.id}>{p.nom}</span>{/each}</span>
      {#if suivant}<span class="t12 mut3">{fcfa(suivant.min - (f?.cumul ?? 0))} points gagnés avant {suivant.nom}</span>{/if}
    </span>
  </div>
  <p class="t12 mut3" style="margin: 0">1 point par 100 F de billet payé. {POINTS_BON} points = un bon de {fcfa(VALEUR_BON)} F.</p>

  <span class="lab">Parrainer · {POINTS_PARRAINAGE} points chacun</span>
  <div class="codebox"><span class="col"><span class="lab">Ton code</span><span class="mono t20 b7" data-testid="code-parrain">{code}</span></span><button class="b p sm" type="button" onclick={partager}>Partager</button></div>
  <div class="row g8">
    <button class="b s sm grow" type="button" onclick={utiliser} disabled={points < POINTS_BON}>Utiliser {POINTS_BON} pts</button>
    <a class="b s sm grow" href="/" use:nav>Acheter un billet</a>
  </div>
  {#if cagnotte > 0}
    <div class="gl row sp" data-testid="cagnotte"><span class="col"><span class="lab">Cagnotte AfriMove</span><span class="t12 mut">gestes commerciaux · déduite au paiement</span></span><span class="ttl t20 okc">{fcfa(cagnotte)} F</span></div>
  {/if}
  {#if bons.length}
    <div class="gl col" style="gap: 4px" aria-label="Bons de réduction">
      {#each bons as b (b.id)}<div class="row sp"><span class="t14 b7">Bon de {fcfa(b.montant)} F</span><span class="pl ok">à utiliser au paiement</span></div>{/each}
    </div>
  {/if}

  <span class="lab">Historique</span>
  <ul class="gl col" style="gap: 0; list-style: none">
    {#each f?.mouvements ?? [] as m (m.id)}
      <li class="li"><span class="col grow"><span class="t14 b7">{m.libelle}</span><span class="t12 mut">{dateMouvement(m.ts)}</span></span><span class="mono b7 {m.pts > 0 ? 'okc' : 'erc'}">{m.pts > 0 ? '+' : '−'}{fcfa(Math.abs(m.pts))}</span></li>
    {:else}
      <li class="li"><span class="t13 mut">Pas encore de points : ils arrivent dès ton premier billet payé.</span></li>
    {/each}
  </ul>
</Mobile>

<style>
  .lvl { display: flex; gap: 6px; } .lvl span { flex: 1; height: 8px; border-radius: 4px; background: rgba(255, 255, 255, 0.12); } .lvl span.on { background: linear-gradient(90deg, #8b7cff, #3de0ff); }
  .codebox { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; border-radius: 18px; border: 1px dashed rgba(61, 224, 255, 0.6); background: rgba(61, 224, 255, 0.08); flex: none; }
  .b:disabled { opacity: 0.4; pointer-events: none; }
  .gl { flex: none; }
</style>
