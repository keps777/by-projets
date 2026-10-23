<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Champ from '../../ui/Champ.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Ligne from '../../ui/Ligne.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import Etiquette from '../_services/Etiquette.svelte';
  import Choix from '../_services/Choix.svelte';
  import Vide from '../_services/Vide.svelte';
  import { MOYENS, totalEuro, type MoyenPaiement } from '../../core/diaspora.ts';
  import { EUR_FCFA, euro, fcfa, fcfaUnite, lireMontant } from '../../core/money.ts';
  import { ini2 } from '../_services/format.ts';
  import { ajouterFacture, ajouterProche, changerVille, payer, plafondMembre } from './actions.ts';
  import { totalSelection, verifierPaiement } from './calcul.ts';
  import { etat, type CategorieFacture } from './etat.ts';

  const e = etat();
  let procheId = $state(e.proches[0]?.id ?? '');
  let ids = $state<string[]>([]);
  let moyen = $state<MoyenPaiement>('visa');
  const proche = $derived(e.proches.find((p) => p.id === procheId) ?? e.proches[0]);
  const enAttente = $derived((proche?.factures ?? []).filter((f) => !f.payee));
  let touche = $state(false);
  // Au départ : première facture en attente présélectionnée (tant que le membre n'a pas touché à la sélection).
  $effect(() => { if (proche && !ids.length && enAttente.length && !touche) ids = [enAttente[0].id]; });
  const choisies = $derived(enAttente.filter((f) => ids.includes(f.id)));
  const total = $derived(totalSelection(enAttente, ids));
  const euros = $derived(totalEuro(total));
  const erreur = $derived(choisies.length ? verifierPaiement(choisies.length, total, plafondMembre()) : null);
  const peutPayer = $derived(choisies.length > 0 && !erreur);

  function pickProche(id: string) { procheId = id; touche = false; ids = []; }
  function basculer(id: string) { touche = true; ids = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]; }
  function lancer() {
    const r = payer(proche!.id, ids, moyen);
    if (!r.ok) { montrer(r.erreur, 'danger'); return; }
    aller(`/diaspora/suivi/${r.id}`);
  }

  // Feuilles
  let feuille = $state<'' | 'proche' | 'facture' | 'ville'>('');
  let ouverte = $state(false);
  $effect(() => { if (!ouverte) feuille = ''; });
  const ouvrir = (f: 'proche' | 'facture' | 'ville') => { feuille = f; ouverte = true; err = ''; };
  let err = $state('');
  let nom = $state(''); let ville = $state(''); let villeDepart = $state('');
  let prestataire = $state(''); let detail = $state(''); let montantTxt = $state(''); let categorie = $state<CategorieFacture>('sante');
  function validerProche() {
    const r = ajouterProche(nom, ville);
    if (!r.ok) { err = r.erreur; return; }
    pickProche(r.id); nom = ''; ville = ''; ouverte = false; montrer('Proche ajouté');
  }
  function validerFacture() {
    const r = ajouterFacture(proche!.id, { prestataire, detail, montant: lireMontant(montantTxt), categorie });
    if (!r.ok) { err = r.erreur; return; }
    touche = true; ids = [...ids, r.id]; prestataire = ''; detail = ''; montantTxt = ''; ouverte = false; montrer('Facture ajoutée');
  }
  function validerVille() { const r = changerVille(villeDepart); if (!r.ok) { err = r.erreur; return; } ouverte = false; montrer('Ville mise à jour'); }
  const recents = $derived(e.paiements.slice(0, 3));
  const moyens: MoyenPaiement[] = ['visa', 'applepay', 'sepa'];
</script>

