<script lang="ts">
  import { fmtSigne } from '../../core/argent.ts';
  import { maintenant } from '../../data/store.svelte.ts';
  import { compagnieDe } from '../../domain/marche.ts';
  import { fmtDuree, fmtEscales, fmtJourCourt } from './dates.ts';
  import { revendablePc } from './filtresPc.ts';
  import { dollars, nbsp } from './montants.ts';
  import { lienAgence, lienOffre, va } from './nav.ts';
  import { fmtEcart, type LigneOffre } from './offres.ts';
  import Pictos from './Pictos.svelte';

  /** Carte d'une offre de la variante PC (planche WebResultats) : source, horaires, puces, compagnie à gauche ; prix, écart signé et action à droite. `meilleure` : bandeau « Meilleure affaire ». */
  let { ligne, meilleure = null, avecDate = false }: { ligne: LigneOffre; meilleure?: 'direct' | 'tous' | null; avecDate?: boolean } = $props();
  const offre = $derived(ligne.offre), vol = $derived(ligne.vol), cie = $derived(compagnieDe(vol).nom);
  const numero = $derived(vol.numero.split(' ').slice(1).join(' ') || vol.numero);
  const href = $derived(offre.type === 'drop' ? (offre.masquee ? '/pass' : '/drops') : lienOffre(offre.id));
  const ok = $derived(revendablePc(ligne, maintenant()));
  const sous = $derived(offre.type === 'agence' ? 'Offre d’agence partenaire' : offre.type === 'drop' ? 'Quantités limitées' : `Vol ${numero} · ${vol.cabine}`);
  const meta = $derived(avecDate ? `${fmtJourCourt(vol.jour)} · ${sous}` : sous);
  const delta = $derived(offre.prix - vol.prixNeuf), baisse = $derived(offre.ecartPct < 0), hausse = $derived(offre.ecartPct > 0);
  const nomAgence = $derived(offre.vendeur.replace(/^Vendu par /, ''));
  const cta = $derived(offre.type === 'agence' ? 'Voir l’offre de l’agence' : offre.type === 'drop' ? (offre.masquee ? 'Découvrir le Pass NexG' : 'Voir le drop') : 'Voir l’offre');
  const resume = $derived(`${cie}, vol ${numero}, ${vol.de} vers ${vol.vers}, départ ${vol.heureDepart}, ${fmtDuree(vol.dureeMin)}, ${fmtEscales(vol.escales).toLowerCase()}, ${offre.masquee ? 'prix masqué' : dollars(offre.prix)}`);
</script>

