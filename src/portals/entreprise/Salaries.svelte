<script lang="ts">
  import { fcfa } from '../../core/money.ts';
  import { PRIX_PASS } from '../../core/sante.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { annulerInvitation, relancer } from './actions.ts';
  import { ent } from './etat.ts';
  import type { Nav } from './types.ts';
  import type { LigneSalarie, StatutAffiche } from './vues.ts';
  import Statut from './Statut.svelte';

  let { ls, nav }: { ls: LigneSalarie[]; nav: Nav } = $props();
  type Filtre = 'Tous' | StatutAffiche;
  const FILTRES: Filtre[] = ['Tous', 'Validé', 'Plafonné', 'Nouveau', 'Invité'];
  let q = $state('');
  let filtre: Filtre = $state('Tous');
  let tri: 'nom' | 'montant' | 'statut' = $state('nom');
  let sens = $state(1);
  const invitations = $derived(ent().invitations);

  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const lignes = $derived.by(() => {
    const t = norm(q.trim());
    const r = ls.filter((l) => (filtre === 'Tous' || l.affiche === filtre) && (!t || norm(`${l.nom} ${l.matricule} ${l.services} ${l.telephone}`).includes(t)));
    const cle = (l: LigneSalarie) => (tri === 'nom' ? norm(l.nom) : tri === 'montant' ? l.retenue.total : l.affiche);
    return r.sort((a, b) => (cle(a) < cle(b) ? -1 : cle(a) > cle(b) ? 1 : 0) * sens);
  });
  const trier = (k: typeof tri) => () => { if (tri === k) sens = -sens; else { tri = k; sens = 1; } };
  const aria = (k: typeof tri) => (tri === k ? (sens === 1 ? 'ascending' : 'descending') : 'none');
  const fleche = (k: typeof tri) => (tri === k ? (sens === 1 ? '↑' : '↓') : '');
  const nbPar = (f: Filtre) => (f === 'Tous' ? ls.length : ls.filter((l) => l.affiche === f).length);
  const niveauLib = (l: LigneSalarie) => (l.niveau ? l.niveau[0] + l.niveau.slice(1).toLowerCase() : '—');
</script>

<div class="titre">
  <div><h1>Salariés</h1><p class="doux">{ls.filter((l) => l.statut !== 'invite').length} salarié{ls.filter((l) => l.statut !== 'invite').length > 1 ? 's' : ''} inscrit{ls.filter((l) => l.statut !== 'invite').length > 1 ? 's' : ''}. Ouvrez une ligne pour le détail.</p></div>
  <div class="boutons"><button class="btn" onclick={() => nav.importer()}>Importer un CSV</button><button class="btn prim" onclick={() => nav.inviter()}>Inviter des salariés</button></div>
</div>

