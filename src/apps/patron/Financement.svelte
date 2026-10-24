<script lang="ts">
  import { recetteMensuelleEstimee } from '../../core/assistant.ts';
  import { OFFRES, PART_MAX, PIECES, scoreConfiance, simuler, type Offre } from '../../core/financement.ts';
  import { app } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Colonne from './Colonne.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { envoyerDossier } from './actions.ts';
  import { entreesConfiance } from './confiance.ts';
  import { dockPatron } from './dockPatron.ts';
  import { etatFinancement } from './etat.ts';
  import { contexte, francs, millions } from './lecture.ts';
  import { moduleActif } from './modules.ts';
  import ModuleMasque from './ModuleMasque.svelte';

  const etat = etatFinancement();
  let selection = $state(etat.selection), montant = $state(etat.montant), duree = $state(etat.duree);
  const ctx = $derived(contexte());
  const mensuelle = $derived(recetteMensuelleEstimee(ctx));
  const conf = $derived(scoreConfiance(entreesConfiance(ctx)));
  const offre = $derived(OFFRES.find((o) => o.id === selection) ?? OFFRES[0]);
  const sim = $derived(simuler(offre, { montant, duree, recetteMensuelle: mensuelle }));
  const encours = $derived(app.tranches.financement ? etatFinancement().dossiers.find((d) => d.offreId === offre.id && d.etape < 4) : undefined);
  const dossiers = $derived(app.tranches.financement ? etatFinancement().dossiers : []);
  const piecesLa = $derived(offre.piecesRequises.filter((k) => k !== 'devis').length);
  const sauver = () => { const e = etatFinancement(); e.selection = selection; e.montant = montant; e.duree = duree; };
  function choisir(o: Offre) { selection = o.id; montant = o.montantMax; duree = o.dureeDefaut; sauver(); }
  const pas = $derived(offre.montantMax >= 10_000_000 ? 500_000 : offre.montantMax >= 2_000_000 ? 100_000 : 50_000);
  function envoyer() {
    sauver();
    const r = envoyerDossier(offre.id, montant, duree);
    if (r.ok && r.dossier) { montrer(r.message ?? 'Dossier envoyé'); aller(`/financement/demande?dossier=${r.dossier.id}`); } else montrer(r.raison ?? 'Envoi impossible', 'er');
  }
  const lier = (e: MouseEvent, v: string) => { e.preventDefault(); aller(v); };
  const nomMois = (n: number) => `${n} mois`;
</script>

