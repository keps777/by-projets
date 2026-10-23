<script lang="ts">
  import { jourCourt, jourDe } from '../../core/dates.ts';
  import { fcfa } from '../../core/money.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { type Ecole } from '../../screens/ecole/etat.ts';
  import { famillesAvecPlan, inviterFamilles, paiementsRecus, publierGrille } from './actions.ts';

  let { ec }: { ec: Ecole } = $props();
  // svelte-ignore state_referenced_locally
  let saisie = $state<Record<string, string>>(Object.fromEntries(ec.grille.map((g) => [g.niveau, String(g.montant)])));
  let erreurs = $state<Record<string, string>>({});
  const famillesPlan = $derived(famillesAvecPlan(ec.id));
  const paiements = $derived(paiementsRecus(ec.id));
  const total = $derived(paiements.reduce((s, p) => s + p.montant, 0));
  const modifiee = $derived(ec.grille.some((g) => saisie[g.niveau] !== String(g.montant)));
  const jour = (ts: number) => jourCourt(jourDe(new Date(ts)));
  function publier() {
    const r = publierGrille(ec.id, ec.grille.map((g) => ({ niveau: g.niveau, montant: saisie[g.niveau] ?? '' })));
    if (!r.ok) { erreurs = r.erreurs ?? {}; montrer(r.erreur, 'danger'); return; }
    erreurs = {}; saisie = Object.fromEntries(ec.grille.map((g) => [g.niveau, String(g.montant)])); montrer('Grille publiée : les familles voient les nouveaux frais');
  }
  function inviter() { const r = inviterFamilles(ec.id); if (r.ok) montrer(`Invitation envoyée aux ${r.nombre} familles non connectées`); else montrer(r.erreur, 'danger'); }
</script>

<section class="carte" aria-label="Grille des frais">
  <h2>Grille de frais de scolarité par niveau</h2>
  <p class="muted">Ces frais sont visibles par les familles dans l’app. Un plan déjà signé garde son montant.{#if ec.grillePubliee} Dernière publication : {jour(ec.grillePubliee)}.{/if}</p>
  <form onsubmit={(ev) => { ev.preventDefault(); publier(); }}>
    <div class="defile"><table>
      <thead><tr><th>Niveau</th><th class="num">Frais (FCFA)</th></tr></thead>
      <tbody>
        {#each ec.grille as g (g.niveau)}
          <tr><td><label for={`frais-${g.niveau}`}>{g.niveau}</label></td>
            <td class="num"><input id={`frais-${g.niveau}`} type="text" inputmode="numeric" class:invalide={!!erreurs[g.niveau]} aria-invalid={!!erreurs[g.niveau]} bind:value={saisie[g.niveau]} />{#if erreurs[g.niveau]}<span class="err" role="alert">{erreurs[g.niveau]}</span>{/if}</td></tr>
        {/each}
      </tbody>
    </table></div>
    <button class="btn" type="submit" disabled={!modifiee}>Publier la grille</button>
  </form>
</section>

<section class="carte" aria-label="Familles avec un plan AssureMe">
  <h2>Familles avec un plan AssureMe</h2>
  {#if famillesPlan.length}
    <div class="defile"><table>
      <thead><tr><th>Famille</th><th>Élève</th><th>Niveau</th><th class="num">Frais</th><th>Plan</th></tr></thead>
      <tbody>{#each famillesPlan as f (f.id)}<tr><td>{f.famille}</td><td>{f.eleve}</td><td>{f.niveau}</td><td class="num">{fcfa(f.montant)}</td><td><span class="tag" class:ok={f.statut === 'termine'}>{f.statut === 'termine' ? 'Soldé' : `${f.duree} mois`}</span></td></tr>{/each}</tbody>
    </table></div>
  {:else}<p class="muted">Aucune famille n’a encore choisi un plan AssureMe. Invitez-les depuis le bouton ci-dessous.</p>{/if}
  <button class="btn sec" onclick={inviter}>Inviter les {Math.max(0, ec.familles - ec.connectees)} familles non connectées</button>
</section>

<section class="carte" aria-label="Paiements reçus">
  <h2>Paiements reçus via AssureMe</h2>
  {#if paiements.length}
    <div class="defile"><table>
      <thead><tr><th>Date</th><th>Famille</th><th>Objet</th><th class="num">Montant</th><th>Référence</th></tr></thead>
      <tbody>{#each paiements as p (p.id)}<tr><td>{jour(p.ts)}</td><td>{p.famille}<br /><span class="muted">{p.eleve}</span></td><td>{p.objet}</td><td class="num">{fcfa(p.montant)}</td><td>{p.ref}</td></tr>{/each}</tbody>
      <tfoot><tr><td colspan="3"><b>Total</b></td><td class="num"><b>{fcfa(total)}</b></td><td></td></tr></tfoot>
    </table></div>
  {:else}<p class="muted">Aucun paiement reçu pour l’instant.</p>{/if}
</section>
