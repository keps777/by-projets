<script lang="ts">
  import { fmtSigne } from '../../core/argent.ts';
  import { app } from '../../data/store.svelte.ts';
  import { compagnieDe } from '../../domain/marche.ts';
  import { fmtDuree, fmtEscales } from './dates.ts';
  import type { CleTriPc, TriPc } from './filtresPc.ts';
  import { dollars, nbsp } from './montants.ts';
  import { fmtEcart, type LigneOffre } from './offres.ts';
  import Pictos from './Pictos.svelte';

  /** Tableau des départs (face nuit, planche WebMarche) : une ligne par offre, horaires en palettes à volets, source, prix et écart signé ; la ligne choisie alimente le panneau « Offre sélectionnée ». */
  let { lignes, selection = '', tri, ontri, onselect, titre, refNeuf, description }: { lignes: LigneOffre[]; selection?: string; tri: TriPc; ontri: (c: CleTriPc) => void; onselect: (id: string) => void; titre: string; refNeuf: number | null; description: string } = $props();
  const SOURCE: Record<string, { libelle: string; icone: 'echange' | 'avion' | 'agence' | 'cadenas' }> = { neuf: { libelle: 'Neuf', icone: 'avion' }, revente: { libelle: 'Revente', icone: 'echange' }, agence: { libelle: 'Agence', icone: 'agence' }, drop: { libelle: 'Drop', icone: 'cadenas' } };
  const sousSource = (l: LigneOffre): string => (l.offre.type === 'neuf' ? 'Vendu par la compagnie' : l.offre.type === 'revente' ? 'Détenteur vérifié' : l.offre.type === 'agence' ? `${l.offre.vendeur.replace(/^Vendu par /, '')}` : 'Réservé aux membres');
  const sens = (c: CleTriPc) => (tri.cle === c ? (tri.sens === 'asc' ? 'ascending' : 'descending') : 'none');
  const fleche = (c: CleTriPc) => (tri.cle === c ? (tri.sens === 'asc' ? '↑' : '↓') : '');
  const app_ville = (code: string): string => app.monde.aeroports.find((a) => a.code === code)?.ville ?? code;
  /** Une seule destination : la colonne « Vers » est redondante avec l'en-tête, l'escale passe sous l'heure d'arrivée. */
  const unique = $derived(new Set(lignes.map((l) => l.vol.vers)).size === 1);
  const palettes = (t: string) => t.split('');
</script>

