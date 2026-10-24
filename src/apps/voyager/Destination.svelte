<script lang="ts">
  import { aller, retour } from '../../router.svelte.ts';
  import { fmtF } from '../../core/tarif.ts';
  import { duree } from '../../core/tranches.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { dockVoyageur } from '../../ui/dockVoyageur.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { choisirTrajet, initRecherche } from './etat.ts';
  import { destinations, villesDeDepart } from './offres.ts';

  /** Où vas-tu ? Carte en relief du Cameroun (villes du réseau d'AfriMove) et liste des destinations depuis la ville de départ. */
  const R = initRecherche();
  /** Position des villes sur la carte (repère 390 × 300). Les villes sans ligne s'affichent grisées. */
  const CARTE: Record<string, { x: number; y: number }> = {
    Douala: { x: 95, y: 170 }, Yaoundé: { x: 190, y: 190 }, Bafoussam: { x: 150, y: 95 }, Bamenda: { x: 95, y: 70 }, Kribi: { x: 120, y: 255 }, Bertoua: { x: 300, y: 165 }, Ngaoundéré: { x: 260, y: 55 }
  };
  let de = $state(R.de), q = $state('');
  const villes = $derived(destinations(de, R.jour));
  const origines = $derived(villesDeDepart());
  let choisie = $state<string | null>(R.vers);
  const sel = $derived(villes.find((v) => v.ville === choisie) ?? villes[0] ?? null);
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const visibles = $derived(villes.filter((v) => !q.trim() || norm(`${v.ville} ${v.gares.join(' ')}`).includes(norm(q.trim()))));
  const ailleurs = $derived(Object.keys(CARTE).filter((v) => v !== de && !villes.some((x) => x.ville === v)));
  const lieu = (v: string) => ({ left: `${(CARTE[v].x / 390) * 100}%`, top: `${CARTE[v].y}px` });
  const sousVille = (v: (typeof villes)[number]) => `Gare ${v.gares.join(' / ')} · ${v.compagnies} compagnie${v.compagnies > 1 ? 's' : ''}`;

  function changerDepart(nouveau: string) { de = nouveau; q = ''; choisie = destinations(nouveau, R.jour)[0]?.ville ?? null; }
  function appliquer() { if (sel) choisirTrajet(R, de, sel.ville); }
  function suite(href: string) { appliquer(); aller(href); }
  const entree = (e: KeyboardEvent) => { if (e.key === 'Enter' && visibles[0]) { e.preventDefault(); choisie = visibles[0].ville; } };
  const pasDesservie = (v: string) => montrer(`${v} n’est pas encore desservie depuis ${de}`, 'wa');
</script>

