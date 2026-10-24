<script lang="ts">
  import { jourCourt } from '../../core/dates.ts';
  import { jourDeTs } from '../../core/indicateurs.ts';
  import { DELAIS_ETAPES, ETAPES_DOSSIER, OFFRES, PIECES, PILL_ETAPE } from '../../core/financement.ts';
  import { app } from '../../data/store.svelte.ts';
  import { param, aller } from '../../router.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Colonne from './Colonne.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { ajouterPiece, avancerDossier } from './actions.ts';
  import { dockPatron } from './dockPatron.ts';
  import { etatFinancement } from './etat.ts';
  import { moduleActif } from './modules.ts';
  import ModuleMasque from './ModuleMasque.svelte';
  import { millions } from './lecture.ts';

  const dossiers = $derived(app.tranches.financement ? etatFinancement().dossiers : []);
  const d = $derived(dossiers.find((x) => x.id === param('dossier')) ?? dossiers[0]);
  const offre = $derived(d ? OFFRES.find((o) => o.id === d.offreId) : undefined);
  const PLC = ['inf', 'wa', 'inf', 'ok', 'ok'] as const;
  const heure = (ts: number) => `${jourCourt(jourDeTs(ts))} ${new Date(ts).toTimeString().slice(0, 5)}`;
  const manque = $derived(d ? Object.values(d.pieces).some((v) => !v) : false);
  const lier = (e: MouseEvent, v: string) => { e.preventDefault(); aller(v); };
  function avancer() { if (!d) return; const r = avancerDossier(d.id); montrer(r.message ?? r.raison ?? '', r.ok ? 'ok' : 'er'); }
  function ajouter(k: string) { if (!d) return; const r = ajouterPiece(d.id, k); montrer(r.message ?? r.raison ?? '', r.ok ? 'ok' : 'er'); }
</script>

<Mobile titre={d ? `Dossier ${d.id}` : 'Aucun dossier'} sous={d && offre ? `${offre.nom} · ${millions(d.montant)} · ${offre.par.split(' · ')[0]}` : ''} retourVers="/financement" dock={dockPatron('finance')}>
  {#snippet droite()}{#if d}<span class="pl {PLC[d.etape]}">{PILL_ETAPE[d.etape]}</span>{/if}{/snippet}
<Colonne>

  {#if !moduleActif('financement')}
    <ModuleMasque cle="financement" />
  {:else if !d || !offre}
    <div class="center"><span class="ttl t20">Pas encore de dossier</span><span class="t14 mut">Choisis une offre et envoie ton dossier : le suivi s’affiche ici.</span><a class="b p" href="/financement" onclick={(e) => lier(e, '/financement')}>Voir les offres</a></div>
  {:else}
    <ol class="tl" aria-label="Étapes du dossier">
      {#each ETAPES_DOSSIER as nom, i (nom)}
        <li class="ev" class:ok={i < d.etape} class:cur={i === d.etape} aria-current={i === d.etape ? 'step' : undefined}><span>{nom}</span><span class="t13 mono">{d.horodatage[i] ? heure(d.horodatage[i]!) : DELAIS_ETAPES[i]}</span></li>
      {/each}
    </ol>

    <div class="gl row sp t13"><span class="col"><span class="lab">Mensualité</span><span class="ttl t18">{d.mensualite.toLocaleString('fr-FR')} F</span></span><span class="col" style="text-align: right"><span class="lab">Durée</span><span class="ttl t18">{d.duree} mois</span></span></div>

    <span class="lab">Pièces</span>
    <div class="gl col" style="gap: 0">
      {#each Object.entries(d.pieces) as [k, ok] (k)}
        <div class="li"><span class="pl {ok ? 'ok' : 'wa'}">{ok ? 'ok' : 'manque'}</span><span class="col grow"><span class="t14">{PIECES[k]?.nom ?? k}</span><span class="t12 mut">{PIECES[k]?.detail}</span></span>
          {#if !ok}<button type="button" class="b s sm" onclick={() => ajouter(k)}>Ajouter</button>{/if}</div>
      {/each}
    </div>
    {#if manque && d.etape >= 1}<span class="t13 wac" role="status">La banque ne planifiera pas la visite tant qu’une pièce manque.</span>{/if}

    <div class="col g8" style="margin-top: auto">
      <button type="button" class="b s" disabled={d.etape >= 4} onclick={avancer}>{d.etape >= 4 ? 'Fonds versés' : 'Avancer le dossier (démo)'}</button>
      <a class="b g" href="/patron" onclick={(e) => lier(e, '/patron')}>Retour au tableau</a>
    </div>
  {/if}
</Colonne>
</Mobile>

<style>
  .tl { position: relative; padding-left: 30px; display: flex; flex-direction: column; list-style: none; }
  .tl:before { content: ''; position: absolute; left: 11px; top: 14px; bottom: 14px; width: 2px; background: rgba(255, 255, 255, 0.12); }
  .ev { position: relative; display: flex; justify-content: space-between; gap: 8px; min-height: 48px; padding: 6px 0; color: #b7c0db; align-items: center; }
  .ev:before { content: ''; position: absolute; left: -25px; top: 14px; width: 14px; height: 14px; border-radius: 50%; background: #05070d; border: 3px solid rgba(255, 255, 255, 0.3); }
  .ev.ok { color: #8e99bb; } .ev.ok:before { background: #4ade80; border-color: #4ade80; }
  .ev.cur { color: #f2f4ff; font-weight: 600; } .ev.cur:before { background: #3de0ff; border-color: #3de0ff; box-shadow: 0 0 14px #3de0ff; }
  .b:disabled { opacity: 0.5; }
</style>
