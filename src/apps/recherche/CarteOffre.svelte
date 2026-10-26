<script lang="ts">
  import { dollars } from './montants.ts';
  import { maintenant } from '../../data/store.svelte.ts';
  import { compagnieDe } from '../../domain/marche.ts';
  import Pictos from './Pictos.svelte';
  import Trajet from './Trajet.svelte';
  import { fmtDuree, fmtEscales, fmtJourCourt } from './dates.ts';
  import { lienAgence, lienOffre, va } from './nav.ts';
  import { fmtEcart, revendable, type LigneOffre } from './offres.ts';

  /** Carte d'une offre (résultats, vitrine) : tout le texte vient de `offresDuVol`. `miseEnAvant` : « Meilleure affaire » ; `avecDate` : ajoute le jour quand la recherche couvre plusieurs jours ou destinations. */
  let { ligne, miseEnAvant = null, avecDate = false }: { ligne: LigneOffre; miseEnAvant?: 'direct' | 'tous' | null; avecDate?: boolean } = $props();
  const offre = $derived(ligne.offre), vol = $derived(ligne.vol), cie = $derived(compagnieDe(vol).nom);
  const numero = $derived(vol.numero.split(' ').slice(1).join(' ') || vol.numero);
  const href = $derived(offre.type === 'drop' ? (offre.masquee ? '/pass' : '/drops') : lienOffre(offre.id));
  const ok = $derived(revendable(vol, maintenant()));
  const sous = $derived(offre.type === 'agence' ? 'Offre d’agence partenaire' : `Vol ${numero} · ${vol.cabine}`);
  const meta = $derived(avecDate ? `${fmtJourCourt(vol.jour)} · ${sous}` : sous);
  const pct = $derived(fmtEcart(offre.ecartPct)), baisse = $derived(offre.ecartPct < 0), hausse = $derived(offre.ecartPct > 0);
  const nomAgence = $derived(offre.vendeur.replace(/^Vendu par /, ''));
  const resume = $derived(`${cie}, vol ${numero}, ${vol.de} vers ${vol.vers}, départ ${vol.heureDepart}, ${fmtDuree(vol.dureeMin)}, ${fmtEscales(vol.escales).toLowerCase()}, ${dollars(offre.prix)}`);
</script>