<section class="carte" aria-label="Liste des salariés">
  <div class="outils">
    <label class="rech"><span class="sr">Rechercher un salarié</span><input class="entree" type="search" placeholder="Rechercher (nom, matricule, téléphone)" bind:value={q} /></label>
    <div class="puces" role="group" aria-label="Filtrer par statut">
      {#each FILTRES as f (f)}<button class="filtre" class:on={filtre === f} aria-pressed={filtre === f} onclick={() => (filtre = f)}>{f} <span class="mono">{nbPar(f)}</span></button>{/each}
    </div>
  </div>

  {#if ls.length === 0}
    <div class="vide"><p><b>Aucun salarié pour l'instant.</b></p><p>Importez un fichier CSV (nom, matricule, téléphone) ou invitez vos salariés par SMS avec le code de l'entreprise.</p></div>
  {:else if lignes.length === 0}
    <div class="vide"><p>Aucun salarié ne correspond à cette recherche.</p><button class="btn" onclick={() => { q = ''; filtre = 'Tous'; }}>Effacer les filtres</button></div>
  {:else}
    <div class="tableau"><table>
      <caption class="sr">Salariés de l'entreprise : statut, niveau, Pass et retenue mensuelle</caption>
      <thead><tr>
        <th scope="col" aria-sort={aria('nom')}><button onclick={trier('nom')}>Salarié {fleche('nom')}</button></th>
        <th scope="col" class="opt">Services</th><th scope="col" class="opt">Pass</th><th scope="col" class="opt">Niveau</th>
        <th scope="col" class="num" aria-sort={aria('montant')}><button onclick={trier('montant')}>Retenue {fleche('montant')}</button></th>
        <th scope="col" aria-sort={aria('statut')}><button onclick={trier('statut')}>Statut {fleche('statut')}</button></th>
      </tr></thead>
      <tbody>
        {#each lignes as l (l.id)}
          <tr>
            <th scope="row" class="nom"><button class="ouvrir" onclick={() => nav.ouvrirFiche(l.id)} aria-label="Ouvrir la fiche de {l.nom}"><b>{l.nom}{#if l.membre} <span class="puce">Vous</span>{/if}</b><small class="doux mono">{l.matricule}</small></button></th>
            <td class="opt doux">{l.services}</td>
            <td class="opt">{l.pass ? `${l.pass[0].toUpperCase()}${l.pass.slice(1)}` : '—'}</td>
            <td class="opt">{niveauLib(l)}</td>
            <td class="num mono">{l.statut === 'invite' ? '—' : fcfa(l.retenue.total)}</td>
            <td><Statut statut={l.affiche} /></td>
          </tr>
        {/each}
      </tbody>
    </table></div>
    <p class="doux compte" aria-live="polite">{lignes.length} salarié{lignes.length > 1 ? 's' : ''} affiché{lignes.length > 1 ? 's' : ''} sur {ls.length}. Prix des Pass : {Object.entries(PRIX_PASS).map(([p, v]) => `${p} ${fcfa(v)}`).join(' · ')}.</p>
  {/if}
</section>

<section class="carte" aria-labelledby="h-inv">
  <h2 id="h-inv">Invitations en attente ({invitations.length})</h2>
  {#if invitations.length === 0}
    <p class="doux">Aucune invitation en attente. Chaque salarié invité reçoit un SMS avec le code de l'entreprise.</p>
  {:else}
    <ul class="invs">
      {#each invitations as i (i.id)}
        <li><span class="mono">+237 {i.telephone}</span><span class="doux">{i.relances ? `Relancé ${i.relances} fois` : 'Invité'} · {new Date(i.envoyee).toLocaleDateString('fr-FR')}</span>
          <span class="act"><button class="btn" onclick={() => { relancer(i.id); montrer('Relance envoyée par SMS (simulation)'); }}>Relancer</button>
          <button class="btn" onclick={() => { annulerInvitation(i.id); montrer('Invitation annulée'); }} aria-label="Annuler l'invitation de {i.telephone}">Annuler</button></span></li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .titre { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; flex-wrap: wrap; } .boutons { display: flex; gap: 10px; flex-wrap: wrap; }
  .outils { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 14px; } .rech { flex: 1 1 260px; }
  .puces { display: flex; gap: 8px; flex-wrap: wrap; }
  .filtre { min-height: 44px; padding: 0 14px; border-radius: 99px; border: 1px solid var(--ligne-forte); background: var(--carte); font-weight: 500; } .filtre.on { background: var(--texte); color: var(--carte); border-color: transparent; }
  th button { font: inherit; letter-spacing: inherit; text-transform: inherit; color: inherit; min-height: 44px; } .nom { font-weight: inherit; text-transform: none; letter-spacing: 0; font-family: var(--sans); font-size: 14px; background: none; color: var(--texte); }
  .ouvrir { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left; min-height: 44px; justify-content: center; width: 100%; } .ouvrir:hover b { color: var(--primaire); text-decoration: underline; }
  .compte { margin-top: 10px; font-size: 13px; } tbody tr:last-child .nom { border-bottom: 0; }
  .vide { text-align: center; padding: 32px 12px; display: flex; flex-direction: column; gap: 10px; align-items: center; }
  .invs { list-style: none; display: flex; flex-direction: column; margin-top: 8px; } .invs li { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; padding: 8px 0; border-bottom: 1px solid var(--ligne); } .invs li:last-child { border: 0; }
  .act { margin-left: auto; display: flex; gap: 8px; }
  @media (max-width: 700px) { .opt { display: none; } }
</style>