<div class="tableau">
  <div class="ent"><span class="titre"><Pictos nom="avion" taille={20} />{titre}</span>{#if refNeuf !== null}<span class="ref">Prix équivalent neuf : <b>{dollars(refNeuf)}</b> · indicatif</span>{/if}</div>
  <div class="defile">
    <table>
      <caption class="sr">{description}</caption>
      <thead><tr>
        <th scope="col" aria-sort={sens('depart')}><button type="button" class:actif={tri.cle === 'depart'} onclick={() => ontri('depart')}>Départ<span aria-hidden="true">{fleche('depart')}</span></button></th>
        {#if !unique}<th scope="col">Vers</th>{/if}<th scope="col">Compagnie</th><th scope="col">Source</th>
        <th scope="col" class="d" aria-sort={sens('prix')}><button type="button" class:actif={tri.cle === 'prix'} onclick={() => ontri('prix')}>Prix<span aria-hidden="true">{fleche('prix')}</span></button></th>
        <th scope="col" class="d">Écart vs neuf</th><th scope="col" class="d"><span class="sr">Sélection</span></th>
      </tr></thead>
      <tbody>
        {#each lignes as l (l.offre.id)}
          {@const o = l.offre}{@const v = l.vol}{@const choisi = selection === o.id}{@const delta = o.prix - v.prixNeuf}
          <tr class:choisi onclick={() => onselect(o.id)} data-offre={o.id}>
            <td><span class="col"><span class="sr">Départ {v.heureDepart},</span><span class="pal" aria-hidden="true">{#each palettes(v.heureDepart) as c, i (i)}<span class="p" class:sep={c === ':'}>{c}</span>{/each}</span><span class="pt">arr. {v.heureArrivee}{v.plusJours > 0 ? ` (+${v.plusJours})` : ''}</span>{#if unique}<span class="pt">{fmtEscales(v.escales)}</span>{/if}</span></td>
            {#if !unique}<td><span class="col"><span class="sr">{app_ville(v.vers)} {v.vers},</span><span class="pal code" aria-hidden="true">{#each palettes(v.vers) as c, i (i)}<span class="p">{c}</span>{/each}</span><span class="pt">{fmtEscales(v.escales)}</span></span></td>{/if}
            <td><span class="col"><span class="cie">{compagnieDe(v).nom}</span><span class="pt">Vol {v.numero.split(' ').slice(1).join(' ')} · {fmtDuree(v.dureeMin)}</span></span></td>
            <td><span class="col g4"><span class="chip" class:drop={o.type === 'drop'}><Pictos nom={SOURCE[o.type].icone} taille={14} trait={2} />{SOURCE[o.type].libelle}</span><span class="pt">{sousSource(l) + (o.type === 'agence' ? ' · non revendable' : '')}</span></span></td>
            <td class="d">{#if o.masquee}<span class="membres"><Pictos nom="cadenas" taille={14} trait={2} />Membres</span>{:else}<span class="prix">{dollars(o.prix)}</span>{/if}</td>
            <td class="d">{#if o.masquee}<span class="pt">—<span class="sr">non affiché</span></span>{:else}<span class="ecart" class:hausse={delta > 0} class:baisse={delta < 0}><span class="e1">{delta === 0 ? `±0${' '}$` : fmtSigne(delta)}</span><span class="e2">{delta === 0 ? 'prix neuf' : fmtEcart(o.ecartPct)}</span></span>{/if}</td>
            <td class="d"><button type="button" class="rond" aria-pressed={choisi} aria-label="Sélectionner l’offre de {v.heureDepart}, {compagnieDe(v).nom}, {SOURCE[o.type].libelle.toLowerCase()}, {o.masquee ? 'prix réservé aux membres' : dollars(o.prix)}" onclick={(e) => { e.stopPropagation(); onselect(o.id); }}><span class="anneau">{#if choisi}<Pictos nom="ok" taille={14} trait={3} />{/if}</span></button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .tableau { border-radius: 20px; background: #060708; border: 1px solid var(--line); overflow: hidden; }
  .ent { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 16px; padding: 12px 16px; border-bottom: 1px solid #1a1c21; }
  .titre { display: flex; align-items: center; gap: 10px; font: 700 20px/24px 'Barlow', sans-serif; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); } .ref { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); } .ref b { font-weight: 600; color: var(--ink); }
  .defile { overflow-x: auto; } table { width: 100%; min-width: 560px; border-collapse: collapse; }
  th { padding: 10px 6px 6px; text-align: left; font: 700 11px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink3); } th:first-child { padding-left: 16px; } th.d { text-align: right; } th:last-child { padding-right: 16px; }
  th button { display: inline-flex; align-items: center; gap: 4px; min-height: 44px; min-width: 44px; padding: 0 6px; margin: 0 -6px; border: 0; border-radius: 8px; background: transparent; color: inherit; letter-spacing: inherit; text-transform: inherit; font: inherit; cursor: pointer; } th button.actif { color: var(--ink); } th.d button { margin-right: -6px; }
  td { padding: 8px 6px; border-top: 1px solid #1a1c21; vertical-align: middle; } td:first-child { padding-left: 16px; } td:last-child { padding: 4px 12px 4px 4px; } td.d { text-align: right; }
  tr { cursor: pointer; } tbody tr:hover { background: #14161b; } tr.choisi { background: var(--surface2); }
  .col { display: flex; flex-direction: column; gap: 3px; min-width: 0; } .col.g4 { align-items: flex-start; gap: 4px; }
  .pal { display: flex; gap: 2px; } .p { width: 20px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 4px; background: #1c1f25; box-shadow: inset 0 -15px 0 #15171b; font: 600 16px/1 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink); } .p.sep { width: 8px; background: transparent; box-shadow: none; color: var(--ink3); } .code .p { color: var(--accent); }
  .pt { font: 400 12px/16px 'Barlow', sans-serif; color: var(--ink3); } .cie { font: 600 15px/20px 'Barlow', sans-serif; }
  .chip { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; border-radius: 999px; background: var(--surface3); color: var(--ink); font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; } .chip.drop { background: var(--accent-soft); color: var(--accent); }
  .prix { font: 600 17px/22px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; white-space: nowrap; } .membres { display: inline-flex; align-items: center; gap: 6px; font: 700 13px/18px 'Barlow', sans-serif; color: var(--accent); }
  .ecart { display: inline-flex; flex-direction: column; align-items: flex-end; gap: 2px; font: 600 15px/18px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; color: var(--ink2); white-space: nowrap; } .ecart.hausse { color: var(--up); } .ecart.baisse { color: var(--down); } .e2 { font-size: 12px; line-height: 14px; }
  .rond { width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 999px; background: transparent; cursor: pointer; }
  .anneau { width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 999px; border: 2px solid var(--ink3); color: transparent; } .rond[aria-pressed='true'] .anneau { background: var(--accent); border-color: var(--accent); color: var(--on-signal); } .rond:hover .anneau { border-color: var(--ink); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
