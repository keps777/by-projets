<script lang="ts">
  import Carte from '../../ui/Carte.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Pastille from '../../ui/Pastille.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { quand } from '../../core/dates.ts';
  import { fcfa } from '../../core/money.ts';
  import { ETAPES_LIVRAISON, ETAPES_RETRAIT, LIBELLE_STATUT, statutOrdonnance } from '../../core/sante-facture.ts';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { FRAIS_LIVRAISON, annulerOrdonnance, envoyerOrdonnance } from './actions.ts';
  import { beneficiaires, sante } from './etat.ts';
  import { PHARMACIES } from './reseau.ts';

  let { ouverte = $bindable(false) }: { ouverte?: boolean } = $props();
  let now = $state(maintenant());
  $effect(() => { const t = setInterval(() => (now = maintenant()), 20_000); return () => clearInterval(t); });
  const liste = $derived(sante().ordonnances.filter((o) => o.numeroMembre === app.compte?.numeroMembre));

  const noms = $derived(beneficiaires());
  let qui = $state(''); let pharmacie = $state(PHARMACIES[0].id); let livraison = $state(true); let texte = $state(''); let photo = $state(''); let erreur = $state('');
  const beneficiaire = $derived(noms.includes(qui) ? qui : (noms[0] ?? ''));
  function envoyer(e: Event) {
    e.preventDefault();
    const ph = PHARMACIES.find((p) => p.id === pharmacie);
    const r = envoyerOrdonnance({ beneficiaire, pharmacieId: pharmacie, pharmacie: ph?.nom ?? '', medicaments: texte, livraison, photo: photo || undefined });
    if (r.ok) { montrer(livraison ? 'Ordonnance reçue, livraison sous 2 h' : 'Ordonnance reçue, retrait possible dans 1 h'); ouverte = false; texte = ''; photo = ''; erreur = ''; } else erreur = r.erreur;
  }
  const etapes = (livraison: boolean) => (livraison ? ETAPES_LIVRAISON : ETAPES_RETRAIT);
  const ton = (s: string) => (s === 'livree' || s === 'prete' ? 'bon' : 'primaire');
</script>

