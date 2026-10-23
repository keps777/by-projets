<script lang="ts">
  import { fcfa } from '../../core/money.ts';
  import { formaterTel, libellePart } from '../../core/entreprise.ts';
  import { PRIX_PASS } from '../../core/sante.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Champ from '../../ui/Champ.svelte';
  import { emettreAttestation, modifierSalaire, simulerInscription, validerRetenue } from './actions.ts';
  import { ent } from './etat.ts';
  import Panneau from './Panneau.svelte';
  import Statut from './Statut.svelte';
  import type { Nav } from './types.ts';
  import type { LigneSalarie } from './vues.ts';

  let { ouvert = $bindable(false), ligne, nav }: { ouvert?: boolean; ligne: LigneSalarie | null; nav: Nav } = $props();
  const e = $derived(ent().entreprise);
  let salaire = $state('');
  let erreurSalaire = $state('');
  $effect(() => { salaire = ligne && ligne.salaire > 0 ? String(ligne.salaire) : ''; erreurSalaire = ''; });

  function enregistrerSalaire() {
    if (!ligne) return;
    const err = modifierSalaire(ligne.id, salaire);
    if (err) { erreurSalaire = err; return; }
    erreurSalaire = ''; montrer('Salaire enregistré');
  }
  function valider() { if (ligne && validerRetenue(ligne.id)) montrer('Retenue validée : elle est dans le fichier du mois'); }
  function inscrire() { if (ligne && simulerInscription(ligne.id)) montrer("Inscription simulée : le salarié a créé son compte (Pass Essentiel, niveau Start)"); }
  function attester() {
    if (!ligne) return;
    const r = emettreAttestation(ligne.id);
    if (!r.ok) { montrer(r.erreur, 'danger'); return; }
    montrer(`Attestation ${r.attestation.numero} délivrée`); ouvert = false; nav.voirAttestation(r.attestation.id);
  }
</script>

<Panneau bind:ouvert titre={ligne?.nom ?? 'Salarié'} sous={ligne && e ? `${ligne.matricule} · ${e.raisonSociale}` : ''}>
  {#if ligne && e}
    {@const r = ligne.retenue}
    <div class="ligne-statut"><Statut statut={ligne.affiche} />{#if ligne.membre}<span class="puce">Compte AssureMe de cet appareil</span>{/if}</div>

    {#if ligne.statut === 'invite'}
      <p>Ce salarié n'a pas encore créé son compte. Il rejoint l'entreprise avec le code <b class="mono">{e.code}</b>. Téléphone : {formaterTel(ligne.telephone)}.</p>
      <button class="btn" onclick={inscrire}>Simuler son inscription (démo)</button>
    {:else}
      <dl>
        <dt>Niveau</dt><dd>{ligne.niveau} · score {ligne.score}</dd>
        <dt>Pass</dt><dd>{ligne.pass ? `${ligne.pass[0].toUpperCase()}${ligne.pass.slice(1)} · ${fcfa(PRIX_PASS[ligne.pass])} FCFA` : '—'}</dd>
        <dt>Services utilisés</dt><dd>{ligne.services}</dd>
        <dt>Téléphone</dt><dd>{formaterTel(ligne.telephone)}</dd>
      </dl>

      <section aria-labelledby="h-ret">
        <h3 id="h-ret">Retenue du mois</h3>
        <table class="det"><tbody>
          <tr><th scope="row">Pass, part du salarié</th><td class="mono">{fcfa(r.pass)}</td></tr>
          <tr><th scope="row">Crédits</th><td class="mono">{fcfa(r.credit)}</td></tr>
          <tr><th scope="row">Coffre d'épargne</th><td class="mono">{fcfa(r.coffre)}</td></tr>
          <tr class="tot"><th scope="row">Total retenu sur la paie</th><td class="mono">{fcfa(r.total)} FCFA</td></tr>
        </tbody></table>
        {#if ligne.pass}<p class="doux note">Part de l'employeur sur le Pass : {fcfa(r.employeur)} FCFA ({libellePart(e.part)}, plafonné à 12 500).</p>{/if}
        {#if r.plafonne}<p class="alerte" role="status">La retenue des crédits est limitée à 33 % du salaire net ({fcfa(r.plafondCredit)} FCFA sur {fcfa(ligne.credit)} FCFA). AssureMe a ajusté le montant : vous n'avez rien à faire.</p>{/if}
        {#if ligne.statut === 'nouveau'}<p class="doux note">Nouvelle inscription : validez la retenue pour l'inclure dans le fichier de paie.</p>{/if}
      </section>

      <form class="salaire" onsubmit={(ev) => { ev.preventDefault(); enregistrerSalaire(); }}>
        <Champ etiquette="Salaire net mensuel" inputmode="numeric" suffixe="FCFA" bind:valeur={salaire} erreur={erreurSalaire} />
        {#if ligne.membre}<p class="doux note">Ce salaire vient du compte AssureMe du salarié : il n'est pas modifiable ici.</p>
        {:else}<button class="btn" type="submit">Enregistrer le salaire</button>{/if}
      </form>

      <div class="actions">
        {#if ligne.statut === 'nouveau'}<button class="btn prim" onclick={valider}>Valider la retenue</button>{/if}
        <button class="btn" onclick={attester}>Délivrer une attestation de salaire</button>
        <button class="btn" onclick={() => montrer('Rappel envoyé par SMS (simulation)')}>Envoyer un rappel</button>
      </div>
    {/if}
  {/if}
</Panneau>

<style>
  .ligne-statut { display: flex; gap: 8px; flex-wrap: wrap; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; font-size: 14.5px; } dt { color: var(--muted); } dd { min-width: 0; }
  h3 { margin-bottom: 6px; } .note { font-size: 13px; margin-top: 8px; }
  .det { width: 100%; border-collapse: collapse; } .det th { text-align: left; font-weight: 400; font-family: var(--sans); text-transform: none; letter-spacing: 0; font-size: 14.5px; color: var(--texte); background: none; padding: 8px 0; border-bottom: 1px solid var(--ligne); } .det td { text-align: right; padding: 8px 0; border-bottom: 1px solid var(--ligne); }
  .det .tot th, .det .tot td { font-weight: 700; border-bottom: 0; }
  .alerte { background: #fff1e6; color: #5c2a04; border: 1px solid #f3c9a6; border-radius: 12px; padding: 10px 12px; margin-top: 10px; font-size: 13.5px; }
  .salaire { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; } .salaire :global(.champ) { align-self: stretch; }
  .actions { display: flex; flex-direction: column; gap: 10px; }
</style>
