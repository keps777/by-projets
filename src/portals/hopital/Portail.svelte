<script lang="ts">
  import { aller } from '../../router.svelte.ts';
  import { fcfa } from '../../core/money.ts';
  import { nomMois } from '../../core/dates.ts';
  import { statsClinique } from '../../core/sante-portail.ts';
  import { maintenant } from '../../data/store.svelte.ts';
  import type { Droits } from '../../screens/sante/actions.ts';
  import { CLINIQUE, aujourdhui, initSante, type FactureSante } from '../../screens/sante/etat.ts';
  import { facturesClinique } from './donnees.ts';
  import Factures from './Factures.svelte';
  import NouvelleFacture from './NouvelleFacture.svelte';
  import Paiements from './Paiements.svelte';
  import Prises from './Prises.svelte';
  import Tiroir from './Tiroir.svelte';
  import Verification from './Verification.svelte';
  initSante();

  type Onglet = 'accueil' | 'prises' | 'factures' | 'paiements';
  const ONGLETS: { id: Onglet; libelle: string }[] = [{ id: 'accueil', libelle: 'Accueil patients' }, { id: 'prises', libelle: 'Prises en charge' }, { id: 'factures', libelle: 'Factures' }, { id: 'paiements', libelle: 'Paiements' }];
  let onglet = $state<Onglet>('accueil'); let menu = $state(false);
  let droits = $state<Extract<Droits, { ok: true }> | null>(null); let patient = $state('');
  let sel = $state(''); let derniere = $state<{ f: FactureSante; brouillon: boolean } | null>(null);

  const toutes = $derived(facturesClinique());
  const courante = $derived(toutes.find((f) => f.id === sel));
  const stats = $derived(statsClinique(toutes.filter((f) => f.statut !== 'brouillon'), maintenant()));
  const mois = $derived(nomMois(aujourdhui()));
  const aller_ = (o: Onglet) => { onglet = o; menu = false; };
  function emise(f: FactureSante, brouillon: boolean) { derniere = { f, brouillon }; }
</script>

