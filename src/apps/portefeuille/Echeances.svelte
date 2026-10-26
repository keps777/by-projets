<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { app } from '../../data/store.svelte.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { jourSemaine } from '../voyager/format.ts';
  import { va } from '../voyager/lien.ts';
  import { tempsReel } from '../voyager/temps.svelte.ts';
  import Pic from './Pic.svelte';
  import { basculerRappel, lireRappels } from './actions.ts';
  import { chronologie, decompte, echeances, LIBELLE_URGENCE, phraseProchainRappel, prochaine, rappelsPlanifies, RAPPELS, resumeEchelle, type CleRappel } from './echeances.ts';

  /** Calendrier des échéances (verso, nuit) : prochaine échéance avec compte à rebours, rappels J-30 / J-7 / J-2, échelle mois par mois, règle retenue. */
  const compte = $derived(compteCourant());
  const temps = tempsReel(1000);
  const liste = $derived(compte ? echeances(app.monde, compte.id, temps.maintenant) : []);
  const rappels = $derived(lireRappels());
  const mois = $derived(chronologie(liste, rappels, temps.maintenant));
  const prochain = $derived(prochaine(liste, temps.maintenant));
  const cd = $derived(prochain ? decompte(prochain.echeanceMs - temps.maintenant) : undefined);
  const phraseRappel = $derived(phraseProchainRappel(rappelsPlanifies(liste, rappels, temps.maintenant)));
  const jourLong = (ms: number) => new Intl.DateTimeFormat('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(ms)).replace(/ | /g, ' ');
  let annonce = $state('');
  const basculer = (cle: CleRappel, libelle: string) => { annonce = `Rappel ${libelle} ${basculerRappel(cle) ? 'activé' : 'désactivé'}.`; };
</script>

<Ecran titre="Mes actifs · Échéances" face="nuit" retour="/portefeuille" large>
  <section class="intro">
    <h1 class="t-h1">Calendrier des échéances</h1>
    <p>Chaque droit de voyage doit être finalisé, voyageur nommé, au plus tard 24 h avant le départ. Passé ce délai, plus aucune revente ni aucun transfert.</p>
  </section>

  <div class="pc-duo"><div class="pc-col colle">
  {#if prochain && cd}
    <section class="prochaine" aria-labelledby="next-t">
      <div class="p-haut"><h2 id="next-t"><span class="pouls" aria-hidden="true"></span>Prochaine échéance</h2><span class="etat" class:vente={prochain.statut === 'en_vente'}>{prochain.statutLib}</span></div>
      <div class="col g6"><span class="route">{prochain.route}</span><span class="p-det">Finaliser avant le <strong>{prochain.quandLong}</strong><br />Départ {jourLong(prochain.departMs)} · {prochain.compagnie} · vol {prochain.numeroVol.split(' ')[1]}</span></div>
      <div class="decompte" role="timer" aria-label={cd.phrase}>
        {#each [['j', 'Jours', true], ['h', 'H', false], ['m', 'Min', false], ['s', 'S', false]] as [k, l, jaune] (k)}
          <span class="grp" aria-hidden="true"><span class="chiffres">{#each cd[k as 'j' | 'h' | 'm' | 's'].slice(-2).split('') as c, i (i)}<span class="chiffre" class:jaune class:gris={k === 's'}>{c}</span>{/each}</span><span class="unite">{l}</span></span>
        {/each}
      </div>
      <div class="col g8">
        <a class="btn" href="/nommer/{prochain.droitId}" onclick={(e) => va(e, `/nommer/${prochain.droitId}`)}>Nommer le voyageur<Pic nom="fleche" taille={20} /></a>
        {#if prochain.statut === 'en_vente'}<a class="sec-lien" href="/revendre/{prochain.droitId}" onclick={(e) => va(e, `/revendre/${prochain.droitId}`)}>Gérer l’annonce (retrait automatique à l’échéance)</a>
        {:else}<a class="sec-lien" href="/liquidite/{prochain.droitId}" onclick={(e) => va(e, `/liquidite/${prochain.droitId}`)}>Ou le revendre avant l’échéance</a>{/if}
      </div>
    </section>
  {:else}
    <section class="vide" role="status"><span class="ico"><Icone nom="calendrier" taille={20} /></span><span class="col g4"><span class="v-t">Aucune échéance à agir</span><span class="v-s">Dès que vous détenez un droit de voyage, son échéance (24 h avant le départ) apparaît ici, avec ses rappels.</span></span></section>
    <a class="btn sec" href="/rechercher" onclick={(e) => va(e, '/rechercher')}>Chercher un voyage</a>
  {/if}

  <section class="rappels" aria-labelledby="rap-t">
    <div class="col g4"><h2 id="rap-t" class="t-section">Rappels</h2><p class="t-sec">Une notification avant chaque échéance, pour tous vos droits de voyage.</p></div>
    <div class="trois">
      {#each RAPPELS as r (r.cle)}
        <button type="button" role="switch" aria-checked={rappels[r.cle]} aria-label={`Rappel ${r.libelle}, ${r.jours} jours avant chaque échéance`} class:on={rappels[r.cle]} onclick={() => basculer(r.cle, r.libelle)}>
          <span class="rail" aria-hidden="true"><span class="bouton"></span></span>
          <span class="col g2 mn"><span class="r-j">{r.libelle}</span><span class="r-e">{rappels[r.cle] ? 'Activé' : 'Désactivé'}</span></span>
        </button>
      {/each}
    </div>
    <p class="prochain-r"><Icone nom="cloche" taille={18} /><span>{phraseRappel}</span></p>
    <p class="sr" role="status" aria-live="polite">{annonce}</p>
  </section>

  </div><div class="pc-col">
  <section class="echelle" aria-labelledby="lad-t">
    <div class="col g4"><h2 id="lad-t" class="t-section">Échelle des échéances</h2><p class="t-sec">{resumeEchelle(mois, liste.length)}</p></div>
    <div class="legende">
      <span><span class="pt plein" aria-hidden="true"></span>Proche · ≤ 90 j</span><span><span class="pt anneau jaune" aria-hidden="true"></span>Moyenne · 91–120 j</span><span><span class="pt anneau gris" aria-hidden="true"></span>Lointaine · &gt; 120 j</span>
    </div>
    <div class="frise">
      <span class="axe" aria-hidden="true"></span>
      {#each mois as m (m.cle)}
        <div class="mois"><span class="m-nom"><span class="m-l">{m.label}</span><span class="m-a">{m.annee}</span></span><span class="m-tick" aria-hidden="true"><span></span></span><span class="m-r">{m.resume}</span></div>
        {#each m.entrees as e (e.genre === 'echeance' ? `e-${e.e.droitId}` : e.genre === 'rappel' ? `r-${e.droitId}-${e.texte}` : 'auj')}
          {#if e.genre === 'aujourdhui'}
            <div class="ligne auj"><span class="jour">{e.jour}</span><span class="m-tick" aria-hidden="true"><span class="losange"></span></span><span class="auj-t">Aujourd’hui · {jourLong(temps.maintenant)}</span></div>
          {:else if e.genre === 'rappel'}
            <div class="ligne rap"><span class="jour g">{e.jour}</span><span class="m-tick" aria-hidden="true"><span class="point"></span></span><span class="rap-t"><Icone nom="cloche" taille={14} />{e.texte}</span></div>
          {:else}
            <div class="ligne item"><span class="jour {e.e.urgence}">{e.jour}</span><span class="m-tick pad" aria-hidden="true"><span class="rond {e.e.urgence}"></span></span>
              <a class="carte-e {e.e.urgence}" href="/droit/{e.e.droitId}" onclick={(ev) => va(ev, `/droit/${e.e.droitId}`)}>
                <span class="c-ent"><span class="c-g"><span class="c-route">{e.e.route}</span><span class="c-ville">{e.e.ville}</span></span><Pic nom="chevron" taille={18} trait={1.75} /></span>
                <span class="c-q">Échéance <span class="mono">{e.e.quand}</span></span>
                <span class="c-eff">{e.e.effet}</span>
                <span class="c-bas"><span class="statut" class:vente={e.e.statut === 'en_vente'} class:nomme={e.e.statut === 'nomme'}>{e.e.statutLib}</span><span class="urg {e.e.urgence}">{LIBELLE_URGENCE[e.e.urgence]} · dans {e.e.jours} j</span></span>
              </a></div>
          {/if}
        {/each}
      {/each}
    </div>
  </section>

  <section class="regle" aria-labelledby="q-t">
    <span class="puce ready"><Pic nom="coche" taille={14} />Règle retenue</span>
    <h2 id="q-t">Si personne n’est nommé avant l’échéance</h2>
    <p class="defaut"><Pic nom="identite" taille={22} trait={1.75} /><span>Le détenteur est nommé voyageur par défaut à l’échéance. Le droit reste utilisable&nbsp;: c’est vous qui voyagez.</span></p>
    <p class="t-sec">Après l’échéance, plus aucune revente ni aucun transfert. Solutions de repli à l’étude, selon les accords avec les transporteurs&nbsp;:</p>
    <ul><li>rachat par NexG-TT à un prix annoncé d’avance&nbsp;;</li><li>expiration du droit, avec ou sans remboursement partiel.</li></ul>
  </section>
  </div></div>
  <p class="aide">Échéance = 24 h avant le départ, à l’heure du vol.</p>
</Ecran>

<style>
  .col { display: flex; flex-direction: column; } .g2 { gap: 2px; } .g4 { gap: 4px; } .g6 { gap: 6px; } .g8 { gap: 8px; } .mn { min-width: 0; } .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-weight: 500; color: var(--ink); }
  .t-section { font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; }
  .intro { display: flex; flex-direction: column; gap: 8px; margin-top: -4px; } .intro h1 { font: 600 34px/34px 'Barlow Condensed', 'Arial Narrow', sans-serif; text-transform: uppercase; letter-spacing: 0.01em; } .intro p { font-size: 15px; line-height: 22px; color: var(--ink2); }
  .prochaine { display: flex; flex-direction: column; gap: 16px; padding: 18px; border-radius: 20px; background: #060708; border: 1px solid var(--line); }
  .p-haut { display: flex; align-items: center; justify-content: space-between; gap: 8px; } .p-haut h2 { display: inline-flex; align-items: center; gap: 8px; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); }
  .pouls { width: 8px; height: 8px; border-radius: 999px; background: var(--accent); animation: nx-pulse 1.4s ease-in-out infinite; }
  .etat { display: inline-flex; align-items: center; height: 26px; padding: 0 10px; border-radius: 999px; background: var(--surface3); color: var(--ink2); font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; } .etat.vente { background: rgba(98, 199, 255, 0.12); color: var(--up); }
  .route { font: 700 clamp(38px, 12.3vw, 48px)/44px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; } .p-det { font-size: 14px; line-height: 20px; color: var(--ink2); } .p-det strong { color: var(--ink); }
  .decompte { display: flex; align-items: flex-start; gap: 10px; flex-wrap: wrap; } .grp { display: flex; flex-direction: column; align-items: center; gap: 6px; } .chiffres { display: flex; gap: 3px; }
  .chiffre { width: 30px; height: 42px; display: flex; align-items: center; justify-content: center; border-radius: 6px; background: #1c1f25; box-shadow: inset 0 -21px 0 #15171b; font: 600 24px/1 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink); } .chiffre.jaune { color: var(--accent); } .chiffre.gris { color: var(--ink3); }
  .unite { font: 700 11px/14px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink3); }
  .sec-lien { display: flex; align-items: center; justify-content: center; min-height: 44px; text-align: center; font: 600 14px/18px 'Barlow', sans-serif; color: var(--accent); }
  .vide { display: flex; align-items: flex-start; gap: 12px; padding: 16px; border-radius: 16px; border: 1px dashed var(--line-strong); } .ico { width: 40px; height: 40px; flex: none; border-radius: 12px; background: var(--surface2); color: var(--ink2); display: grid; place-items: center; } .v-t { font-size: 15px; font-weight: 600; } .v-s { font-size: 13px; line-height: 18px; color: var(--ink2); }
  .rappels, .echelle { display: flex; flex-direction: column; gap: 12px; }
  .trois { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .trois button { display: flex; align-items: center; gap: 8px; min-height: 60px; padding: 8px; box-sizing: border-box; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); color: var(--ink); text-align: left; cursor: pointer; font: inherit; }
  .trois button.on { background: rgba(255, 210, 63, 0.08); border-color: rgba(255, 210, 63, 0.45); }
  .rail { position: relative; flex: none; width: 28px; height: 18px; border-radius: 999px; background: var(--line-strong); } .on .rail { background: var(--accent); }
  .bouton { position: absolute; top: 3px; left: 3px; width: 12px; height: 12px; border-radius: 999px; background: var(--ink2); transition: left 150ms; } .on .bouton { left: 13px; background: #0d0e11; }
  .r-j { font: 600 15px/18px 'IBM Plex Mono', ui-monospace, monospace; } .r-e { font-size: 12px; color: var(--ink3); } .on .r-e { color: var(--accent); }
  .prochain-r { display: flex; align-items: center; gap: 8px; font-size: 13px; line-height: 18px; color: var(--ink2); } .prochain-r :global(svg) { flex: none; }
  .legende { display: flex; flex-wrap: wrap; gap: 8px 16px; font: 600 12px/16px 'Barlow', sans-serif; color: var(--ink2); } .legende > span { display: inline-flex; align-items: center; gap: 6px; }
  .pt { width: 12px; height: 12px; border-radius: 999px; box-sizing: border-box; } .pt.plein { background: var(--accent); } .pt.anneau { border: 2px solid; } .pt.anneau.jaune { border-color: var(--accent); } .pt.anneau.gris { border-color: var(--ink3); }
  .frise { position: relative; display: flex; flex-direction: column; padding: 4px 0; } .axe { position: absolute; left: 71px; top: 16px; bottom: 16px; width: 2px; background: var(--line); }
  .mois, .ligne { display: grid; grid-template-columns: 52px 20px minmax(0, 1fr); column-gap: 10px; align-items: center; } .mois { min-height: 40px; padding-top: 6px; }
  .m-nom { display: flex; flex-direction: column; align-items: flex-end; line-height: 1; } .m-l { font: 600 18px/1 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; } .m-a { font: 400 11px/1 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink3); margin-top: 2px; } .m-r { font-size: 12px; color: var(--ink3); }
  .m-tick { position: relative; display: flex; justify-content: center; } .m-tick > span:not(.losange):not(.point):not(.rond) { width: 12px; height: 2px; background: var(--line-strong); } .m-tick.pad { padding-top: 17px; align-self: start; }
  .ligne.auj { min-height: 36px; } .jour { text-align: right; font: 600 13px/1 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .auj .jour { color: var(--accent); } .losange { width: 10px; height: 10px; transform: rotate(45deg); background: var(--accent); } .auj-t { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent); }
  .ligne.rap { min-height: 30px; } .jour.g { color: var(--ink3); font-weight: 400; } .point { width: 6px; height: 6px; border-radius: 999px; background: var(--ink3); } .rap-t { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--ink2); }
  .ligne.item { align-items: start; padding: 4px 0 8px; } .item .jour { padding-top: 14px; font-size: 16px; color: var(--ink); } .item .jour.proche { color: var(--accent); } .item .jour.lointaine { color: var(--ink); }
  .rond { width: 14px; height: 14px; box-sizing: border-box; border-radius: 999px; background: var(--bg); } .rond.proche { background: var(--accent); box-shadow: 0 0 0 4px rgba(255, 210, 63, 0.22); } .rond.moyenne { border: 2px solid var(--accent); } .rond.lointaine { border: 2px solid var(--ink3); }
  .carte-e { display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 12px 12px 12px 14px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); color: var(--ink); } .carte-e.proche { border-color: rgba(255, 210, 63, 0.5); }
  .c-ent { display: flex; align-items: center; justify-content: space-between; gap: 8px; } .c-g { display: flex; align-items: baseline; gap: 8px; min-width: 0; } .c-route { font: 700 24px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.03em; white-space: nowrap; } .c-ville { font-size: 13px; color: var(--ink3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .c-q { font-size: 13px; line-height: 18px; color: var(--ink2); } .c-eff { font-size: 13px; line-height: 18px; color: var(--ink2); }
  .c-bas { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
  .statut { display: inline-flex; align-items: center; height: 26px; padding: 0 10px; border-radius: 999px; background: var(--surface3); color: var(--ink2); font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; } .statut.vente { background: rgba(98, 199, 255, 0.12); color: var(--up); } .statut.nomme { background: var(--ok-soft); color: var(--ok); }
  .urg { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.08em; text-transform: uppercase; } .urg.proche { color: var(--accent); } .urg.moyenne { color: var(--ink); } .urg.lointaine { color: var(--ink3); }
  .regle { display: flex; flex-direction: column; gap: 10px; padding: 16px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); } .regle .puce { align-self: flex-start; } .regle h2 { font-size: 17px; line-height: 23px; font-weight: 700; }
  .defaut { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; border-radius: 12px; background: var(--accent-soft); border: 1px solid rgba(255, 210, 63, 0.45); font-size: 15px; line-height: 21px; font-weight: 600; } .defaut :global(svg) { color: var(--accent); margin-top: 1px; }
  .regle ul { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; font-size: 14px; line-height: 20px; color: var(--ink2); } .regle p.t-sec { font-size: 14px; line-height: 20px; }
  .aide { font-size: 12px; line-height: 17px; color: var(--ink3); }
  @media (min-width: 900px) { .intro { max-width: 760px; } .intro h1 { font-size: 44px; line-height: 44px; } .aide { text-align: center; } }
</style>