<article class="of" class:fort={!!meilleure} data-offre={offre.id} data-type={offre.type}>
  {#if meilleure}<div class="bandeau"><span class="maj"><span class="pt" aria-hidden="true"></span>Meilleure affaire</span><span class="b2">{meilleure === 'direct' ? 'Prix le plus bas en direct' : 'Prix le plus bas'}</span></div>{/if}
  <div class="corps">
    <div class="gauche">
      {#if offre.type === 'agence'}
        <a class="etiq lien" href={lienAgence(offre.agenceId ?? '')} onclick={(e) => va(e, lienAgence(offre.agenceId ?? ''))}><Pictos nom="agence" taille={16} />Vendu par {nomAgence} (exemple)</a>
      {:else if offre.type === 'revente'}<span class="etiq"><Pictos nom="echange" taille={16} />Revente · détenteur vérifié</span>
      {:else if offre.type === 'neuf'}<span class="etiq"><Pictos nom="avion" taille={16} />Neuf · émis via NexG-TT</span>
      {:else}<span class="etiq"><Pictos nom="cadenas" taille={16} />Drop membres</span>{/if}
      {#if offre.masquee}
        <div class="verrou"><span class="cle" aria-hidden="true"><Pictos nom="cadenas" taille={22} /></span><div class="col"><span class="t15 g">Réservé aux membres du Pass NexG</span><span class="t13">Prix et horaires visibles avec le Pass.</span></div></div>
      {:else}
        <div class="trajet">
          <div class="col"><span class="heure">{vol.heureDepart}</span><span class="code">{vol.de}</span></div>
          <div class="milieu"><span class="duree">{fmtDuree(vol.dureeMin)}</span><span class="fil" aria-hidden="true"><i></i><Pictos nom="avion" taille={14} /><i></i></span><span class="via">{fmtEscales(vol.escales)}</span></div>
          <div class="col fin"><span class="h2"><span class="heure">{vol.heureArrivee}</span>{#if vol.plusJours > 0}<span class="plus" aria-label="le lendemain">+{vol.plusJours}</span>{/if}</span><span class="code">{vol.vers}</span></div>
        </div>
        <div class="puces">
          {#if ok}<span class="puce info"><Pictos nom="etiquette" taille={14} trait={2} />Revendable</span><span class="puce"><Pictos nom="identite" taille={14} trait={2} />Nominatif à J-1</span>
          {:else}<span class="puce"><Pictos nom="fermer" taille={14} trait={2} />Non revendable</span>{/if}
        </div>
      {/if}
      <div class="col"><span class="t15">{offre.type === 'drop' && offre.masquee ? 'Drop membres' : cie}</span><span class="t13">{meta}</span></div>
    </div>
    <div class="droite">
      <div class="prix">
        {#if offre.masquee}<span class="masque"><span class="barres" aria-hidden="true">• • • $</span>Prix masqué</span>
        {:else}
          <span class="montant">{dollars(offre.prix)}</span>
          {#if offre.type === 'neuf'}<span class="ecart">±0{' '}$ · prix neuf</span><span class="t12">Prix neuf de référence</span>
          {:else}<span class="ecart" class:baisse class:hausse>{#if delta !== 0}<Pictos nom={baisse ? 'baisse' : 'hausse'} taille={14} trait={2.25} />{/if}{fmtSigne(delta)} · {fmtEcart(offre.ecartPct)}</span>{/if}
        {/if}
      </div>
      <a class="action" href={href} onclick={(e) => va(e, href)}><span class="sr">{resume} : </span>{cta}<Pictos nom="suivant" taille={16} trait={2} /></a>
    </div>
  </div>
</article>

<style>
  .of { position: relative; display: flex; flex-direction: column; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); color: var(--ink); overflow: hidden; box-shadow: var(--ombre); }
  .of.fort { border: 2px solid var(--ink); }
  .bandeau { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 18px; background: var(--ink); color: #fff; }
  .maj { display: inline-flex; align-items: center; gap: 8px; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; } .pt { width: 6px; height: 6px; border-radius: 999px; background: var(--signal); } .b2 { font: 500 12px/16px 'Barlow', sans-serif; color: #c9d3df; }
  .corps { display: flex; flex-wrap: wrap; gap: 14px 24px; padding: 16px 18px; } .gauche { flex: 999 1 300px; min-width: 0; display: flex; flex-direction: column; gap: 14px; }
  .col { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .etiq { display: inline-flex; align-items: center; gap: 8px; align-self: flex-start; font: 600 13px/18px 'Barlow', sans-serif; color: var(--ink2); } .etiq.lien { position: relative; z-index: 1; color: var(--ink2); } .etiq.lien:hover { color: var(--accent); }
  .trajet { display: grid; grid-template-columns: auto minmax(60px, 1fr) auto; align-items: center; gap: 12px; min-width: 0; }
  .heure { font: 600 22px/26px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .code { font: 600 13px/16px 'Barlow', sans-serif; letter-spacing: 0.06em; color: var(--ink2); }
  .fin { align-items: flex-end; } .h2 { display: flex; align-items: flex-start; gap: 2px; } .plus { font: 600 12px/14px 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink2); }
  .milieu { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; } .duree { font: 500 13px/16px 'Barlow', sans-serif; color: var(--ink2); } .via { font: 600 13px/16px 'Barlow', sans-serif; color: var(--ink2); text-align: center; }
  .fil { display: flex; align-items: center; gap: 4px; width: 100%; color: var(--accent); } .fil i { flex: 1; border-top: 2px dotted var(--line-strong); }
  .puces { display: flex; flex-wrap: wrap; gap: 6px; } .puce { min-height: 26px; }
  .t15 { font: 600 15px/20px 'Barlow', sans-serif; } .t15.g { font-weight: 700; } .t13 { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); } .t12 { font: 400 12px/16px 'Barlow', sans-serif; color: var(--ink2); }
  .verrou { display: flex; align-items: center; gap: 12px; } .cle { flex: none; width: 44px; height: 44px; border-radius: 12px; background: var(--signal-soft); color: var(--signal-ink); display: grid; place-items: center; }
  .droite { flex: 1 1 170px; min-width: 150px; display: flex; flex-direction: column; align-items: flex-end; justify-content: space-between; gap: 12px; text-align: right; }
  .prix { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; } .montant { font: 600 30px/34px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .ecart { display: inline-flex; align-items: center; gap: 4px; font: 600 13px/18px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; color: var(--ink2); white-space: nowrap; } .ecart.baisse { color: var(--down); } .ecart.hausse { color: var(--up); }
  .masque { display: inline-flex; align-items: center; gap: 8px; font: 700 15px/20px 'Barlow', sans-serif; } .barres { letter-spacing: 0.2em; }
  .action { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 0 18px; border-radius: 14px; background: var(--surface); color: var(--ink); border: 1px solid var(--line-strong); font: 700 15px/1 'Barlow', sans-serif; }
  .action::after { content: ''; position: absolute; inset: 0; } .action:focus-visible { outline: none; } .action:focus-visible::after { outline: 2px solid var(--focus); outline-offset: -4px; border-radius: 20px; } .action:hover { background: var(--surface2); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
