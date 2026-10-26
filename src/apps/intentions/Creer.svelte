<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Picto from '../bagages/Picto.svelte';
  import { aller, param } from '../../router.svelte.ts';
  import { aujourdhui, maintenant } from '../../data/store.svelte.ts';
  import { fmt } from '../../core/argent.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { aideFenetre, aideValidite, aideOptions, bornesPrix, calerPrix, codeAeroport, erreursBrouillon, fenetreAutour, jourValide, libelleAeroport, libelleVendeurs, prixParDefaut, reperes, villeDe } from './compat.ts';
  import { enregistrerBrouillon } from './actions.ts';
  import { MAX_VOYAGEURS, PAS_PRIX, expirationDe, lire, type Brouillon, type Validite } from './modele.ts';
  import { nomAnonyme } from './vues.ts';
  import { decaler } from './temps.ts';

  /** Publier une intention d'achat — « Dites votre prix » (planche m3-23). `?de=&vers=&jour=` pré-remplissent le trajet et la fenêtre (3 jours avant, 2 jours après le jour cherché). */
  const compte = $derived(compteCourant());
  const memo = lire().brouillon;
  const aujour = aujourdhui();
  const dep0 = param('de') ?? memo?.de ?? compteCourant()?.aeroport ?? 'YUL', arr0 = param('vers') ?? memo?.vers ?? 'CDG';
  const jour0 = param('jour'), fen0 = jourValide(jour0) && jour0 >= aujour ? fenetreAutour(jour0) : memo ? { du: memo.du, au: memo.au } : fenetreAutour(decaler(aujour, 66));
  let depTexte = $state(libelleAeroport(codeAeroport(dep0) ?? 'YUL')), arrTexte = $state(libelleAeroport(codeAeroport(arr0) ?? 'CDG'));
  let aller_ = $state<'simple' | 'retour'>(memo?.aller ?? 'simple');
  let du = $state(fen0.du), au = $state(fen0.au), flexible = $state(memo?.flexible ?? true);
  let retourOuvert = $state(!!memo?.retour), retourDu = $state(memo?.retour?.du ?? decaler(fen0.au, 7)), retourAu = $state(memo?.retour?.au ?? decaler(fen0.au, 14));
  let voyageurs = $state(memo?.voyageurs ?? 1);
  let choisi = $state<number | null>(memo?.budget ?? null);
  let validite = $state<Validite>(memo?.validite ?? '30');
  let auto = $state(memo?.auto ?? true), auDessus = $state(memo?.auDessus ?? true), anonyme = $state(memo?.anonyme ?? true);
  let tente = $state(false);

  const de = $derived(codeAeroport(depTexte) ?? ''), vers = $derived(codeAeroport(arrTexte) ?? '');
  const critere = $derived({ de, vers, du, au, flexible });
  const rep = $derived(reperes(critere, choisi ?? 0, compte?.id));
  const neuf = $derived(rep.neuf);
  const bornes = $derived(neuf !== undefined ? bornesPrix(neuf) : { min: 600, max: 2050 });
  const prix = $derived(neuf !== undefined ? (choisi !== null ? calerPrix(choisi, neuf) : prixParDefaut(neuf)) : (choisi ?? 1300));
  const rp = $derived(reperes(critere, prix, compte?.id));
  const brouillon = $derived<Brouillon>({ de, vers, aller: aller_, du, au, flexible, retour: aller_ === 'retour' && retourOuvert ? { du: retourDu, au: retourAu } : undefined, voyageurs, budget: prix, validite, auto, auDessus, anonyme });
  const erreurs = $derived(erreursBrouillon(brouillon));
  const invalide = $derived(Object.keys(erreurs).length > 0);
  const expire = $derived(expirationDe(validite, du || aujour, maintenant()));
  const pct = (v: number) => `${Math.max(0, Math.min(100, ((v - bornes.min) / Math.max(1, bornes.max - bornes.min)) * 100)).toFixed(1)}%`;
  const vsNeuf = $derived(neuf ? Math.round(((prix - neuf) / neuf) * 100) : 0);
  const id = $derived(nomAnonyme(compte));
  const aides = $derived(aideOptions({ auto, auDessus, anonyme }, fmt(prix), id.initiale, id.nom));

  function inverser() { const t = depTexte; depTexte = arrTexte; arrTexte = t; }
  function poser(e: Event) { choisi = calerPrix(Number((e.currentTarget as HTMLInputElement).value), neuf ?? bornes.max); }
  function continuer() {
    tente = true; if (invalide) { document.querySelector<HTMLElement>('[data-erreur] input, [aria-invalid="true"]')?.focus(); return; }
    enregistrerBrouillon(brouillon); aller('/intention/fonds');
  }
  const commutateurs = $derived([
    { cle: 'auto', titre: 'Accepter automatiquement toute proposition ≤ mon prix', aide: aides.auto, on: auto, bascule: () => (auto = !auto) },
    { cle: 'dessus', titre: 'Recevoir les propositions au-dessus de mon prix', aide: aides.auDessus, on: auDessus, bascule: () => (auDessus = !auDessus) },
    { cle: 'anon', titre: 'Rester anonyme (initiale seulement)', aide: aides.anonyme, on: anonyme, bascule: () => (anonyme = !anonyme) }
  ]);
