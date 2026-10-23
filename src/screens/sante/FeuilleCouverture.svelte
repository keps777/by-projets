<script lang="ts">
  import Feuille from '../../ui/Feuille.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { jourLong } from '../../core/dates.ts';
  import { fcfa } from '../../core/money.ts';
  import { app } from '../../data/store.svelte.ts';
  import { prochaine } from '../../data/paie.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { ajouterBeneficiaire, retirerBeneficiaire } from './actions.ts';
  import { beneficiaires, couvertureDe, teleconsultationsUtilisees } from './etat.ts';

  let { ouverte = $bindable(false) }: { ouverte?: boolean } = $props();
  const c = $derived(couvertureDe());
  const noms = $derived(beneficiaires());
  const validite = $derived(prochaine());
  let nouveau = $state(''); let erreur = $state('');
  const pct = (t: number) => `${Math.round(t * 100)} %`;
  function ajouter(e: Event) {
    e.preventDefault(); const r = ajouterBeneficiaire(nouveau);
    if (r.ok) { montrer(`${nouveau.trim()} est maintenant couvert·e`); nouveau = ''; erreur = ''; } else erreur = r.erreur;
  }
</script>

<Feuille bind:ouverte titre={c ? `Couverture Pass ${app.compte!.pass[0].toUpperCase()}${app.compte!.pass.slice(1)}` : 'Couverture'}>
  {#if c && app.compte}
    <p class="muted">Valable pour {noms.join(', ')}{validite ? ` jusqu'au ${jourLong(validite)}` : ''}.</p>
    <dl>
      <div><dt>Consultations</dt><dd class="mono">{pct(c.taux)}</dd></div>
      <div><dt>Hospitalisation</dt><dd class="mono">{pct(c.taux)}</dd></div>
      <div><dt>Pharmacie sur ordonnance</dt><dd class="mono">{pct(c.pharmacie)}</dd></div>
      <div><dt>Téléconsultations</dt><dd class="mono">{c.teleconsultations === Infinity ? 'Illimitées' : `${teleconsultationsUtilisees()} / ${c.teleconsultations}`}</dd></div>
      <div><dt>Plafond annuel</dt><dd class="mono">{fcfa(c.plafond)}</dd></div>
      <div><dt>Bénéficiaires</dt><dd class="mono">{noms.length} / {c.personnes}</dd></div>
    </dl>
    <h3>Bénéficiaires</h3>
    <ul>
      {#each noms as n, i (n)}
        <li><span class="ini">{n[0]}</span><b>{n}</b>{#if i === 0}<small>titulaire</small>{:else}<button class="ret" onclick={() => retirerBeneficiaire(n)} aria-label="Retirer {n}"><Icone nom="fermer" taille={16} /></button>{/if}</li>
      {/each}
    </ul>
    {#if noms.length < c.personnes}
      <form onsubmit={ajouter}>
        <label for="nouv-benef">Ajouter un bénéficiaire</label>
        <div class="ligne"><input id="nouv-benef" bind:value={nouveau} placeholder="Prénom" autocomplete="off" aria-invalid={!!erreur} /><button class="ajout" type="submit">Ajouter</button></div>
        {#if erreur}<span class="err" role="alert">{erreur}</span>{/if}
      </form>
    {/if}
    <Bouton onclick={() => { montrer('Contrat envoyé par SMS'); ouverte = false; }}>Recevoir le contrat par SMS</Bouton>
  {:else}
    <p class="muted">Aucun compte connecté.</p>
  {/if}
  <Bouton variante="discret" onclick={() => (ouverte = false)}>Fermer</Bouton>
</Feuille>

<style>
  dl { display: flex; flex-direction: column; } dl div { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--ligne); } dt { color: var(--muted); } dd { font-weight: 550; }
  h3 { font: 500 10.5px var(--mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
  ul { list-style: none; display: flex; flex-direction: column; } li { display: flex; align-items: center; gap: 10px; min-height: 48px; border-bottom: 1px solid var(--ligne); }
  .ini { width: 32px; height: 32px; border-radius: 16px; background: var(--carte2); display: grid; place-items: center; font-weight: 600; } li b { flex: 1; } li small { color: var(--muted); }
  .ret { width: 44px; height: 44px; display: grid; place-items: center; color: var(--muted); border-radius: 22px; }
  form { display: flex; flex-direction: column; gap: 6px; } label { font: 500 10.5px var(--mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
  .ligne { display: flex; gap: 8px; } input { flex: 1; min-width: 0; min-height: 48px; padding: 0 14px; border-radius: 14px; background: var(--carte2); border: 1px solid var(--ligne-forte); font-size: 16px; }
  input[aria-invalid='true'] { border-color: var(--danger); } .ajout { min-height: 48px; padding: 0 18px; border-radius: 14px; background: var(--primaire-fond); color: var(--pale); font-weight: 600; }
  .err { color: var(--danger); font-size: 12.5px; }
</style>
