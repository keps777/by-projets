<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Picto from './Picto.svelte';
  import { aller, param } from '../../router.svelte.ts';
  import { app } from '../../data/store.svelte.ts';
  import { fmt } from '../../core/argent.ts';
  import { taux } from '../../core/regles.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { compagnieDe, volDe } from '../../domain/marche.ts';
  import { compteursSoute, ecartComptoir, etiquettes, numeroVol, offresSoute, partDe, plafondBagage, resoudreDroit, resumeFranchise, titreFranchise, type Etiquette } from './soute.ts';
  import { jourCourt, jourMois, pluriel, pourcent } from './format.ts';

  /** Mes bagages — étiquettes et franchise (planche m3-12). `?droit=` : la réservation ; sinon le prochain droit du compte. */
  const compte = $derived(compteCourant());
  const droit = $derived(compte ? resoudreDroit(compte.id, param('droit')) : undefined);
  const vol = $derived(droit ? volDe(droit.volId) : undefined);
  const cie = $derived(vol ? compagnieDe(vol) : undefined);
  const ville = $derived(app.monde.aeroports.find((a) => a.code === vol?.vers)?.ville ?? vol?.vers ?? '');
  const tags = $derived(droit ? etiquettes(droit) : []);
  const resume = $derived(resumeFranchise(tags));
  const titre = $derived(titreFranchise(resume));
  const num = $derived(vol ? numeroVol(vol) : '');
  const comptoir = $derived(vol ? plafondBagage(vol) : 0);
  const offres = $derived(vol && compte ? offresSoute(vol.id, compte.id) : []);
  const min = $derived(offres[0]?.prix), max = $derived(offres.at(-1)?.prix);
  const gap = $derived(min !== undefined ? ecartComptoir(min, comptoir) : undefined);
  const compteurs = $derived(vol ? compteursSoute(vol.id) : { proposes: 0, demandes: 0 });
  const enVente = $derived(tags.find((t) => t.genre === 'en_vente'));
  const query = $derived(droit ? `?droit=${encodeURIComponent(droit.id)}` : '');
  const chiffresVol = $derived(num.split(''));
  const chiffresDate = $derived(vol ? [...vol.jour.slice(8).replace(/^0/, '').split(''), null, ...jourMois(vol.jour).split(' ')[1].replace('.', '').toUpperCase().split('')] : []);

  const nom = (t: Etiquette) => ({ utilise: 'utilisé', inutilise: 'inutilisé', en_vente: 'en vente', vendu: 'vendu', ajoute: 'ajouté', attente: 'en attente de la compagnie' })[t.genre];
  const sousTitre = (t: Etiquette) => ({ utilise: 'Il part avec vous', inutilise: 'Place libre en soute', en_vente: `En vente à ${fmt(t.prix ?? 0)} sur la soute`, vendu: 'Passé à un autre passager du vol', ajoute: 'Confirmé par la compagnie (démo)', attente: 'Acheté sur la soute du vol' })[t.genre];
  const puce = (t: Etiquette) => ({ utilise: 'Utilisé', inutilise: 'Inutilisé', en_vente: `En vente · ${fmt(t.prix ?? 0)}`, vendu: 'Vendu', ajoute: 'Ajouté', attente: 'En attente' })[t.genre];
  const libre = (t: Etiquette) => t.genre === 'inutilise' || t.genre === 'en_vente';
  const ariaJauge = $derived(`Jauge de franchise : ${pluriel(resume.utilises, 'bagage utilisé', 'bagages utilisés')} sur ${resume.inclus} inclus, ${pluriel(resume.libres, 'inutilisé')}${resume.vendus ? `, ${pluriel(resume.vendus, 'vendu')}` : ''}`);
</script>

