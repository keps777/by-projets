<script lang="ts">
  import Feuille from '../../ui/Feuille.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import { fcfa } from '../../core/money.ts';
  import { repartirActes } from '../../core/sante-facture.ts';
  import { app } from '../../data/store.svelte.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { TARIF_TELECONSULTATION, teleconsulter } from './actions.ts';
  import { beneficiaires, couvertureDe, teleconsultationsUtilisees, utilisation } from './etat.ts';

  let { ouverte = $bindable(false) }: { ouverte?: boolean } = $props();
  const noms = $derived(beneficiaires());
  let choix = $state(''); let erreur = $state('');
  const qui = $derived(noms.includes(choix) ? choix : (noms[0] ?? ''));
  const c = $derived(couvertureDe());
  const r = $derived(c ? repartirActes([{ nom: 'Téléconsultation', sous: '', montant: TARIF_TELECONSULTATION, categorie: 'consultation' }], c, utilisation().restant) : null);
  const utilisees = $derived(teleconsultationsUtilisees());
  const epuise = $derived(!!c && utilisees >= c.teleconsultations);
  function appeler() {
    const res = teleconsulter(qui);
    if (res.ok) { montrer('Un médecin vous rappelle dans 10 minutes'); ouverte = false; erreur = ''; } else erreur = res.erreur;
  }
</script>

<Feuille bind:ouverte titre="Téléconsultation" sous="Médecin sous 10 min">
  <p class="muted">Un médecin vous répond par vidéo ou par téléphone, sans vous déplacer.</p>
  {#if c && r}
    <label for="tele-qui">Pour qui ?</label>
    <select id="tele-qui" value={qui} onchange={(e) => (choix = e.currentTarget.value)}>{#each noms as n (n)}<option value={n}>{n}</option>{/each}</select>
    <dl>
      <div><dt>Tarif</dt><dd class="mono">{fcfa(r.total)}</dd></div>
      <div><dt>Pris en charge ({Math.round(c.taux * 100)} %)</dt><dd class="mono">{fcfa(r.assureMe)}</dd></div>
      <div><dt>À votre charge</dt><dd class="mono">{fcfa(r.patient)}</dd></div>
      <div><dt>Téléconsultations de l'année</dt><dd class="mono">{c.teleconsultations === Infinity ? `${utilisees} (illimitées)` : `${utilisees} / ${c.teleconsultations}`}</dd></div>
    </dl>
    {#if epuise}<p class="err" role="alert">Vos téléconsultations de l'année sont utilisées. Le Pass Famille les rend illimitées.</p>
    {:else if app.solde < r.patient}<p class="err" role="alert">Solde insuffisant : {fcfa(r.patient)} FCFA à votre charge.</p>{/if}
    {#if erreur}<p class="err" role="alert">{erreur}</p>{/if}
    <Bouton onclick={appeler} desactive={epuise || app.solde < r.patient}>Appeler un médecin</Bouton>
  {/if}
  <Bouton variante="discret" onclick={() => (ouverte = false)}>Fermer</Bouton>
</Feuille>

<style>
  label { font: 500 10.5px var(--mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
  select { min-height: 48px; padding: 0 14px; border-radius: 14px; background: var(--carte2); border: 1px solid var(--ligne-forte); font-size: 16px; }
  dl div { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--ligne); } dt { color: var(--muted); } dd { font-weight: 550; }
  .err { color: var(--danger); font-size: 13px; }
</style>
