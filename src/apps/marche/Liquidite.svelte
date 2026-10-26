<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { fmt } from '../../core/argent.ts';
  import { departDe, echeanceDe } from '../../core/regles.ts';
  import { maintenant } from '../../data/store.svelte.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { compagnieDe, droitDe, volDe } from '../../domain/marche.ts';
  import { accepterRachat, blocageDe, ErreurRevente, offreDeRachat } from '../../domain/revente.ts';
  import { reseau } from '../achat/reseau.svelte.ts';
  import Absent from './Absent.svelte';
  import { texteBlocage } from './Blocage.ts';
  import { jours as nbJours, jourComplet, jourCourt, jourHeure } from './format.ts';
  import { naviguer } from './lien.ts';
  import { courbe, dateVente, estimation, horizon, modeDe, pointsReference, V_ANNONCE, xCurseur, yPrix } from './liquidite.ts';
  import Pic from './Pic.svelte';
  import { recu } from './vente.ts';

  /** Vendre ou attendre : comparer le rachat instantané NexG-TT, l'annonce au marché et la patience. */
  let { id = '' }: { id?: string } = $props();
  const compte = $derived(compteCourant());
  const droit = $derived(droitDe(id));
  const vol = $derived(droit ? volDe(droit.volId) : undefined);
  const blocage = $derived(compte ? blocageDe(id, compte.id) : 'introuvable');
  let v = $state(V_ANNONCE), confirmer = $state(false), erreur = $state(''), fait = $state<number | undefined>();
  const depart = $derived(vol ? departDe(vol.jour, vol.heureDepart) : 0);
  const hz = $derived(horizon(depart, echeanceDe(depart), maintenant()));
  const pass = $derived(!!compte?.pass.actif);
  const neuf = $derived(vol?.prixNeuf ?? 1);
  const est = $derived(estimation(v, neuf, hz.jours, pass)), mode = $derived(modeDe(v));
  const annonce = $derived(estimation(V_ANNONCE, neuf, hz.jours, pass)), attente = $derived(estimation(100, neuf, hz.jours, pass));
  const rachat = $derived(offreDeRachat(id));
  const cb = $derived(courbe(neuf, hz.jours));
  const annoncePoint = $derived(pointsReference(neuf, hz.jours)[1]);
  const dotX = $derived(xCurseur(v)), dotY = $derived(yPrix(est.prix, neuf));
  const marche = $derived(mode !== 'rachat');
  const jour = (n: number) => nbJours(n);
  const patience = $derived(mode === 'rachat' ? 'Maintenant' : mode === 'annonce' ? `≈ ${jour(est.jours)}` : `jusqu’au ${jourCourt(maintenant() + est.jours * 86_400_000)}`);
  const valeurTexte = $derived(mode === 'rachat' ? `Maintenant : rachat instantané par NexG-TT, ${fmt(est.prix)}, offre hypothétique` : mode === 'annonce' ? `Annonce au marché : environ ${fmt(est.prix)}, vente estimée sous ${jour(est.jours)}, certitude ${est.mot.toLowerCase()}` : `Attendre jusqu’au ${jourCourt(maintenant() + est.jours * 86_400_000)} : environ ${fmt(est.prix)}, certitude ${est.mot.toLowerCase()}`);
  const certCouleur = $derived(est.niveau === 3 ? '#7ce3b5' : est.niveau === 2 ? '#62c7ff' : '#ff9e5e');
  const segments = $derived(Array.from({ length: 10 }, (_, i) => i < Math.max(1, Math.round(est.cert / 10))));
  const rClair = $derived(vol ? recu(annonce.prix, droit?.prixPaye ?? 0, pass) : undefined);
  const sousPrixSuggere = $derived(`/revendre/${id}?prix=${marche ? est.prix : annonce.prix}`);
  const dejaEnVente = $derived(droit?.statut === 'en_vente');

  function choisirRachat() { v = 0; } function choisirAnnonce() { v = V_ANNONCE; }
  function accepter() {
    erreur = ''; if (!compte || !rachat) return;
    if (!reseau.enLigne) { erreur = 'Vous êtes hors ligne : le rachat demande une connexion.'; confirmer = false; return; }
    try { fait = accepterRachat(id, compte.id, rachat.prix).prix; confirmer = false; } catch (e) { erreur = e instanceof ErreurRevente ? e.message : 'Rachat impossible pour l’instant.'; confirmer = false; }
  }
</script>

