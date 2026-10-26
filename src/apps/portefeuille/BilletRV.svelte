<script lang="ts">
  import { onMount } from 'svelte';
  import Icone from '../../ui/Icone.svelte';
  import { fmt, fmtPct } from '../../core/argent.ts';
  import { pointsSerie } from '../../core/indices.ts';
  import Pic from './Pic.svelte';
  import { avancementChaine, dureeVol, jourAnnee, jourVol, serieValeur, type VueDroit } from './droit.ts';
  import { jourCourt } from '../voyager/format.ts';
  import { departDe } from '../../core/regles.ts';

  /** Billet papier perforé qui se retourne. Recto : carte d'embarquement (jaune et blanc). Verso : prix équivalent, payé, écart, chaîne de détention, statut.
   *  Se retourne au clic sur le bouton (`aria-pressed`) et au défilement de la page ; avec « mouvement réduit », la bascule est instantanée (aucune rotation). */
  let { vue, now, compagnie, ville, villeDepart, detenteur }: { vue: VueDroit; now: number; compagnie: string; ville: string; villeDepart: string; detenteur: string } = $props();
  const SEUIL_DEFILEMENT = 80;
  let verso = $state(false), apresSeuil = false;
  onMount(() => {
    const surDefilement = () => { const bas = window.scrollY > SEUIL_DEFILEMENT; if (bas !== apresSeuil) { apresSeuil = bas; verso = bas; } };
    window.addEventListener('scroll', surDefilement, { passive: true }); return () => window.removeEventListener('scroll', surDefilement);
  });
  const d = $derived(vue.droit), v = $derived(vue.vol);
  const dep = $derived(departDe(v.jour, v.heureDepart));
  const serie = $derived(serieValeur(d, v));
  const ligne = $derived(pointsSerie(serie, 100, 48, 6));
  const av = $derived(avancementChaine(d, v, now));
  const sens = $derived(vue.ecart.sens);
  const premier = $derived(av.debut);
  const maillons = $derived([...d.chaine].filter((m) => m.type !== 'nommage' && m.type !== 'gel' && m.type !== 'degel').length);
</script>

