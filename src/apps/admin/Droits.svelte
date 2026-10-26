<script lang="ts">
  import { onMount } from 'svelte';
  import Console from './Console.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { aller, param } from '../../router.svelte.ts';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { FILTRES_VIDES, STATUTS_AFFICHES, compteDroits, filtrer, instantComplet, rapprochement, registre, type Filtres, type StatutAffiche } from './DroitsDonnees.ts';
  import { reseau } from './DroitsReseau.svelte.ts';

  /** Registre interne des droits de voyage (console d'administration, PC) : recherche, filtres, tableau trié par départ ; une ligne ouvre la chaîne de détention. */
  let q = $state(FILTRES_VIDES.q), statut = $state<Filtres['statut']>('all'), canal = $state<Filtres['canal']>('all');
  let instant = $state(maintenant()), attente = $state(false), erreurForcee = $state(param('etat') === 'erreur');
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  onMount(() => () => clearTimeout(minuterie));
  const chargement = $derived(attente || param('etat') === 'chargement');
  const horsLigne = $derived(!reseau.enLigne || param('etat') === 'horsligne');
  const vue = $derived(erreurForcee ? 'erreur' : chargement ? 'chargement' : 'donnees');
  const tous = $derived(registre(app.monde.droits, instant));
  const lignes = $derived(filtrer(tous, { q, statut, canal }));
  const STATUTS: { v: Filtres['statut']; l: string }[] = [{ v: 'all', l: 'Tous les statuts' }, { v: 'anommer', l: 'À nommer' }, { v: 'detenu', l: 'Détenu' }, { v: 'envente', l: 'En vente' }, { v: 'nomme', l: 'Nommé — prêt' }, { v: 'gele', l: 'Gelé' }];
  const CANAUX: { v: Filtres['canal']; l: string }[] = [{ v: 'all', l: 'Tous les canaux' }, { v: 'primaire', l: 'Primaire' }, { v: 'drop', l: 'Drop' }, { v: 'agence', l: 'Agence' }];

  function reinitialiser() { q = FILTRES_VIDES.q; statut = 'all'; canal = 'all'; }
  function reessayer() { erreurForcee = false; attente = true; clearTimeout(minuterie); minuterie = setTimeout(() => { instant = maintenant(); attente = false; }, 450); }
  const ouvrir = (id: string) => aller(`/admin/droits/${encodeURIComponent(id)}`);
  const puce = (s: StatutAffiche) => STATUTS_AFFICHES[s];
  const classe = (t: string) => (t === 'signal' ? 'signal' : t === 'ok' ? 'ready' : t === 'info' ? 'bleu' : '');
</script>