{#if liste.length === 0}
  <Carte><p class="muted vide">Aucune ordonnance envoyée. Photographiez la vôtre : la pharmacie la prépare et vous la livre en 2 h.</p></Carte>
{:else}
  <ul class="liste">
    {#each liste as o (o.id)}
      {@const s = statutOrdonnance(o.ts, now, o.livraison)}
      <li>
        <Carte>
          <div class="tete"><div><b>{o.pharmacie}</b><small>{o.beneficiaire} · {quand(o.ts, now)}</small></div>
            {#if o.annulee}<Pastille ton="danger">Annulée</Pastille>{:else}<Pastille ton={ton(s)}>{LIBELLE_STATUT[s]}</Pastille>{/if}</div>
          <p class="meds">{o.medicaments}</p>
          {#if !o.annulee}
            <ol class="etapes" aria-label="Avancement de l'ordonnance">
              {#each etapes(o.livraison) as e, i (e)}<li class:fait={etapes(o.livraison).indexOf(s) >= i} aria-current={e === s ? 'step' : undefined}><span></span>{LIBELLE_STATUT[e]}</li>{/each}
            </ol>
          {/if}
          <p class="pied muted">{o.livraison ? `Livraison ${fcfa(o.fraisLivraison)} FCFA` : 'Retrait en pharmacie'}{o.partPatient ? ` · votre part ${fcfa(o.partPatient)} FCFA` : ' · médicaments réglés à la remise (prise en charge selon votre Pass)'}</p>
          {#if !o.annulee && s === 'recue'}<button class="annul" onclick={() => { const r = annulerOrdonnance(o.id); montrer(r.ok ? 'Ordonnance annulée' : r.erreur, r.ok ? 'bon' : 'danger'); }}>Annuler l'ordonnance</button>{/if}
        </Carte>
      </li>
    {/each}
  </ul>
{/if}

<Feuille bind:ouverte titre="Envoyer une ordonnance" sous="Pharmacie du réseau">
  <form onsubmit={envoyer}>
    <label for="o-qui">Pour qui ?</label>
    <select id="o-qui" value={beneficiaire} onchange={(e) => (qui = e.currentTarget.value)}>{#each noms as n (n)}<option value={n}>{n}</option>{/each}</select>
    <label for="o-ph">Pharmacie</label>
    <select id="o-ph" bind:value={pharmacie}>{#each PHARMACIES as p (p.id)}<option value={p.id}>{p.nom} · {p.quartier}</option>{/each}</select>
    <span class="lab">Photo de l'ordonnance</span>
    <label class="photo" for="o-photo"><Icone nom="camera" taille={20} /><span>{photo || 'Prendre ou choisir une photo'}</span></label>
    <input id="o-photo" class="cache" type="file" accept="image/*" capture="environment" onchange={(e) => (photo = e.currentTarget.files?.[0]?.name ?? '')} />
    <label for="o-med">Ou la liste des médicaments</label>
    <textarea id="o-med" rows="3" bind:value={texte} placeholder="Ex. amoxicilline 500 mg, paracétamol 1 g"></textarea>
    <div class="choix" role="radiogroup" aria-label="Réception">
      <button type="button" role="radio" aria-checked={livraison} class:on={livraison} onclick={() => (livraison = true)}><b>Livraison</b><small>sous 2 h · {fcfa(FRAIS_LIVRAISON)} FCFA</small></button>
      <button type="button" role="radio" aria-checked={!livraison} class:on={!livraison} onclick={() => (livraison = false)}><b>Retrait</b><small>prête en 1 h · gratuit</small></button>
    </div>
    <p class="muted note">Les médicaments sont réglés à la remise ; votre Pass prend en charge une partie sur ordonnance.</p>
    {#if erreur}<p class="err" role="alert">{erreur}</p>{/if}
    <Bouton type="submit">Envoyer mon ordonnance</Bouton>
  </form>
  <Bouton variante="discret" onclick={() => (ouverte = false)}>Fermer</Bouton>
</Feuille>

<style>
  .vide { font-size: 13.5px; } .liste { list-style: none; display: flex; flex-direction: column; gap: 10px; }
  .tete { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; } .tete div { display: flex; flex-direction: column; } small { color: var(--muted); font-size: 12.5px; }
  .meds { margin: 8px 0 10px; color: var(--doux); font-size: 14px; }
  .etapes { list-style: none; display: flex; gap: 6px; } .etapes li { flex: 1; font-size: 10.5px; color: var(--faint); display: flex; flex-direction: column; gap: 5px; }
  .etapes span { height: 4px; border-radius: 2px; background: var(--ligne-forte); } .etapes li.fait { color: var(--doux); } .etapes li.fait span { background: var(--bon); }
  .pied { margin-top: 10px; font-size: 12.5px; } .annul { margin-top: 6px; min-height: 44px; color: var(--danger); font-weight: 600; font-size: 14px; }
  form { display: flex; flex-direction: column; gap: 8px; } form > label, .lab { font: 500 10.5px var(--mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin-top: 4px; }
  select, textarea { padding: 12px 14px; border-radius: 14px; background: var(--carte2); border: 1px solid var(--ligne-forte); font-size: 16px; min-height: 48px; resize: vertical; }
  .photo { display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 0 14px; border-radius: 14px; border: 1px dashed var(--ligne-forte); color: var(--doux); cursor: pointer; font-size: 15px; text-transform: none; letter-spacing: 0; font-family: var(--sans); }
  .cache { position: absolute; width: 1px; height: 1px; opacity: 0; } .cache:focus-visible + * { outline: 2px solid var(--primaire-clair); }
  .choix { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } .choix button { text-align: left; padding: 12px; border-radius: 14px; border: 1px solid var(--ligne-forte); min-height: 56px; display: flex; flex-direction: column; }
  .choix button.on { border-color: var(--primaire); background: var(--primaire-fond); } .note { font-size: 12.5px; } .err { color: var(--danger); font-size: 13px; }
</style>