<div class="bloc">
  <div class="scene" data-verso={verso}>
    <div class="pivot" class:verso>
      <!-- Recto : carte d'embarquement -->
      <article class="face recto" aria-label={`Billet ${v.de} vers ${v.vers}, ${v.numero}, recto`} aria-hidden={verso} inert={verso}>
        <div class="haut">
          <div class="ligne-ent"><span>{compagnie} · Vol {v.numero.split(' ')[1]}</span><span>{jourVol(v)}</span></div>
          <div class="trajet"><span class="code">{v.de}</span><span class="fil" aria-hidden="true"><i></i><Icone nom="avion" taille={22} /><i></i></span><span class="code">{v.vers}</span></div>
          <div class="horaires">
            <span class="h"><span class="heure">{v.heureDepart}</span><span class="v">{villeDepart}</span></span>
            <span class="duree">{dureeVol(v)}</span>
            <span class="h droite"><span class="heure">{v.heureArrivee}{#if v.plusJours > 0} <small>(+{v.plusJours})</small>{/if}</span><span class="v">{ville}</span></span>
          </div>
        </div>
        <div class="perfore-b" aria-hidden="true"><span class="trait"></span><span class="encoche g"></span><span class="encoche d"></span></div>
        <div class="bas plein">
          <dl class="infos"><div><dt>Date</dt><dd>{jourCourt(dep)} {new Date(dep).getFullYear()}</dd></div><div><dt>Vol</dt><dd>{compagnie} {v.numero.split(' ')[1]}</dd></div><div><dt>Durée</dt><dd>{dureeVol(v)}</dd></div><div><dt>Réf.</dt><dd class="reg">{d.ref}</dd></div></dl>
          <span class="puce-b {vue.puce.ton}">{#if vue.puce.ton === 'signal'}<Icone nom="horloge" taille={14} trait={2} />{:else if vue.puce.ton === 'ok'}<Pic nom="coche" taille={14} />{:else if vue.puce.ton === 'info'}<Pic nom="etiquette" taille={14} />{:else if vue.puce.ton === 'err'}<Pic nom="cadenas" taille={14} />{/if}{vue.puce.texte}</span>
          <div class="pied-b"><span>{vue.ligneStatut}</span><span class="reg">Registre {d.ref}</span></div>
        </div>
      </article>

      <!-- Verso : l'actif -->
      <article class="face verso-f" aria-label={`Billet ${v.de} vers ${v.vers}, ${v.numero}, verso`} aria-hidden={!verso} inert={!verso}>
        <div class="haut">
          <div class="ligne-ent2"><span class="marque">NEXG<b>·TT</b></span><span class="etiq">Verso · Mes actifs</span></div>
          <div class="col g3"><span class="sur">Droit de voyage</span><span class="num">N° {d.ref}</span><span class="sous">{v.de} → {v.vers} · {jourCourt(dep)} {new Date(dep).getFullYear()} · {v.numero}</span></div>
          <div class="prix-l">
            <div class="col g2"><span class="sous">Prix équivalent aujourd’hui</span><span class="gros">{fmt(v.prixNeuf)}</span>
              <span class="payel">Payé {fmt(d.prixPaye)}<span class="ecart {sens}"><Pic nom={sens === 'baisse' ? 'baisse' : sens === 'hausse' ? 'hausse' : 'stable'} taille={14} />{fmtPct(vue.ecart.pct)}</span></span></div>
            {#if ligne}<div class="col g2 fin" aria-hidden="true"><svg width="100" height="48" viewBox="0 0 100 48"><polyline points={ligne.points} fill="none" stroke="var(--up)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /><circle cx={ligne.fin.x} cy={ligne.fin.y} r="3.5" fill="var(--up)" /></svg><span class="axe"><span>{jourCourt(premier)}</span><span>auj.</span></span></div>{/if}
          </div>
        </div>
        <div class="perfore-b sombre" aria-hidden="true"><span class="trait"></span><span class="encoche g"></span><span class="encoche d"></span></div>
        <div class="bas sombre-b">
          <span class="sur">Chaîne de détention · registre NexG-TT</span>
          <div class="regle" aria-hidden="true"><span class="piste"></span><span class="rempli" style:width="{av.pct}%"></span><span class="pion" style:left="calc({av.pct}% - 8px)"></span><span class="fin-p"></span></div>
          <div class="dates"><span>{jourAnnee(premier, now)}</span><span>{jourCourt(dep)}</span></div>
          <p class="sous">{maillons} maillon{maillons > 1 ? 's' : ''} · détenteur actuel : {detenteur}</p>
          <p class="statut-v"><span class="puce-b {vue.puce.ton}">{vue.puce.texte}</span></p>
          <p class="legal">Prix indicatifs. Un droit de voyage n’est pas un placement financier.</p>
        </div>
      </article>
    </div>
  </div>
  <button type="button" class="btn sec retourner" aria-pressed={verso} onclick={() => (verso = !verso)}><Pic nom="retourner" taille={20} />Retourner le billet</button>
  <p class="face-nom" aria-live="polite">{verso ? 'Verso · Mes actifs' : 'Recto · Voyager'}</p>
</div>

<style>
  .bloc { display: flex; flex-direction: column; gap: 10px; }
  .scene { perspective: 1400px; }
  .pivot { display: grid; grid-template-columns: minmax(0, 1fr); transform-style: preserve-3d; transition: transform 700ms cubic-bezier(0.2, 0.8, 0.2, 1); }
  .pivot.verso { transform: rotateY(180deg); }
  .face { grid-area: 1 / 1; transition: visibility 700ms; display: flex; flex-direction: column; border-radius: 18px; backface-visibility: hidden; -webkit-backface-visibility: hidden; position: relative; }
  .recto { background: #fff; color: #121418; } .pivot.verso .recto, .verso-f { visibility: hidden; } .pivot.verso .verso-f { visibility: visible; }
  .verso-f { transform: rotateY(180deg); background: var(--surface); color: var(--ink); border: 1px solid var(--line); box-sizing: border-box; }
  .haut { padding: 18px 18px 16px; display: flex; flex-direction: column; gap: 12px; }
  .ligne-ent { display: flex; align-items: center; justify-content: space-between; gap: 8px; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: #555c6b; flex-wrap: wrap; }
  .trajet { display: flex; align-items: center; gap: 10px; } .code { font: 700 clamp(34px, 12.3vw, 48px)/44px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; }
  .fil { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; color: #555c6b; } .fil i { flex: 1; border-top: 2px dotted #c9cdd5; }
  .horaires { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: start; gap: 8px; }
  .h { display: flex; flex-direction: column; gap: 1px; } .h.droite { align-items: flex-end; text-align: right; }
  .heure { font: 600 17px/22px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .heure small { font: 500 12px/1 'Barlow', sans-serif; color: #555c6b; }
  .v { font-size: 13px; color: #555c6b; } .duree { padding-top: 3px; font: 600 12px/16px 'Barlow', sans-serif; color: #555c6b; text-align: center; }
  .perfore-b { position: relative; height: 2px; }
  .perfore-b .trait { position: absolute; left: 16px; right: 16px; top: 0; border-top: 2px dashed #e2e4e9; }
  .perfore-b .encoche { position: absolute; top: -10px; width: 22px; height: 22px; border-radius: 999px; background: var(--bg); } .perfore-b .g { left: -11px; } .perfore-b .d { right: -11px; }
  .perfore-b.sombre .trait { border-top-color: var(--line-strong); }
  .infos { margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; } .infos div { display: flex; flex-direction: column; gap: 2px; } .infos dt { font: 700 11px/14px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: #3e4f66; } .infos dd { margin: 0; font: 600 15px/20px 'Barlow', sans-serif; }
  .bas.plein { flex: 1; justify-content: space-between; }
  .bas { padding: 14px 18px 18px; display: flex; flex-direction: column; gap: 12px; }
  .puce-b { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; min-height: 28px; padding: 4px 12px; border-radius: 999px; background: #eef0f3; color: #555c6b; font: 700 12px/1.2 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; }
  .puce-b.signal { background: #ffd23f; color: #121418; } .puce-b.info { background: #e3f1fa; color: #0b6fa4; } .puce-b.ok { background: #dff3ea; color: #0b6a47; } .puce-b.err { background: #fde4e4; color: #a3201a; }
  .verso-f .puce-b { background: var(--surface3); color: var(--ink2); } .verso-f .puce-b.signal { background: var(--signal-soft); color: var(--accent); } .verso-f .puce-b.info { background: rgba(98, 199, 255, 0.12); color: var(--up); } .verso-f .puce-b.ok { background: var(--ok-soft); color: var(--ok); } .verso-f .puce-b.err { background: var(--err-soft); color: var(--err); }
  .pied-b { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; font-size: 12px; color: #555c6b; } .reg { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .col { display: flex; flex-direction: column; } .g2 { gap: 2px; } .g3 { gap: 3px; }
  .ligne-ent2 { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .marque { font: 700 20px/1 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.06em; } .marque b { color: var(--accent); font-weight: 700; }
  .etiq { display: inline-flex; align-items: center; height: 26px; padding: 0 10px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font: 700 11px/1 'Barlow', sans-serif; letter-spacing: 0.08em; text-transform: uppercase; }
  .sur { font: 700 11px/14px 'Barlow', sans-serif; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink2); } .num { font: 600 22px/26px 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: 0.02em; } .sous { font-size: 13px; line-height: 18px; color: var(--ink2); }
  .prix-l { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; } .gros { font: 600 34px/38px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .payel { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; font-size: 13px; color: var(--ink2); }
  .ecart { display: inline-flex; align-items: center; gap: 3px; font: 600 13px/1 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .ecart.hausse { color: var(--up); } .ecart.baisse { color: var(--down); } .ecart.stable { color: var(--ink2); }
  .fin { flex: none; } .axe { display: flex; justify-content: space-between; font: 400 11px/14px 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink3); }
  .regle { position: relative; height: 16px; } .piste { position: absolute; left: 0; right: 0; top: 6px; height: 4px; border-radius: 999px; background: var(--surface3); } .rempli { position: absolute; left: 0; top: 6px; height: 4px; border-radius: 999px; background: var(--ink3); }
  .pion { position: absolute; top: 0; width: 16px; height: 16px; box-sizing: border-box; border-radius: 999px; background: var(--ink); border: 3px solid var(--surface); } .fin-p { position: absolute; right: 0; top: 3px; width: 10px; height: 10px; border-radius: 999px; background: var(--accent); }
  .dates { display: flex; justify-content: space-between; font: 400 11px/14px 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink3); }
  .statut-v { margin: 0; } .legal { font-size: 11px; line-height: 15px; color: var(--ink3); }
  .retourner { min-height: 48px; } .face-nom { text-align: center; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); }
  @media (prefers-reduced-motion: reduce) {
    .pivot, .pivot.verso { transition: none; transform: none; }
    .verso-f { transform: none; }
    .pivot:not(.verso) .verso-f, .pivot.verso .recto { visibility: hidden; }
  }
</style>
