<script lang="ts">
  import { onMount } from 'svelte';
  import './compte.css';
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Pic from './Pic.svelte';
  import { reseau } from './reseau.svelte.ts';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { fmt } from '../../core/argent.ts';
  import { droitsDe } from '../../domain/marche.ts';
  import { BUDGET_MAX, BUDGET_MIN, BUDGET_PAS, CANAUX, PARTOUT, TYPES_OFFRE, alertesDe, basculerAlerte, basculerIntention, creerAlerte, etat, evaluerAlertes, historiqueDe, libelleActives, metaDe, sousTitreAlerte, supprimerAlerte, titreAlerte, trouverAeroport, trouverDestination, validerAlerte, type Canal, type ErreursAlerte, type TypeOffreAlerte } from './alertes.ts';
  import { heureRelative } from './notifs.ts';

  /** Alertes : « prévenez-moi à ce prix ou moins ». Liste (activer, désactiver, supprimer), historique des alertes déclenchées, création. */
  const compte = $derived(compteCourant());
  const pass = $derived(!!compte?.pass.actif);
  const mes = $derived(compte ? alertesDe(compte.id) : []);
  const actives = $derived(mes.filter((a) => a.actif).length);
  const historique = $derived(compte ? historiqueDe(compte.id).slice(0, 3) : []);
  const detenus = $derived(compte ? droitsDe(compte.id).length : 0);
  const intention = $derived(etat().intention);
  const now = maintenant();
  const NB = ' ';
  const aeroportDe = (code: string) => { const a = app.monde.aeroports.find((x) => x.code === code); return a ? `${a.ville} (${a.code})` : 'Montréal (YUL)'; };
  let depart = $state(''), destination = $state(PARTOUT), budget = $state(600), flexible = $state(true), date = $state('');
  let types = $state<TypeOffreAlerte[]>([]), canaux = $state<Canal[]>(['notification']);
  let erreurs = $state<ErreursAlerte>({}), tente = $state(false);
  onMount(() => { depart = aeroportDe(compte?.aeroport ?? 'YUL'); types = pass ? ['drop', 'revente'] : ['revente']; if (compte) evaluerAlertes(compte.id, maintenant()); });

  const code = (t: string, partout = false) => { const m = /\(([A-Za-z]{3})\)/.exec(t.trim()); return m ? m[1].toUpperCase() : t.trim() ? (partout ? (trouverDestination(t) ?? t.trim().toUpperCase()) : (trouverAeroport(t) ?? t.trim().toUpperCase())) : '…'; };
  const brouillon = $derived({ depart, destination, budget, types, flexible, date, canaux });
  const apercuTypes = $derived(types.length ? types.map((t) => TYPES_OFFRE.find((x) => x.id === t)!.label).join(', ') : 'Aucun type');
  const apercuCanaux = $derived(canaux.length ? canaux.map((c) => CANAUX.find((x) => x.id === c)!.label).join(', ') : 'Aucun canal');
  const mois = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const apercuDates = $derived(flexible ? 'Dates flexibles' : /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${Number(date.slice(8))} ${mois[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}` : 'date à choisir');
  const bascule = <T,>(liste: T[], v: T): T[] => (liste.includes(v) ? liste.filter((x) => x !== v) : [...liste, v]);
  const revalider = () => { if (tente) erreurs = validerAlerte(brouillon, pass); };
  const icone = (titre: string, t: TypeOffreAlerte[]) => (titre.startsWith('Drops') ? 'eclair' : t.length === 1 && t[0] === 'revente' ? 'etiquette' : 'avion');

  function enregistrer() {
    tente = true; if (!compte || !reseau.enLigne) return;
    const r = creerAlerte(compte.id, brouillon);
    if (!r.ok) { erreurs = r.erreurs; const id = r.erreurs.depart ? 'al-dep' : r.erreurs.destination ? 'al-dest' : r.erreurs.budget ? 'al-budget' : r.erreurs.date ? 'al-date' : r.erreurs.types ? 'types-err' : 'chans-err'; document.getElementById(id)?.scrollIntoView({ block: 'center' }); return; }
    erreurs = {}; tente = false; destination = PARTOUT; budget = 600; flexible = true; date = ''; types = pass ? ['drop', 'revente'] : ['revente']; canaux = ['notification'];
    montrer(r.declenchees ? `Alerte enregistrée · ${r.declenchees} offre${r.declenchees > 1 ? 's' : ''} correspond${r.declenchees > 1 ? 'ent' : ''} déjà.` : 'Alerte enregistrée.');
    window.scrollTo({ top: 0 });
  }
  const retirer = (id: string, titre: string) => { if (supprimerAlerte(id)) montrer(`Alerte ${titre} supprimée.`); };
  const va = (e: MouseEvent, c: string) => { if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); aller(c); };
</script>

<Ecran titre="Alertes" face="nuit" retour="/compte" pied={bas}>
  {#if compte}
  <div class="cp page">
    {#if !reseau.enLigne}<div class="cp-hl" role="status"><Icone nom="hors_ligne" taille={20} /><span class="col"><b>Hors ligne : les alertes ne peuvent pas être modifiées.</b><span class="d">Reconnectez-vous pour créer ou changer une alerte.</span></span></div>{/if}

    <section class="cp-groupe g10" aria-labelledby="mine-title">
      <div class="ent"><h2 id="mine-title" class="cp-h2">Mes alertes</h2><span class="cp-puce" role="status">{libelleActives(actives)}</span></div>
      <ul class="cp-liste">
        {#each mes as a (a.id)}
          {@const m = metaDe(a)}{@const titre = titreAlerte(a, m)}
          <li class="al">
            <label class="cp-ligne tout"><span class="cp-ico carre" aria-hidden="true"><Pic nom={icone(titre, m.types)} taille={20} /></span>
              <span class="cp-txt"><span class="cp-t t16">{titre}</span><span class="cp-s clair">{sousTitreAlerte(a, m)}</span></span>
              <span class="cp-sw"><input type="checkbox" role="switch" checked={a.actif} disabled={!reseau.enLigne} aria-label={`Alerte ${titre}, ${sousTitreAlerte(a, m)}`} onchange={() => basculerAlerte(a.id)} /><span aria-hidden="true"></span></span></label>
            <button type="button" class="poub" aria-label={`Supprimer l’alerte ${titre}`} disabled={!reseau.enLigne} onclick={() => retirer(a.id, titre)}><Pic nom="poubelle" taille={18} /></button>
          </li>
        {:else}
          <li class="vide-l"><p>Aucune alerte pour l’instant. Créez la première ci-dessous.</p></li>
        {/each}
        <li class="al"><label class="cp-ligne tout"><span class="cp-ico carre vertc" aria-hidden="true"><Pic nom="portefeuille" taille={20} /></span>
          <span class="cp-txt"><span class="cp-t t16">Nouvelle intention sur mes vols</span><span class="cp-s clair">Acheteurs à fonds réservés · mes {detenus} droit{detenus > 1 ? 's' : ''} détenu{detenus > 1 ? 's' : ''}</span></span>
          <span class="cp-sw"><input type="checkbox" role="switch" checked={intention} disabled={!reseau.enLigne} aria-label="Nouvelle intention sur mes vols" onchange={() => basculerIntention()} /><span aria-hidden="true"></span></span></label><span class="cale" aria-hidden="true"></span></li>
      </ul>
      <p class="cp-note">Les alertes de drops sont réservées aux membres du Pass NexG.{#if !pass}{' '}<a href="/pass" onclick={(e) => va(e, '/pass')}>Découvrir le Pass</a>{/if}</p>
    </section>

    <section class="cp-groupe g10" aria-labelledby="hist-title">
      <h2 id="hist-title" class="cp-h2">Alertes déclenchées</h2>
      {#if historique.length}
        <ul class="cp-liste">
          {#each historique as h (h.id)}
            <li><a class="cp-ligne" href={h.offreId.startsWith('drop:') ? '/drops' : `/offre/${h.offreId}`} onclick={(e) => va(e, h.offreId.startsWith('drop:') ? '/drops' : `/offre/${h.offreId}`)}><span class="cp-ico carre" aria-hidden="true"><Pic nom="cloche" taille={18} /></span>
              <span class="cp-txt"><span class="cp-t">{h.titre}</span><span class="cp-s">{h.sous}</span></span><span class="mono quand">{heureRelative(h.quand, now)}</span></a></li>
          {/each}
        </ul>
      {:else}
        <p class="t-sec">Aucune alerte déclenchée pour l’instant. Dès qu’une offre passe sous votre prix, elle apparaît ici et dans vos notifications.</p>
      {/if}
    </section>

    <section class="cp-groupe g18" aria-labelledby="new-title">
      <h2 id="new-title" class="cp-h2">Nouvelle alerte</h2>
      <div class="apercu" aria-label="Aperçu de l’alerte"><span class="cp-sur mini">Aperçu</span>
        <span class="route"><span class="r">{code(depart)} → {code(destination, true)}</span><span class="mono prix">≤ {fmt(budget)}</span></span>
        <span class="t-sec">{apercuTypes} · {apercuDates} · {apercuCanaux}</span></div>

      <div class="cp-champ"><label for="al-dep">Départ</label><input id="al-dep" type="text" autocomplete="off" bind:value={depart} oninput={revalider} aria-invalid={erreurs.depart ? 'true' : undefined} aria-describedby={erreurs.depart ? 'al-dep-e' : undefined} />
        {#if erreurs.depart}<span class="cp-err" id="al-dep-e" role="alert"><Icone nom="alerte" taille={16} />{erreurs.depart}</span>{/if}</div>

      <div class="cp-champ"><label for="al-dest">Destination</label>
        <div class="dest"><input id="al-dest" type="text" autocomplete="off" bind:value={destination} oninput={revalider} aria-describedby={erreurs.destination ? 'al-dest-e' : 'al-dest-help'} aria-invalid={erreurs.destination ? 'true' : undefined} />
          <button type="button" aria-pressed={destination.trim().toLowerCase() === 'partout'} onclick={() => { destination = PARTOUT; revalider(); }}>Partout</button></div>
        {#if erreurs.destination}<span class="cp-err" id="al-dest-e" role="alert"><Icone nom="alerte" taille={16} />{erreurs.destination}</span>{:else}<span class="t-aide" id="al-dest-help">« Partout »{NB}: toutes les destinations au départ de cet aéroport.</span>{/if}</div>

      <div class="col g4"><div class="ligne-b"><label for="al-budget" class="lib">Budget maximum par billet</label><output for="al-budget" class="mono sortie">{fmt(budget)}</output></div>
        <input id="al-budget" class="curseur" type="range" min={BUDGET_MIN} max={BUDGET_MAX} step={BUDGET_PAS} bind:value={budget} aria-valuetext={`${budget} dollars`} oninput={revalider} />
        <div class="bornes mono" aria-hidden="true"><span>{fmt(BUDGET_MIN)}</span><span>{fmt(BUDGET_MAX)}</span></div>
        {#if erreurs.budget}<span class="cp-err" id="al-budget-e" role="alert"><Icone nom="alerte" taille={16} />{erreurs.budget}</span>{/if}</div>

      <div class="col g10">
        <label class="cp-ligne flex56"><span class="cp-txt"><span class="cp-t">Dates flexibles</span><span class="cp-s clair">Tout départ d’ici octobre 2027</span></span><span class="cp-sw"><input type="checkbox" role="switch" bind:checked={flexible} onchange={revalider} /><span aria-hidden="true"></span></span></label>
        {#if !flexible}<div class="cp-champ"><label for="al-date">Date de départ</label><input id="al-date" type="date" bind:value={date} oninput={revalider} aria-invalid={erreurs.date ? 'true' : undefined} />
          {#if erreurs.date}<span class="cp-err" role="alert"><Icone nom="alerte" taille={16} />{erreurs.date}</span>{/if}</div>{/if}
      </div>

      <fieldset class="champs"><legend>Types d’offres</legend>
        <div class="grille3">
          {#each TYPES_OFFRE as t (t.id)}
            {@const bloque = t.id === 'drop' && !pass}
            <label class="cp-choix"><input type="checkbox" checked={types.includes(t.id)} disabled={bloque} aria-invalid={erreurs.types ? 'true' : undefined} aria-describedby={erreurs.types ? 'types-err' : undefined} onchange={() => { types = bascule(types, t.id); revalider(); }} />{t.label}</label>
          {/each}
        </div>
        {#if !pass}<p class="cp-note marge">Les drops demandent le Pass NexG.</p>{/if}
        {#if erreurs.types}<p class="cp-err marge" id="types-err" role="alert"><Icone nom="alerte" taille={16} />{erreurs.types}</p>{/if}</fieldset>

      <fieldset class="champs"><legend>Me prévenir par</legend>
        <div class="grille2">
          {#each CANAUX as c (c.id)}
            <label class="cp-choix"><input type="checkbox" checked={canaux.includes(c.id)} aria-invalid={erreurs.canaux ? 'true' : undefined} aria-describedby={erreurs.canaux ? 'chans-err' : undefined} onchange={() => { canaux = bascule(canaux, c.id); revalider(); }} />{c.label}</label>
          {/each}
        </div>
        {#if erreurs.canaux}<p class="cp-err marge" id="chans-err" role="alert"><Icone nom="alerte" taille={16} />{erreurs.canaux}</p>{/if}</fieldset>

      <p class="cp-note">Une alerte signale une offre{NB}; elle ne réserve pas de place.</p>
    </section>
  </div>
  {/if}
</Ecran>

{#snippet bas()}
<div class="cp-barre">
  <button type="button" class="btn" aria-disabled={!reseau.enLigne ? 'true' : undefined} onclick={enregistrer}><Icone nom="ok" taille={20} trait={2} />Enregistrer l’alerte</button>
</div>
{/snippet}

<style>
  .page { display: flex; flex-direction: column; gap: 28px; } .g10 { gap: 10px; } .g18 { gap: 18px; } .ent { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .t16 { font-size: 16px; } .clair { color: var(--ink2); } .al { display: flex; align-items: center; } .al .tout { flex: 1; min-height: 72px; padding-right: 8px; cursor: pointer; }
  .poub { width: 44px; height: 44px; margin-right: 8px; flex: none; border-radius: 999px; border: 0; background: transparent; color: var(--ink3); display: grid; place-items: center; cursor: pointer; } .poub:hover:not(:disabled) { background: var(--surface2); color: var(--err); } .poub:disabled { opacity: 0.5; cursor: not-allowed; }
  .cale { width: 52px; flex: none; }
  .vertc { background: var(--ok-soft); color: var(--ok); } .vide-l { padding: 16px; font-size: 14px; color: var(--ink2); } .vide-l p { margin: 0; }
  .quand { font-size: 12px; color: var(--ink3); white-space: nowrap; align-self: flex-start; margin-top: 4px; }
  .apercu { display: flex; flex-direction: column; gap: 6px; padding: 14px 16px; border-radius: 16px; background: #060708; border: 1px solid var(--line); } .mini { font-size: 11px; letter-spacing: 0.14em; color: var(--ink3); }
  .route { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; } .r { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 600 26px/30px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; } .prix { flex: none; font-weight: 600; font-size: 20px; color: var(--accent); font-variant-numeric: tabular-nums; }
  .dest { display: flex; gap: 8px; } .dest input { flex: 1; min-width: 0; } .dest button { flex: none; min-height: 52px; padding: 0 14px; border-radius: 12px; background: var(--surface2); border: 1px solid var(--line-strong); color: var(--ink); font-size: 14px; font-weight: 700; cursor: pointer; } .dest button[aria-pressed='true'] { background: var(--accent-soft); border-color: var(--accent); }
  .ligne-b { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap; } .lib { font-size: 13px; font-weight: 500; color: var(--ink2); } .sortie { font-weight: 600; font-size: 22px; font-variant-numeric: tabular-nums; }
  .curseur { width: 100%; height: 44px; margin: 0; accent-color: #FFD23F; cursor: pointer; } .bornes { display: flex; justify-content: space-between; font-size: 12px; color: var(--ink3); }
  .flex56 { min-height: 56px; padding: 0; cursor: pointer; } .champs { margin: 0; padding: 0; border: 0; min-width: 0; } .grille3 { margin-top: 8px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; } .grille2 { margin-top: 8px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .grille3 :global(.cp-choix) { padding: 0 8px; gap: 8px; font-size: 14px; } .marge { margin: 8px 0 0; }
  .cp-note a { color: var(--accent); text-decoration: underline; }
  @media (max-width: 340px) { .grille3 { grid-template-columns: repeat(2, minmax(0, 1fr)); } .r { font-size: 22px; } }
</style>