<Mobile titre="Financement" sous={conf.jours ? `sur la base de ${conf.jours} jours de caisses AfriMove` : 'pas encore assez de caisses'} retourVers="/patron" dock={dockPatron('finance')}>
<Colonne>
  {#if !moduleActif('financement')}
    <ModuleMasque cle="financement" />
  {:else}
    <div class="gl ac row sp">
      <span class="col"><span class="pl {conf.eligible ? 'ok' : 'wa'}" style="align-self: flex-start">{conf.eligible ? 'éligible' : 'à renforcer'}</span>
        <span class="row g8" style="align-items: baseline; margin-top: 6px"><span class="big">{conf.score}</span><span class="t14 mut">/ 100</span></span><span class="lab">Score de confiance</span></span>
      <span class="col t12 mut grow" style="max-width: 190px; gap: 4px"><span>recettes régulières à {conf.regularite} %</span><span>{conf.ecartsPct.toLocaleString('fr-FR')} % d’écarts de caisse</span><span>{conf.ponctualitePct} % de bus partis à l’heure</span>
        <a href="/siege/analyses" onclick={(e) => lier(e, '/siege/analyses')} class="t13">voir ce qui compte</a></span>
    </div>

    <span class="lab">Offres pour {ctx.compagnieId === 'BX' ? 'Bêta Express' : 'ta compagnie'}</span>
    {#each OFFRES as o (o.id)}
      {@const s = simuler(o, { montant: o.montantMax, duree: o.dureeDefaut, recetteMensuelle: mensuelle })}
      <button type="button" class="of" class:on={selection === o.id} aria-pressed={selection === o.id} onclick={() => choisir(o)}>
        <span class="row sp"><span class="col"><span class="t15 b7">{o.nom}</span><span class="t12 mut">{o.par}</span></span><span class="ttl t18 nowrap">{millions(o.montantMax)}</span></span>
        <span class="row sp wrapf"><span class="t12 mut">{o.durees.length > 1 ? `${o.dureeDefaut} mois` : nomMois(o.dureeDefaut)} · {o.tauxMensuelPct === 0 ? '0 %' : o.type === 'bus' ? `${(o.tauxMensuelPct * 12).toLocaleString('fr-FR')} % / an` : `${o.tauxMensuelPct.toLocaleString('fr-FR')} % / mois`}{o.apportPct ? ` · apport ${o.apportPct} %` : ''}</span><span class="pl {o.ton}">{o.badge}</span></span>
        {#if s.depasse}<span class="t12 wac">au-dessus de ton plafond actuel</span>{/if}
      </button>
    {/each}

    <div class="gl col g12" aria-live="polite">
      <span class="lab">Simulateur</span>
      <label class="fld"><span class="row sp"><span class="t13 b7">Montant</span><output class="mono b7">{francs(montant)}</output></span>
        <input type="range" min={offre.montantMin} max={offre.montantMax} step={pas} bind:value={montant} onchange={sauver} aria-label="Montant en francs" disabled={offre.montantMin === offre.montantMax} /></label>
      {#if offre.durees.length > 1}
        <div class="fld"><span class="t13 b7" id="duree-l">Durée</span><div class="chips" role="group" aria-labelledby="duree-l">{#each offre.durees as d (d)}<button type="button" class="ch" class:on={duree === d} aria-pressed={duree === d} onclick={() => { duree = d; sauver(); }}>{d} mois</button>{/each}</div></div>
      {/if}
      <div class="row sp"><span class="col"><span class="lab">Mensualité</span><span class="ttl t24 nowrap {sim.depasse ? 'erc' : ''}">{francs(sim.mensualite)}</span></span><span class="col t12 mut" style="text-align: right"><span>prélevée sur les recettes MoMo</span><span class="b7 {sim.depasse ? 'erc' : 'okc'}">{sim.partRecette === null ? '—' : `${sim.partRecette.toLocaleString('fr-FR')} %`} de ta recette</span></span></div>
      <div class="col t13 mut" style="gap: 4px">
        {#if sim.apport}<div class="row sp"><span>Apport à verser</span><span class="b7">{francs(sim.apport)}</span></div>{/if}
        <div class="row sp"><span>Capital financé</span><span class="b7">{francs(sim.finance)}</span></div>
        <div class="row sp"><span>Coût du crédit</span><span class="b7">{francs(sim.cout)}</span></div>
        <div class="row sp"><span>Plafond selon tes recettes</span><span class="b7">{millions(sim.plafond)}</span></div>
      </div>
      {#if sim.raison}<span class="t13 erc" role="alert">{sim.raison}. Plafond de mensualité : {Math.round(PART_MAX * 100)} % de {francs(mensuelle)} par mois.</span>{/if}
    </div>

    {#if encours}
      <a class="b p" href="/financement/demande?dossier={encours.id}" onclick={(e) => lier(e, `/financement/demande?dossier=${encours.id}`)}>Voir le dossier {encours.id}<small>déjà envoyé</small></a>
    {:else}
      <button type="button" class="b p" disabled={sim.depasse || !conf.eligible} onclick={envoyer}>Envoyer le dossier · {piecesLa} pièce{piecesLa > 1 ? 's' : ''} déjà là
        {#if !conf.eligible}<small>historique de caisses trop court ou score trop bas</small>{/if}</button>
      {#if offre.piecesRequises.includes('devis')}<span class="t12 mut3">Il restera à ajouter : {PIECES.devis.nom.toLowerCase()}.</span>{/if}
    {/if}

    {#if dossiers.length}
      <span class="lab">Tes dossiers</span>
      <div class="gl col" style="gap: 0">
        {#each dossiers as d (d.id)}
          <a class="li" href="/financement/demande?dossier={d.id}" onclick={(e) => lier(e, `/financement/demande?dossier=${d.id}`)}><span class="col grow"><span class="t14 b7">{d.id} · {OFFRES.find((o) => o.id === d.offreId)?.nom}</span><span class="t12 mut">{millions(d.montant)} · {d.duree} mois</span></span><span class="t13 aq">suivre</span></a>
        {/each}
      </div>
    {/if}
  {/if}
</Colonne>
</Mobile>

<style>
  .of { display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: 22px; border: 1px solid rgba(255, 255, 255, 0.12); background: rgba(255, 255, 255, 0.06); color: #f2f4ff; cursor: pointer; font: inherit; text-align: left; width: 100%; min-height: 44px; }
  .of.on { background: linear-gradient(135deg, rgba(139, 124, 255, 0.25), rgba(61, 224, 255, 0.15)); border-color: #8b7cff; }
  .nowrap { white-space: nowrap; } .t15 { font-size: 15px; } .big { font-size: 34px; }
  input[type='range'] { width: 100%; accent-color: #3de0ff; height: 44px; }
  .b:disabled { opacity: 0.45; cursor: not-allowed; }
  output { font-size: 14px; }
</style>