{#if !id}
  <!-- ancien écran réinstancié brièvement -->
{:else if fait !== undefined}
  <Ecran titre="Rachat accepté" face="nuit" sansRetour>
    <section class="carte fait" role="status" aria-live="polite" data-testid="rachat-fait"><span class="rond-ok"><Icone nom="ok" taille={30} trait={2.25} /></span>
      <h2 class="t-section">Rachat accepté</h2><p class="montant mono">+{fmt(fait)}</p><p class="t-sec">Versé sur votre solde NexG : le droit est passé à NexG-TT, le montant est net, commission incluse.</p>
      <a class="btn" href="/solde" onclick={(e) => naviguer(e, '/solde')}>Voir mon solde</a><a class="btn sec" href="/portefeuille" onclick={(e) => naviguer(e, '/portefeuille')}>Retour au portefeuille</a></section>
  </Ecran>
{:else if !droit || !vol || blocage}
  {@const t = texteBlocage(blocage ?? 'introuvable')}
  <Absent titre={t.titre} message={t.message} details={t.details} lien="/portefeuille" libelleLien="Voir mon portefeuille" retour="/portefeuille" />
{:else}
  {@const cie = compagnieDe(vol)}
  <Ecran titre="Options de vente" face="nuit" retour="/portefeuille">
    <section class="billet" aria-label="Votre droit"><div class="gauche"><span class="route">{vol.de} → {vol.vers}</span><span class="detail">{jourComplet(depart)} · {cie.nom} · vol {vol.numero.split(' ')[1]}</span></div>
      <div class="coupe" aria-hidden="true"></div><div class="droite"><span class="l">Payé</span><span class="m mono">{fmt(droit.prixPaye)}</span><span class="l sp">Prix équivalent</span><span class="m mono">{fmt(vol.prixNeuf)}</span></div></section>

    <section class="entete"><h2 class="titre">Vendre maintenant ou attendre ?</h2><p class="intro">Glissez le curseur de patience. Plus vous laissez de temps, plus le prix estimé peut monter, et moins la vente est certaine.</p></section>

    <section class="estimation" aria-labelledby="est-t">
      <div class="haut"><h2 id="est-t" class="t-sur">Estimation</h2><span class="chip" class:c-r={mode === 'rachat'} class:c-a={mode === 'annonce'} class:c-w={mode === 'attente'}>{mode === 'rachat' ? 'Rachat instantané' : mode === 'annonce' ? 'Annonce au marché' : 'Attendre'}</span></div>
      <div class="prix"><span class="gros mono" data-testid="estimation">{mode === 'rachat' ? fmt(est.prix) : `≈ ${fmt(est.prix)}`}</span>
        {#if mode === 'rachat'}<span class="t-sec">Montant fixe de l’offre de rachat (offre hypothétique)</span>{:else}<span class="t-sec">Fourchette estimée&nbsp;: <span class="mono clair">{fmt(est.bas)} – {fmt(est.haut)}</span></span>{/if}</div>
      <div class="trois">
        <div><span class="tit">Délai</span><span class="mono val">{mode === 'rachat' ? 'Minutes' : `${est.jours} j`}</span><span class="sub">{mode === 'rachat' ? 'dès l’acceptation' : `vers le ${dateVente(est.jours, maintenant())}`}</span></div>
        <div><span class="tit">Certitude</span><span class="segs" aria-hidden="true">{#each segments as on}<span style="background: {on ? certCouleur : '#2c303a'}"></span>{/each}</span><span class="mot" style="color: {certCouleur}">{est.mot}</span></div>
        <div><span class="tit">Net reçu</span><span class="mono val" data-testid="net">{fmt(est.net)}</span><span class="sub">{mode === 'rachat' ? 'commission incluse' : `commission −${fmt(est.commission)} (${rClair?.tauxLabel}${pass ? ' · Pass' : ''}, hyp.)`}</span></div>
      </div>
      <svg viewBox="0 0 316 172" width="100%" role="img" class="graph" aria-label="Courbe indicative du prix de vente estimé selon le délai accepté. Rachat instantané : {fmt(rachat?.prix ?? est.prix)}. Annonce au marché : environ {fmt(annonce.prix)}, vente estimée sous {jour(annonce.jours)}. Attente jusqu’à {hz.label} : jusqu’à environ {fmt(attente.prix)}, avec une fourchette de plus en plus large et une vente moins certaine. Prix équivalent d’un billet neuf : {fmt(neuf)}.">
        <g stroke="#1a1d23" stroke-width="1">{#each cb.grille as g}<line x1="44" y1={g.y} x2="312" y2={g.y} />{/each}</g>
        <line x1="44" y1="149.5" x2="312" y2="149.5" stroke="#2c303a" /><line x1="44" y1={cb.yPlafond} x2="312" y2={cb.yPlafond} stroke="#3a3f4b" stroke-dasharray="4 4" />
        <line x1="84.3" y1="28" x2="84.3" y2="149" stroke="#2c303a" stroke-dasharray="2 3" /><line x1="227.3" y1="28" x2="227.3" y2="149" stroke="#2c303a" stroke-dasharray="2 3" />
        <polygon points={cb.bande} fill="rgba(98,199,255,0.12)" stroke="none" />
        <polyline points="{cb.rachat[0]},{cb.rachat[2]} 83,{cb.rachat[2]}" fill="none" stroke="#f3f4f6" stroke-width="2.5" stroke-linecap="round" />
        <polyline points={cb.annonce.map((p) => p.join(',')).join(' ')} fill="none" stroke="#62c7ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        {#each cb.points as p, i}<circle cx={p[0]} cy={p[1]} r="4" fill="#0d0e11" stroke={i === 0 ? '#f3f4f6' : '#62c7ff'} stroke-width="1.5" />{/each}
        <text x="312" y="14" text-anchor="end" class="neuf">Prix équivalent neuf · {fmt(neuf)}</text>
        {#each cb.grille as g}<text x="38" y={g.y + 4} text-anchor="end" class="grad">{fmt(g.texte).replace(/[  ]?\$/, '')}</text>{/each}
        <line x1={dotX} y1={dotY} x2={dotX} y2="149" stroke="rgba(255,210,63,0.55)" /><circle cx={dotX} cy={dotY} r="9" fill="#ffd23f" stroke="#0d0e11" stroke-width="3" /><circle cx={dotX} cy={dotY} r="12.5" fill="none" stroke="rgba(255,210,63,0.25)" stroke-width="4" />
        <g class="zones"><text x={cb.xRachat} y="166" text-anchor="middle" fill={mode === 'rachat' ? '#f3f4f6' : '#8c93a3'}>RACHAT</text><text x={cb.xAnnonce} y="166" text-anchor="middle" fill={mode === 'annonce' ? '#f3f4f6' : '#8c93a3'}>ANNONCE</text><text x={cb.xAttente} y="166" text-anchor="middle" fill={mode === 'attente' ? '#f3f4f6' : '#8c93a3'}>ATTENTE</text></g>
      </svg>
      <div class="patience"><div class="ligne-p"><label for="patience">Curseur de patience</label><span class="mono jaune">{patience}</span></div>
        <input id="patience" type="range" min="0" max="100" step="1" bind:value={v} aria-valuetext={valeurTexte} />
        <div class="reperes"><span>Maintenant</span><span>≈ {jour(annoncePoint.jours)}</span><span>{hz.label} · {jourCourt(hz.fin)}</span></div></div>
      {#if mode === 'rachat'}<p class="explique"><Icone nom="ok" taille={18} trait={2} /><span><strong>Rachat instantané par NexG-TT&nbsp;:</strong> {fmt(est.prix)}, versé en quelques minutes sur votre solde (offre hypothétique).</span></p>
      {:else if mode === 'annonce'}<p class="explique"><span class="bleu"><Pic nom="etiquette" taille={18} /></span><span><strong>Annonce au marché&nbsp;:</strong> votre droit est proposé aux acheteurs. Vente estimée sous {jour(est.jours)}, sans garantie.</span></p>
      {:else}<p class="explique"><span class="jaune"><Icone nom="info" taille={18} trait={2} /></span><span><strong>Attendre&nbsp;:</strong> jusqu’à ~{fmt(attente.prix)} estimés si la demande monte, avec un risque de ne pas vendre avant l’échéance du {jourCourt(echeanceDe(depart))} (J-1).</span></p>{/if}
    </section>

    <section aria-labelledby="cmp-t" class="comparer"><h2 id="cmp-t" class="t-section">Comparer</h2>
      <div class="deux">
        <button type="button" aria-pressed={mode === 'rachat'} class="opt" class:sel={mode === 'rachat'} onclick={choisirRachat}>
          <span class="t-sur petit">Rachat instantané</span><span class="gros2 mono">{fmt(rachat?.prix ?? est.prix)}</span><span class="t-sec">Versé en quelques minutes</span>
          <span class="lignes"><span><span>Commission</span><span class="clair">incluse</span></span><span><span>Net reçu</span><span class="mono clair">{fmt(rachat?.net ?? est.net)}</span></span></span><span class="fin">Offre hypothétique</span>
          {#if mode === 'rachat'}<span class="actuel"><Icone nom="ok" taille={16} trait={2.25} />Choix actuel</span>{:else}<span class="choisir">Choisir</span>{/if}</button>
        <button type="button" aria-pressed={marche} class="opt" class:sel={marche} onclick={choisirAnnonce}>
          <span class="t-sur petit">Annonce au marché</span><span class="gros2 mono">≈ {fmt(annonce.prix)}</span><span class="t-sec">Vente estimée sous {jour(annonce.jours)}</span>
          <span class="lignes"><span><span>Commission*</span><span class="mono orange">−{fmt(annonce.commission)}</span></span><span><span>Net estimé</span><span class="mono clair">{fmt(annonce.net)}</span></span></span><span class="fin">Sans garantie de vente</span>
          {#if marche}<span class="actuel"><Icone nom="ok" taille={16} trait={2.25} />Choix actuel</span>{:else}<span class="choisir">Choisir</span>{/if}</button>
      </div>
      <p class="note">* Commission de revente NexG-TT&nbsp;: {rClair?.tauxLabel === rClair?.tauxSansPass ? '' : '10 % pour les membres Pass, '}{rClair?.tauxSansPass} sans Pass (hypothèse). {compte?.prenom} {(compte?.nom ?? '').charAt(0)}. {pass ? 'est' : 'n’est pas'} membre Pass. Le rachat est un montant net, sans commission ajoutée (hypothèse). Prix de revente encadré par un plafond&nbsp;: règle à définir.</p></section>

    <a class="echeance" href="/echeances" onclick={(e) => naviguer(e, '/echeances')}><Icone nom="horloge" taille={18} trait={2} /><span class="grow">Échéance le {jourHeure(echeanceDe(depart))}&nbsp;: après, plus aucune vente possible</span><Icone nom="suivant" taille={18} trait={2} /></a>
    {#if erreur}<p class="erreur" role="alert"><Icone nom="alerte" taille={18} trait={2} /><span>{erreur}</span></p>{/if}
    <div class="mentions"><p class="fort">Estimations indicatives, aucun prix garanti.</p><p>Un droit de voyage n’est pas un placement financier. Données fictives de démonstration.</p></div>

    {#snippet pied()}
      <button type="button" class="btn grand" class:sec={mode !== 'rachat'} onclick={() => (confirmer = true)} disabled={!rachat}>Accepter le rachat · <span class="mono">{fmt(rachat?.prix ?? est.prix)}</span></button>
      <a class="btn grand" class:sec={mode === 'rachat'} href={sousPrixSuggere} onclick={(e) => naviguer(e, sousPrixSuggere)}><Pic nom="etiquette" taille={18} />{dejaEnVente ? 'Modifier l’annonce' : 'Mettre en vente'}</a>
    {/snippet}
  </Ecran>
  <Feuille bind:ouvert={confirmer} titre="Accepter le rachat ?" sous="Cette action est définitive.">
    <p>NexG-TT rachète ce droit {vol.de} → {vol.vers} pour <strong class="mono">{fmt(rachat?.prix ?? 0)}</strong>, versés en quelques minutes sur votre solde. Le droit quitte votre portefeuille et n’est plus récupérable.</p>
    {#snippet pied()}<button type="button" class="btn" onclick={accepter}>Confirmer le rachat</button><button type="button" class="btn sec" onclick={() => (confirmer = false)}>Garder mon droit</button>{/snippet}
  </Feuille>
{/if}

<style>
  .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .grow { flex: 1; } .clair { color: var(--ink); } .orange { color: var(--down); } .jaune { color: var(--accent); } .bleu { color: var(--up); display: contents; }
  .billet { display: flex; align-items: stretch; border-radius: 16px; background: #fff; color: #121418; } .gauche { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 4px; padding: 14px 16px; }
  .route { font: 700 clamp(26px, 8.2vw, 32px)/1 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.03em; } .detail { font-size: 13px; font-weight: 500; color: #555c6b; }
  .coupe { position: relative; flex: none; width: 0; border-left: 2px dashed #e2e4e9; } .coupe::before, .coupe::after { content: ''; position: absolute; left: -12px; width: 22px; height: 22px; border-radius: 999px; background: var(--bg); } .coupe::before { top: -11px; } .coupe::after { bottom: -11px; }
  .droite { flex: none; width: 112px; display: flex; flex-direction: column; justify-content: center; gap: 1px; padding: 12px 14px; } .l { font-size: 12px; font-weight: 500; color: #555c6b; } .l.sp { margin-top: 4px; } .m { font-weight: 600; font-size: 16px; }
  .entete { display: flex; flex-direction: column; gap: 8px; } .titre { font: 600 clamp(28px, 8.7vw, 34px)/1 'Barlow Condensed', 'Arial Narrow', sans-serif; text-transform: uppercase; letter-spacing: 0.01em; text-wrap: balance; } .intro { font-size: 15px; line-height: 22px; color: var(--ink2); }
  .t-sur { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); } .t-sur.petit { letter-spacing: 0.08em; } .t-section { text-transform: uppercase; letter-spacing: 0.04em; }
  .estimation { display: flex; flex-direction: column; gap: 14px; padding: 16px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
  .haut { display: flex; align-items: center; justify-content: space-between; gap: 8px; } .chip { display: inline-flex; align-items: center; height: 26px; padding: 0 10px; border-radius: 999px; font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; }
  .c-r { background: var(--surface3); color: var(--ink); } .c-a { background: rgba(98, 199, 255, 0.12); color: var(--up); } .c-w { background: var(--accent-soft); color: var(--accent); }
  .prix { display: flex; flex-direction: column; gap: 4px; } .gros { font-weight: 600; font-size: clamp(32px, 10.2vw, 40px); line-height: 44px; letter-spacing: -0.01em; white-space: nowrap; }
  .trois { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; padding-top: 12px; border-top: 1px solid var(--line); } .trois > div { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .tit { font: 700 11px/1.2 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink3); } .val { font-weight: 600; font-size: 16px; } .sub { font-size: 12px; color: var(--ink3); }
  .segs { display: flex; gap: 2px; height: 16px; } .segs span { width: 6px; border-radius: 2px; } .mot { font-size: 12px; font-weight: 700; }
  .graph { display: block; } .neuf { font: 600 11px 'Barlow', sans-serif; fill: #b9bec9; } .grad { font: 11px 'IBM Plex Mono', ui-monospace, monospace; fill: #8c93a3; } .zones text { font: 700 11px 'Barlow', sans-serif; letter-spacing: 0.1em; }
  .patience { display: flex; flex-direction: column; gap: 2px; } .ligne-p { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; } .ligne-p label { font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; } .ligne-p .mono { font-weight: 600; font-size: 13px; }
  input[type='range'] { width: 100%; height: 44px; margin: 0; accent-color: var(--accent); cursor: pointer; } .reperes { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; font-weight: 600; color: var(--ink3); }
  .explique { display: flex; gap: 10px; font-size: 14px; line-height: 20px; } .explique :global(svg) { margin-top: 1px; }
  .comparer { display: flex; flex-direction: column; gap: 10px; } .deux { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .opt { display: flex; flex-direction: column; align-items: stretch; gap: 8px; padding: 14px; border-radius: 18px; background: var(--surface); border: 2px solid var(--line); color: var(--ink); text-align: left; cursor: pointer; min-width: 0; } .opt.sel { background: var(--surface2); border-color: var(--accent); }
  .gros2 { font-weight: 600; font-size: clamp(20px, 6.2vw, 24px); line-height: 28px; white-space: nowrap; } .lignes { display: flex; flex-direction: column; gap: 4px; padding-top: 8px; border-top: 1px solid var(--line); font-size: 12px; color: var(--ink2); } .lignes > span { display: flex; justify-content: space-between; gap: 4px; }
  .fin { font-size: 11px; font-weight: 600; color: var(--ink3); } .actuel { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; color: var(--accent); } .choisir { font-size: 13px; font-weight: 600; color: var(--ink2); } .note { font-size: 12px; line-height: 17px; color: var(--ink3); }
  .echeance { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 10px 12px; border-radius: 12px; background: var(--accent-soft); color: var(--accent); font-size: 14px; font-weight: 600; }
  .erreur { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 12px; background: var(--err-soft); color: var(--err); font-size: 14px; font-weight: 600; }
  .mentions { display: flex; flex-direction: column; gap: 4px; font-size: 12px; line-height: 17px; color: var(--ink3); } .mentions .fort { font-weight: 600; color: var(--ink2); }
  .grand { width: 100%; height: 52px; border-radius: 14px; white-space: nowrap; } .btn.sec { background: var(--surface2); border-color: var(--line-strong); color: var(--ink); }
  .fait { display: flex; flex-direction: column; gap: 12px; align-items: stretch; text-align: center; } .rond-ok { width: 64px; height: 64px; border-radius: 999px; display: grid; place-items: center; background: var(--ok-soft); color: var(--ok); align-self: center; } .montant { font-size: 40px; font-weight: 600; color: var(--ok); }
</style>
