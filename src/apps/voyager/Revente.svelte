<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { app } from '../../data/store.svelte.ts';
  import { fmt as fmtBrut, fmtPct as fmtPctBrut } from '../../core/argent.ts';
  const fmt = (n: number) => nb(fmtBrut(n));
  const fmtPct = (n: number) => nb(fmtPctBrut(n));
  import { compteCourant } from '../../domain/compte.ts';
  import HorsLigne from './HorsLigne.svelte';
  import Picto from './Picto.svelte';
  import { decompte, heureDe, jourSemaine, nb } from './format.ts';
  import { va } from './lien.ts';
  import { arrivee, poseDe, reventesDeLaSemaine, tailleVille, trier, TRIS, type Pose, type Tri } from './reventes.ts';
  import { tempsReel } from './temps.svelte.ts';

  /** « Ces billets cherchent un voyageur » : la pile des reventes de la semaine (Passer / Je le prends), puis la liste complète triable. */
  const compte = $derived(compteCourant());
  const temps = tempsReel(1000);
  const cartes = $derived(reventesDeLaSemaine(app.monde, temps.maintenant, compte?.id));
  let idx = $state(0), tri = $state<Tri>('depart');
  const n = $derived(cartes.length);
  const courant = $derived(cartes.length ? cartes[idx % cartes.length] : undefined);
  const liste = $derived(trier(cartes, tri));
  const POSES: Record<Pose, { transform: string; opacity: number; z: number }> = {
    devant: { transform: 'translate(0px, 0px) rotate(0deg) scale(1)', opacity: 1, z: 4 },
    derriere1: { transform: 'translate(6px, -22px) rotate(2.2deg) scale(0.95)', opacity: 1, z: 3 },
    derriere2: { transform: 'translate(-6px, -42px) rotate(-2.6deg) scale(0.9)', opacity: 1, z: 2 },
    dernier: { transform: 'translate(10px, -58px) rotate(3.2deg) scale(0.86)', opacity: 0.55, z: 1 },
    sortie: { transform: 'translate(-120%, 30px) rotate(-16deg) scale(1)', opacity: 0.2, z: 5 },
    cachee: { transform: 'translate(-6px, -42px) rotate(-2.6deg) scale(0.9)', opacity: 0, z: 1 }
  };
  const rang = (i: number) => (n ? (i - (idx % n) + n) % n : 0);
  // « Passer » : la carte quitte la pile par la gauche, puis revient se ranger tout au fond (on la revoit derrière les autres). Glisser vers la gauche = passer, vers la droite = revenir à la précédente.
  let sortant = $state(-1), dx = $state(0), tire = false, x0 = 0;
  const reduit = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const passer = () => {
    if (n < 2 || sortant >= 0) return; const i = idx % n; dx = 0;
    if (reduit) { idx = (idx + 1) % n; return; }
    sortant = i; setTimeout(() => { idx = (idx + 1) % n; sortant = -1; }, 300);
  };
  const precedent = () => { if (n > 1 && sortant < 0) { dx = 0; idx = (idx - 1 + n) % n; } };
  const bas = (e: PointerEvent) => { if (n < 2 || sortant >= 0) return; tire = true; x0 = e.clientX; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); };
  const bouge = (e: PointerEvent) => { if (tire) dx = Math.max(-220, Math.min(220, e.clientX - x0)); };
  const lache = () => { if (!tire) return; tire = false; const d = dx; if (d < -70) passer(); else if (d > 70) { dx = 0; precedent(); } else dx = 0; };
  const touche = (e: KeyboardEvent) => { if (e.key === 'ArrowLeft') { e.preventDefault(); passer(); } else if (e.key === 'ArrowRight') { e.preventDefault(); precedent(); } };
  const paysDate = (ms: number) => jourSemaine(ms);
  const phrase = $derived(courant ? `Billet ${(idx % n) + 1} sur ${n} : ${courant.ville}, ${paysDate(courant.departMs)}, ${fmt(courant.prix)}` : '');
  const signe = (pct: number) => fmtPct(pct);
</script>