<div class="portail">
  <header>
    <div class="marque"><span class="logo" aria-hidden="true">A</span><span class="nom">Assure<b>Me</b></span><span class="sep"></span><span class="lieu">Santé · {CLINIQUE.nom}</span></div>
    <nav aria-label="Sections du portail">{#each ONGLETS as o (o.id)}<button class:on={onglet === o.id} aria-current={onglet === o.id ? 'page' : undefined} onclick={() => aller_(o.id)}>{o.libelle}</button>{/each}</nav>
    <div class="user"><button onclick={() => (menu = !menu)} aria-expanded={menu} aria-haspopup="menu">Accueil · Grâce M. ▾</button>
      {#if menu}<div class="menu" role="menu"><b>Grâce M.</b><small>Accueil · {CLINIQUE.nom}</small>
        <button role="menuitem" onclick={() => aller_('factures')}>Mes factures</button><button role="menuitem" onclick={() => aller('/')}>Ouvrir l'application membre</button></div>{/if}</div>
  </header>

  <main>
    {#if onglet === 'accueil'}
      <div class="grille">
        <div class="col"><Verification bind:droits bind:patient /></div>
        <div class="col">
          {#if derniere}
            <div class="ok" role="status"><b>{derniere.brouillon ? `Brouillon ${derniere.f.numero} enregistré.` : `Facture ${derniere.f.numero} validée pour ${derniere.f.patient}.`}</b>
              {#if !derniere.brouillon}<span>AssureMe paie la clinique {fcfa(derniere.f.assureMe)} FCFA. Le patient voit sa part de {fcfa(derniere.f.partPatient)} FCFA dans son application.</span>{/if}
              <span class="liens"><button onclick={() => (sel = derniere!.f.id)}>Voir la facture</button><button onclick={() => (derniere = null)}>Fermer</button></span></div>
          {/if}
          <NouvelleFacture {droits} {patient} onemise={emise} />
        </div>
      </div>
      <div class="kpis">
        <div><span>Payé par AssureMe en {mois}</span><b class="mono">{fcfa(stats.versee)}</b></div>
        <div><span>Part patient à encaisser</span><b class="mono">{fcfa(stats.aEncaisser)}</b></div>
        <div><span>Délai moyen de règlement</span><b>{stats.delaiMoyenJours === null ? '—' : `${stats.delaiMoyenJours} j`}</b></div>
      </div>
      <section class="rec"><div class="ent"><h2>Factures récentes</h2><button onclick={() => aller_('factures')}>Tout voir</button></div>
        <Factures factures={toutes} ouvrir={(id) => (sel = id)} limite={4} titre="Factures récentes" /></section>
      <p class="muted pied">Les paiements arrivent sur le compte de la clinique ou son numéro marchand Mobile Money. Contrat de tiers payant avec un assureur agréé CIMA.</p>
    {:else if onglet === 'prises'}
      <Prises factures={toutes} ouvrir={(id) => (sel = id)} nouvelle={() => aller_('accueil')} />
    {:else if onglet === 'factures'}
      <h2>Factures</h2><Factures factures={toutes} ouvrir={(id) => (sel = id)} />
    {:else}
      <Paiements factures={toutes} ouvrir={(id) => (sel = id)} />
    {/if}
  </main>
</div>
{#if courante}<Tiroir facture={courante} fermer={() => (sel = '')} />{/if}

<style>
  .portail { min-height: 100dvh; } header { background: #0b0f1a; color: #fff; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 20px; padding: 10px 20px; position: sticky; top: 0; z-index: 10; }
  .marque { display: flex; align-items: center; gap: 8px; } .logo { width: 30px; height: 30px; border-radius: 9px; background: var(--primaire); display: grid; place-items: center; font-weight: 800; } .nom { font-size: 18px; font-weight: 500; } .nom b { font-weight: 800; }
  .sep { width: 1px; height: 18px; background: rgba(255, 255, 255, 0.25); } .lieu { font-size: 13px; color: #d3d8e4; }
  nav { display: flex; flex-wrap: wrap; gap: 4px; flex: 1; } nav button, .user > button { min-height: 44px; padding: 0 14px; border-radius: 10px; color: #d3d8e4; font-size: 14px; } nav button.on { background: #161c2b; color: #fff; font-weight: 700; }
  @media (max-width: 700px) { nav { order: 3; flex: 1 0 100%; flex-wrap: nowrap; overflow-x: auto; } nav button { white-space: nowrap; } }
  .user { position: relative; } .menu { position: absolute; right: 0; top: 48px; width: 260px; background: var(--carte); color: var(--texte); border-radius: 14px; box-shadow: var(--ombre); padding: 12px; display: flex; flex-direction: column; gap: 2px; border: 1px solid var(--ligne); }
  .menu small { color: var(--muted); margin-bottom: 6px; } .menu button { min-height: 44px; text-align: left; padding: 0 10px; border-radius: 8px; color: var(--texte); } .menu button:hover { background: var(--carte2); }
  main { padding: 20px; display: flex; flex-direction: column; gap: 18px; } h2 { font-size: 18px; }
  .grille { display: grid; gap: 16px; align-items: start; grid-template-columns: minmax(0, 1fr); } .col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
  @media (min-width: 900px) { .grille { grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); } }
  .ok { display: flex; flex-direction: column; gap: 6px; padding: 14px; border-radius: 14px; background: #e2f6ec; color: #0b5a3a; font-size: 14px; } .liens { display: flex; gap: 10px; } .liens button { min-height: 44px; font-weight: 650; text-decoration: underline; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; } .kpis div { background: var(--carte); border: 1px solid var(--ligne); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 4px; } .kpis span { font-size: 12.5px; color: var(--muted); } .kpis b { font-size: 22px; }
  .rec { background: var(--carte); border: 1px solid var(--ligne); border-radius: 16px; padding: 16px; } .ent { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; } .ent button { min-height: 44px; color: var(--primaire); font-weight: 650; }
  .pied { font-size: 12.5px; }
</style>
