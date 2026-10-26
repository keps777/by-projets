<script lang="ts">
  import { onMount } from 'svelte';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { consigner } from '../../domain/audit.ts';
  import Console from './Console.svelte';
  import AuditGravite from './AuditGravite.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { etatForce, reseau } from './DropsReseau.svelte.ts';
  import { decalage, heure, heureSec, heureUtc, jour, jourHeure } from './DropsFormat.ts';
  import { FILTRES_INITIAUX, filtrer, GRAVITES, nbPages, page as tranche, TAILLE_PAGE, trier, versCsv, type CategorieAction, type CleTri, type Filtres, type Periode } from './AuditVues.ts';
  /** « Journal d'audit » (`/admin/audit`) : table des lignes de `app.monde.audit` (ajout seul), filtres, tri, pagination, export CSV simulé (Blob). États chargement / vide / erreur / hors ligne (`?etat=chargement|erreur|horsligne`). */
  const acteur = $derived(compteCourant()?.id ?? 'adm-01');
  let etat = $state<'ok' | 'chargement' | 'erreur'>(etatForce() === 'chargement' ? 'chargement' : etatForce() === 'erreur' ? 'erreur' : 'ok');
  const recu = maintenant();
  const horsLigne = $derived(!reseau.enLigne);
  let now = $state(maintenant());
  onMount(() => { document.title = 'Journal d’audit · Administration · NexG-TT'; const t = setInterval(() => (now = maintenant()), 15_000); return () => clearInterval(t); });
  $effect(() => { void app.monde.audit.length; now = maintenant(); });

  let f = $state<Filtres>({ ...FILTRES_INITIAUX });
  let cle = $state<CleTri>('quand'), sens = $state<'asc' | 'desc'>('desc'), p = $state(1);
  const filtrees = $derived(trier(filtrer(app.monde.audit, f, now), cle, sens));
  const total = $derived(app.monde.audit.length);
  const pages = $derived(nbPages(filtrees.length));
  const courante = $derived(Math.min(p, pages));
  const visibles = $derived(tranche(filtrees, courante));
  $effect(() => { void [f.periode, f.gravite, f.acteur, f.action, f.recherche, cle, sens]; p = 1; });
  const filtreActif = $derived(f.periode !== FILTRES_INITIAUX.periode || f.gravite !== 'toutes' || f.acteur !== '' || f.action !== 'toutes' || f.recherche !== '');
  const reinitialiser = () => { f = { ...FILTRES_INITIAUX }; };

  const COLONNES: { cle: CleTri; label: string; defaut: 'asc' | 'desc' }[] = [{ cle: 'quand', label: 'Horodatage', defaut: 'desc' }, { cle: 'acteur', label: 'Acteur', defaut: 'asc' }, { cle: 'action', label: 'Action', defaut: 'asc' }, { cle: 'cible', label: 'Objet', defaut: 'asc' }];
  const NOMS_TRI: Record<CleTri, [string, string]> = { quand: ['du plus ancien au plus récent', 'du plus récent au plus ancien'], acteur: ['acteur de A à Z', 'acteur de Z à A'], action: ['action de A à Z', 'action de Z à A'], cible: ['objet de A à Z', 'objet de Z à A'], gravite: ['gravité croissante', 'gravité décroissante'] };
  function trierPar(k: CleTri, defaut: 'asc' | 'desc') { if (cle === k) sens = sens === 'asc' ? 'desc' : 'asc'; else { cle = k; sens = defaut; } }
  const ariaSort = (k: CleTri) => (cle === k ? (sens === 'asc' ? 'ascending' : 'descending') : 'none');
  const PERIODES: { v: Periode; t: string }[] = [{ v: 'semaine', t: '7 derniers jours' }, { v: 'jour', t: '24 dernières heures' }, { v: 'heure', t: 'Dernière heure' }, { v: 'tout', t: 'Tout le journal' }];
  const ACTIONS: { v: CategorieAction; t: string }[] = [{ v: 'toutes', t: 'Toutes les actions' }, { v: 'gel', t: 'Gel d’un droit' }, { v: 'drops', t: 'Drops' }, { v: 'agences', t: 'Agences' }, { v: 'connexions', t: 'Connexions' }, { v: 'exports', t: 'Exports' }, { v: 'rapprochement', t: 'Rapprochement' }, { v: 'autres', t: 'Autres' }];

  let notice = $state('');
  /** Export CSV simulé : télécharge les lignes filtrées et triées (toutes les pages), puis journalise l'export. */
  function exporter() {
    if (horsLigne) return;
    const n = filtrees.length, csv = versCsv(filtrees), url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `journal-audit-${new Date(maintenant()).toISOString().slice(0, 10)}.csv`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    consigner(acteur, 'Export du journal', 'Journal d’audit', `CSV · ${PERIODES.find((x) => x.v === f.periode)!.t.toLowerCase()} · ${n} entrée(s) · journalisé`, 'info');
    notice = `Export CSV de ${n} entrée${n > 1 ? 's' : ''} téléchargé. L’export est consigné au journal.`;
  }
  const SQUELETTE = [0, 1, 2, 3, 4];