{#if offre.type === 'drop' && offre.masquee}
  <article class="of drop masque" data-offre={offre.id}>
    <div class="ligne"><span class="etiq maj"><Pictos nom="eclair" taille={16} trait={2} />Drop membres</span>
      <span class="barres"><span class="sr">Prix masqué</span><i aria-hidden="true"></i><i aria-hidden="true"></i><i aria-hidden="true"></i><b aria-hidden="true">$</b></span></div>
    <div class="invite"><span class="cle" aria-hidden="true"><Pictos nom="cadenas" taille={22} /></span>
      <div class="col g4"><span class="t15">Réservé aux membres du Pass NexG</span><span class="t13">Prix et horaires visibles avec le Pass.</span></div></div>
    <span class="appel">Découvrir le Pass NexG<Pictos nom="suivant" taille={18} trait={2} /></span>
    <a class="etendu" href="/pass" onclick={(e) => va(e, '/pass')}><span class="sr">Drop membres, prix masqué. Découvrir le Pass NexG</span></a>
  </article>
{:else}
  <article class="of" class:fort={!!miseEnAvant} data-offre={offre.id} data-type={offre.type}>
    {#if miseEnAvant}<div class="bandeau"><span class="maj"><span class="pt" aria-hidden="true"></span>Meilleure affaire</span><span class="b2">{miseEnAvant === 'direct' ? 'Prix le plus bas en direct' : 'Prix le plus bas'}</span></div>{/if}
    <div class="corps">
      {#if offre.type === 'agence'}
        <a class="vendeur lien" href={lienAgence(offre.agenceId ?? '')} onclick={(e) => va(e, lienAgence(offre.agenceId ?? ''))}><span class="etiq"><Pictos nom="agence" taille={16} />Vendu par {nomAgence} (exemple)</span><Pictos nom="suivant" taille={18} /></a>
      {:else if offre.type === 'revente'}
        <span class="etiq verifie"><Pictos nom="bouclier-ok" taille={16} trait={2} />Revente · détenteur vérifié</span>
      {:else if offre.type === 'neuf'}
        <span class="etiq"><Pictos nom="avion" taille={16} />Neuf · émis via NexG-TT</span>
      {:else}
        <span class="etiq maj"><Pictos nom="eclair" taille={16} trait={2} />Drop membres</span>
      {/if}
      <Trajet {vol} />
      {#if miseEnAvant && ok}
        <div class="puces"><span class="puce info"><Pictos nom="etiquette" taille={14} trait={2} />Revendable</span><span class="puce"><Pictos nom="identite" taille={14} trait={2} />Nominatif à J-1</span></div>
      {:else if !ok}
        <div class="puces"><span class="puce err"><Pictos nom="alerte" taille={14} trait={2} />Échéance passée · non revendable</span></div>
      {/if}
      <div class="pied">
        <div class="col g4"><span class="t15">{cie}</span><span class="t13">{meta}</span></div>
        <div class="prix"><span class="montant" class:grand={!!miseEnAvant}>{dollars(offre.prix)}</span>
          {#if offre.type === 'neuf'}<span class="t13">Prix neuf de référence</span>
          {:else if offre.ecartPct !== 0}<span class="ecart" class:baisse class:hausse><Pictos nom={baisse ? 'baisse' : 'hausse'} taille={14} trait={2.25} />{pct} vs neuf</span>{/if}
        </div>
      </div>
    </div>
    <a class="etendu" href={href} onclick={(e) => va(e, href)}><span class="sr">Voir l’offre : {resume}</span></a>
  </article>
{/if}

<style>
  .of { position: relative; display: flex; flex-direction: column; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); color: var(--ink); overflow: hidden; box-shadow: none; padding: 0; }
  .of.fort { border: 2px solid var(--ink); box-shadow: var(--ombre); }
  .bandeau { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 16px; background: var(--ink); color: #fff; }
  .maj { display: inline-flex; align-items: center; gap: 8px; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; }
  .pt { width: 6px; height: 6px; border-radius: 999px; background: var(--signal); flex: none; } .b2 { font: 500 12px/16px 'Barlow', sans-serif; color: #c9d3df; text-align: right; }
  .corps { display: flex; flex-direction: column; gap: 14px; padding: 16px; } .fort .corps { padding: 14px 16px 16px; }
  .etiq { display: inline-flex; align-items: center; gap: 6px; font: 600 13px/18px 'Barlow', sans-serif; color: var(--ink2); } .etiq.verifie { color: var(--ink2); } .etiq.verifie :global(svg) { color: var(--ok); }
  .etiq.maj { font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink); }
  .vendeur { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 0; margin: -10px 0; color: var(--ink2); position: relative; z-index: 1; } .vendeur :global(svg:last-child) { color: var(--ink3); }
  .puces { display: flex; flex-wrap: wrap; gap: 6px; }
  .pied { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
  .col { display: flex; flex-direction: column; } .g4 { gap: 2px; min-width: 0; }
  .t15 { font: 600 15px/20px 'Barlow', sans-serif; } .t13 { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink3); }
  .prix { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex: none; }
  .montant { font: 600 22px/26px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; white-space: nowrap; } .montant.grand { font-size: 26px; line-height: 30px; }
  .ecart { display: inline-flex; align-items: center; gap: 3px; font: 600 13px/16px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; white-space: nowrap; } .ecart.baisse { color: var(--down); } .ecart.hausse { color: var(--up); }
  .etendu { position: absolute; inset: 0; z-index: 0; border-radius: inherit; } .etendu:focus-visible { outline-offset: -4px; }
  .drop { gap: 14px; padding: 16px; border: 1px dashed var(--line-strong); }
  .ligne { display: flex; align-items: center; justify-content: space-between; gap: 8px; } .barres { display: flex; align-items: center; gap: 3px; } .barres i { width: 14px; height: 22px; border-radius: 4px; background: var(--surface2); } .barres b { margin-left: 4px; font: 600 20px/22px 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink3); }
  .invite { display: flex; align-items: center; gap: 14px; } .cle { flex: none; width: 44px; height: 44px; border-radius: 12px; background: var(--ink); color: var(--signal); display: grid; place-items: center; }
  .appel { display: flex; align-items: center; justify-content: space-between; min-height: 44px; padding: 0 14px; border-radius: 12px; background: var(--accent-soft); color: var(--accent); font: 600 14px/18px 'Barlow', sans-serif; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