{#snippet chevron()}<span class="chev" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m5 9 7 7 7-7" /></svg></span>{/snippet}
{#snippet badge()}{#if vue === 'donnees'}<span class="puce ready"><Icone nom="ok" taille={14} trait={2} />Rapprochement du {rapprochement(instant)} · aucun écart</span>{/if}{/snippet}

<Console actif="droits" titre="Droits de voyage" sous={`Administration · registre interne · ${tous.length} droits de démonstration · données du ${instantComplet(instant)}`} {badge}>
  {#if horsLigne}<div class="avis" role="status"><Icone nom="info" taille={20} trait={2} /><span>Hors ligne. Dernières données reçues le {instantComplet(instant).replace(', ', ' à ')}. Lecture seule : la recherche porte sur ces données et aucune action sensible n’est possible.</span></div>{/if}

  {#if vue === 'erreur'}
    <div class="carte erreur" role="alert">
      <div class="row g12 err"><Icone nom="alerte" taille={24} trait={2} /><h2>Impossible de charger les droits de voyage.</h2></div>
      <p class="corps-p">Le serveur n’a pas répondu. Aucune donnée n’a été modifiée. Réessayez ; si l’erreur persiste, communiquez le code de corrélation à l’équipe technique.</p>
      <p class="t-aide">Code de corrélation : <span class="mono code">ERR-DEMO-4F2A</span></p>
      <button type="button" class="btn sm" onclick={reessayer}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>Réessayer</button>
    </div>
  {:else if vue === 'chargement'}
    <div aria-busy="true" class="col g16">
      <p role="status" class="chg">Chargement des droits de voyage…</p>
      <div class="carte sq-filtres" aria-hidden="true"><span class="sq" style="width:34%;height:48px"></span><span class="sq" style="width:22%;height:48px"></span><span class="sq" style="width:22%;height:48px"></span></div>
      <div class="carte sq-table" aria-hidden="true">{#each [0, 1, 2, 3, 4, 5] as r (r)}<div class="sq-ligne">{#each [12, 16, 10, 10, 12, 12, 14, 14] as w, i (i)}<span style="flex:0 0 {w}%"><span class="sq" style="width:100%;height:14px"></span></span>{/each}</div>{/each}</div>
    </div>
  {:else}
    <div class="col g16">
      <div class="carte filtres" role="search" aria-label="Rechercher un droit de voyage">
        <div class="champ-q"><label for="q">Référence, PNR, compte ou vol</label>
          <div class="rel"><span class="loupe" aria-hidden="true"><Icone nom="chercher" taille={18} /></span><input id="q" name="q" type="search" bind:value={q} autocomplete="off" aria-describedby="q-aide" /></div>
          <span id="q-aide" class="aide">Exemples : NXG-9PL3, Q7RT2M, ACC-0412, 812</span></div>
        <div class="champ-s"><label for="f-statut">Statut</label><div class="rel"><select id="f-statut" name="statut" bind:value={statut}>{#each STATUTS as o (o.v)}<option value={o.v}>{o.l}</option>{/each}</select>{@render chevron()}</div></div>
        <div class="champ-s"><label for="f-canal">Canal</label><div class="rel"><select id="f-canal" name="canal" bind:value={canal}>{#each CANAUX as o (o.v)}<option value={o.v}>{o.l}</option>{/each}</select>{@render chevron()}</div></div>
        <button type="button" class="reinit" onclick={reinitialiser}>Réinitialiser</button>
      </div>

      <div class="compte"><p id="compte" role="status" aria-live="polite">{compteDroits(lignes.length)}</p><p class="t-sec">Tri : départ le plus proche. Fuseau de chaque départ indiqué (UTC−4 ou UTC−5).</p></div>

      {#if lignes.length === 0}
        <div class="carte vide"><span class="loupe-v" aria-hidden="true"><Icone nom="chercher" taille={32} trait={1.5} /></span><h2>Aucun droit ne correspond à votre recherche</h2><p class="corps-p">Vérifiez la référence, le PNR, le compte ou le vol, ou retirez un filtre.</p><button type="button" class="btn sec sm" onclick={reinitialiser}>Réinitialiser les filtres</button></div>
      {:else}
        <div class="boite" tabindex="-1">
          <table>
            <caption class="sr">Droits de voyage du registre : référence, trajet et vol, départ, détenteur, statut, canal, échéance de nommage et dernier événement.</caption>
            <thead><tr><th scope="col" class="p16">Référence</th><th scope="col">Trajet et vol</th><th scope="col">Départ</th><th scope="col">Détenteur</th><th scope="col">Statut</th><th scope="col">Canal</th><th scope="col">Échéance de nommage</th><th scope="col">Dernier événement</th></tr></thead>
            <tbody>
              {#each lignes as l (l.id)}
                <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
                <tr data-droit={l.ref} onclick={(e) => { if (!(e.target as HTMLElement).closest('a')) ouvrir(l.id); }}>
                  <th scope="row" class="ref"><a href="/admin/droits/{l.id}" aria-label="Ouvrir le droit {l.ref}" onclick={(e) => { e.preventDefault(); ouvrir(l.id); }}><span class="mono r1">{l.ref}</span><span class="mono r2">PNR {l.pnr}</span></a></th>
                  <td><span class="trajet">{l.de} → {l.vers}</span><span class="sec">{l.vol}</span></td>
                  <td class="nw"><span class="v">{l.departJour}</span><span class="s">{l.departSous}</span></td>
                  <td class="mono nw">{l.detenteur}</td>
                  <td><span class="statuts"><span class="puce {classe(puce(l.statut).ton)}">{puce(l.statut).label}</span>{#if l.gele}<span class="puce err"><Icone nom="cadenas" taille={14} trait={2} />Gelé</span>{/if}</span></td>
                  <td>{l.canal}</td>
                  <td class="nw"><span class="v" class:jaune={l.urgente}>{l.echeance}</span><span class="s">{l.echeanceSous}</span></td>
                  <td><span class="v nw">{l.evenement}</span><span class="s">{l.evenementDate}</span></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
      <p class="t-aide note">Le statut « À nommer » est un statut d’affichage d’un droit détenu dont l’échéance approche. « Gelé » est un indicateur distinct du statut <span class="h">[H]</span>. Cliquez une ligne pour ouvrir la chaîne de détention du droit.</p>
    </div>
  {/if}
</Console>

<style>
  h2 { font: 700 20px/26px 'Barlow', sans-serif; }
  .avis { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 14px; background: var(--accent-soft); color: var(--accent); font: 600 14px/20px 'Barlow', sans-serif; } .avis :global(svg) { margin-top: 1px; }
  .corps-p { font-size: 15px; line-height: 22px; color: var(--ink2); max-width: 640px; } .err { color: var(--err); } .code { color: var(--ink); }
  .erreur { padding: 24px; display: flex; flex-direction: column; align-items: flex-start; gap: 12px; } .erreur .btn { min-height: 48px; border-radius: 14px; }
  .chg { font: 600 14px/20px 'Barlow', sans-serif; color: var(--ink2); }
  .sq { display: block; max-width: 100%; border-radius: 6px; background: var(--surface3); animation: nx-pulse 1.4s ease-in-out infinite; }
  .sq-filtres { display: flex; flex-wrap: wrap; gap: 12px 16px; } .sq-table { padding: 0; overflow: hidden; } .sq-ligne { display: flex; gap: 16px; padding: 18px 16px; border-top: 1px solid var(--line); } .sq-ligne:first-child { border-top: 0; }
  .carte.filtres { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px 16px; }
  .champ-q { flex: 2 1 360px; min-width: 0; display: flex; flex-direction: column; gap: 6px; } .champ-s { flex: 1 1 190px; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  label { font: 500 13px/18px 'Barlow', sans-serif; color: var(--ink2); } .aide { font-size: 12px; line-height: 17px; color: var(--ink3); }
  .rel { position: relative; }
  input, select { width: 100%; height: 48px; padding: 0 14px; border-radius: 12px; background: var(--surface2); border: 1px solid #6b7282; color: var(--ink); font-size: 15px; }
  input[type='search'] { padding-left: 42px; appearance: none; -webkit-appearance: none; } select { appearance: none; -webkit-appearance: none; padding-right: 40px; cursor: pointer; }
  .loupe { position: absolute; left: 14px; top: 15px; display: flex; color: var(--ink3); pointer-events: none; } .chev { position: absolute; right: 12px; top: 14px; display: flex; color: var(--ink2); pointer-events: none; }
  .reinit { min-height: 44px; padding: 0 8px; background: transparent; border: 0; color: var(--accent); font: 600 14px/1 'Barlow', sans-serif; cursor: pointer; }
  .compte { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 16px; } .compte p:first-child { font: 600 14px/20px 'Barlow', sans-serif; } .compte .t-sec { font-size: 13px; }
  .vide { padding: 40px 24px; display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; } .loupe-v { color: var(--ink3); display: flex; } .vide .btn { min-height: 48px; border-radius: 14px; }
  .boite { position: relative; overflow-x: auto; max-width: 100%; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
  table { width: 100%; min-width: 1180px; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  thead th { padding: 12px 8px 10px; text-align: left; font: 700 11px/16px 'Barlow', sans-serif; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink3); white-space: nowrap; } thead th.p16 { padding-left: 16px; }
  td, th.ref { border-top: 1px solid var(--line); vertical-align: middle; } td { padding: 8px; font-size: 14px; } tbody tr { cursor: pointer; } tbody tr:hover { background: var(--surface2); }
  th.ref { padding: 0; text-align: left; font-weight: inherit; } th.ref a { display: flex; flex-direction: column; justify-content: center; gap: 2px; min-height: 64px; padding: 8px 8px 8px 16px; color: var(--accent); }
  th.ref a:focus-visible { outline-offset: -3px; } .r1 { font-weight: 600; font-size: 15px; } .r2 { font-size: 12px; color: var(--ink3); font-weight: 400; }
  .trajet { display: block; font: 700 20px/22px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; white-space: nowrap; } .sec { font-size: 13px; color: var(--ink2); white-space: nowrap; }
  .v { display: block; font-size: 14px; font-weight: 600; } .s { font-size: 12px; color: var(--ink3); } .jaune { color: var(--accent); } .nw { white-space: nowrap; }
  td.mono { font-size: 14px; font-weight: 400; } .statuts { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
  .note { max-width: 1100px; } .h { color: var(--ink2); }
.puce.bleu { background: rgba(98, 199, 255, 0.12); color: var(--up); }
</style>