</script>

<Console actif="audit" titre="Journal d’audit" sous={`Administration · données du ${jour(now)}, ${heure(now)} (${decalage(now)}) · heures de Montréal et UTC`}>
  {#snippet badge()}
    <div class="export"><button type="button" class="btn sec sm" aria-disabled={horsLigne || etat !== 'ok'} onclick={() => etat === 'ok' && exporter()}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 11l5 5 5-5M5 20h14" /></svg>Exporter (CSV)</button>
      <span class="t-aide">{horsLigne ? 'Export indisponible hors ligne.' : 'L’export est journalisé.'}</span></div>
  {/snippet}

  {#if horsLigne}
    <div class="bandeau" role="status"><Icone nom="alerte" taille={20} trait={2} /><span>Hors ligne. Dernières données reçues le {jourHeure(recu)}. Lecture seule : le journal affiché est daté ; l’export est indisponible.</span></div>
  {/if}
  {#if notice}<div class="notice" role="status"><Icone nom="ok" taille={18} trait={2} /><span>{notice}</span><button type="button" class="x" aria-label="Fermer ce message" onclick={() => (notice = '')}><Icone nom="fermer" taille={16} /></button></div>{/if}

  <p class="carte2 ajout"><Icone nom="cadenas" taille={18} /><span><strong>Ajout seul</strong> : aucune modification ni suppression (le rôle applicatif ne peut pas écrire dans ce journal). Il ne contient aucune donnée passager et aucun secret.</span></p>

  {#if etat === 'erreur'}
    <div class="carte erreur" role="alert">
      <div class="row g8 titre"><Icone nom="alerte" taille={24} trait={2} /><h2>Impossible de charger le journal d’audit.</h2></div>
      <p class="t-sec">Le serveur n’a pas répondu. Aucune donnée n’a été modifiée.</p>
      <p class="t-aide">Code de corrélation : <span class="mono code">ERR-DEMO-5E17</span></p>
      <div><button type="button" class="btn sm" onclick={() => (etat = 'ok')}><Icone nom="echange" taille={18} />Réessayer</button></div>
    </div>
  {:else if etat === 'chargement'}
    <div class="col g12" aria-busy="true"><p class="t-sec" role="status">Chargement du journal d’audit…</p>
      <div class="squelette" aria-hidden="true">{#each SQUELETTE as i (i)}<div class="ligne">{#each [12, 8, 16, 14, 24, 10] as w, j (j)}<span style:width={`${w}%`}></span>{/each}</div>{/each}</div></div>
  {:else}
    <form class="carte filtres" role="search" aria-label="Filtrer le journal" onsubmit={(e) => e.preventDefault()}>
      <div class="champ"><label for="f-periode">Période</label><select id="f-periode" bind:value={f.periode}>{#each PERIODES as x (x.v)}<option value={x.v}>{x.t}</option>{/each}</select></div>
      <div class="champ"><label for="f-gravite">Gravité</label><select id="f-gravite" bind:value={f.gravite}><option value="toutes">Toutes les gravités</option>{#each Object.entries(GRAVITES) as [v, t] (v)}<option value={v}>{t}</option>{/each}</select></div>
      <div class="champ"><label for="f-acteur">Acteur (adm-01, système)</label><input id="f-acteur" type="search" autocomplete="off" bind:value={f.acteur} /></div>
      <div class="champ"><label for="f-action">Action</label><select id="f-action" bind:value={f.action}>{#each ACTIONS as x (x.v)}<option value={x.v}>{x.t}</option>{/each}</select></div>
      <div class="champ"><label for="f-q">Recherche (objet, action, détail)</label><input id="f-q" type="search" autocomplete="off" placeholder="NXG-…, Drop N° …" bind:value={f.recherche} /></div>
      <button type="button" class="btn texte reinit" onclick={reinitialiser} disabled={!filtreActif}>Réinitialiser</button>
    </form>

    <div class="entete"><p class="fort" role="status" aria-live="polite">{filtrees.length} entrée{filtrees.length > 1 ? 's' : ''} sur {total}</p><p class="t-sec">Tri : {NOMS_TRI[cle][sens === 'asc' ? 0 : 1]}.</p></div>

    {#if total === 0}
      <div class="carte vide"><span class="ico"><Icone nom="horloge" taille={32} trait={1.5} /></span><h2>Le journal est vide</h2><p class="t-sec">Aucune action d’administration n’a encore été consignée.</p></div>
    {:else if filtrees.length === 0}
      <div class="carte vide"><span class="ico"><Icone nom="chercher" taille={32} trait={1.5} /></span><h2>Aucune entrée ne correspond à ces filtres</h2><p class="t-sec">Élargissez la période ou retirez un filtre.</p><button type="button" class="btn sec sm" onclick={reinitialiser}>Réinitialiser les filtres</button></div>
    {:else}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div class="tableau" role="region" aria-label="Journal d’audit, défilement horizontal possible" tabindex="0">
        <table>
          <caption class="sr">Journal d’audit : horodatage en heure de Montréal et UTC, acteur, action, objet, détail et gravité.</caption>
          <thead><tr>
            {#each COLONNES as c (c.cle)}<th scope="col" aria-sort={ariaSort(c.cle)}><button type="button" class="tri" onclick={() => trierPar(c.cle, c.defaut)}>{c.label}<span aria-hidden="true" class="fl">{cle === c.cle ? (sens === 'asc' ? '▲' : '▼') : ''}</span></button></th>{/each}
            <th scope="col">Détail</th>
            <th scope="col" aria-sort={ariaSort('gravite')}><button type="button" class="tri" onclick={() => trierPar('gravite', 'desc')}>Gravité<span aria-hidden="true" class="fl">{cle === 'gravite' ? (sens === 'asc' ? '▲' : '▼') : ''}</span></button></th>
          </tr></thead>
          <tbody>
            {#each visibles as l (l.id)}
              <tr>
                <td class="nowrap"><span class="hl mono">{heureSec(l.quand)} {decalage(l.quand)}</span><span class="hu mono">{heureUtc(l.quand)} UTC</span><span class="jr">{jour(l.quand)}</span></td>
                <td class="mono acteur">{l.acteur}</td>
                <td class="action">{l.action}</td>
                <td>{l.cible || '—'}</td>
                <td class="detail">{l.detail}</td>
                <td><AuditGravite gravite={l.gravite} /></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <nav class="pagination" aria-label="Pages du journal">
        <p class="t-sec">Page {courante} sur {pages} · {filtrees.length} entrée{filtrees.length > 1 ? 's' : ''}{pages > 1 ? `, ${TAILLE_PAGE} par page` : ''}.</p>
        <div class="row g8"><button type="button" class="btn sec sm" disabled={courante <= 1} onclick={() => (p = courante - 1)}><Icone nom="retour" taille={16} trait={2} />Précédent</button><button type="button" class="btn sec sm" disabled={courante >= pages} onclick={() => (p = courante + 1)}>Suivant<Icone nom="suivant" taille={16} trait={2} /></button></div>
      </nav>
    {/if}
  {/if}
</Console>

<style>
  .export { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
  .bandeau { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 14px; background: var(--signal-soft); color: var(--signal-ink); font: 600 14px/20px 'Barlow', sans-serif; } .bandeau :global(svg) { flex: none; margin-top: 1px; }
  .notice { display: flex; align-items: center; gap: 10px; padding: 8px 8px 8px 14px; border-radius: 14px; background: var(--ok-soft); color: var(--ok); font: 600 14px/20px 'Barlow', sans-serif; } .notice span { flex: 1; }
  .x { width: 44px; height: 44px; border-radius: 999px; border: 0; background: transparent; color: inherit; display: grid; place-items: center; cursor: pointer; }
  .ajout { display: flex; align-items: center; gap: 10px; margin: 0; padding: 12px 16px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); } .ajout :global(svg) { flex: none; color: var(--ink2); }
  .filtres { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px 16px; align-items: end; padding: 16px; }
  .reinit { justify-self: start; min-height: 52px; }
  .reinit:disabled { opacity: 0.45; cursor: not-allowed; }
  .entete { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 4px 16px; } .fort { font-weight: 700; }
  .vide { display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; padding: 40px 24px; } .vide h2 { font: 700 20px/26px 'Barlow', sans-serif; } .ico { color: var(--ink3); display: flex; }
  .erreur { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; padding: 24px; } .titre { color: var(--err); } .titre h2 { font: 700 20px/26px 'Barlow', sans-serif; } .code { color: var(--ink); }
  .squelette { background: var(--surface); border: 1px solid var(--line); border-radius: 20px; overflow: hidden; }
  .ligne { display: flex; gap: 16px; padding: 18px 16px; border-top: 1px solid var(--line); } .ligne:first-child { border-top: 0; }
  .ligne span { display: block; height: 14px; border-radius: 6px; background: var(--surface3); animation: nx-pulse 1.4s ease-in-out infinite; }
  .tableau { overflow-x: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 20px; }
  table { width: 100%; min-width: 980px; border-collapse: collapse; }
  th { padding: 6px 8px 4px; text-align: left; white-space: nowrap; font: 700 11px/16px 'Barlow', sans-serif; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink3); } th:first-child { padding-left: 16px; }
  .tri { display: inline-flex; align-items: center; gap: 4px; min-height: 36px; padding: 0 4px; margin: 0 -4px; border: 0; background: transparent; color: inherit; font: inherit; letter-spacing: inherit; text-transform: inherit; cursor: pointer; border-radius: 6px; }
  .tri:hover { color: var(--ink); } th[aria-sort='ascending'] .tri, th[aria-sort='descending'] .tri { color: var(--ink); } .fl { display: inline-block; min-width: 10px; font-size: 9px; }
  tbody tr { border-top: 1px solid var(--line); } td { padding: 10px 8px; vertical-align: middle; } td:first-child { padding-left: 16px; }
  .nowrap { white-space: nowrap; } td > span { display: block; }
  .hl { font-weight: 700; font-size: 13px; line-height: 18px; } .hu { font-size: 12px; line-height: 16px; color: var(--ink3); } .jr { font-size: 12px; line-height: 16px; color: var(--ink2); }
  .acteur { font-size: 14px; } .action { font-weight: 700; } .detail { color: var(--ink2); min-width: 220px; }
  .pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
  .pagination .btn:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
