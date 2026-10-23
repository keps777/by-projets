<script lang="ts">
  import { app, creditsActifs } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { niveauDuScore, PLAFONDS, type Niveau } from '../../core/credit.ts';
  import { fcfa } from '../../core/money.ts';
  import { PILIERS, etatPilier, NOM_NIVEAU, type Pilier } from '../../core/piliers.ts';
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Pastille from '../../ui/Pastille.svelte';
  import Panneau from './Panneau.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Pict from './Pict.svelte';

  const score = $derived(app.score.valeur);
  const niveau = $derived(niveauDuScore(score));
  const ouverts = $derived(PILIERS.filter((p) => !etatPilier(p.id, score).verrouille).length);
  let choisi = $state<Pilier | null>(null);
  let feuille = $state(false);

  /** Ce que le niveau actuel permet pour ce pilier (plafonds réels). */
  function avantage(p: Pilier, n: Niveau): string {
    const pl = PLAFONDS[n];
    if (p.id === 'mobilite') return pl.auto ? `Crédit auto jusqu'à ${fcfa(pl.auto)}` : 'Crédit auto pas encore disponible';
    if (p.id === 'logement') return pl.avanceLoyerMois ? `Avance de loyer jusqu'à ${pl.avanceLoyerMois} mois` : 'Avance de loyer pas encore disponible';
    if (p.id === 'ecole') return `Crédit scolaire jusqu'à ${fcfa(pl.credit)}`;
    return '';
  }
  function etat(p: Pilier) {
    const e = etatPilier(p.id, score);
    const credit = p.produit ? creditsActifs().find((c) => c.produit === p.produit) : undefined;
    return { ...e, credit };
  }
  function ouvrir(p: Pilier) {
    if (etatPilier(p.id, score).verrouille) { choisi = p; feuille = true; } else aller(p.href);
  }
</script>

<Ecran titre="Piliers" sur="Votre écosystème" retourVers="/">
  <p class="intro"><b>{PILIERS.length} piliers</b>, une seule app. <span class="muted">{ouverts} ouvert{ouverts > 1 ? 's' : ''} à votre niveau <b class="niv">{NOM_NIVEAU[niveau]}</b> ({score} pts).</span></p>
  <ul class="grille">
    {#each PILIERS as p (p.id)}
      {@const e = etat(p)}
      <li>
        <button type="button" class="p" class:ver={e.verrouille} style:--a={p.accent} onclick={() => ouvrir(p)} aria-label="{p.nom}. {e.verrouille ? `Verrouillé : niveau ${NOM_NIVEAU[e.requis]} requis, il manque ${e.manque} points` : e.credit ? 'En cours' : 'Disponible'}">
          <span class="ic"><Icone nom={p.icone} taille={24} />{#if e.verrouille}<em><Pict nom="cadenas" taille={13} /></em>{/if}</span>
          <b>{p.nom}</b>
          <small>{p.pitch}</small>
          {#if e.verrouille}<Pastille ton="alerte">{NOM_NIVEAU[e.requis]} dès {e.seuil}</Pastille>
          {:else if e.credit}<Pastille ton="primaire">En cours {e.credit.payees} / {e.credit.duree}</Pastille>
          {:else}<Pastille ton="bon">Disponible</Pastille>{/if}
        </button>
      </li>
    {/each}
  </ul>
</Ecran>

<Panneau bind:ouverte={feuille} titre={choisi ? `${choisi.nom} · verrouillé` : ''}>
  {#if choisi}
    {@const e = etatPilier(choisi.id, score)}
    <p>{choisi.pitch}</p>
    <p class="muted">Ce pilier s'ouvre au niveau <b>{NOM_NIVEAU[e.requis]}</b>, dès {e.seuil} points d'AssureScore. Vous êtes à {score} : il vous manque <b>{e.manque} point{e.manque > 1 ? 's' : ''}</b>.</p>
    <p class="muted">{avantage(choisi, e.requis)}</p>
    <Bouton href="/score" onclick={() => (feuille = false)}>Voir comment gagner des points</Bouton>
    <Bouton variante="secondaire" onclick={() => (feuille = false)}>Fermer</Bouton>
  {/if}
</Panneau>

<style>
  .intro { font-size: 15px; } .niv { color: var(--pale); }
  .grille { list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding-bottom: 80px; }
  .p { width: 100%; height: 100%; text-align: left; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 14px; min-height: 168px; border-radius: 20px; background: linear-gradient(160deg, color-mix(in srgb, var(--a) 14%, var(--carte)), var(--carte) 65%); border: 1px solid color-mix(in srgb, var(--a) 45%, transparent); }
  .p.ver { background: var(--carte); border-color: var(--ligne); } .p.ver b, .p.ver small { opacity: 0.7; }
  .ic { width: 42px; height: 42px; border-radius: 14px; background: color-mix(in srgb, var(--a) 18%, transparent); color: var(--a); display: grid; place-items: center; position: relative; } .ver .ic { background: var(--carte2); color: var(--faint); }
  .ic em { position: absolute; right: -5px; bottom: -5px; width: 20px; height: 20px; border-radius: 10px; background: var(--carte2); border: 1px solid var(--ligne-forte); color: var(--muted); display: grid; place-items: center; }
  b { font-size: 16px; font-weight: 650; } small { color: var(--muted); font-size: 12.5px; flex: 1; }
</style>