{#snippet entete()}
  <header class="hd">
    <a class="ib" href="/" aria-label="Retour" onclick={(e) => { e.preventDefault(); retour('/'); }}><Icone nom="retour" /></a>
    <div class="col grow"><span class="ttl t18">Où vas-tu ?</span><span class="t13 mut ell">Depuis {de}</span></div>
    <a class="ib" href="/voix" aria-label="Dire la destination" onclick={(e) => { e.preventDefault(); aller('/voix'); }}><Icone nom="micro" /></a>
  </header>
{/snippet}

<Mobile enteteLibre={entete} dock={dockVoyageur('voyager')}>
  <label class="inp on" for="recherche-ville"><Icone nom="recherche" taille={20} /><input id="recherche-ville" type="search" class="champ grow" placeholder="ville, gare, quartier" autocomplete="off" bind:value={q} onkeydown={entree} /></label>
  <div class="map" role="group" aria-label="Carte en relief · touche une ville">
    <div class="plane"></div>
    <div class="relief" style="left: 40px; top: 60px; width: 160px; height: 90px"></div>
    <div class="relief" style="left: 220px; top: 120px; width: 180px; height: 110px"></div>
    {#if CARTE[de]}<span class="pin depart" style="left: {lieu(de).left}; top: {lieu(de).top}"><i></i><b>{de} · départ</b></span>{/if}
    {#each villes as v (v.ville)}
      {#if CARTE[v.ville]}<button type="button" class="pin" class:on={sel?.ville === v.ville} aria-pressed={sel?.ville === v.ville} aria-label={v.ville} style="left: {lieu(v.ville).left}; top: {lieu(v.ville).top}" onclick={() => (choisie = v.ville)}><span class="beam"></span><i></i><b>{v.ville}</b></button>{/if}
    {/each}
    {#each ailleurs as v (v)}
      <button type="button" class="pin off" aria-label="{v}, pas encore desservie" style="left: {lieu(v).left}; top: {lieu(v).top}" onclick={() => pasDesservie(v)}><i></i><b>{v}</b></button>
    {/each}
  </div>
  <div class="row sp">
    <label class="lab" for="depart-ville">Depuis</label>
    <select id="depart-ville" class="selv" value={de} onchange={(e) => changerDepart(e.currentTarget.value)}>{#each origines as o (o)}<option value={o}>{o}</option>{/each}</select>
    <span class="t12 mut3">prix le plus bas du jour</span>
  </div>
  {#each visibles as c (c.ville)}
    <button type="button" class="city" class:on={sel?.ville === c.ville} aria-pressed={sel?.ville === c.ville} onclick={() => (choisie = c.ville)}>
      <span class="bub"><Icone nom="pin" /></span>
      <span class="col grow"><span class="t15 b7">{c.ville}</span><span class="t12 mut ell">{sousVille(c)}</span></span>
      <span class="col" style="align-items: flex-end"><span class="t14 b7 aq">{c.prix === null ? 'aucun départ' : `dès ${fmtF(c.prix)}`}</span><span class="t12 mut3">{duree(c.dureeMin)}</span></span>
    </button>
  {:else}
    <div class="gl" role="status"><span class="t14 b7">{villes.length ? `Aucune destination ne correspond à « ${q} »` : `Aucune ligne au départ de ${de}`}</span>{#if villes.length}<p class="t12 mut">Essaie le nom d'une ville ou d'une gare.</p>{/if}</div>
  {/each}
  {#if sel}
    <div class="sheet bas" aria-live="polite">
      <div class="row sp">
        <div class="col"><span class="lab">Ta destination</span><span class="ttl t20">{sel.ville}</span><span class="t13 mut">{sousVille(sel)} · {duree(sel.dureeMin)}</span></div>
        <span class="ttl t20 aq">{sel.prix === null ? '—' : fmtF(sel.prix)}</span>
      </div>
      <button type="button" class="b p" onclick={() => suite('/calendrier')}><Icone nom="calendrier" taille={20} />Choisir la date et l’heure</button>
      <button type="button" class="b g sm" style="width: 100%" onclick={() => suite('/')}>Voir les départs tout de suite</button>
    </div>
  {/if}
</Mobile>

<style>
  .champ { background: transparent; border: 0; outline: 0; color: inherit; font: inherit; min-height: 44px; min-width: 0; }
  .champ::placeholder { color: #8e99bb; }
  .inp:focus-within { border-color: #3de0ff; }
  .map { position: relative; height: 300px; margin: 0 -16px; overflow: hidden; perspective: 800px; perspective-origin: 50% 20%; flex: none; }
  .plane { position: absolute; left: -30%; right: -30%; top: 0; bottom: -50%; transform: rotateX(58deg); transform-origin: 50% 60%; background-image: linear-gradient(rgba(61, 224, 255, 0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(61, 224, 255, 0.16) 1px, transparent 1px); background-size: 40px 40px; background-color: rgba(10, 14, 28, 0.6); }
  .relief { position: absolute; border-radius: 50%; background: radial-gradient(circle, rgba(139, 124, 255, 0.35), transparent 70%); filter: blur(6px); }
  .pin { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 4px; border: 0; background: transparent; color: #f2f4ff; cursor: pointer; padding: 0; min-width: 44px; min-height: 44px; transform: translate(-50%, -100%); }
  .pin i { width: 16px; height: 16px; border-radius: 50%; background: #3de0ff; box-shadow: 0 0 16px #3de0ff; border: 3px solid #05070d; transition: transform 0.2s; }
  .pin b { font: 600 11px 'Geist Mono', monospace; padding: 3px 8px; border-radius: 999px; background: rgba(5, 7, 13, 0.8); border: 1px solid rgba(255, 255, 255, 0.2); white-space: nowrap; }
  .pin.on i { background: #ff5bde; box-shadow: 0 0 22px #ff5bde; transform: scale(1.4); }
  .pin.on b { background: linear-gradient(135deg, #8b7cff, #3de0ff); color: #06080f; border-color: transparent; }
  .pin .beam { position: absolute; left: 50%; bottom: 8px; width: 2px; height: 0; background: linear-gradient(0deg, #ff5bde, transparent); transition: height 0.25s; }
  .pin.on .beam { height: 50px; }
  .pin.off { opacity: 0.45; } .pin.off i { background: #8e99bb; box-shadow: none; } .pin.off b { border-style: dashed; }
  .pin.depart { pointer-events: none; } .pin.depart i { background: #7cf0a6; box-shadow: 0 0 16px #7cf0a6; }
  .city { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 18px; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(255, 255, 255, 0.06); color: #f2f4ff; cursor: pointer; font: inherit; text-align: left; width: 100%; min-height: 60px; flex: none; }
  .city.on { background: linear-gradient(135deg, rgba(139, 124, 255, 0.22), rgba(61, 224, 255, 0.14)); border-color: rgba(139, 124, 255, 0.45); }
  .selv { min-height: 44px; padding: 0 10px; border-radius: 14px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.2); color: #f2f4ff; font: 600 14px 'Sora Variable', 'Sora', sans-serif; }
  .selv option { color: #05070d; }
  .sheet.bas { position: sticky; bottom: -14px; margin: 0 -8px; border-radius: 24px; z-index: 5; flex: none; }
  .t15 { font-size: 15px; }
</style>