<Ecran titre="Mes bagages" face="jour" retour={droit ? `/voyage/${droit.id}` : '/'}>
  <h1 class="sr">Mes bagages</h1>
  {#if !compte || !droit || !vol || !cie}
    <section class="vide carte" aria-live="polite">
      <span class="rond" aria-hidden="true"><Picto nom="etiquette" taille={26} /></span>
      <h2 class="t-section">Aucun voyage à venir</h2>
      <p class="t-sec">Vos étiquettes de bagage apparaissent dès que vous détenez un droit de voyage.</p>
      <button type="button" class="btn" onclick={() => aller('/rechercher')}>Rechercher un vol</button>
    </section>
  {:else}
    <section class="intro" aria-labelledby="intro-t">
      <p class="sur">{cie.nom} {num} · {vol.de} → {vol.vers} · {jourCourt(vol.jour)}</p>
      <h2 id="intro-t" class="grand">{titre[0]}<br />{titre[1]}</h2>
    </section>

    <ul class="etiquettes" aria-label="Étiquettes de vos bagages, vol {cie.code} {num} du {jourMois(vol.jour)}">
      {#each tags as t, i (i)}
        <li class="tag-li" class:pair={i % 2 === 0} class:balance={libre(t)}>
          <div class="ombre" class:forte={libre(t)}>
            <div class="tag" data-genre={t.genre}>
              <span class="mono ligne">{cie.code} {num} · {jourMois(vol.jour).replace('.', '').toUpperCase()}</span>
              <span class="code">{vol.vers}</span>
              <span class="ville">{ville}</span>
              <span class="barres" aria-hidden="true"></span>
              <span class="mono rang">Bagage {t.rang}/{t.sur} · {t.kg}&nbsp;kg</span>
              <span class="chip" data-genre={t.genre}>
                {#if t.genre === 'utilise' || t.genre === 'ajoute'}<Picto nom="ok" taille={14} trait={2.25} />{:else if libre(t)}<Picto nom="etiquette" taille={14} />{:else if t.genre === 'attente'}<Picto nom="horloge" taille={14} />{/if}
                {puce(t)}
              </span>
            </div>
          </div>
          <span class="ficelle" aria-hidden="true"></span><span class="oeillet" aria-hidden="true"></span>
        </li>
      {/each}
    </ul>

    <section class="carte franchise" aria-labelledby="fr-t">
      <div class="entete-fr"><h2 id="fr-t" class="sur">Franchise en soute</h2><span class="puce">[H] Hypothèse démo</span></div>
      <p class="chiffre"><span class="mono grosnb">{resume.utilises} / {resume.inclus}</span><span class="legende">{resume.utilises > 1 ? 'bagages utilisés' : 'bagage utilisé'} · {resume.inclus} × {tags[0]?.kg ?? 23}&nbsp;kg inclus</span></p>
      <div class="jauge" role="img" aria-label={ariaJauge} style:grid-template-columns="repeat({Math.max(1, tags.length)}, 1fr)">
        {#each tags as t, i (i)}<span class="seg" data-genre={t.genre} class:g={i === 0} class:d={i === tags.length - 1}></span>{/each}
      </div>
      <ul class="legendes">
        {#each tags as t, i (i)}
          <li>
            <span class="pastille" data-genre={t.genre} aria-hidden="true">{#if t.genre === 'utilise' || t.genre === 'ajoute'}<Picto nom="ok" taille={14} trait={2.25} />{:else if libre(t)}<Picto nom="etiquette" taille={12} trait={2.25} />{:else if t.genre === 'attente'}<Picto nom="horloge" taille={12} />{:else}<Picto nom="croix" taille={12} />{/if}</span>
            <span class="txt"><span class="t1">Bagage {t.rang} · {nom(t)}</span><span class="t2">{sousTitre(t)}</span></span>
          </li>
        {/each}
      </ul>
      <p class="note">Inclus dans le tarif du droit de voyage {droit.ref} (hypothèse de démonstration). Poids et dimensions selon la compagnie.</p>
    </section>

    <section class="actions" aria-label="Que faire de votre franchise">
      {#if resume.libres > 0}
        <a class="act jaune" href="/bagages/vendre{query}" onclick={(e) => { e.preventDefault(); aller(`/bagages/vendre${query}`); }}>
          <span class="ico sombre" aria-hidden="true"><Picto nom="etiquette" taille={24} trait={1.75} /></span>
          <span class="corps"><span class="a1">Revendre mon bagage inutilisé</span><span class="a2">{enVente ? `En vente à ${fmt(enVente.prix ?? 0)} · ` : ''}À un passager du vol {num} · prix plafonné au prix compagnie (règle à valider)</span></span>
          <Picto nom="suivant" taille={20} />
        </a>
      {/if}
      <a class="act blanc" href="/bagages/ajouter{query}" onclick={(e) => { e.preventDefault(); aller(`/bagages/ajouter${query}`); }}>
        <span class="ico bleu" aria-hidden="true"><Picto nom="avion" taille={24} trait={1.75} /></span>
        <span class="corps"><span class="a1">Besoin de plus ? Voir la soute du vol</span><span class="a2">{pluriel(compteurs.proposes, 'bagage proposé', 'bagages proposés')} et {compteurs.demandes ? pluriel(compteurs.demandes, 'demande') : 'aucune demande'} sur le vol {num}</span></span>
        <Picto nom="suivant" taille={20} />
      </a>
    </section>

    <section class="carte comparaison" aria-labelledby="cmp-t">
      <h2 id="cmp-t" class="t-bloc">Un bagage en plus, deux options</h2>
      <div class="barre-bloc">
        <div class="ligne-prix"><span class="lib">Bagage supplémentaire · compagnie</span><span class="mono prix">{fmt(comptoir)}</span></div>
        <span class="piste" aria-hidden="true"><span class="plein gris" style:width="100%"></span></span>
        <span class="aide">Exemple · prix affiché par la compagnie</span>
      </div>
      <div class="barre-bloc">
        <div class="ligne-prix"><span class="lib">Soute du vol {num}</span><span class="mono prix bleu">{min !== undefined ? `dès ${fmt(min)}` : 'aucune offre'}</span></div>
        <span class="piste" aria-hidden="true"><span class="plein" style:width="{min !== undefined ? partDe(min, comptoir) : 0}%"></span></span>
        <span class="aide">{min !== undefined && max !== undefined ? `Offres de passagers du même vol · de ${fmt(min)} à ${fmt(max)}` : 'Aucune offre de passager du même vol aujourd’hui.'}</span>
      </div>
      {#if gap}
        <p class="ecart"><Picto nom="tendance" taille={18} /><span><span class="mono gap">{gap.libelle}</span> entre le prix compagnie et l’offre la plus basse aujourd’hui. Exemple, selon le marché&nbsp;: aucune économie garantie.</span></p>
      {/if}
    </section>

    <section class="regle" aria-labelledby="rule-t">
      <h2 id="rule-t" class="regle-t"><Picto nom="cadenas" taille={16} />La règle de la soute</h2>
      <p class="regle-p">Un bagage ne voyage que sur son vol : même numéro, même date.</p>
      <div class="solari" role="img" aria-label="Vol {num}, {jourMois(vol.jour)}">
        <span class="groupe" aria-hidden="true"><span class="g-t">Vol</span><span class="cases">{#each chiffresVol as c, i (i)}<span class="case">{c}</span>{/each}</span></span>
        <span class="groupe" aria-hidden="true"><span class="g-t">Date</span><span class="cases">{#each chiffresDate as c, i (i)}{#if c === null}<span class="blanc-case"></span>{:else}<span class="case">{c}</span>{/if}{/each}</span></span>
      </div>
      <p class="regle-s">La place en soute appartient à cet avion. Aucune revente vers un autre vol, même chez {cie.nom}. Transferts possibles jusqu’à l’échéance de nommage (à valider).</p>
    </section>

    <p class="reserve" role="note"><span class="h">[H]</span><span><strong>Sous réserve d’accord avec la compagnie.</strong> Retirer une franchise d’une réservation pour l’ajouter à une autre suppose un accord avec {cie.nom}. Aucun accord n’existe à ce jour. Commission&nbsp;: hypothèse {pourcent(taux(compte.pass.actif))}.</span></p>
  {/if}
</Ecran>

<style>
  .vide { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
  .vide .rond { width: 52px; height: 52px; border-radius: 16px; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; }
  .intro { display: flex; flex-direction: column; gap: 6px; }
  .sur { margin: 0; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); }
  .grand { margin: 0; font: 700 clamp(34px, 11vw, 42px)/0.95 'Barlow Condensed', 'Arial Narrow', sans-serif; text-wrap: balance; }
  .etiquettes { overflow-x: clip; list-style: none; margin: 0; padding: 0 2px 6px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .tag-li { position: relative; padding-top: 30px; transform: rotate(3deg); transform-origin: 50% 0; min-width: 0; }
  .tag-li.pair { transform: rotate(-3deg); }
  .tag-li.balance { animation: nx-swing 900ms ease-out 200ms 1 both; }
  .ombre { position: relative; filter: drop-shadow(0 10px 16px rgba(11, 27, 46, 0.14)); } .ombre.forte { filter: drop-shadow(0 12px 18px rgba(11, 27, 46, 0.18)); }
  .tag { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 46px 14px 16px; border-radius: 16px; background: #fff; color: #0b1b2e; clip-path: polygon(26% 0, 74% 0, 100% 15%, 100% 100%, 0 100%, 0 15%); }
  .tag[data-genre='inutilise'], .tag[data-genre='en_vente'] { background: #ffd23f; }
  .tag[data-genre='vendu'] { background: #e3eaf2; }
  .ligne { font: 600 12px/16px 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: 0.04em; color: #3e4f66; white-space: nowrap; }
  .tag[data-genre='inutilise'] .ligne, .tag[data-genre='en_vente'] .ligne { color: #0b1b2e; }
  .code { font: 700 clamp(60px, 19vw, 76px)/0.82 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.01em; }
  .ville { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.14em; text-transform: uppercase; color: #3e4f66; }
  .tag[data-genre='inutilise'] .ville, .tag[data-genre='en_vente'] .ville { color: #0b1b2e; }
  .barres { align-self: stretch; height: 30px; border-radius: 3px; background: repeating-linear-gradient(90deg, rgba(11, 27, 46, 0.34) 0 2px, transparent 2px 4px, rgba(11, 27, 46, 0.34) 4px 7px, transparent 7px 9px, rgba(11, 27, 46, 0.34) 9px 10px, transparent 10px 13px); }
  .rang { font: 500 12px/16px 'IBM Plex Mono', ui-monospace, monospace; color: #3e4f66; white-space: nowrap; }
  .tag[data-genre='inutilise'] .rang, .tag[data-genre='en_vente'] .rang { color: #0b1b2e; }
  .chip { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 999px; background: rgba(9, 106, 73, 0.1); color: #096a49; font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; }
  .chip[data-genre='inutilise'], .chip[data-genre='en_vente'] { background: #0b1b2e; color: #fff; }
  .chip[data-genre='vendu'] { background: #fff; color: #3e4f66; }
  .chip[data-genre='attente'] { background: rgba(255, 210, 63, 0.3); color: #5c4600; }
  .ficelle { position: absolute; left: 50%; top: 0; width: 14px; height: 54px; margin-left: -7px; box-sizing: border-box; border: 3px solid #0b1b2e; border-bottom: 0; border-radius: 7px 7px 0 0; z-index: 2; }
  .balance .ficelle { border-color: #1a64c8; }
  .oeillet { position: absolute; left: 50%; top: 44px; width: 20px; height: 20px; margin-left: -10px; box-sizing: border-box; border-radius: 999px; background: var(--bg); border: 4px solid #b9c5d3; z-index: 3; }
  .balance .oeillet { border-color: #0b1b2e; }
  @keyframes nx-swing { 0% { transform: rotate(14deg); } 30% { transform: rotate(-5deg); } 55% { transform: rotate(6deg); } 78% { transform: rotate(1.5deg); } 100% { transform: rotate(3deg); } }

  .franchise { display: flex; flex-direction: column; gap: 12px; padding: 18px; }
  .entete-fr { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .chiffre { margin: 0; display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 10px; }
  .grosnb { font: 600 34px/38px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .legende { font: 600 15px/20px 'Barlow', sans-serif; }
  .jauge { display: grid; gap: 6px; }
  .seg { height: 16px; box-sizing: border-box; border-radius: 4px; background: #0b1b2e; }
  .seg.g { border-top-left-radius: 999px; border-bottom-left-radius: 999px; } .seg.d { border-top-right-radius: 999px; border-bottom-right-radius: 999px; }
  .seg[data-genre='inutilise'], .seg[data-genre='en_vente'] { border: 2px solid #0b1b2e; background: repeating-linear-gradient(135deg, #ffd23f 0 6px, #ffe79a 6px 12px); }
  .seg[data-genre='vendu'] { border: 2px dashed #b9c5d3; background: transparent; }
  .seg[data-genre='ajoute'] { background: #1a64c8; } .seg[data-genre='attente'] { background: repeating-linear-gradient(135deg, #1a64c8 0 6px, #7fa8e0 6px 12px); }
  .legendes { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .legendes li { display: flex; align-items: flex-start; gap: 8px; min-width: 0; }
  .pastille { flex: none; width: 22px; height: 22px; box-sizing: border-box; border-radius: 999px; background: rgba(9, 106, 73, 0.1); color: #096a49; display: grid; place-items: center; }
  .pastille[data-genre='inutilise'], .pastille[data-genre='en_vente'] { background: #ffd23f; border: 1.5px solid #0b1b2e; color: #0b1b2e; }
  .pastille[data-genre='vendu'] { background: #e3eaf2; color: #3e4f66; } .pastille[data-genre='attente'] { background: rgba(255, 210, 63, 0.3); color: #5c4600; }
  .txt { display: flex; flex-direction: column; gap: 1px; min-width: 0; } .t1 { font: 600 14px/18px 'Barlow', sans-serif; } .t2 { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .note { margin: 0; font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .actions { display: flex; flex-direction: column; gap: 10px; }
  .act { display: flex; align-items: center; gap: 14px; min-height: 76px; padding: 12px 14px 12px 12px; box-sizing: border-box; border-radius: 16px; color: #0b1b2e; text-decoration: none; }
  .act.jaune { background: #ffd23f; box-shadow: 0 10px 24px rgba(11, 27, 46, 0.12); } .act.blanc { background: #fff; border: 1px solid #b9c5d3; }
  .ico { flex: none; width: 48px; height: 48px; border-radius: 14px; display: grid; place-items: center; } .ico.sombre { background: #0b1b2e; color: #ffd23f; } .ico.bleu { background: rgba(26, 100, 200, 0.1); color: #1a64c8; }
  .corps { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; } .a1 { font: 700 17px/21px 'Barlow', sans-serif; } .a2 { font: 500 13px/17px 'Barlow', sans-serif; } .blanc .a2 { font-weight: 400; color: var(--ink2); }
  .blanc :global(svg:last-child) { color: var(--ink2); }
  .comparaison { display: flex; flex-direction: column; gap: 16px; padding: 18px; }
  .t-bloc { margin: 0; font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; }
  .barre-bloc { display: flex; flex-direction: column; gap: 6px; } .ligne-prix { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .lib { font: 600 15px/20px 'Barlow', sans-serif; } .prix { font: 600 18px/22px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; white-space: nowrap; } .prix.bleu { color: #1a64c8; }
  .piste { display: block; height: 10px; border-radius: 999px; background: #e3eaf2; overflow: hidden; } .plein { display: block; height: 100%; border-radius: 999px; background: #1a64c8; } .plein.gris { background: #5a6a80; }
  .aide { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .ecart { margin: 0; display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: 12px; background: var(--bg); font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .ecart :global(svg) { margin-top: 1px; color: #a84a0e; } .gap { font-weight: 600; color: #a84a0e; font-variant-numeric: tabular-nums; }
  .regle { display: flex; flex-direction: column; gap: 14px; padding: 20px 18px; border-radius: 20px; background: #0b1b2e; color: #fff; }
  .regle-t { margin: 0; display: flex; align-items: center; gap: 8px; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: #c9d3df; }
  .regle-p { margin: 0; font: 700 clamp(26px, 8.4vw, 32px)/1 'Barlow Condensed', 'Arial Narrow', sans-serif; } .regle-s { margin: 0; font: 400 13px/18px 'Barlow', sans-serif; color: #c9d3df; }
  .solari { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px 18px; }
  .groupe { display: flex; flex-direction: column; gap: 6px; } .g-t { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: #c9d3df; }
  .cases { display: flex; gap: 3px; } .case { width: 22px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 4px; background: #1c1f25; box-shadow: inset 0 -15px 0 #15171b; font: 600 17px/1 'IBM Plex Mono', ui-monospace, monospace; color: #ffd23f; } .blanc-case { width: 8px; }
  .reserve { margin: 0; display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 14px; background: #e3eaf2; font: 400 13px/18px 'Barlow', sans-serif; color: #3e4f66; }
  .reserve .h { flex: none; display: inline-flex; align-items: center; height: 24px; padding: 0 8px; border-radius: 999px; background: #0b1b2e; color: #fff; font: 600 12px/1 'IBM Plex Mono', ui-monospace, monospace; } .reserve strong { color: #0b1b2e; }
  @media (max-width: 359px) { .ligne { font-size: 10.5px; letter-spacing: 0; } .tag { padding-inline: 8px; } .legendes { grid-template-columns: 1fr; } .rang { font-size: 11px; } }
</style>
