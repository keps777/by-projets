<script lang="ts">
  import { onMount } from 'svelte';
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Pic from '../compte/Pic.svelte';
  import { reseau } from '../compte/reseau.svelte.ts';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { fmt, fmtSigne } from '../../core/argent.ts';
  import { FRAIS_VERSEMENT } from '../../core/regles.ts';
  import { DELAI_VERSEMENT, dateLongue, FILTRES, ecrituresDe, enCours, estCommission, filtrer, grouperParMois, jourDe, jourLong, moisCourt, periode, reglerVersements, reinitialiserDemo, soldeOuverture, totaux, verser, type FiltreLivre } from './actions.ts';

  /** Solde NexG et grand livre : solde disponible, versement simulé (confirmation, identité exigée), grand livre filtrable avec le solde après chaque mouvement. */
  const compte = $derived(compteCourant());
  const now = maintenant();
  let filtre = $state<FiltreLivre>('tout');
  const lignes = $derived(compte ? ecrituresDe(app.monde.ecritures, compte.id) : []);
  const tot = $derived(totaux(lignes));
  const groupes = $derived(grouperParMois(filtrer(lignes, filtre)));
  const ouverture = $derived(soldeOuverture(lignes));
  const attente = $derived(compte ? enCours(compte.id) : []);
  const solde = $derived(compte?.solde ?? 0);
  let etape = $state<'repos' | 'confirmer' | 'fait'>('repos');
  let erreur = $state(''), dernier = $state(0);
  const carte4 = $derived(compte?.carte4 ?? '4821');
  const verifie = $derived(!!compte?.identiteVerifiee);
  const frais = FRAIS_VERSEMENT;
  const fmtC = (n: number) => fmt(n, { centimes: true });
  const fmtS = (n: number) => fmtSigne(n, { centimes: true });
  const dateIdentite = $derived(compte?.identiteVerifiee ? dateLongue(compte.identiteVerifiee) : '');
  const NB = ' ';
  /** Tuiles du solde : un chiffre par tuile, comme un tableau des départs. */
  const tuiles = $derived([...fmtC(solde)].map((c) => ({ c, type: /\d/.test(c) ? 'chiffre' : c === NB ? 'espace' : c === '$' ? 'dollar' : 'signe' })));

  onMount(() => { if (compte) reglerVersements(compte.id, maintenant()); });
  function demander() {
    erreur = '';
    if (!compte) return;
    if (!verifie) { aller('/identite?retour=/solde'); return; }
    if (solde <= 0) { erreur = 'Votre solde disponible est nul : il n’y a rien à verser.'; return; }
    etape = 'confirmer';
  }
  function confirmer() {
    if (!compte || !reseau.enLigne) return;
    const r = verser(compte.id);
    if (!r.ok) { if (r.code === 'identite') { aller('/identite?retour=/solde'); return; } erreur = r.message; etape = 'repos'; return; }
    dernier = r.montant; etape = 'fait';
  }
  function reinitialiser() { if (compte) { reinitialiserDemo(compte.id); etape = 'repos'; filtre = 'tout'; erreur = ''; } }
</script>