</script>

<Ecran titre="Dites votre prix" face="jour" retour="/rechercher">
  <h1 class="sr">Dites votre prix</h1>
  <div class="intro"><span class="sur">Intention d’achat</span><p class="p15">Vous dites votre prix et réservez les fonds. Les détenteurs d’un billet compatible viennent à vous.</p></div>

  <section class="trajet" aria-label="Trajet">
    <div class="rang"><div class="col g2 grow"><label for="from" class="sur">Départ</label><input id="from" type="text" bind:value={depTexte} autocomplete="off" aria-invalid={erreurs.de ? 'true' : undefined} aria-describedby={erreurs.de ? 'from-e' : undefined} /></div><span class="code" aria-hidden="true">{de || '···'}</span></div>
    <div class="perf"><span class="tiret" aria-hidden="true"></span><span class="e g" aria-hidden="true"></span><span class="e d" aria-hidden="true"></span>
      <button type="button" class="inv" aria-label="Inverser départ et arrivée" onclick={inverser}><Picto nom="inverser" taille={20} /></button></div>
    <div class="rang bas"><div class="col g2 grow"><label for="to" class="sur">Arrivée</label><input id="to" type="text" bind:value={arrTexte} autocomplete="off" aria-invalid={erreurs.vers || erreurs.trajet ? 'true' : undefined} aria-describedby={erreurs.vers ? 'to-e' : erreurs.trajet ? 'traj-e' : undefined} /></div><span class="code" aria-hidden="true">{vers || '···'}</span></div>
  </section>
  {#if erreurs.de}<p class="err" id="from-e" role="alert"><Picto nom="alerte" taille={16} />{erreurs.de}</p>{/if}
  {#if erreurs.vers}<p class="err" id="to-e" role="alert"><Picto nom="alerte" taille={16} />{erreurs.vers}</p>{/if}
  {#if erreurs.trajet}<p class="err" id="traj-e" role="alert"><Picto nom="alerte" taille={16} />{erreurs.trajet}</p>{/if}

  <div class="seg" role="group" aria-label="Type de trajet">
    <button type="button" aria-pressed={aller_ === 'simple'} onclick={() => (aller_ = 'simple')}>Aller simple</button>
    <button type="button" aria-pressed={aller_ === 'retour'} onclick={() => (aller_ = 'retour')}>Aller-retour</button>
  </div>

  <fieldset class="fen">
    <legend>Fenêtre de départ</legend>
    <div class="dates">
      <div class="date"><label for="date-from">Du</label><Picto nom="calendrier" taille={18} trait={1.75} /><input id="date-from" type="date" bind:value={du} min={aujour} class="avec-ico" aria-invalid={erreurs.du ? 'true' : undefined} aria-describedby={erreurs.du ? 'fen-e' : undefined} /></div>
      <div class="date"><label for="date-to" class="g">Au</label><input id="date-to" type="date" bind:value={au} min={du || aujour} aria-invalid={erreurs.au ? 'true' : undefined} aria-describedby={erreurs.au ? 'fen-e' : undefined} /></div>
      <label for="flex-dates" class="flex" class:on={flexible}><input id="flex-dates" type="checkbox" bind:checked={flexible} />Flexible</label>
    </div>
    {#if erreurs.du || erreurs.au}<p class="err" id="fen-e" role="alert"><Picto nom="alerte" taille={16} />{erreurs.du ?? erreurs.au}</p>
    {:else}<p class="aide">{aideFenetre(flexible, du, au)}</p>{/if}
  </fieldset>

  {#if aller_ === 'retour'}
    <div class="col g6"><span class="leg">Fenêtre de retour</span>
      {#if !retourOuvert}<button type="button" class="pointille" onclick={() => (retourOuvert = true)}><Picto nom="calendrier" taille={20} trait={1.75} />Choisir les dates de retour</button>
      {:else}<div class="dates"><div class="date"><label for="ret-from" class="g">Du</label><input id="ret-from" type="date" bind:value={retourDu} min={au} /></div><div class="date"><label for="ret-to" class="g">Au</label><input id="ret-to" type="date" bind:value={retourAu} min={retourDu} /></div></div>
        {#if erreurs.retour}<p class="err" role="alert"><Picto nom="alerte" taille={16} />{erreurs.retour}</p>{/if}{/if}</div>
  {/if}

  <div class="pax"><div class="row g10"><Picto nom="personne" taille={24} trait={1.75} /><div class="col"><span id="pax-label" class="leg">Voyageurs</span><span class="pax-v" aria-live="polite">{voyageurs} {voyageurs > 1 ? 'voyageurs' : 'voyageur'}</span></div></div>
    <div class="row g6" role="group" aria-labelledby="pax-label">
      <button type="button" class="pm" aria-label="Retirer un voyageur" disabled={voyageurs <= 1} onclick={() => (voyageurs = Math.max(1, voyageurs - 1))}><Picto nom="moins" taille={20} trait={1.75} /></button>
      <button type="button" class="pm" aria-label="Ajouter un voyageur" disabled={voyageurs >= MAX_VOYAGEURS} onclick={() => (voyageurs = Math.min(MAX_VOYAGEURS, voyageurs + 1))}><Picto nom="plus" taille={20} trait={1.75} /></button></div></div>

  <section class="prix" aria-labelledby="prix-title">
    <div class="ent"><h2 id="prix-title" class="sur">Prix maximum</h2><span class="aide">par voyageur</span></div>
    <div class="grosprix" aria-live="polite"><span class="mono montant">{fmt(prix)}</span>{#if neuf}<span class="vs">{vsNeuf > 0 ? '+' : vsNeuf < 0 ? '−' : ''}{Math.abs(vsNeuf)}&nbsp;% vs neuf</span>{/if}</div>
    <div class="col g2"><label for="prix-range" class="leg">Ajuster le prix maximum (pas de {PAS_PRIX}&nbsp;$)</label>
      <input id="prix-range" type="range" min={bornes.min} max={bornes.max} step={PAS_PRIX} value={prix} aria-valuetext={fmt(prix)} oninput={poser} onchange={poser} />
      <div class="bornes mono" aria-hidden="true"><span>{fmt(bornes.min)}</span><span>{fmt(bornes.max)}</span></div></div>
    {#if neuf}
      <div class="col g8 haut4"><span class="sur">Repères aujourd’hui</span>
        <div class="regle" aria-hidden="true"><span class="rail"></span><span class="vous" style:width={pct(prix)}></span>{#if rp.meilleure}<span class="trait-m" style:left={pct(rp.meilleure)}></span>{/if}<span class="trait-m fin"></span><span class="bouton" style:left={pct(prix)}></span></div>
        <p class="aide2"><span>Vous&nbsp;: <span class="mono fort">{fmt(prix)}</span></span>{#if rp.meilleure}<span> · Meilleure revente actuelle <span class="mono fort">{fmt(rp.meilleure)}</span></span>{/if}<span> · Neuf <span class="mono fort">{fmt(neuf)}</span></span></p></div>
    {/if}
    <div class="chances" aria-live="polite">
      <div class="row g10"><Picto nom="groupe" taille={24} trait={1.75} /><span class="t15">{libelleVendeurs(rp)}</span></div>
      <div class="row g10"><span class="barres" aria-hidden="true"><span style:background={rp.niveau >= 1 ? '#0b1b2e' : '#c5cfda'} style:height="10px"></span><span style:background={rp.niveau >= 2 ? '#0b1b2e' : '#c5cfda'} style:height="14px"></span><span style:background={rp.niveau >= 3 ? '#0b1b2e' : '#c5cfda'} style:height="18px"></span></span><span class="t15">Chances d’accord&nbsp;: {rp.chance}</span></div>
      <p class="aide2">{rp.aide} Estimation à partir des billets en vente aujourd’hui, pas une garantie.</p></div>
  </section>

  <fieldset class="valid">
    <legend class="sur">Validité de l’intention</legend>
    <div class="seg v" role="group" aria-label="Durée de validité">
      <button type="button" aria-pressed={validite === '7'} onclick={() => (validite = '7')}>7 jours</button>
      <button type="button" aria-pressed={validite === '30'} onclick={() => (validite = '30')}>30 jours</button>
      <button type="button" aria-pressed={validite === 'j3'} onclick={() => (validite = 'j3')}>Jusqu’à J-3</button>
    </div>
    <p class="aide">{aideValidite(validite, expire)}</p>
  </fieldset>

  <section class="col g8" aria-labelledby="opt-title"><h2 id="opt-title" class="sur">Options</h2>
    {#each commutateurs as o (o.cle)}
      <button type="button" role="switch" aria-checked={o.on} class="sw" onclick={o.bascule}>
        <span class="col g2 grow"><span class="sw-t">{o.titre}</span><span class="sw-a">{o.aide}</span></span>
        <span class="piste" class:on={o.on} aria-hidden="true"><span class="pouce"></span></span>
      </button>
    {/each}
  </section>

  <section class="comment" aria-labelledby="how-title"><h2 id="how-title" class="t-bloc">Comment ça marche</h2>
    <ol>
      <li><span class="n mono" aria-hidden="true">1</span><span><strong>Vous réservez les fonds, sans débit.</strong> <span class="gris">Ils restent sur votre carte ou votre solde, simplement mis de côté.</span></span></li>
      <li><span class="n mono" aria-hidden="true">2</span><span><strong>Les vendeurs de ce trajet voient votre intention et proposent.</strong> <span class="gris">À votre prix, ou au-dessus si vous l’autorisez.</span></span></li>
      <li><span class="n mono" aria-hidden="true">3</span><span><strong>Vous acceptez ou non.</strong> <span class="gris">L’argent n’est pris qu’à l’accord. Sans accord, il est libéré à l’expiration.</span></span></li>
    </ol>
    <p class="hyp"><span class="h">Hypothèse</span>Modalités de réservation des fonds à valider (cadre juridique).</p></section>

  {#snippet pied()}
    {#if tente && invalide}<p class="err sur-pied" role="alert"><Picto nom="alerte" taille={16} />Corrigez les champs signalés pour réserver les fonds.</p>{/if}
    <button type="button" class="btn" aria-disabled={invalide} onclick={continuer}><Picto nom="reserve" taille={20} />Réserver&nbsp;<span class="mono">{fmt(prix * voyageurs)}</span>&nbsp;et publier</button>
  {/snippet}
</Ecran>

<style>
  .intro { display: flex; flex-direction: column; gap: 4px; margin-bottom: -4px; } .sur { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: #3e4f66; } .p15 { margin: 0; font: 400 15px/22px 'Barlow', sans-serif; color: #3e4f66; }
  .trajet { position: relative; background: #fff; border-radius: 18px; box-shadow: 0 1px 0 #d3dce6, 0 12px 32px rgba(11, 27, 46, 0.1); }
  .rang { display: flex; align-items: center; gap: 12px; padding: 14px 18px 6px; } .rang.bas { padding: 6px 18px 14px; }
  .trajet input { width: 100%; min-width: 0; height: 44px; box-sizing: border-box; padding: 0; border: 0; border-radius: 6px; background: transparent; color: #0b1b2e; font: 600 18px/1 'Barlow', sans-serif; }
  .trajet input[aria-invalid='true'] { color: #b02c27; } .code { flex: none; font: 700 44px/44px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; }
  .perf { position: relative; height: 22px; } .tiret { position: absolute; left: 18px; right: 18px; top: 10px; border-top: 2px dashed #d3dce6; } .e { position: absolute; top: 0; width: 22px; height: 22px; border-radius: 999px; background: var(--bg); } .e.g { left: -11px; } .e.d { right: -11px; }
  .inv { position: absolute; right: 30px; top: -11px; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 999px; background: #0b1b2e; color: #fff; box-shadow: 0 0 0 4px #fff; display: grid; place-items: center; cursor: pointer; z-index: 1; }
  .err { margin: 0; display: flex; align-items: flex-start; gap: 6px; font: 500 13px/18px 'Barlow', sans-serif; color: #c2362f; } .err :global(svg) { margin-top: 1px; } .sur-pied { background: #fff; padding: 6px 8px; border-radius: 10px; }
  .seg { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; border-radius: 14px; background: #e3eaf2; } .seg.v { grid-template-columns: 1fr 1fr 1.3fr; }
  .seg button { height: 44px; border: 0; border-radius: 10px; background: transparent; color: #3e4f66; font: 600 15px/1 'Barlow', sans-serif; cursor: pointer; padding: 0 4px; } .seg button[aria-pressed='true'] { background: #fff; color: #0b1b2e; box-shadow: 0 1px 2px rgba(11, 27, 46, 0.16); }
  fieldset { margin: 0; padding: 0; border: 0; min-width: 0; } legend { padding: 0; margin: 0 0 6px; font: 500 13px/18px 'Barlow', sans-serif; color: #3e4f66; } .valid legend { margin-bottom: 8px; }
  .dates { display: flex; gap: 8px; flex-wrap: wrap; } .date { position: relative; flex: 1 1 96px; min-width: 0; }
  .date label { position: absolute; left: 44px; top: 7px; font: 700 11px/14px 'Barlow', sans-serif; letter-spacing: 0.08em; text-transform: uppercase; color: #5e6e84; pointer-events: none; z-index: 1; } .date label.g { left: 14px; }
  .date :global(svg) { position: absolute; left: 14px; top: 20px; color: #5e6e84; pointer-events: none; }
  .date input { width: 100%; height: 52px; box-sizing: border-box; padding: 14px 8px 0 14px; border-radius: 12px; background: #fff; border: 1px solid #b9c5d3; color: #0b1b2e; font: 600 15px/1 'Barlow', sans-serif; } .date input.avec-ico { padding-left: 44px; }
  .date input[aria-invalid='true'] { border-color: #c2362f; box-shadow: 0 0 0 1px #c2362f; }
  .flex { flex: none; display: flex; align-items: center; gap: 8px; height: 52px; padding: 0 12px; box-sizing: border-box; border-radius: 12px; background: #fff; border: 1px solid #b9c5d3; color: #0b1b2e; font: 600 14px/1 'Barlow', sans-serif; cursor: pointer; } .flex.on { background: rgba(26, 100, 200, 0.1); border-color: #1a64c8; } .flex input { width: 20px; height: 20px; margin: 0; accent-color: #1a64c8; cursor: pointer; }
  .aide { margin: 6px 0 0; font: 400 13px/18px 'Barlow', sans-serif; color: #5e6e84; } .valid .aide { margin-top: 8px; } .ent .aide { margin: 0; }
  .leg { font: 500 13px/18px 'Barlow', sans-serif; color: #3e4f66; } .pointille { display: flex; align-items: center; gap: 10px; height: 52px; padding: 0 14px; box-sizing: border-box; border-radius: 12px; background: #fff; border: 1px dashed #b9c5d3; color: #1a64c8; font: 600 16px/1 'Barlow', sans-serif; text-align: left; cursor: pointer; }
  .pax { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 56px; padding: 4px 6px 4px 14px; box-sizing: border-box; border-radius: 12px; background: #fff; border: 1px solid #b9c5d3; } .pax-v { font: 600 16px/22px 'Barlow', sans-serif; }
  .pm { width: 44px; height: 44px; padding: 0; border-radius: 12px; background: #eef3f8; border: 1px solid #b9c5d3; color: #0b1b2e; display: grid; place-items: center; cursor: pointer; } .pm:disabled { color: #5e6e84; cursor: not-allowed; }
  .g2 { gap: 2px; } .g6 { gap: 6px; } .g8 { gap: 8px; } .g10 { gap: 10px; } .haut4 { padding-top: 4px; }
  .prix { display: flex; flex-direction: column; gap: 12px; padding: 18px; border-radius: 20px; background: #fff; box-shadow: 0 1px 0 #d3dce6, 0 12px 32px rgba(11, 27, 46, 0.1); } .ent { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .grosprix { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 10px; } .montant { font: 600 clamp(44px, 14.4vw, 56px)/60px 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; } .vs { font: 500 13px/18px 'Barlow', sans-serif; color: #3e4f66; }
  input[type='range'] { width: 100%; height: 44px; margin: 0; accent-color: #1a64c8; cursor: pointer; } .bornes { display: flex; justify-content: space-between; font: 500 11px/14px 'IBM Plex Mono', ui-monospace, monospace; color: #5e6e84; }
  .regle { position: relative; height: 34px; } .rail { position: absolute; left: 0; right: 0; top: 14px; height: 6px; border-radius: 3px; background: #e3eaf2; } .vous { position: absolute; left: 0; top: 14px; height: 6px; border-radius: 3px 0 0 3px; background: #1a64c8; }
  .trait-m { position: absolute; top: 9px; width: 2px; height: 16px; background: #0b1b2e; } .trait-m.fin { right: 0; } .bouton { position: absolute; top: 6px; width: 22px; height: 22px; box-sizing: border-box; margin-left: -11px; border-radius: 999px; background: #fff; border: 3px solid #1a64c8; }
  .aide2 { margin: 0; font: 400 13px/18px 'Barlow', sans-serif; color: #3e4f66; } .fort { font-weight: 600; color: #0b1b2e; font-variant-numeric: tabular-nums; }
  .chances { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; border-radius: 14px; background: #eef3f8; } .t15 { font: 600 15px/20px 'Barlow', sans-serif; } .barres { flex: none; display: flex; gap: 3px; align-items: flex-end; } .barres span { width: 8px; border-radius: 2px; }
  .sw { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 60px; padding: 8px 14px; box-sizing: border-box; border-radius: 14px; background: #fff; border: 1px solid #d3dce6; color: #0b1b2e; text-align: left; cursor: pointer; } .sw-t { font: 600 15px/20px 'Barlow', sans-serif; } .sw-a { font: 400 13px/18px 'Barlow', sans-serif; color: #5e6e84; }
  .piste { position: relative; flex: none; width: 48px; height: 28px; box-sizing: border-box; border-radius: 999px; background: #e3eaf2; border: 1px solid #b9c5d3; } .piste.on { background: #1a64c8; border-color: #1a64c8; } .pouce { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 999px; background: #5e6e84; transition: left 0.2s ease; } .piste.on .pouce { left: 23px; background: #fff; }
  .comment { display: flex; flex-direction: column; gap: 12px; padding: 18px; border-radius: 20px; background: #0b1b2e; color: #fff; } .t-bloc { margin: 0; font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; }
  .comment ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; } .comment li { display: flex; align-items: flex-start; gap: 12px; font: 400 15px/22px 'Barlow', sans-serif; } .comment strong { font-weight: 600; } .gris { color: #c9d3df; }
  .n { flex: none; width: 28px; height: 28px; border-radius: 999px; background: #ffd23f; color: #0b1b2e; display: grid; place-items: center; font: 600 14px/1 'IBM Plex Mono', ui-monospace, monospace; }
  .hyp { margin: 0; display: flex; align-items: center; gap: 8px; font: 400 13px/18px 'Barlow', sans-serif; color: #c9d3df; } .h { flex: none; display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 999px; background: rgba(255, 255, 255, 0.12); color: #fff; font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.04em; }
</style>
