<script lang="ts">
  import { fcfa } from '../../core/money.ts';
  import Ecran from '../../ui/Ecran.svelte';
  import Carte from '../../ui/Carte.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Champ from '../../ui/Champ.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import Jauge from '../../ui/Jauge.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Puces from './Puces.svelte';
  import { ajouterEnfant, anneeRentree, basculerEnfant, classeAffichee, fraisDe, fraisEnfant, nomEcole, planDe, recap, rentreeCible, saisirCoffre } from './actions.ts';
  import { ecole, MAX_ENFANTS } from './etat.ts';

  const e = $derived(ecole());
  const r = $derived(recap());
  const cible = $derived(rentreeCible());
  const accepte = $derived(planDe(cible));
  const pctCoffre = $derived(r.total ? (r.utilise / r.total) * 100 : 0);

  let ajout = $state(false); let prenom = $state(''); let ecoleId = $state('la-rochelle'); let niveau = $state(''); let erreur = $state('');
  const ecoleChoisie = $derived(e.ecoles.find((x) => x.id === ecoleId)!);
  $effect(() => { if (!ecoleChoisie.grille.some((g) => g.niveau === niveau)) niveau = ecoleChoisie.grille[0]?.niveau ?? ''; });
  function ajouter() {
    const res = ajouterEnfant({ prenom, ecoleId, niveau });
    if (!res.ok) { erreur = res.erreur; return; }
    montrer(`${res.valeur.prenom} ajouté(e) à la rentrée`); prenom = ''; erreur = ''; ajout = false;
  }
  function basculer(id: string) { const res = basculerEnfant(id); if (!res.ok) montrer(res.erreur, 'danger'); }

  let coffreTexte = $state(''); let erreurCoffre = $state('');
  $effect(() => { coffreTexte = String(e.coffreSaisi || ''); });
  function validerCoffre() { const res = saisirCoffre(coffreTexte); erreurCoffre = res.ok ? '' : res.erreur; if (res.ok) montrer('Coffre mis à jour'); }
</script>