<Ecran titre="Mes actifs · Solde NexG" face="nuit" retour="/portefeuille" large>
  {#if compte}
  <div class="pc-duo etroit"><div class="pc-col colle">
  <section class="solde" aria-labelledby="bal-title">
    <div class="ligne"><h2 id="bal-title" class="sur">Solde disponible</h2><span class="mono dev">$ CA</span></div>
    <p class="tuiles"><span class="sr">{fmtC(solde)}</span><span aria-hidden="true" class="rang">{#each tuiles as t, i (i)}<span class="t {t.type}">{t.type === 'espace' ? '' : t.c}</span>{/each}</span></p>
    <div class="infos">
      <div class="ligne"><span class="avec"><Icone nom="horloge" taille={16} trait={2} />En attente</span><span class="mono val">{fmtC(compte.enAttente)}</span></div>
      {#each attente as v (v.id)}
        <div class="ligne"><span class="avec"><Pic nom="fleche" taille={16} trait={2} />Versement en cours · •••• {v.carte4}</span><span class="mono val">{fmtC(v.montant)}</span></div>
      {/each}
    </div>

    {#if etape === 'repos'}
      <div class="col g8">
        <button type="button" class="btn" aria-disabled={solde <= 0 ? 'true' : undefined} onclick={demander}>Verser vers mon compte <span class="mono">•••• {carte4}</span></button>
        <a class="btn sec" href="/rechercher" onclick={(e) => { e.preventDefault(); aller('/rechercher'); }}>Utiliser pour un achat</a>
      </div>
    {:else if etape === 'confirmer'}
      <div role="group" aria-labelledby="cf-title" class="confirm">
        <p id="cf-title" class="cf-t">Confirmer le versement</p>
        <dl>
          <dt>Montant</dt><dd class="mono">{fmtC(solde - frais)}</dd>
          <dt>Vers</dt><dd>Compte <span class="mono">•••• {carte4}</span> (fictif)</dd>
          <dt>Frais de versement</dt><dd><span class="mono">{fmtC(frais)}</span> (hypothèse)</dd>
          <dt>Délai estimé</dt><dd>{DELAI_VERSEMENT}</dd>
        </dl>
        <p class="demo">MODE DÉMO — aucun paiement réel</p>
        {#if !reseau.enLigne}<p class="hl" role="alert"><Icone nom="hors_ligne" taille={16} />Hors ligne : le versement demande une connexion.</p>{/if}
        <div class="deux"><button type="button" class="btn sec" onclick={() => (etape = 'repos')}>Annuler</button><button type="button" class="btn" aria-disabled={!reseau.enLigne ? 'true' : undefined} onclick={confirmer}>Confirmer</button></div>
      </div>
    {:else}
      <div class="col g4">
        <p role="status" class="fait"><Icone nom="ok" taille={20} trait={2} /><span>Versement simulé lancé{NB}: {fmtC(dernier)} vers •••• {carte4}. Il apparaît dans le grand livre.</span></p>
        <button type="button" class="lien" onclick={reinitialiser}>Réinitialiser la démo</button>
      </div>
    {/if}
    {#if erreur}<p class="err" role="alert"><Icone nom="alerte" taille={16} />{erreur}</p>{/if}
    <p class="sr" aria-live="polite">{etape === 'fait' ? 'Versement simulé lancé.' : ''}</p>
  </section>

  <section class="kyc" class:non={!verifie} aria-labelledby="kyc-title">
    <span class="rondel"><Icone nom="verifie" taille={22} /></span>
    <div class="col g4 grow"><h2 id="kyc-title">{verifie ? 'Identité vérifiée' : 'Identité à vérifier'}</h2><span class="t-sec">{verifie ? `Requise pour les versements · vérifiée le ${dateIdentite}` : 'Requise pour les versements · à faire une seule fois'}</span></div>
    <a href={verifie ? '/compte' : '/identite?retour=/solde'} onclick={(e) => { e.preventDefault(); aller(verifie ? '/compte' : '/identite?retour=/solde'); }}>{verifie ? 'Gérer' : 'Vérifier'}</a>
  </section>

  </div><div class="pc-col">
  <section class="livre" aria-labelledby="gl-title">
    <div class="ligne base"><h2 id="gl-title" class="t-section maj">Grand livre</h2><span class="t-aide">{periode(lignes, now)}</span></div>
    <div role="group" aria-label="Filtrer les mouvements" class="seg">
      {#each FILTRES as f (f.id)}<button type="button" aria-pressed={filtre === f.id} onclick={() => (filtre = f.id)}>{f.label}</button>{/each}
    </div>
    <div class="tot">
      <div><span>Entrées</span><span class="mono ent">{fmtS(tot.entrees)}</span></div>
      <div><span>Sorties</span><span class="mono sor">{fmtS(tot.sorties)}</span></div>
    </div>
    <div class="table" role="table" aria-label="Mouvements du solde NexG">
      <div class="th" role="row"><span role="columnheader">Date</span><span role="columnheader">Mouvement</span><span role="columnheader" class="d">Montant · solde</span></div>
      <div class="tr ouv" role="row"><span class="mono" role="cell">{jourLong(lignes[0]?.quand ?? now)}</span><span role="cell">Solde d'ouverture</span><span class="mono d" role="cell">{fmtC(ouverture)}</span></div>
      {#each groupes as g (g.cle)}
        <div class="mois" role="row"><span role="cell">{g.nom}</span></div>
        {#each g.lignes as r (r.id)}
          {@const enfant = estCommission(r)}
          <div class="tr mv" class:enfant role="row">
            <span class="dt" role="cell"><span class="mono j">{jourDe(r.quand)}</span><span class="m">{moisCourt(r.quand)}</span></span>
            <span class="lib" role="cell">
              <span class="nom">{#if enfant}<Pic nom="enfant" taille={14} trait={2} />{/if}<span class="lb">{r.libelle}</span>{#if r.hypothese}<span class="hyp">Hypothèse</span>{/if}</span>
              {#if r.sous}<span class="sous">{r.sous}</span>{/if}
            </span>
            <span class="mt mono" role="cell"><span class="a" class:ent={r.montant > 0} class:sor={r.montant < 0}>{fmtS(r.montant)}</span><span class="s">solde {fmtC(r.solde)}</span></span>
          </div>
        {/each}
      {:else}
        <div class="vide" role="row"><span role="cell">Aucun mouvement de ce type.</span></div>
      {/each}
      <div class="tr clot" role="row"><span class="mono" role="cell">{new Date(now).getDate()} {moisCourt(now)}</span><span role="cell">Solde de clôture</span><span class="mono d" role="cell">{fmtC(solde)}</span></div>
    </div>
    {#if filtre !== 'tout'}<p class="note">Filtre actif{NB}: chaque solde affiché reste celui du grand livre complet après le mouvement.</p>{/if}
    <p class="note">Chaque commission de revente est une ligne distincte, placée sous la revente qui l'a déclenchée. Taux{NB}: hypothèse 10 %, dans une plage de 10 à 20 % à valider.</p>
  </section>

  </div></div>
  <div class="col g4 mentions"><p class="fort">Montants fictifs de démonstration.</p><p>Aucun paiement réel. Compte •••• {carte4} fictif. Un droit de voyage n'est pas un placement financier.</p></div>
  {/if}
</Ecran>

<style>
  .maj { text-transform: uppercase; letter-spacing: 0.04em; }
  .ligne { display: flex; align-items: center; justify-content: space-between; gap: 8px; } .ligne.base { align-items: baseline; flex-wrap: wrap; }
  .sur { margin: 0; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); } .dev { font-size: 12px; color: var(--ink3); }
  .solde { display: flex; flex-direction: column; gap: 16px; padding: 18px; border-radius: 20px; background: #060708; border: 1px solid var(--line); }
  .tuiles { margin: 0; position: relative; } .rang { display: flex; align-items: center; gap: 3px; flex-wrap: nowrap; }
  .t { display: inline-flex; align-items: center; justify-content: center; height: 48px; border-radius: 6px; font: 600 30px/1 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; color: var(--ink); }
  .t.chiffre { flex: 1 1 0; max-width: 30px; min-width: 0; background: #1C1F25; box-shadow: inset 0 -24px 0 #15171B; } .t.espace { width: 4px; flex: none; } .t.signe { width: 12px; flex: none; } .t.dollar { width: 22px; flex: none; }
  .infos { display: flex; flex-direction: column; gap: 8px; padding-top: 12px; border-top: 1px solid #1A1C21; font-size: 13px; color: var(--ink2); } .avec { display: inline-flex; align-items: center; gap: 6px; } .val { font-weight: 600; font-variant-numeric: tabular-nums; color: var(--ink); }
  .confirm { display: flex; flex-direction: column; gap: 12px; padding: 14px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line-strong); }
  .cf-t { margin: 0; font-size: 16px; font-weight: 700; } dl { margin: 0; display: grid; grid-template-columns: 1fr auto; gap: 8px 12px; font-size: 14px; } dt { color: var(--ink2); } dd { margin: 0; text-align: right; } dd.mono { font-weight: 600; font-variant-numeric: tabular-nums; }
  .demo { margin: 0; background: rgba(98, 199, 255, 0.12); border: 1px solid rgba(98, 199, 255, 0.4); color: var(--up); border-radius: 12px; padding: 10px 12px; font-size: 13px; font-weight: 600; }
  .deux { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; } .confirm .btn { width: 100%; }
  .fait { margin: 0; display: flex; align-items: flex-start; gap: 10px; padding: 12px; border-radius: 12px; background: var(--ok-soft); border: 1px solid rgba(124, 227, 181, 0.35); color: var(--ok); font-size: 14px; line-height: 20px; font-weight: 600; }
  .lien { align-self: flex-start; min-height: 44px; padding: 0 4px; background: transparent; border: 0; color: var(--accent); font-size: 14px; font-weight: 600; cursor: pointer; }
  .err, .hl { margin: 0; display: flex; align-items: flex-start; gap: 8px; font-size: 13px; line-height: 18px; font-weight: 600; color: var(--err); } .hl { color: var(--up); }
  .kyc { display: flex; align-items: center; gap: 12px; padding: 14px 12px 14px 16px; border-radius: 16px; background: var(--ok-soft); border: 1px solid rgba(124, 227, 181, 0.35); }
  .kyc.non { background: var(--signal-soft); border-color: rgba(255, 210, 63, 0.45); } .kyc.non h2, .kyc.non a { color: var(--accent); }
  .rondel { flex: none; width: 40px; height: 40px; border-radius: 999px; background: rgba(124, 227, 181, 0.16); color: var(--ok); display: flex; align-items: center; justify-content: center; } .kyc.non .rondel { background: rgba(255, 210, 63, 0.16); color: var(--accent); }
  .kyc h2 { margin: 0; font-size: 15px; font-weight: 700; color: var(--ok); } .kyc .t-sec { line-height: 18px; }
  .kyc a { flex: none; display: flex; align-items: center; min-height: 44px; padding: 0 6px; font-size: 14px; font-weight: 600; color: var(--ok); text-decoration: underline; }
  .livre { display: flex; flex-direction: column; gap: 12px; }
  .seg { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 2px; padding: 3px; border-radius: 14px; background: var(--surface2); border: 1px solid var(--line); }
  .seg button { min-height: 44px; border-radius: 11px; border: 0; background: transparent; color: var(--ink2); font-size: 14px; font-weight: 700; cursor: pointer; } .seg button[aria-pressed='true'] { background: #F3F4F6; color: #0D0E11; }
  .tot { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; } .tot > div { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); }
  .tot span:first-child { font-size: 12px; font-weight: 600; color: var(--ink2); } .tot .mono { font-weight: 600; font-size: 17px; font-variant-numeric: tabular-nums; } .ent { color: var(--up); } .sor { color: var(--down); }
  .table { border-radius: 16px; background: #060708; border: 1px solid var(--line); overflow: hidden; }
  .th, .tr { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; gap: 10px; padding: 10px 14px; } .th { padding-bottom: 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink3); } .d { text-align: right; }
  .tr { border-top: 1px solid #1A1C21; align-items: center; font-size: 13px; } .ouv { color: var(--ink3); } .ouv .mono { font-size: 12px; font-weight: 500; } .ouv .d { font-variant-numeric: tabular-nums; }
  .mois { padding: 12px 14px 6px; border-top: 1px solid #1A1C21; font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink2); }
  .mv { align-items: start; padding: 10px 14px 12px; } .mv.enfant { background: #0E0F12; }
  .dt { display: flex; flex-direction: column; line-height: 1.15; } .j { font-weight: 600; font-size: 16px; font-variant-numeric: tabular-nums; } .m { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink3); }
  .lib { display: flex; flex-direction: column; gap: 3px; min-width: 0; } .nom { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; font-size: 14px; font-weight: 600; line-height: 19px; color: var(--ink); } .nom :global(svg) { color: var(--ink3); }
  .lb { min-width: 0; flex: 0 1 auto; }
  .btn .mono { white-space: nowrap; }
  .hyp { display: inline-flex; align-items: center; height: 20px; padding: 0 7px; border-radius: 999px; background: var(--surface3); color: var(--ink2); font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; } .sous { font-size: 12px; line-height: 16px; color: var(--ink3); }
  .mt { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; font-variant-numeric: tabular-nums; } .a { font-weight: 600; font-size: 15px; } .s { font-size: 11px; color: var(--ink3); }
  .clot { padding: 12px 14px; border-top: 1px solid var(--line); background: var(--surface); } .clot .mono:first-child { font-size: 12px; color: var(--ink2); } .clot span:nth-child(2) { font-size: 14px; font-weight: 700; } .clot .d { font-weight: 600; font-size: 15px; font-variant-numeric: tabular-nums; }
  .vide { margin: 0; padding: 16px 14px; border-top: 1px solid #1A1C21; font-size: 13px; color: var(--ink3); }
  .note { margin: 0; font-size: 12px; line-height: 17px; color: var(--ink3); } .mentions { font-size: 12px; line-height: 17px; color: var(--ink3); } .mentions .fort { font-weight: 600; color: var(--ink2); }
  @media (max-width: 340px) { .t.chiffre { max-width: 24px; } .t { font-size: 24px; height: 40px; } }
</style>
