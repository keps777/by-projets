<script lang="ts">
  import { onMount } from 'svelte';
  import Ecran from '../../ui/Ecran.svelte';
  import Champ from '../../ui/Champ.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { fmt } from '../../core/argent.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { jourSemaine } from '../voyager/format.ts';
  import { va } from '../voyager/lien.ts';
  import { mouvementReduit, reseau } from '../voyager/temps.svelte.ts';
  import { departDe } from '../../core/regles.ts';
  import Pic from './Pic.svelte';
  import { importerBillet } from './actions.ts';
  import { COMPAGNIES_IMPORT, DELAI_VERIFICATION, lirePrix, normaliserPnr, nomCompagnie, valider, verifier, type CompagnieImport, type Eligibilite, type ErreursImport } from './import.ts';
  import type { Droit } from '../../domain/types.ts';

  /** Importer un billet acheté ailleurs : compagnie partenaire, référence de réservation, nom du passager, prix payé ; vérification simulée ; résultat (éligible, refusé) puis import. Démo : aucun billet réel n'est transféré. */
  const compte = $derived(compteCourant());
  let compagnie = $state<CompagnieImport | ''>(''), pnr = $state(''), nom = $state(''), prix = $state('');
  let essaye = $state(false), phase = $state<'saisie' | 'attente' | 'resultat' | 'importe'>('saisie');
  let resultat = $state<Eligibilite | undefined>(), droit = $state<Droit | undefined>(), erreurImport = $state('');
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  onMount(() => () => clearTimeout(minuteur));
  const demande = $derived({ compagnie, pnr, nom, prix });
  const erreurs: ErreursImport = $derived(valider(demande));
  const visibles = $derived(essaye ? erreurs : {});
  const etapes = $derived((() => {
    const d1 = !!compagnie, d2 = !erreurs.pnr && !erreurs.nom && !erreurs.prix, d3 = phase === 'resultat' || phase === 'importe';
    const cur = !d1 ? 1 : !d2 ? 2 : !d3 ? 3 : 0;
    return [{ n: 1, lib: 'Compagnie', fait: d1 }, { n: 2, lib: 'Référence', fait: d2 }, { n: 3, lib: 'Vérification', fait: d3 }].map((e) => ({ ...e, etat: e.fait ? 'fait' : cur === e.n ? 'cours' : 'avenir' }));
  })());
  const SR = { fait: 'terminée', cours: 'en cours', avenir: 'à venir' };
  const modifier = () => { phase = 'saisie'; resultat = undefined; erreurImport = ''; };
  const editer = () => { if (phase !== 'saisie') modifier(); };
  const verifierEligibilite = () => {
    essaye = true;
    if (Object.keys(erreurs).length) { queueMicrotask(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return; }
    if (!reseau.enLigne) return;
    phase = 'attente'; resultat = undefined;
    minuteur = setTimeout(() => { resultat = verifier(app.monde, demande, maintenant()); phase = 'resultat'; }, mouvementReduit() ? 250 : DELAI_VERIFICATION);
  };
  const confier = () => {
    const r = importerBillet(demande, compte?.id);
    if (r.ok) { droit = r.droit; phase = 'importe'; erreurImport = ''; } else erreurImport = r.message;
  };
  const eligible = $derived(resultat?.ok === true ? resultat : undefined);
  const refus = $derived(resultat && !resultat.ok ? resultat : undefined);
  const volImporte = $derived(droit ? app.monde.vols.find((v) => v.id === droit!.volId) : undefined);
  const nomUp = $derived(nom.trim().toUpperCase());
</script>

<Ecran titre="Importer un billet" face="nuit" retour="/portefeuille">
  {#if phase === 'importe' && droit && volImporte}
    <section class="reussi" aria-labelledby="ok-t" role="status">
      <span class="ico-ok"><Pic nom="coche" taille={26} trait={2.25} /></span>
      <h1 id="ok-t" class="t-h1">Billet importé</h1>
      <p class="t-sec">Votre billet est désormais un droit de voyage, inscrit au registre NexG-TT et dans votre portefeuille.</p>
      <dl class="recap">
        <div><dt>Trajet</dt><dd>{volImporte.de} → {volImporte.vers} · {volImporte.numero}</dd></div>
        <div><dt>Départ</dt><dd>{jourSemaine(departDe(volImporte.jour, volImporte.heureDepart), { avecAnnee: true })}</dd></div>
        <div><dt>Prix payé (déclaré)</dt><dd class="mono">{fmt(droit.prixPaye)}</dd></div>
        <div><dt>Registre</dt><dd class="mono">{droit.ref}</dd></div>
      </dl>
      <p class="t-aide">Démo : aucun billet réel n’a été transféré. Pensez à nommer le voyageur avant l’échéance.</p>
      <a class="btn" href="/droit/{droit.id}" onclick={(e) => va(e, `/droit/${droit!.id}`)}>Voir mon droit de voyage<Pic nom="fleche" taille={20} /></a>
      <a class="btn sec" href="/portefeuille" onclick={(e) => va(e, '/portefeuille')}>Retour au portefeuille</a>
    </section>
  {:else}
    <section class="intro">
      <h1 class="t-h1">Confiez un billet acheté ailleurs</h1>
      <p>NexG-TT prend la gestion de la réservation auprès de la compagnie. Le billet rejoint votre portefeuille et peut devenir revendable et transférable, si la compagnie et le tarif le permettent.</p>
      <span class="puce info"><Icone nom="info" taille={14} trait={2} />Phase pilote · hypothèse</span>
    </section>

    <ol class="etapes" aria-label="Étapes de l’import">
      {#each etapes as e (e.n)}
        <li aria-current={e.etat === 'cours' ? 'step' : undefined} class={e.etat}><span class="barre" aria-hidden="true"></span>
          <span class="e-lib"><span class="e-n" aria-hidden="true">{#if e.fait}<Pic nom="coche" taille={12} trait={3} />{:else}{e.n}{/if}</span>{e.lib}<span class="sr">, {SR[e.etat as 'fait' | 'cours' | 'avenir']}</span></span></li>
      {/each}
    </ol>

    <div class="champ" data-erreur={visibles.compagnie ? '' : undefined}>
      <label for="imp-cie">1 · Compagnie</label>
      <span class="sel"><select id="imp-cie" bind:value={compagnie} onchange={editer} aria-invalid={visibles.compagnie ? 'true' : undefined} aria-describedby={visibles.compagnie ? 'imp-cie-e' : undefined}>
        <option value="">Choisir une compagnie</option>{#each COMPAGNIES_IMPORT as c (c.id)}<option value={c.id}>{c.nom}</option>{/each}</select><span class="fleche" aria-hidden="true"><Pic nom="bas" taille={20} trait={1.75} /></span></span>
      {#if visibles.compagnie}<span class="erreur" id="imp-cie-e" role="alert"><Icone nom="alerte" taille={16} />{visibles.compagnie}</span>{/if}
    </div>
    <div class="col g14">
      <Champ id="imp-pnr" label="2 · Référence de réservation (6 caractères)" bind:valeur={pnr} autocomplete="off" placeholder="Q7RT2M" aide="Sur la confirmation de la compagnie. Exemple : Q7RT2M" erreur={visibles.pnr ?? ''} onsaisie={(v) => { pnr = normaliserPnr(v); editer(); }} />
      <Champ id="imp-nom" label="Nom de famille du passager" bind:valeur={nom} autocomplete="family-name" placeholder="EXEMPLE" erreur={visibles.nom ?? ''} onsaisie={editer} />
      <Champ id="imp-prix" label="Prix payé (en dollars canadiens)" bind:valeur={prix} inputmode="numeric" placeholder="1 250" aide="Le prix que vous avez payé à la compagnie. Sert à calculer votre écart ; il n’est pas vérifié." erreur={visibles.prix ?? ''} onsaisie={editer} />
    </div>

    <section class="verif" aria-labelledby="ver-h">
      <h2 id="ver-h">3 · Vérification</h2>
      {#if phase === 'saisie'}
        <div class="col g8">
          <button type="button" class="btn" onclick={verifierEligibilite} aria-disabled={!reseau.enLigne ? 'true' : undefined}><Icone nom="verifie" taille={20} />Vérifier l’éligibilité</button>
          {#if !reseau.enLigne}<p class="hors" role="alert"><Icone nom="hors_ligne" taille={16} />Hors ligne : la vérification auprès de la compagnie demande une connexion. Réessayez une fois connecté.</p>{/if}
          <p class="aide-c">Démo : aucune donnée n’est transmise à la compagnie.</p>
        </div>
      {:else if phase === 'attente'}
        <div class="attente" role="status" aria-live="polite"><span class="roue" aria-hidden="true"></span><span class="col g2"><span class="a-t">Vérification en cours…</span><span class="a-s">Nous interrogeons {nomCompagnie(compagnie)} sur la réservation {pnr}.</span></span></div>
      {:else if eligible}
        <div class="carte-ok" role="status">
          <div class="c-haut"><span class="c-ico"><Icone nom="verifie" taille={22} /></span><span class="col g2"><span class="c-t">Éligible sous réserve d’accord</span><span class="c-s">{eligible.compagnie}, partenaire pilote (hypothèse)</span></span></div>
          <div class="resa"><span class="r-l">Réservation</span><span class="r-v">{pnr} · {nomUp}</span></div>
          <div class="resa vol"><span class="r-l">Vol</span><span class="r-v">{eligible.vol.numero} · {eligible.vol.de} → {eligible.vol.vers} · {jourSemaine(departDe(eligible.vol.jour, eligible.vol.heureDepart))}</span></div>
          <h3>Ce qui change</h3>
          <ul>
            <li><Pic nom="echange" taille={18} trait={1.75} /><span><strong>NexG-TT devient gestionnaire de la réservation</strong> auprès d’{eligible.compagnie}.</span></li>
            <li><Pic nom="identite" taille={18} trait={1.75} /><span><strong>Vous restez détenteur</strong> : le billet s’inscrit au registre NexG-TT, dans votre portefeuille.</span></li>
            <li><Pic nom="etiquette" taille={18} trait={1.75} /><span><strong>Frais d’import</strong> : montant à définir (hypothèse).</span></li>
          </ul>
        </div>
      {:else if refus}
        <div class="carte-refus" role="alert"><span class="c-ico"><Icone nom="info" taille={22} /></span><span class="col g4"><span class="c-t">{refus.titre}</span><span class="c-s">{refus.texte}</span></span></div>
      {/if}
      {#if resultat}
        <div class="autres">
          <p class="sur">Autres issues possibles</p>
          {#if eligible}<p><Icone nom="info" taille={16} trait={1.75} /><span><strong>Compagnie pas encore partenaire</strong> — on vous prévient.</span></p>{/if}
          {#if refus && refus.motif === 'non_partenaire'}<p><Icone nom="info" taille={16} trait={1.75} /><span><strong>Éligible sous réserve d’accord</strong> — avec une compagnie partenaire pilote.</span></p>{/if}
          <p><Pic nom="cadenas" taille={16} trait={1.75} /><span><strong>Tarif non transférable</strong> — certaines conditions tarifaires interdisent toute cession ; le billet reste chez la compagnie.</span></p>
          <button type="button" class="texte" onclick={modifier}>Modifier la saisie</button>
        </div>
      {/if}
    </section>
    <p class="aide-c">Un droit de voyage n’est pas un placement financier.</p>
  {/if}

  {#snippet pied()}
    {#if phase !== 'importe'}
      {#if eligible}
        <button type="button" class="btn" onclick={confier}><Pic nom="coche" taille={20} />Confier mon billet à NexG-TT</button>
        {#if erreurImport}<p class="erreur-p" role="alert"><Icone nom="alerte" taille={16} />{erreurImport}</p>{/if}
        <p class="aide-c">Démo : aucun billet réel n’est transféré.</p>
      {:else}
        <button type="button" class="btn desactive" aria-disabled="true" aria-describedby="hint-imp">Confier mon billet à NexG-TT</button>
        <p id="hint-imp" class="aide-c">{refus ? 'Import impossible pour l’instant avec cette compagnie.' : 'Vérifiez d’abord l’éligibilité (étape 3).'}</p>
      {/if}
    {/if}
  {/snippet}
</Ecran>

<style>
  .col { display: flex; flex-direction: column; } .g2 { gap: 2px; } .g4 { gap: 4px; } .g8 { gap: 8px; } .g14 { gap: 14px; } .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .intro { display: flex; flex-direction: column; gap: 10px; } .intro h1 { font: 600 32px/32px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.01em; text-transform: uppercase; } .intro p { font-size: 15px; line-height: 22px; color: var(--ink2); } .intro .puce { align-self: flex-start; }
  .puce.info { background: rgba(98, 199, 255, 0.12); color: var(--up); }
  .etapes { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
  .etapes li { display: flex; flex-direction: column; gap: 8px; } .barre { height: 4px; border-radius: 999px; background: var(--line); } li.fait .barre { background: var(--ok); } li.cours .barre { background: var(--accent); }
  .e-lib { display: flex; align-items: center; gap: 6px; font: 700 13px/1.2 'Barlow', sans-serif; color: var(--ink3); } li.fait .e-lib { color: var(--ink); } li.cours .e-lib { color: var(--accent); }
  .e-n { width: 22px; height: 22px; flex: none; box-sizing: border-box; border-radius: 999px; border: 2px solid var(--line-strong); display: flex; align-items: center; justify-content: center; font: 500 11px/1 'IBM Plex Mono', ui-monospace, monospace; }
  li.fait .e-n { background: var(--ok); border-color: var(--ok); color: #0d0e11; } li.cours .e-n { border-color: var(--accent); }
  .sel { position: relative; display: block; } .sel select { appearance: none; -webkit-appearance: none; width: 100%; padding-right: 40px; cursor: pointer; } .fleche { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--ink2); display: flex; }
  .champ select { min-height: 52px; padding: 0 14px; border-radius: 12px; background: var(--surface2); border: 1px solid #6b7282; color: var(--ink); font-size: 16px; }
  .champ[data-erreur] select { border-color: var(--err); box-shadow: 0 0 0 1px var(--err); }
  :global(#imp-pnr) { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-weight: 600; font-size: 18px; letter-spacing: 0.18em; text-transform: uppercase; }
  :global(#imp-nom) { text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; }
  .verif { display: flex; flex-direction: column; gap: 12px; } .verif h2 { font: 500 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .aide-c { text-align: center; font-size: 12px; line-height: 17px; color: var(--ink3); }
  .hors { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border-radius: 12px; background: var(--err-soft); color: var(--err); font: 500 13px/18px 'Barlow', sans-serif; }
  .attente { display: flex; align-items: center; gap: 14px; padding: 16px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); } .a-t { font-weight: 700; } .a-s { font-size: 13px; color: var(--ink2); }
  .roue { width: 24px; height: 24px; flex: none; border-radius: 999px; border: 3px solid var(--line-strong); border-top-color: var(--accent); animation: nx-tourne 800ms linear infinite; }
  @keyframes nx-tourne { to { transform: rotate(360deg); } }
  .carte-ok { display: flex; flex-direction: column; gap: 14px; padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid rgba(124, 227, 181, 0.45); }
  .c-haut { display: flex; align-items: flex-start; gap: 12px; } .c-ico { width: 40px; height: 40px; flex: none; border-radius: 12px; display: grid; place-items: center; background: var(--ok-soft); color: var(--ok); }
  .c-t { font-size: 17px; font-weight: 700; color: var(--ok); } .c-s { font-size: 14px; line-height: 20px; color: var(--ink2); }
  .resa { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; padding: 10px 12px; border-radius: 12px; background: #fff; color: #121418; } .r-l { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.1em; text-transform: uppercase; color: #555c6b; } .r-v { font: 600 15px/20px 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: 0.04em; } .resa.vol .r-v { font-size: 13px; letter-spacing: 0; }
  .carte-ok h3 { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); }
  .carte-ok ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; } .carte-ok li { display: flex; align-items: flex-start; gap: 10px; font-size: 14px; line-height: 20px; color: var(--ink2); } .carte-ok li strong { color: var(--ink); } .carte-ok li :global(svg) { margin-top: 2px; color: var(--ok); }
  .carte-refus { display: flex; align-items: flex-start; gap: 12px; padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid rgba(98, 199, 255, 0.4); } .carte-refus .c-ico { background: rgba(98, 199, 255, 0.12); color: var(--up); } .carte-refus .c-t { color: var(--up); }
  .autres { display: flex; flex-direction: column; gap: 8px; padding-top: 4px; } .autres .sur { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink3); }
  .autres p:not(.sur) { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; line-height: 18px; color: var(--ink2); } .autres strong { color: var(--ink); font-weight: 600; } .autres :global(svg) { margin-top: 1px; }
  .texte { align-self: flex-start; min-height: 44px; padding: 0; border: 0; background: transparent; color: var(--accent); font: 600 14px/1 'Barlow', sans-serif; cursor: pointer; }
  .btn.desactive { background: var(--surface2); color: var(--ink3); border: 1px solid var(--line); cursor: not-allowed; opacity: 1; }
  .erreur-p { display: flex; align-items: flex-start; gap: 6px; font: 500 13px/18px 'Barlow', sans-serif; color: var(--err); }
  .reussi { display: flex; flex-direction: column; gap: 14px; } .reussi h1 { font: 600 34px/36px 'Barlow Condensed', 'Arial Narrow', sans-serif; text-transform: uppercase; } .ico-ok { width: 52px; height: 52px; border-radius: 999px; display: grid; place-items: center; background: var(--ok-soft); color: var(--ok); }
  .recap { margin: 0; display: flex; flex-direction: column; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); padding: 4px 16px; } .recap div { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px; } .recap div + div { border-top: 1px solid var(--line); } .recap dt { font-size: 13px; color: var(--ink2); } .recap dd { margin: 0; font-weight: 600; text-align: right; }
</style>
