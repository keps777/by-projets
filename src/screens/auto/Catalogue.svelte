<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Voiture from './Voiture.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { apportMinimum, autoDisponible, plafondAuto, simuler } from '../../core/auto.ts';
  import { fcfa } from '../../core/money.ts';
  import { TAGS_ETAT, auto } from './etat.ts';
  import { catalogue, choisirVehicule, dossierOuvert, entreeSimulation, niveauMembre } from './actions.ts';

  auto();
  const niveau = $derived(niveauMembre());
  $effect(() => { if (!autoDisponible(niveau)) aller('/auto', { remplacer: true }); });

  const FILTRES = [{ id: '', nom: 'Tous' }, { id: 'voiture', nom: 'Voitures' }, { id: 'moto', nom: 'Motos' }] as const;
  let filtre = $state<'' | 'voiture' | 'moto'>('');
  let i = $state(0);
  const liste = $derived(catalogue(filtre || undefined));
  const v = $derived(liste.length ? liste[Math.min(i, liste.length - 1)] : undefined);
  const bloque = $derived(dossierOuvert()?.signeLe != null);
  const dessus = $derived(v ? v.prix > plafondAuto(niveau) : false);
  const des = $derived(v ? simuler(entreeSimulation(v.prix, apportMinimum(v.prix, niveau), 36, 'tous_risques')).mensualite : 0);

  const choisir = (f: '' | 'voiture' | 'moto') => { filtre = f; i = 0; };
  const suivant = () => { if (liste.length) i = (i + 1) % liste.length; };
  const precedent = () => { if (liste.length) i = (i - 1 + liste.length) % liste.length; };
  let x0: number | null = null;
  const fin = (e: PointerEvent) => { if (x0 == null) return; const dx = e.clientX - x0; x0 = null; if (dx < -50) suivant(); else if (dx > 50) precedent(); };
  const simulerCe = () => {
    if (!v) return;
    const e = choisirVehicule(v.id);
    if (e) montrer(e, 'danger'); else aller('/auto/simulation');
  };
</script>

<Ecran titre="Choisir un véhicule" sur="Étape 1 / 5 · budget max {fcfa(plafondAuto(niveau))}" retourVers="/auto">
  <div class="filtres" role="group" aria-label="Type de véhicule">
    {#each FILTRES as f (f.id)}<button class:on={filtre === f.id} aria-pressed={filtre === f.id} onclick={() => choisir(f.id)}>{f.nom}</button>{/each}
  </div>

  {#if v}
    <article class="fiche" onpointerdown={(e) => (x0 = e.clientX)} onpointerup={fin} onpointercancel={() => (x0 = null)} aria-roledescription="carte" aria-label="{v.titre}, {i + 1} sur {liste.length}">
      <div class="haut"><span class="tag" style:--c={TAGS_ETAT[v.etat].couleur}>{TAGS_ETAT[v.etat].libelle}</span><span class="num mono">{Math.min(i, liste.length - 1) + 1} / {liste.length}</span></div>
      <div class="photo"><Voiture type={v.type} couleur={v.couleur} titre={v.titre} /></div>
      <h2>{v.titre}</h2>
      <p class="muted meta">{v.meta}</p>
      <div class="prix">
        <div><small>Prix</small><b class="mono">{fcfa(v.prix)} <i>FCFA</i></b></div>
        <div class="d"><small>Dès</small><b class="mono">{fcfa(des)} <i>/ mois</i></b></div>
      </div>
      {#if dessus}<p class="alerte" role="note">Au-dessus de votre plafond : apport minimum {fcfa(apportMinimum(v.prix, niveau))} FCFA.</p>{/if}
    </article>
    <div class="nav">
      <button class="rond" onclick={precedent} aria-label="Véhicule précédent"><Icone nom="retour" taille={18} trait={2.2} /></button>
      <span class="muted indic">← glissez pour passer au suivant →</span>
      <button class="passer" onclick={suivant}>Passer<Icone nom="suivant" taille={16} trait={2.2} /></button>
    </div>
  {:else}
    <div class="vide" role="status"><Icone nom="auto" taille={28} /><b>Aucun véhicule dans cette catégorie</b><small class="muted">Les concessionnaires partenaires publient régulièrement de nouveaux véhicules.</small></div>
  {/if}

  <p class="note"><Icone nom="info" taille={16} /><span>Tous les véhicules sont contrôlés par un garage partenaire. Mensualités pour 36 mois, assurance comprise.</span></p>
  {#if bloque}<p class="alerte" role="alert">Vous avez déjà un financement signé en cours de livraison. <a href="/auto/livraison" onclick={(e) => { e.preventDefault(); aller('/auto/livraison'); }}>Suivre ma livraison</a></p>{/if}

  {#snippet pied()}<Bouton onclick={simulerCe} desactive={!v || bloque}>{v ? `Simuler ${v.court}` : 'Simuler'}<Icone nom="fleche" taille={18} trait={2.2} /></Bouton>{/snippet}
</Ecran>

<style>
  .filtres { display: flex; gap: 8px; } .filtres button { min-height: 44px; padding: 0 18px; border-radius: 99px; background: var(--carte); border: 1px solid var(--ligne); color: var(--muted); font-weight: 550; }
  .filtres .on { background: var(--primaire-fond); border-color: var(--primaire); color: var(--texte); }
  .fiche { touch-action: pan-y; user-select: none; padding: 16px; border-radius: 26px; background: linear-gradient(170deg, var(--carte2), var(--carte)); border: 1px solid var(--ligne-forte); display: flex; flex-direction: column; gap: 6px; }
  .haut { display: flex; justify-content: space-between; align-items: center; } .num { color: var(--muted); font-size: 12px; }
  .tag { font: 600 10.5px var(--mono); letter-spacing: 0.1em; padding: 4px 10px; border-radius: 99px; color: var(--c); background: color-mix(in srgb, var(--c) 16%, transparent); }
  .photo { padding: 10px 6px 2px; border-radius: 18px; background: radial-gradient(circle at 50% 70%, color-mix(in srgb, var(--primaire) 22%, transparent), transparent 70%); }
  h2 { font-size: 21px; margin-top: 4px; } .meta { font-size: 13px; }
  .prix { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 10px; padding-top: 12px; border-top: 1px solid var(--ligne); } .prix div { display: flex; flex-direction: column; gap: 2px; } .d { text-align: right; }
  small { color: var(--muted); font: 500 10.5px var(--mono); letter-spacing: 0.1em; text-transform: uppercase; } b.mono { font-size: 20px; } i { font-style: normal; font-size: 12px; color: var(--muted); font-weight: 400; }
  .nav { display: flex; align-items: center; gap: 10px; } .indic { flex: 1; text-align: center; font-size: 11px; }
  .rond { width: 44px; height: 44px; border-radius: 22px; background: var(--carte); border: 1px solid var(--ligne); display: grid; place-items: center; }
  .passer { display: inline-flex; align-items: center; gap: 4px; min-height: 44px; padding: 0 12px; color: var(--primaire-clair); font-weight: 600; }
  .note { display: flex; gap: 8px; align-items: flex-start; color: var(--muted); font-size: 12.5px; } .note :global(svg) { flex: none; margin-top: 1px; }
  .alerte { color: var(--alerte); font-size: 13px; } .alerte a { text-decoration: underline; }
  .vide { display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; padding: 40px 16px; border-radius: 22px; background: var(--carte); border: 1px dashed var(--ligne-forte); }
</style>
