<script lang="ts">
  import Tiroir from './Tiroir.svelte';
  import FormPublication from './FormPublication.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { COLONNES, NOM_COLONNE, piecesCompletes, verifierTransition, type Etape } from '../../core/auto.ts';
  import { jourCourt, jourDe } from '../../core/dates.ts';
  import { fcfa } from '../../core/money.ts';
  import { CONCESSION, TAGS_ETAT, auto, type Dossier } from '../../screens/auto/etat.ts';
  import { LIBELLE_AVANCER, avancer, basculerAssurance, basculerVehicule, clos, livrees, releveCsv, statsMois, supprimerVehicule } from '../../screens/auto/actions.ts';

  const t = auto();
  type Onglet = 'demandes' | 'vehicules' | 'paiements';
  const ONGLETS: { id: Onglet; nom: string; titre: string; sous: string }[] = [
    { id: 'demandes', nom: 'Demandes de financement', titre: 'Demandes de financement', sous: 'Vous êtes payé par AssureMe à la livraison du véhicule. Le client rembourse sur son salaire.' },
    { id: 'vehicules', nom: 'Véhicules publiés', titre: 'Véhicules publiés', sous: 'Ce que vos clients voient dans le catalogue AssureMe.' },
    { id: 'paiements', nom: 'Paiements reçus', titre: 'Paiements reçus', sous: 'Versés par AssureMe le jour de la livraison.' }
  ];
  let onglet = $state<Onglet>('demandes');
  let q = $state('');
  let selection = $state<string | null>(null);
  let menu = $state(false);
  let publication = $state(false);
  let glisse = $state<string | null>(null);
  let survol = $state<Etape | null>(null);
  let aSupprimer = $state<string | null>(null);
  const actuel = $derived(ONGLETS.find((o) => o.id === onglet)!);

  const filtre = (d: Dossier) => { const s = q.trim().toLowerCase(); return !s || `${d.client} ${d.vehiculeTitre}`.toLowerCase().includes(s); };
  const colonnes = $derived(COLONNES.map((e) => ({ etape: e, nom: NOM_COLONNE[e], tout: t.dossiers.filter((d) => d.etape === e), cartes: t.dossiers.filter((d) => d.etape === e && filtre(d)) })));
  const fermes = $derived(clos());
  const stats = $derived(statsMois());
  const stock = $derived(t.vehicules.filter((v) => v.concession === CONCESSION));
  const recus = $derived(livrees());
  const mois = $derived(new Intl.DateTimeFormat('fr-FR', { month: 'long' }).format(new Date()));

  const meta = (d: Dossier): [string, string] => {
    if (d.etape === 'nouvelle') return [d.score ? `Score ${d.score}` : 'Nouvelle', 'info'];
    if (d.etape === 'etude') return piecesCompletes(d.docs) ? ['Analyse en cours', 'neutre'] : ['Pièces à fournir', 'alerte'];
    if (d.etape === 'accordee') return [d.signeLe ? 'Accordé · contrat signé' : 'Accordé · signature en attente', 'info'];
    return [d.livreLe ? jourCourt(jourDe(new Date(d.livreLe))) : '', 'info'];
  };
  function avance(d: Dossier) { const r = avancer(d.id); if ('erreur' in r) montrer(r.erreur, 'danger'); else montrer(r.ok); }
  function depose(vers: Etape) {
    const id = glisse; glisse = null; survol = null; if (!id) return;
    const d = t.dossiers.find((x) => x.id === id); if (!d || d.etape === vers) return;
    const e = verifierTransition(d, vers); if (e) { montrer(e, 'danger'); return; }
    avance(d);
  }
  function exporter() {
    try {
      const url = URL.createObjectURL(new Blob(['﻿' + releveCsv()], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = 'releve-paiements-auto.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      montrer('Relevé des paiements exporté');
    } catch { montrer("L'export n'est pas disponible sur cet appareil", 'danger'); }
  }
  function toggleAssurance() { montrer(basculerAssurance() ? "L'assurance tous risques sera proposée avec chaque accord" : 'Offre assurance retirée'); }
  function supprimer(id: string) { const e = supprimerVehicule(id); aSupprimer = null; montrer(e ?? 'Véhicule retiré du stock', e ? 'danger' : 'bon'); }
  function bascule(id: string) { const m = basculerVehicule(id); if (m) montrer(m); }
  const aller_ = (o: Onglet) => { onglet = o; menu = false; };
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (menu = false)} />

<div class="portail">
  <header class="barre">
    <div class="marque"><span class="logo" aria-hidden="true">A</span><b>AssureMe</b><span class="sep">Mobilité · {CONCESSION}</span></div>
    <div class="actions">
      <button class="publier" onclick={() => (publication = true)}>+ Publier un véhicule</button>
      <div class="compte">
        <button class="avatar" onclick={() => (menu = !menu)} aria-label="Menu du compte" aria-expanded={menu} aria-haspopup="menu">AB</button>
        {#if menu}
          <div class="menu" role="menu">
            <b>{CONCESSION}</b><small>Concessionnaire partenaire</small>
            <button role="menuitem" onclick={() => aller_('paiements')}>Paiements reçus</button>
            <button role="menuitem" onclick={() => aller('/')}>Quitter le portail</button>
          </div>
        {/if}
      </div>
    </div>
  </header>

  <div class="onglets" role="tablist" aria-label="Sections du portail">
    {#each ONGLETS as o (o.id)}<button role="tab" id="tab-{o.id}" aria-selected={onglet === o.id} aria-controls="panneau" class:on={onglet === o.id} onclick={() => aller_(o.id)}>{o.nom}</button>{/each}
  </div>

  <main><div id="panneau" role="tabpanel" aria-labelledby="tab-{onglet}">
    <div class="titre"><div><h1>{actuel.titre}</h1><p class="muted">{actuel.sous}</p></div>
      {#if onglet === 'demandes'}<label class="recherche"><span class="sr">Rechercher une demande</span><input bind:value={q} placeholder="Client ou véhicule" type="search" /></label>{/if}
    </div>

    {#if onglet === 'demandes'}
      <section class="stats" aria-label="Chiffres du mois">
        <button onclick={() => aller_('paiements')}><small>Ventes financées en {mois}</small><b class="mono">{stats.ventes}</b></button>
        <button onclick={() => aller_('paiements')}><small>Montant reçu de AssureMe</small><b class="mono">{fcfa(stats.montant)}</b></button>
        <div><small>Délai moyen d'accord</small><b class="mono">48 h</b></div>
      </section>

      <div class="kanban">
        {#each colonnes as col (col.etape)}
          <section class="col" class:sur={survol === col.etape && glisse !== null} aria-label="{col.nom}, {col.tout.length} demande{col.tout.length > 1 ? 's' : ''}"
            ondragover={(e) => { e.preventDefault(); survol = col.etape; }} ondragleave={() => { if (survol === col.etape) survol = null; }} ondrop={(e) => { e.preventDefault(); depose(col.etape); }}>
            <h2>{col.nom} <span class="mono n">{col.tout.length}</span></h2>
            {#each col.cartes as d (d.id)}
              {@const m = meta(d)}
              <div class="dossier" class:accorde={d.etape === 'accordee'} class:choisi={selection === d.id} class:glisse={glisse === d.id} draggable="true" role="group" aria-label="{d.client}, {d.vehiculeTitre}"
                ondragstart={(e) => { glisse = d.id; e.dataTransfer?.setData('text/plain', d.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; }} ondragend={() => { glisse = null; survol = null; }}>
                <button class="ouvrir" onclick={() => (selection = d.id)}>
                  <b>{d.client}{#if d.membre}<span class="app">App</span>{/if}</b>
                  <span>{d.vehiculeTitre}</span>
                  <span class="mt"><span class="muted">{d.etape === 'livree' ? 'Payé' : 'Financé'}</span> <b class="mono">{fcfa(d.financement)}</b></span>
                  <span class="meta {m[1]}">{m[0]}</span>
                </button>
                {#if LIBELLE_AVANCER[d.etape]}<button class="avance" class:fin={d.etape === 'accordee'} onclick={() => avance(d)}>{LIBELLE_AVANCER[d.etape]}</button>{/if}
              </div>
            {:else}<p class="vide">{q ? 'Aucun résultat' : 'Aucune demande ici'}</p>{/each}
          </section>
        {/each}
      </div>
      <p class="muted aide">Glissez une demande d'une colonne à l'autre, ou utilisez le bouton de la carte.</p>

      <button class="assurance" class:on={t.assuranceProposee} aria-pressed={t.assuranceProposee} onclick={toggleAssurance}>
        <span><b>Assurance auto :</b> proposez au client la couverture tous risques de [ASSUREUR AGRÉÉ CIMA], ajoutée à sa mensualité.</span>
        <span class="bascule">{t.assuranceProposee ? 'Proposée ✓' : 'Proposer'}</span>
      </button>

      {#if fermes.length}
        <section class="fermes"><h2>Dossiers clos <span class="mono n">{fermes.length}</span></h2>
          <ul>{#each fermes as d (d.id)}<li><button onclick={() => (selection = d.id)}><b>{d.client}</b> · {d.vehiculeTitre} <span class="meta {d.etape === 'refusee' ? 'alerte' : 'neutre'}">{NOM_COLONNE[d.etape]}</span> <span class="muted">{d.motifRefus ?? ''}</span></button></li>{/each}</ul>
        </section>
      {/if}

    {:else if onglet === 'vehicules'}
      <section class="liste" aria-label="Stock">
        {#each stock as v (v.id)}
          <div class="ligne">
            <div class="info"><b>{v.titre}</b><span class="muted">{v.vendu ? 'Vendu' : v.publie ? 'Visible dans le catalogue' : 'Masqué'} · {TAGS_ETAT[v.etat].libelle.toLowerCase()}{v.controle ? '' : ' · contrôle garage à faire'}</span></div>
            <b class="mono prix">{fcfa(v.prix)} FCFA</b>
            {#if v.vendu}<span class="statut vendu">Vendu</span>
            {:else}<button class="statut" class:on={v.publie} aria-pressed={v.publie} onclick={() => bascule(v.id)}>{v.publie ? 'Publié' : 'Brouillon'}</button>{/if}
            {#if aSupprimer === v.id}
              <span class="conf"><button class="danger" onclick={() => supprimer(v.id)}>Confirmer</button><button onclick={() => (aSupprimer = null)}>Non</button></span>
            {:else if !v.vendu}<button class="suppr" onclick={() => (aSupprimer = v.id)} aria-label="Retirer {v.titre} du stock">Retirer</button>{/if}
          </div>
        {:else}<p class="vide">Aucun véhicule en stock. Publiez votre premier véhicule.</p>{/each}
      </section>

    {:else}
      <section class="liste" aria-label="Paiements reçus">
        <div class="entete-liste"><b>Paiements reçus à la livraison</b><button class="export" onclick={exporter} disabled={!recus.length}>Exporter le relevé</button></div>
        {#each recus as d (d.id)}
          <button class="ligne paiement" onclick={() => (selection = d.id)}>
            <span class="info"><b>{d.client}</b><span class="muted">{d.vehiculeTitre}</span></span>
            <span class="droite"><b class="mono">{fcfa(d.financement)} FCFA</b><span class="muted">Reçu le {d.livreLe ? jourCourt(jourDe(new Date(d.livreLe))) : ''}</span></span>
          </button>
        {:else}<p class="vide">Aucun paiement reçu pour l'instant.</p>{/each}
      </section>
    {/if}
  </div></main>
</div>

{#if selection}<Tiroir id={selection} fermer={() => (selection = null)} />{/if}
{#if publication}<FormPublication fermer={() => (publication = false)} publie={() => (onglet = 'vehicules')} />{/if}

<style>
  .portail { padding: 0 24px 48px; color: var(--texte); } .muted { color: var(--muted); } small { font: 500 11px var(--mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); } .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .barre { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 0; flex-wrap: wrap; }
  .marque { display: flex; align-items: center; gap: 10px; } .logo { width: 32px; height: 32px; border-radius: 10px; background: var(--primaire); color: #fff; display: grid; place-items: center; font-weight: 800; } .sep { color: var(--muted); padding-left: 10px; border-left: 1px solid var(--ligne-forte); font-size: 14px; }
  .actions { display: flex; align-items: center; gap: 12px; } .publier { min-height: 44px; padding: 0 18px; border-radius: 12px; background: #0b0f1a; color: #fff; font-weight: 650; }
  .compte { position: relative; } .avatar { width: 44px; height: 44px; border-radius: 22px; background: #ebeeff; color: var(--primaire); font-weight: 700; }
  .menu { position: absolute; right: 0; top: 52px; z-index: 20; width: 240px; padding: 14px; display: flex; flex-direction: column; gap: 4px; background: var(--carte); border-radius: 14px; box-shadow: var(--ombre); border: 1px solid var(--ligne); } .menu button { min-height: 44px; text-align: left; border-radius: 8px; padding: 0 8px; } .menu button:hover { background: var(--carte2); }
  .onglets { display: flex; gap: 6px; border-bottom: 1px solid var(--ligne); overflow-x: auto; } .onglets button { min-height: 48px; padding: 0 16px; white-space: nowrap; color: #2a3142; border-bottom: 3px solid transparent; } .onglets .on { color: var(--primaire); font-weight: 700; border-bottom-color: var(--primaire); background: #ebeeff; border-radius: 10px 10px 0 0; }
  .titre { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin: 22px 0 16px; } h1 { font-size: 26px; } .recherche input { min-height: 44px; width: min(100%, 280px); padding: 0 14px; border-radius: 12px; border: 1px solid var(--ligne-forte); background: var(--carte); }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 18px; } .stats > * { text-align: left; display: flex; flex-direction: column; gap: 6px; padding: 16px; border-radius: 16px; background: var(--carte); border: 1px solid var(--ligne); } .stats b { font-size: 26px; }
  .kanban { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; align-items: start; }
  .col { padding: 12px; border-radius: 18px; background: #eceef4; border: 2px solid transparent; display: flex; flex-direction: column; gap: 10px; min-height: 140px; } .col.sur { background: #e3e8ff; border: 2px dashed var(--primaire); }
  .col h2 { font-size: 13px; font-weight: 700; display: flex; justify-content: space-between; align-items: center; } .n { font-size: 12px; background: var(--carte); border-radius: 99px; padding: 2px 9px; }
  .dossier { background: var(--carte); border-radius: 14px; border: 1px solid transparent; display: flex; flex-direction: column; overflow: hidden; } .dossier.accorde { border: 2px solid var(--primaire); } .dossier.choisi { border: 2px solid var(--primaire); } .dossier.glisse { opacity: 0.4; }
  .ouvrir { display: flex; flex-direction: column; gap: 3px; text-align: left; padding: 12px; min-height: 44px; } .ouvrir b:first-child { font-size: 14.5px; } .ouvrir > span { font-size: 13px; color: var(--doux); } .mt { display: flex; gap: 6px; align-items: baseline; margin-top: 4px; }
  .app { margin-left: 6px; font: 600 9.5px var(--mono); letter-spacing: 0.06em; padding: 2px 6px; border-radius: 99px; background: #ebeeff; color: var(--primaire); vertical-align: 2px; }
  .meta { font-size: 12px; font-weight: 600; } .meta.info { color: var(--primaire); } .meta.neutre { color: #586176; } .meta.alerte { color: #8a3c05; }
  .avance { min-height: 44px; margin: 0 12px 12px; border-radius: 10px; border: 1px solid #cdd2de; background: #fff; font-weight: 650; font-size: 13.5px; } .avance.fin { background: #0b0f1a; color: #fff; border: 0; }
  .vide { color: var(--muted); font-size: 13px; text-align: center; padding: 18px 8px; border: 1px dashed var(--ligne-forte); border-radius: 12px; } .aide { margin: 14px 0; font-size: 13px; }
  .assurance { display: flex; align-items: center; justify-content: space-between; gap: 16px; width: 100%; text-align: left; padding: 14px 16px; border-radius: 14px; background: #fff3ea; color: #8a3c05; border: 1px solid transparent; min-height: 56px; } .assurance .bascule { flex: none; padding: 8px 14px; border-radius: 99px; background: #fff; font-weight: 700; border: 1px solid #e2690f; } .assurance.on .bascule { background: #e2690f; color: #fff; }
  .fermes { margin-top: 22px; } .fermes h2 { font-size: 14px; margin-bottom: 8px; } .fermes ul { list-style: none; display: flex; flex-direction: column; gap: 6px; } .fermes li button { text-align: left; width: 100%; min-height: 44px; padding: 8px 12px; border-radius: 10px; background: var(--carte); border: 1px solid var(--ligne); font-size: 13.5px; }
  .liste { display: flex; flex-direction: column; background: var(--carte); border-radius: 18px; border: 1px solid var(--ligne); padding: 6px 18px; } .entete-liste { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--ligne); }
  .ligne { display: flex; align-items: center; gap: 14px; padding: 14px 0; border-bottom: 1px solid var(--ligne); flex-wrap: wrap; text-align: left; width: 100%; } .ligne:last-child { border: 0; } .info { flex: 1; min-width: 180px; display: flex; flex-direction: column; gap: 2px; } .droite { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; } .prix { font-size: 15px; }
  .statut { min-height: 40px; padding: 0 16px; border-radius: 99px; border: 1px solid #cdd2de; color: #586176; font-weight: 650; font-size: 13px; } .statut.on { background: #ebeeff; border-color: #bac6ff; color: var(--primaire); } .statut.vendu { display: inline-flex; align-items: center; background: var(--carte2); }
  .suppr, .conf button { min-height: 40px; padding: 0 12px; border-radius: 10px; font-size: 13px; color: var(--muted); text-decoration: underline; } .conf { display: flex; gap: 4px; } .conf .danger { color: #b3261e; font-weight: 700; }
  .export { min-height: 44px; padding: 0 16px; border-radius: 10px; border: 1px solid var(--ligne-forte); font-weight: 650; } .export:disabled { opacity: 0.4; } .paiement { cursor: pointer; }
  @media (max-width: 640px) { .portail { padding: 0 14px 40px; } .sep { display: none; } h1 { font-size: 22px; } }
</style>
