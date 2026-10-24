<script lang="ts">
  import './guichet.css';
  import { app } from '../../data/store.svelte.ts';
  import { aller, param } from '../../router.svelte.ts';
  import { billetParId, compagnieDe, heureLocale, ligneDe } from '../../domain/actions.ts';
  import { contenuQr } from '../../core/sceau.ts';
  import { fcfa } from '../../core/money.ts';
  import { formaterCode } from '../../core/guichet.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Qr from '../../ui/Qr.svelte';
  import { dockAgent } from './dock.ts';
  import { billetsCadence, compterImpression } from './actions.ts';
  import { etat } from './etat.ts';

  const billet = $derived(billetParId(param('billet') ?? ''));
  const depart = $derived(billet ? app.monde.departs.find((d) => d.id === billet.departId) : undefined);
  const ligne = $derived(depart ? ligneDe(depart) : undefined);
  const numero = $derived(billet?.caisseId ? billetsCadence(billet.caisseId).findIndex((b) => b.id === billet.id) + 1 : 0);
  const copies = $derived(billet ? (etat().copies[billet.id] ?? 0) : 0);
  const jj = (ms: number) => { const d = new Date(ms); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${heureLocale(ms)}`; };
  function imprimer() { if (!billet) return; compterImpression(billet.id); if (typeof window.print === 'function') window.print(); }
  const lien = (e: MouseEvent, vers: string) => { e.preventDefault(); aller(vers); };
</script>

<Mobile titre={numero ? `Billet n° ${numero}` : 'Billet cadence'} sous={copies ? (copies > 1 ? `copie ${copies}` : 'imprimé') : 'à imprimer'} retourVers="/cadence" dock={dockAgent()}>
  {#if !billet || !depart || !ligne}
    <div class="gl col g8" role="alert"><span class="t16 b7">Billet introuvable</span><a class="b p" href="/cadence" onclick={(e) => lien(e, '/cadence')}>Retour à la cadence</a></div>
  {:else}
    <div class="g-papier a-imprimer">
      <article class="g-rcpt">
        <h3>{compagnieDe(depart).nom.toUpperCase()}</h3>
        <div class="c">{jj(billet.creeLe)}</div><hr />
        <div class="code">{depart.heure} {ligne.vers.toUpperCase()}</div>
        <div class="l"><span>Code</span><b>{formaterCode(billet.code)}</b></div>
        <div class="l"><span>Place</span><b>libre</b></div>
        <div class="l"><span>Espèces</span><b>{fcfa(billet.prix)} F</b></div><hr />
        <div class="qr"><Qr texte={contenuQr(billet.code, billet.sceau)} taille={120} libelle="QR du billet {formaterCode(billet.code)}" /></div>
        <div class="petit">Sans nom · le quai compte les montées</div>
        {#if billet.statut === 'annule'}<div class="annule">BILLET ANNULÉ</div>{/if}
      </article>
    </div>
    <div class="gl col g4"><span class="t14 b7">Pas de siège attribué en cadence</span><span class="t13 mut">placement libre. Le passager peut lier le billet à son numéro : <b class="mono">*123# → 2</b></span></div>
    <button type="button" class="b s" onclick={imprimer}>{copies ? 'Réimprimer' : 'Imprimer'}</button>
    <div class="row g8"><a class="b s" href="/cadence/quai?depart={depart.id}" onclick={(e) => lien(e, `/cadence/quai?depart=${depart.id}`)}>Compter au quai</a><a class="b p" href="/cadence" onclick={(e) => lien(e, '/cadence')}>Billet suivant</a></div>
  {/if}
</Mobile>