<Ecran titre={`Rentrée ${anneeRentree(cible)}`} sur={`ÉTAPE 1 / 2 · ${r.inclus.length} ENFANT${r.inclus.length > 1 ? 'S' : ''}`} retourVers="/ecole">
  <p class="intro">Les frais sont déjà dans l’app : les écoles partenaires publient leurs tarifs. Il reste à choisir comment payer.</p>
  {#if accepte}<Carte accent="var(--bon)"><b>Plan accepté</b><p class="muted">Les écoles ont été payées. Vous remboursez {fcfa(accepte.mensualite)} FCFA par mois.</p><a class="lien" href="/ecole/plan">Voir le plan</a></Carte>{/if}
  {#if e.enfants.length}<p class="muted">Touchez un enfant pour l’inclure ou non dans le financement.</p>{/if}

  <ul class="enfants">
    {#each e.enfants as x (x.id)}
      <li>
        <button role="checkbox" aria-checked={x.inclus} class:off={!x.inclus} onclick={() => basculer(x.id)} disabled={!!accepte}>
          <span class="coche" class:on={x.inclus}>{#if x.inclus}<Icone nom="ok" taille={16} trait={2.6} />{/if}</span>
          <span class="ini">{x.prenom.slice(0, 1).toUpperCase()}</span>
          <span class="m"><b>{x.prenom} · {x.niveau}</b><small>{nomEcole(x.ecoleId)}{x.classeActuelle ? ` · aujourd’hui en ${classeAffichee(x)}` : ''}</small></span>
          <span class="mono montant">{fcfa(fraisEnfant(x))}</span>
        </button>
      </li>
    {/each}
  </ul>
  {#if e.enfants.length < MAX_ENFANTS && !accepte}<Bouton variante="secondaire" onclick={() => { ajout = true; erreur = ''; }}><Icone nom="plus" taille={18} />Ajouter un enfant</Bouton>{/if}

  <Carte>
    <div class="ligne"><span>Total rentrée · {r.inclus.length} enfant{r.inclus.length > 1 ? 's' : ''}</span><b class="mono">{fcfa(r.total)}</b></div>
    <div class="ligne"><span>{r.coffreSource === 'coffres' ? 'Dans votre coffre Rentrée' : 'Déjà dans le coffre scolaire'}</span><b class="mono bon">− {fcfa(r.utilise)}</b></div>
    <Jauge pct={pctCoffre} couleur="var(--bon)" />
    <div class="ligne fort"><span>À financer</span><b class="mono">{fcfa(r.aFinancer)}</b></div>
    {#if r.coffreSource === 'coffres'}
      <p class="muted pt">Solde du coffre Rentrée lu en lecture seule : il se gère dans l’onglet Coffres.</p>
    {:else}
      <form class="coffre" onsubmit={(ev) => { ev.preventDefault(); validerCoffre(); }}>
        <Champ etiquette="Montant déjà épargné pour la rentrée" inputmode="numeric" suffixe="FCFA" bind:valeur={coffreTexte} erreur={erreurCoffre} />
        <Bouton type="submit" variante="secondaire" plein={false}>Mettre à jour</Bouton>
      </form>
    {/if}
  </Carte>
  <p class="info"><Icone nom="info" taille={16} /> Les écoles sont payées en une fois, le jour de l’accord. Les enfants ont leur place dès le premier jour.</p>

  {#snippet pied()}
    {#if accepte}<Bouton href="/ecole">Retour à l’éducation</Bouton>
    {:else if !r.inclus.length}<p class="vide" role="status">Choisissez au moins un enfant</p>
    {:else if r.aFinancer <= 0}<p class="vide" role="status">Votre coffre couvre déjà tous les frais : aucun crédit nécessaire.</p>
    {:else}<Bouton href="/ecole/plan">Choisir mon plan de paiement<Icone nom="suivant" taille={18} /></Bouton>{/if}
  {/snippet}
</Ecran>

<Feuille bind:ouverte={ajout} titre="Ajouter un enfant" sous="Frais publiés par l’école">
  <p class="muted">L’école partenaire publie déjà ses tarifs : rien d’autre à saisir.</p>
  <form class="formulaire" onsubmit={(ev) => { ev.preventDefault(); ajouter(); }}>
    <Champ etiquette="Prénom" placeholder="Prénom de l’enfant" bind:valeur={prenom} erreur={erreur} />
    <div><span class="et">École</span><Puces etiquette="École" bind:valeur={ecoleId} options={e.ecoles.map((x) => ({ valeur: x.id, label: x.nom }))} /></div>
    <div><span class="et">Classe à la rentrée</span><Puces etiquette="Classe à la rentrée" bind:valeur={niveau} options={ecoleChoisie.grille.map((g) => ({ valeur: g.niveau, label: g.niveau }))} /></div>
    <div class="ligne"><span>Frais publiés par l’école</span><b class="mono">{fcfa(fraisDe(ecoleId, niveau))}</b></div>
    <Bouton type="submit" desactive={!prenom.trim()}>Ajouter à la rentrée</Bouton>
    {#if !prenom.trim()}<p class="muted centre">Entrez un prénom</p>{/if}
  </form>
</Feuille>

<style>
  .intro { font-size: 15px; color: var(--doux); } .enfants { list-style: none; display: flex; flex-direction: column; gap: 10px; }
  .enfants button { width: 100%; display: flex; align-items: center; gap: 12px; text-align: left; min-height: 64px; padding: 12px 14px; background: var(--carte); border: 1px solid var(--primaire); border-radius: 18px; }
  .enfants button.off { border-color: var(--ligne); opacity: 0.6; } .enfants button.off .m b, .enfants button.off .montant { text-decoration: line-through; } .enfants button:disabled { opacity: 0.85; }
  .coche { width: 24px; height: 24px; border-radius: 12px; border: 2px solid var(--faint); display: grid; place-items: center; flex: none; color: #fff; } .coche.on { background: var(--primaire); border-color: var(--primaire); }
  .ini { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; font: 600 13px var(--mono); background: var(--primaire-fond); color: var(--pale); flex: none; }
  .m { flex: 1; min-width: 0; display: flex; flex-direction: column; } .m small { color: var(--muted); font-size: 12.5px; } .montant { font-weight: 500; }
  .ligne { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 8px 0; } .ligne.fort { border-top: 1px solid var(--ligne); margin-top: 12px; padding-top: 12px; font-size: 17px; font-weight: 600; } .bon { color: var(--bon); }
  .pt { margin-top: 10px; font-size: 13px; } .coffre { display: flex; flex-direction: column; gap: 10px; margin-top: 14px; align-items: flex-start; } .coffre :global(label) { width: 100%; }
  .info { display: flex; gap: 8px; color: var(--muted); font-size: 13px; align-items: flex-start; } .lien { color: var(--primaire-clair); font-weight: 600; min-height: 44px; display: inline-flex; align-items: center; }
  .vide { text-align: center; color: var(--muted); padding: 14px; background: var(--carte); border-radius: 16px; }
  .formulaire { display: flex; flex-direction: column; gap: 14px; } .et { display: block; font: 500 10.5px var(--mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; } .centre { text-align: center; font-size: 13px; }
</style>