<Ecran titre="Partir ce week-end" face="jour" retour="/">
  {#snippet droite()}<span class="compteur" aria-hidden="true">{n ? `${(idx % n) + 1}/${n}` : ''}</span>{/snippet}

  <div class="cadre">
  <HorsLigne />
  <section class="entete">
    <p class="t-sur">Revente de dernière minute · départs de Montréal</p>
    <h2 class="h2">Ces billets cherchent un voyageur</h2>
  </section>

  {#if n === 0}
    <section class="carte vide" role="status">
      <h3 class="t-section">Aucun billet en revente cette semaine</h3>
      <p class="t-sec">Les départs des 7 prochains jours reviennent ici dès qu’un détenteur renonce à son voyage. Le radar montre ce qui part plus tard.</p>
      <a class="btn" href="/radar" onclick={(e) => va(e, '/radar')}>Explorer le radar</a>
    </section>
  {:else}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="pile" role="region" aria-label="Pile de billets en revente. Flèches gauche et droite : passer ou revenir." tabindex="0" onkeydown={touche} onpointerdown={bas} onpointermove={bouge} onpointerup={lache} onpointercancel={lache}>
      {#each cartes as c, i (c.droitId)}
        {@const pose = sortant === i ? 'sortie' : poseDe(rang(i), n)}
        {@const p = pose === 'devant' && dx !== 0 ? { ...POSES.devant, transform: `translate(${dx}px, 0px) rotate(${dx / 14}deg) scale(1)` } : POSES[pose]}
        <article class="billet" aria-hidden={rang(i) === 0 ? undefined : 'true'} aria-label="{c.ville}, {paysDate(c.departMs)}, {fmt(c.prix)}" style="transform:{p.transform};opacity:{p.opacity};z-index:{p.z};{dx !== 0 && pose === 'devant' ? 'transition:none;' : ''}">
          <div class="bandeau"><span>YUL → {c.code} · {paysDate(c.departMs).toUpperCase()}</span><span class="vol">{c.compagnie.toUpperCase()} {c.numero.split(' ')[1]}</span></div>
          <div class="corps">
            <span class="filigrane" aria-hidden="true">{c.code}</span>
            <div class="decolle"><span class="pouls" data-motion aria-hidden="true"></span><span class="t-sur">Décolle dans</span><span class="decompte">{decompte(c.departMs - temps.maintenant)}</span></div>
            <div class="col g6"><span class="ville" style="font-size:{tailleVille(c.ville)}px;--ville:{tailleVille(c.ville)}px">{c.ville}</span><span class="pays">{c.pays} · {paysDate(c.departMs)}</span></div>
            <div class="trajet"><span class="iata">YUL</span><span class="fil"><span class="pointille"></span><Icone nom="avion" taille={18} /><span class="pointille"></span></span><span class="iata d">{c.code}</span>
              <span class="h">{c.heureDepart}</span><span></span><span class="h d">{arrivee(c)}</span></div>
          </div>
          <div class="perfore-b" aria-hidden="true"><span class="trait"></span><span class="g"></span><span class="d"></span></div>
          <div class="bas">
            <span class="detenteur"><Picto nom="detenteur" taille={16} trait={1.75} />Le détenteur ne part plus</span>
            <div class="prix-ligne">
              <span class="prix-bloc"><s><span class="sr">Prix équivalent neuf : </span>{fmt(c.prixEquivalent)}</s><span aria-hidden="true" class="fleche">→</span><span class="prix">{fmt(c.prix)}</span></span>
              <span class="col ecart"><span class="delta">{signe(c.ecart.pct)}</span><span class="vs">vs prix équivalent neuf</span></span>
            </div>
            <div class="puces"><span class="puce info">Revente</span><span class="puce signal"><Icone nom="horloge" taille={14} trait={2} />Nommer avant {paysDate(c.echeanceMs)}</span></div>
          </div>
        </article>
      {/each}
    </div>
    <p class="aide">Prix indicatifs · revente entre détenteurs</p>
    <p class="sr" aria-live="polite">{phrase}</p>

    <section class="toutes" aria-labelledby="toutes-titre">
      <div class="toutes-tete"><h3 id="toutes-titre" class="h3">Toutes les reventes de la semaine</h3>
        <div class="tri"><label for="tri">Trier</label><select id="tri" bind:value={tri}>{#each TRIS as t (t.id)}<option value={t.id}>{t.libelle}</option>{/each}</select></div></div>
      <ul class="liste-plain cartes">
        {#each liste as c (c.droitId)}
          <li><a class="ligne" href="/offre/{c.offreId}" onclick={(e) => va(e, `/offre/${c.offreId}`)}>
            <span class="code-plaque">{c.code}</span>
            <span class="grow col"><span class="v">{c.ville}</span><span class="s">{paysDate(c.departMs)} · {c.heureDepart} · {c.numeroAffiche}</span><span class="s">Nommer avant {paysDate(c.echeanceMs)} {heureDe(c.echeanceMs)}</span></span>
            <span class="col fin"><span class="p">{fmt(c.prix)}</span><span class="s"><s>{fmt(c.prixEquivalent)}</s></span><span class="e">{signe(c.ecart.pct)}</span></span>
            <Picto nom="chevron" /></a></li>
        {/each}
      </ul>
    </section>
  {/if}
  </div>

  {#snippet pied()}
    {#if courant}
      <div class="actions">
        <button type="button" class="passer" onclick={passer} disabled={n < 2}><Picto nom="croix" />Passer</button>
        <a class="prendre" href="/offre/{courant.offreId}" aria-label="Je le prends : {courant.ville}, {fmt(courant.prix)}" onclick={(e) => va(e, `/offre/${courant.offreId}`)}>Je le prends<Picto nom="fleche" /></a>
      </div>
      <p class="nomme"><Picto nom="identite" taille={16} trait={1.75} /><span>Vous serez le voyageur nommé : vos informations seront transmises à la compagnie à la finalisation.</span></p>
    {/if}
  {/snippet}
</Ecran>

<style>
  .cadre { contain: inline-size; display: flex; flex-direction: column; gap: 20px; }
  .col { display: flex; flex-direction: column; } .g6 { gap: 6px; } .grow { flex: 1; min-width: 0; }
  .compteur { width: 44px; text-align: center; font: 600 13px/44px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; color: var(--ink2); }
  .entete { display: flex; flex-direction: column; gap: 6px; }
  .h2 { font: 600 34px/34px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.005em; text-wrap: balance; }
  .vide { display: flex; flex-direction: column; gap: 12px; padding: 18px; }
  /* Pile : les billets derrière dépassent de 22 et 42 px ; la hauteur s'adapte à l'écran pour que l'action reste visible */
  .pile { touch-action: pan-y; user-select: none; position: relative; flex: none; height: clamp(372px, calc(100dvh - 312px), 460px); margin-top: 6px; }
  .billet { position: absolute; left: 6px; right: 6px; top: 46px; bottom: 0; display: flex; flex-direction: column; border-radius: 20px; background: var(--surface); box-shadow: var(--ombre); transform-origin: 50% 0; transition: transform 560ms cubic-bezier(.2, .8, .2, 1), opacity 420ms ease; }
  .bandeau { height: 30px; flex: none; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 16px; border-radius: 20px 20px 0 0; background: #0B1B2E; color: #fff; font: 600 11px/1 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: 0.08em; white-space: nowrap; }
  .vol { color: #C9D3DF; }
  .corps { position: relative; flex: 1; min-height: 0; overflow: hidden; padding: 12px 18px; display: flex; flex-direction: column; gap: 8px; }
  .filigrane { position: absolute; right: -10px; bottom: -36px; font: 700 168px/1 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: -0.02em; color: var(--bg); pointer-events: none; }
  .decolle { position: relative; display: flex; align-items: center; gap: 8px; }
  .pouls { width: 8px; height: 8px; flex: none; border-radius: 999px; background: var(--accent); animation: nx-pulse 1.4s ease-in-out infinite; }
  .decompte { margin-left: auto; font: 600 17px/22px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .col .ville { position: relative; font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif; font-weight: 700; line-height: 0.9; letter-spacing: -0.01em; white-space: nowrap; }
  .pays { position: relative; font-size: 14px; line-height: 20px; font-weight: 600; color: var(--ink2); }
  .trajet { position: relative; margin-top: auto; display: grid; grid-template-columns: auto 1fr auto; align-items: center; column-gap: 10px; row-gap: 2px; }
  .iata { font: 700 26px/28px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; } .iata.d, .h.d { text-align: right; }
  .fil { display: flex; align-items: center; gap: 6px; color: var(--accent); } .pointille { flex: 1; border-top: 2px dotted var(--line-strong); }
  .h { font: 500 13px/18px 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink2); font-variant-numeric: tabular-nums; }
  .perfore-b { position: relative; height: 0; flex: none; } .perfore-b .trait { position: absolute; left: 16px; right: 16px; top: -1px; border-top: 2px dashed var(--line); }
  .perfore-b .g, .perfore-b .d { position: absolute; top: -11px; width: 22px; height: 22px; border-radius: 999px; background: var(--bg); } .perfore-b .g { left: -11px; } .perfore-b .d { right: -11px; }
  .bas { flex: none; padding: 12px 18px 14px; display: flex; flex-direction: column; gap: 8px; }
  .detenteur { display: flex; align-items: center; gap: 6px; font-size: 13px; line-height: 18px; font-weight: 600; color: var(--ink2); }
  .prix-ligne { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 4px 10px; }
  .prix-bloc { display: flex; align-items: baseline; gap: 8px; font-family: 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .prix-bloc s { font-size: 15px; font-weight: 500; color: var(--ink3); } .fleche { font-size: 15px; color: var(--ink3); } .prix { font-size: clamp(26px, 8.6vw, 34px); line-height: 36px; font-weight: 600; }
  .ecart { align-items: flex-end; gap: 2px; padding-bottom: 2px; } .delta { font: 600 15px/18px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; color: #A84A0E; white-space: nowrap; } .vs { font-size: 12px; line-height: 16px; font-weight: 500; color: var(--ink3); white-space: nowrap; }
  .puces { display: flex; flex-wrap: wrap; gap: 6px; } .puces .puce { height: 26px; }
  .puce.signal { letter-spacing: 0.04em; text-transform: none; font-size: 12px; }
  .aide { font-size: 12px; line-height: 16px; color: var(--ink3); }
  @media (max-height: 780px) {
    .h2 { font-size: 28px; line-height: 28px; } .cadre { gap: 14px; }
    .pile { height: clamp(340px, calc(100dvh - 308px), 460px); }
    .billet { top: 40px; } .corps { padding: 10px 18px; gap: 6px; } .col .ville { font-size: min(var(--ville), 8.5dvh) !important; }
    .trajet .h { display: none; } .bas { padding: 10px 18px 12px; gap: 6px; } .prix { font-size: 30px; line-height: 32px; }
  }
  /* Barre d'actions (pied de l'écran) */
  .actions { display: flex; gap: 10px; }
  .passer { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; height: 52px; border-radius: 14px; background: var(--surface); color: var(--ink); border: 1px solid var(--line-strong); font: 700 16px/1 'Barlow', sans-serif; cursor: pointer; }
  .passer:disabled { opacity: 0.45; cursor: not-allowed; }
  .prendre { flex: 1.6; display: flex; align-items: center; justify-content: center; gap: 8px; height: 52px; border-radius: 14px; background: var(--signal); color: #0B1B2E; font: 700 16px/1 'Barlow', sans-serif; text-decoration: none; }
  .nomme { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; line-height: 16px; color: var(--ink2); } .nomme :global(svg) { margin-top: 0; }
  /* Liste complète */
  .toutes { display: flex; flex-direction: column; gap: 10px; }
  .toutes-tete { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .h3 { font: 600 24px/28px 'Barlow Condensed', 'Arial Narrow', sans-serif; }
  .tri { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ink2); }
  .tri select { min-height: 44px; padding: 0 10px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line-strong); color: var(--ink); font-size: 14px; }
  .cartes { display: flex; flex-direction: column; border-radius: 18px; background: var(--surface); border: 1px solid var(--line); overflow: hidden; }
  .cartes li + li { border-top: 1px solid var(--surface2); }
  .ligne { display: flex; align-items: center; gap: 12px; min-height: 64px; padding: 10px 12px 10px 14px; color: var(--ink); text-decoration: none; }
  .code-plaque { width: 52px; height: 32px; flex: none; border-radius: 8px; background: #0B1B2E; color: #fff; display: flex; align-items: center; justify-content: center; font: 600 14px/1 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: 0.06em; }
  .v { font-size: 16px; line-height: 22px; font-weight: 600; } .s { font-size: 13px; line-height: 18px; color: var(--ink2); }
  .fin { align-items: flex-end; } .p { font: 600 15px/20px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; white-space: nowrap; } .e { font: 600 13px/16px 'IBM Plex Mono', ui-monospace, monospace; color: #A84A0E; white-space: nowrap; }
  .ligne :global(svg) { color: var(--accent); }
  a:focus-visible, button:focus-visible, select:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .billet { transition: opacity 250ms ease; } .pouls { animation: none; } }
</style>
