<script lang="ts">
  import Icone from '../../ui/Icone.svelte';
  import { fmt, fmtPct } from '../../core/argent.ts';
  import { va } from '../voyager/lien.ts';
  import Pic from './Pic.svelte';
  import type { CarteDroit } from './portefeuille.ts';

  /** Un droit de voyage en billet perforé (papier blanc sur fond nuit) : compagnie, trajet, date, statut, origine, prix payé et prix équivalent. Toute la carte mène à `/droit/:id`. `revente` : la souche montre le prix de l'annonce. */
  let { carte, revente = false }: { carte: CarteDroit; revente?: boolean } = $props();
  const sens = $derived(carte.ecart.sens === 'hausse' ? 'hausse' : carte.ecart.sens === 'baisse' ? 'baisse' : 'stable');
  const href = $derived(`/droit/${encodeURIComponent(carte.droitId)}`);
</script>

<article class="billet" aria-label={carte.aria}>
  <div class="corps">
    <span class="cie">{carte.enTete}</span>
    <a class="route" {href} onclick={(e) => va(e, href)} aria-label={`${carte.de} vers ${carte.vers}, ${carte.ville}. Ouvrir le droit de voyage`}>{carte.de}<Icone nom="avion" taille={22} />{carte.vers}</a>
    <span class="date">{carte.date}</span>
    <span class="puces">
      {#if carte.statut === 'a_nommer'}<span class="statut signal"><Icone nom="horloge" taille={14} trait={2} />{carte.statutLib}</span>
      {:else if carte.statut === 'en_vente'}<span class="statut info"><Pic nom="etiquette" taille={14} />{carte.statutLib}</span>
      {:else if carte.statut === 'nomme'}<span class="statut ok"><Pic nom="coche" taille={14} />{carte.statutLib}</span>
      {:else}<span class="statut">{carte.statutLib}</span>{/if}
      {#if carte.origine && !revente}<span class="origine"><Pic nom="etiquette" taille={13} trait={1.75} />{carte.origine}</span>{/if}
      {#if carte.intentions && !revente}
        <a class="intention" href="/marche-intentions" onclick={(e) => va(e, '/marche-intentions')} aria-label={`${carte.intentions.n} intention${carte.intentions.n > 1 ? 's' : ''} d'achat sur ce vol, maximum ${fmt(carte.intentions.max)}`}>
          <span class="pastille"><Pic nom="proche" taille={14} trait={1.75} />{carte.intentions.n} intention{carte.intentions.n > 1 ? 's' : ''} d’achat · max <b>{fmt(carte.intentions.max)}</b></span>
        </a>
      {/if}
    </span>
  </div>
  <div class="souche">
    <span class="encoche haut" aria-hidden="true"></span><span class="encoche bas" aria-hidden="true"></span>
    {#if revente}
      <span class="bloc"><span class="lib">Votre prix</span><span class="m gros">{fmt(carte.annonce ?? 0)}</span></span>
      <span class="bloc"><span class="lib">Prix équivalent</span><span class="m">{fmt(carte.equivalent)}</span></span>
      <span class="bloc"><span class="lib">Payé</span><span class="m">{fmt(carte.prixPaye)}</span></span>
    {:else}
      <span class="bloc"><span class="lib">Payé</span><span class="m">{fmt(carte.prixPaye)}</span></span>
      <span class="bloc"><span class="lib">Prix équivalent</span><span class="m gros">{fmt(carte.equivalent)}</span></span>
      <span class="ecart {sens}"><Pic nom={sens === 'hausse' ? 'hausse' : sens === 'baisse' ? 'baisse' : 'stable'} taille={14} />{fmtPct(carte.ecart.pct)}</span>
    {/if}
  </div>
</article>

<style>
  .billet { position: relative; display: flex; min-height: 136px; border-radius: 18px; background: #fff; color: #121418; }
  .corps { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 6px; padding: 14px 10px 14px 16px; }
  .cie { font: 700 11px/14px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: #555c6b; }
  .route { display: flex; align-items: center; gap: 8px; font: 700 clamp(30px, 9.7vw, 38px)/36px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; color: #121418; text-decoration: none; }
  .route::after { content: ''; position: absolute; inset: 0; border-radius: 18px; } /* toute la carte est cliquable */
  .route :global(svg) { color: #555c6b; flex: none; }
  .route:focus-visible { outline: none; } .route:focus-visible::after { outline: 3px solid #ffd23f; outline-offset: 2px; }
  .date { font: 500 13px/18px 'Barlow', sans-serif; color: #555c6b; }
  .puces { display: flex; flex-wrap: wrap; gap: 6px; padding-top: 2px; }
  .statut { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 999px; background: #eef0f3; color: #555c6b; font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; }
  .statut.signal { background: #ffd23f; color: #121418; } .statut.info { background: #e3f1fa; color: #0b6fa4; } .statut.ok { background: #dff3ea; color: #0b6a47; }
  .origine { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 10px; border-radius: 999px; border: 1px solid #e2e4e9; color: #555c6b; font: 600 12px/1 'Barlow', sans-serif; }
  .intention { position: relative; z-index: 1; display: inline-flex; align-items: center; min-height: 44px; margin: -9px 0; color: #0b7a55; text-decoration: none; }
  .pastille { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 10px; border-radius: 999px; background: rgba(11, 122, 85, 0.12); font: 700 12px/1 'Barlow', sans-serif; white-space: nowrap; }
  .pastille b { font: 600 12px/1 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .intention:focus-visible { outline: 2px solid #0b7a55; outline-offset: 1px; border-radius: 999px; }
  .souche { position: relative; width: clamp(104px, 30vw, 118px); flex: none; display: flex; flex-direction: column; justify-content: center; gap: 8px; padding: 14px 10px 14px 14px; border-left: 2px dashed #e2e4e9; border-radius: 0 18px 18px 0; background: #f1f2f4; }
  .encoche { position: absolute; left: -12px; width: 22px; height: 22px; border-radius: 999px; background: var(--bg); } .encoche.haut { top: -11px; } .encoche.bas { bottom: -11px; }
  .bloc { display: flex; flex-direction: column; gap: 1px; min-width: 0; } .lib { font: 600 11px/14px 'Barlow', sans-serif; color: #555c6b; }
  .m { font: 500 14px/18px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; white-space: nowrap; } .m.gros { font-weight: 600; font-size: clamp(15px, 4.6vw, 18px); }
  .ecart { display: inline-flex; align-items: center; gap: 3px; font: 600 13px/16px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .ecart.hausse { color: #0b6fa4; } .ecart.baisse { color: #a84a0e; } .ecart.stable { color: #555c6b; }
</style>