<Ecran titre="Payer pour un proche" sur={`Depuis ${e.depuis} · EUR → FCFA · 0 frais`}>
  {#if !e.proches.length}
    <Vide icone="diaspora" titre="Aucun proche pour l'instant" texte="Ajoutez la personne que vous aidez au pays : vous réglerez ses factures en euros, directement chez le prestataire.">
      <Bouton onclick={() => ouvrir('proche')}>Ajouter un proche</Bouton>
    </Vide>
  {:else}
    <section class="bloc" aria-labelledby="qui">
      <Etiquette id="qui">Pour qui ?</Etiquette>
      <div class="gens">
        {#each e.proches as p (p.id)}
          <button type="button" class="gen" class:on={p.id === proche?.id} aria-pressed={p.id === proche?.id} onclick={() => pickProche(p.id)}>
            <span class="av">{ini2(p.nom)}</span><b>{p.nom}</b><small>{p.ville}{p.pass ? ` · ${p.pass}` : ''}</small>
          </button>
        {/each}
        <button type="button" class="gen plus" onclick={() => ouvrir('proche')} aria-label="Ajouter un proche"><span class="av"><Icone nom="plus" taille={18} /></span><b>Ajouter</b></button>
      </div>
    </section>

    <section class="bloc" aria-labelledby="quoi">
      <Etiquette id="quoi">Quoi ? · factures en attente</Etiquette>
      {#if !enAttente.length}
        <div class="rien"><p>Aucune facture en attente pour {proche?.nom}.</p><Bouton variante="secondaire" onclick={() => ouvrir('facture')}>Ajouter une facture</Bouton></div>
      {:else}
        <div class="liste" role="group" aria-label="Factures à payer">
          {#each enAttente as f (f.id)}
            {@const on = ids.includes(f.id)}
            <button type="button" class="fact" class:on role="checkbox" aria-checked={on} onclick={() => basculer(f.id)}>
              <span class="coche" aria-hidden="true">{#if on}<Icone nom="ok" taille={14} trait={3} />{/if}</span>
              <span class="m"><b>{f.prestataire}</b><small>{f.detail}</small></span>
              <span class="mono">{fcfa(f.montant)}</span>
            </button>
          {/each}
        </div>
        <button type="button" class="lien" onclick={() => ouvrir('facture')}>+ Ajouter une facture</button>
      {/if}
    </section>

    <section class="bloc" aria-labelledby="avec">
      <Etiquette id="avec">Payer avec</Etiquette>
      <Choix nom="Moyen de paiement" bind:valeur={moyen} colonnes={3} options={moyens.map((m) => ({ valeur: m, label: MOYENS[m].nom }))} />
    </section>

    <div class="vous" aria-live="polite">
      <div class="ligne"><span>VOUS PAYEZ</span><span>1 € = {EUR_FCFA.toLocaleString('fr-FR', { minimumFractionDigits: 3 })} FCFA</span></div>
      <div class="ligne grand"><b class="mono">{euro(euros)} €</b><span class="mono">= {fcfa(total)} FCFA</span></div>
      <div class="ligne bas"><span>Versé directement {choisies.length > 1 ? `aux ${choisies.length} prestataires` : 'au prestataire'}</span><span class="bon">Frais 0 €</span></div>
    </div>
    <p class="info"><Icone nom="info" taille={16} />L'argent ne transite pas par votre proche : il arrive chez le prestataire, avec un reçu signé que vous recevez.</p>
    {#if proche && proche.plafondSante !== null}
      <p class="info"><Icone nom="sante" taille={16} />Plafond santé de {proche.nom} : {fcfaUnite(Math.max(0, (proche.plafondSante ?? 0) - proche.consommeSante))} restants.</p>
    {/if}
  {/if}

  {#if recents.length}
    <section class="bloc" aria-labelledby="hist">
      <Etiquette id="hist">Derniers paiements</Etiquette>
      {#each recents as p (p.id)}
        <button type="button" class="hist" onclick={() => aller(`/diaspora/suivi/${p.id}`)}>
          <Ligne ini={ini2(p.procheNom)} titre={`Pour ${p.procheNom}`} sous={`${p.lignes.length > 1 ? `${p.lignes.length} factures` : p.lignes[0].prestataire} · ${p.signe ? 'reçu signé' : 'en cours'}`} valeur={`${euro(totalEuro(p.montantFcfa))} €`} />
        </button>
      {/each}
    </section>
  {/if}
  <button type="button" class="lien" onclick={() => { villeDepart = e.depuis; ouvrir('ville'); }}>Vous payez depuis {e.depuis} · Modifier</button>

  {#snippet pied()}
    {#if e.proches.length}
      {#if erreur}<p class="alerte" role="alert">{erreur}</p>{/if}
      {#if peutPayer}<Bouton onclick={lancer}>Payer {euro(euros)} € · {MOYENS[moyen].court}</Bouton>
      {:else}<Bouton desactive>{choisies.length ? 'Paiement impossible' : 'Choisissez au moins une facture'}</Bouton>{/if}
    {/if}
  {/snippet}
</Ecran>

<Feuille bind:ouverte titre={feuille === 'proche' ? 'Ajouter un proche' : feuille === 'facture' ? 'Ajouter une facture' : 'Votre ville'}>
  {#if feuille === 'proche'}
    <Champ bind:valeur={nom} etiquette="Nom ou lien (Maman, Frère Paul…)" />
    <Champ bind:valeur={ville} etiquette="Ville au pays" />
    {#if err}<p class="alerte" role="alert">{err}</p>{/if}
    <Bouton onclick={validerProche}>Ajouter</Bouton>
  {:else if feuille === 'facture'}
    <Champ bind:valeur={prestataire} etiquette="À qui est due la facture ?" placeholder="Clinique, bailleur, école…" />
    <Champ bind:valeur={detail} etiquette="Détail (facultatif)" />
    <Champ bind:valeur={montantTxt} etiquette="Montant" suffixe="FCFA" inputmode="numeric" />
    <Choix nom="Catégorie" bind:valeur={categorie} options={[{ valeur: 'sante', label: 'Santé' }, { valeur: 'loyer', label: 'Loyer' }, { valeur: 'ecole', label: 'École' }, { valeur: 'autre', label: 'Autre' }]} />
    {#if err}<p class="alerte" role="alert">{err}</p>{/if}
    <Bouton onclick={validerFacture}>Ajouter la facture</Bouton>
  {:else if feuille === 'ville'}
    <Champ bind:valeur={villeDepart} etiquette="Ville depuis laquelle vous payez" />
    {#if err}<p class="alerte" role="alert">{err}</p>{/if}
    <Bouton onclick={validerVille}>Enregistrer</Bouton>
  {/if}
</Feuille>

<style>
  .bloc { display: flex; flex-direction: column; gap: 8px; }
  .gens { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .gen { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 12px; min-height: 44px; border-radius: 18px; background: var(--carte); border: 1px solid var(--ligne); text-align: left; }
  .gen.on { background: var(--primaire-fond); border-color: var(--primaire); }
  .gen small { color: var(--muted); font-size: 12px; } .gen b { font-size: 15px; }
  .av { width: 34px; height: 34px; border-radius: 17px; background: var(--carte2); color: var(--doux); display: grid; place-items: center; font: 600 11px var(--mono); margin-bottom: 4px; }
  .on .av { background: var(--primaire); color: var(--sur-primaire); }
  .liste { display: flex; flex-direction: column; gap: 8px; }
  .fact { display: flex; align-items: center; gap: 12px; padding: 12px 14px; min-height: 60px; border-radius: 16px; background: var(--carte); border: 1px solid var(--ligne); text-align: left; width: 100%; }
  .fact.on { background: var(--primaire-fond); border-color: var(--primaire); }
  .coche { width: 22px; height: 22px; border-radius: 11px; border: 1.5px solid var(--ligne-forte); display: grid; place-items: center; flex: none; color: var(--sur-primaire); }
  .on .coche { background: var(--primaire); border-color: var(--primaire); }
  .m { flex: 1; min-width: 0; display: flex; flex-direction: column; } .m b { font-size: 14.5px; } .m small { color: var(--muted); font-size: 12.5px; }
  .fact .mono { font-size: 14px; }
  .lien { align-self: flex-start; min-height: 44px; color: var(--primaire-clair); font-weight: 550; font-size: 14px; }
  .rien { display: flex; flex-direction: column; gap: 10px; padding: 14px; border: 1px dashed var(--ligne-forte); border-radius: 16px; color: var(--muted); }
  .vous { border-radius: 24px; padding: 18px; display: flex; flex-direction: column; gap: 8px; border: 1px solid rgba(124, 147, 255, 0.4); background: linear-gradient(135deg, rgba(48, 80, 255, 0.5), rgba(48, 80, 255, 0) 60%), #0f1733; color: #f3f5fa; box-shadow: 0 30px 60px -30px rgba(48, 80, 255, 0.8); }
  .ligne { display: flex; justify-content: space-between; align-items: baseline; font: 500 11px var(--mono); letter-spacing: 0.1em; color: #c9d2ff; gap: 8px; }
  .ligne.grand { align-items: baseline; } .grand b { font-size: 36px; font-weight: 500; letter-spacing: -0.03em; line-height: 1; color: #fff; } .grand span { font-size: 14px; letter-spacing: 0; }
  .ligne.bas { border-top: 1px solid rgba(255, 255, 255, 0.14); padding-top: 10px; font: 400 12.5px var(--sans); letter-spacing: 0; } .bon { color: var(--bon); }
  .info { display: flex; gap: 10px; align-items: flex-start; padding: 10px 14px; border-radius: 14px; background: var(--carte); border: 1px solid var(--ligne); font-size: 12.5px; color: var(--muted); line-height: 1.4; }
  .info :global(svg) { flex: none; margin-top: 1px; color: var(--primaire-clair); }
  .hist { text-align: left; width: 100%; min-height: 44px; } .alerte { color: var(--danger); font-size: 13px; text-align: center; margin-bottom: 8px; }
</style>
