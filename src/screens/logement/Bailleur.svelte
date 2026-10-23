<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Carte from '../../ui/Carte.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Pastille from '../../ui/Pastille.svelte';
  import Jauge from '../../ui/Jauge.svelte';
  import { aller, param } from '../../router.svelte.ts';
  import { app } from '../../data/store.svelte.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { ajouterMois, heure, jourCourt, jourDe, jourLong, moisAnnee } from '../../core/dates.ts';
  import { masquerTel } from '../../core/auth.ts';
  import { fcfa } from '../../core/money.ts';
  import { PLAFOND_ENDETTEMENT, type Decision } from '../../core/credit.ts';
  import { libelleCompte, premierePrelevement, simuler, telephoneSms } from '../../core/avance-loyer.ts';
  import { abandonnerDossier, accordBailleur, annulerDemande, blocage, envoyerPourDecision, manques } from './actions.ts';
  import { entreeSimulation, logement } from './etat.ts';
  import Verrou from './Verrou.svelte';
  import FeuilleEquipement from './FeuilleEquipement.svelte';

  const l = logement();
  const bloque = $derived(blocage());
  const d = $derived(l.dossier);
  const preuve = $derived((param('recu') && l.preuves.find((p) => p.id === param('recu'))) || undefined);
  const manque = $derived(manques(d));
  const sim = $derived(simuler(entreeSimulation(l.sim)));
  let occupe = $state(false);
  let feuilleEquip = $state(false);
  let refus = $state<Decision | null>(null);
  const decision = $derived(refus ?? d?.decision ?? null);

  function lancer() {
    refus = null;
    const r = envoyerPourDecision();
    if (r && r.approuve) montrer('Demande envoyée au bailleur par SMS');
  }
  function simulerAccord() {
    occupe = true;
    const r = accordBailleur();
    occupe = false;
    if (!r) return;
    if ('refus' in r) { refus = r.refus; return; }
    aller(`/logement/bailleur?recu=${r.preuve.id}`, { remplacer: true });
  }
  function abandonner() { abandonnerDossier(); aller('/logement', { remplacer: true }); }

  // Vue « terminé » : lue dans la preuve et dans le crédit.
  const credit = $derived(preuve ? app.credits.find((c) => c.id === preuve.creditId) : undefined);
  const premiere = $derived.by(() => {
    if (!preuve || !app.compte) return null;
    return credit ? ajouterMois(credit.prochaine, -credit.payees, app.compte.jourPaie) : premierePrelevement(jourDe(new Date(preuve.ts)), app.compte.jourPaie);
  });
  const apres = $derived(preuve && premiere ? moisAnnee(ajouterMois(premiere, preuve.duree)) : '');
  const quand = $derived(preuve ? `${jourCourt(jourDe(new Date(preuve.ts)))} ${heure(preuve.ts)}` : '');
  const bailActuel = $derived(l.bail && preuve && l.bail.avanceId === preuve.creditId ? l.bail : undefined);
</script>

{#snippet controles(dec: Decision)}
  <ul class="controles" aria-label="Contrôles de la décision">
    {#each dec.controles as c (c.id)}
      <li class:ko={!c.ok}>
        <span class="pastille" aria-hidden="true"><Icone nom={c.ok ? 'ok' : 'fermer'} taille={14} trait={2.6} /></span>
        <div><b>{c.titre}</b><small>{c.detail}</small></div>
        <Pastille ton={c.ok ? 'bon' : 'danger'}>{c.tag}</Pastille>
        <span class="sr">{c.ok ? 'validé' : 'refusé'}</span>
      </li>
    {/each}
  </ul>
{/snippet}

{#if preuve}
  <Ecran titre="Logement" sur="ÉTAPE 3 / 3 · TERMINÉ" retourVers="/logement">
    <div class="succes">
      <span class="grand" aria-hidden="true"><Icone nom="ok" taille={30} trait={2.6} /></span>
      <h2>Les clés sont à vous.</h2>
      <p class="muted">{preuve.bailleur} a accepté et reçu l'avance. Entrée le {jourLong(preuve.entree)}.</p>
    </div>

    <Carte accent="var(--bon)">
      <p class="mono sur">ASSUREME → {preuve.bailleur.toUpperCase()}</p>
      <p class="montant mono">{fcfa(preuve.montant)}</p>
      <p class="muted">{preuve.mois} mois d'avance {fcfa(preuve.loyer * preuve.mois)} · {preuve.compteLibelle} · {quand}</p>
      <p class="mono ref">PREUVE DE PAIEMENT {preuve.reference}</p>
    </Carte>

    <Carte>
      <div class="rang"><span class="muted">Votre prélèvement logement, {preuve.duree} mois</span><b class="mono">{fcfa(preuve.loyer + preuve.remboursement)} / mois</b></div>
      <div class="rang"><span class="muted">Puis, dès {apres}</span><b class="mono">{fcfa(preuve.loyer)} / mois</b></div>
      <div class="rang"><span class="muted">Loyer versé au bailleur</span><b>le 1er, garanti</b></div>
    </Carte>

    <Carte href="/score">
      <div class="rang"><div><span class="mono sur">ASSURESCORE</span><b class="mono gros">{app.score.valeur}</b></div><span class="mono bon">+6 / loyer payé</span></div>
    </Carte>
    <Carte onclick={() => montrer("Attestation d'assurance envoyée par SMS")}>
      <div class="rang"><div><span class="mono sur">ASSURANCE HABITATION</span><br /><b>Incluse · {fcfa(preuve.assurance)} / mois</b></div><Icone nom="suivant" /></div>
    </Carte>
    {#if bailActuel}
      <Carte onclick={() => (feuilleEquip = true)}>
        <div class="rang"><div><b>{bailActuel.equipement ? `Équipement commandé · ${bailActuel.equipement.ids.length} article${bailActuel.equipement.ids.length > 1 ? 's' : ''}` : 'Équiper le logement'}</b><br /><small class="muted">{bailActuel.equipement ? `Livraison le ${jourLong(bailActuel.equipement.livraison)} au logement` : 'Frigo, matelas, kit solaire : payés par mois au magasin partenaire'}</small></div><Icone nom="suivant" /></div>
      </Carte>
    {/if}
    {#snippet pied()}<Bouton href="/logement">Voir mon logement</Bouton>{/snippet}
  </Ecran>
  <FeuilleEquipement bind:ouverte={feuilleEquip} />
{:else}
  <Ecran titre="Envoi au bailleur" sur="ÉTAPE 3 / 3" retourVers="/logement/justificatifs">
    {#if bloque}
      <Verrou />
    {:else if !d}
      <Carte>
        <b>Aucun dossier en cours</b>
        <p class="muted" style="margin: 6px 0 12px">Simulez votre avance et ajoutez le bail pour l'envoyer au bailleur.</p>
        <Bouton href="/logement/avance">Simuler une avance</Bouton>
      </Carte>
    {:else}
      <Carte>
        <h2>{d.logement || 'Votre logement'}</h2>
        <p class="muted">Entrée le {jourLong(d.entree)} · {d.bailleur}</p>
        <dl>
          <div><dt>Versé au bailleur</dt><dd class="mono">{fcfa(sim.avance)}</dd></div>
          <div><dt>Compte</dt><dd>{d.compte ? libelleCompte(d.compte.type, d.compte.numero) : '—'}</dd></div>
          <div><dt>Loyer + remboursement</dt><dd class="mono">{fcfa(l.sim.loyer)} + {fcfa(sim.remboursement)}</dd></div>
          <div><dt>Prélèvement, {l.sim.duree} mois</dt><dd class="mono">{fcfa(sim.prelevement)} / mois</dd></div>
          <div><dt>Part du salaire</dt><dd class="mono">{sim.pct} % · plafond 33 %</dd></div>
        </dl>
        <Jauge pct={Math.min(100, sim.part * 100)} trait={PLAFOND_ENDETTEMENT * 100} couleur={sim.depasse ? 'var(--danger)' : sim.etat === 'limite' ? 'var(--alerte)' : 'var(--bon)'} />
      </Carte>

      {#if decision}
        <section aria-labelledby="dec">
          <h3 id="dec" class="titre">{decision.approuve ? 'Dossier accepté' : 'Dossier refusé'}</h3>
          {@render controles(decision)}
          {#if !decision.approuve}
            <p class="err" role="alert">{decision.motif}. Ajustez votre simulation ou votre dossier, puis relancez la décision.</p>
          {/if}
        </section>
      {/if}

      {#if d.statut === 'accord_attendu' && d.compte}
        <Carte accent="var(--primaire)">
          <div class="rang"><b>En attente de l'accord du bailleur</b><Pastille ton="primaire">SMS envoyé</Pastille></div>
          <p class="muted" style="margin-top: 6px">Un SMS a été envoyé à {d.bailleur} au {masquerTel(telephoneSms(d.compte.type, d.compte.numero, d.compte.telephone))}. Dès qu'il répond OUI, l'avance lui est versée directement.</p>
          <p class="mono demo">SIMULATION · aucun vrai SMS n'est envoyé</p>
        </Carte>
      {/if}
    {/if}
    {#snippet pied()}
      {#if !bloque && d}
        {#if d.statut === 'accord_attendu'}
          <div class="boutons">
            <Bouton desactive={occupe} onclick={simulerAccord}>Le bailleur répond OUI (simulation)</Bouton>
            <Bouton variante="discret" onclick={annulerDemande}>Annuler la demande</Bouton>
          </div>
        {:else if manque.length}
          <p class="manque" role="status">Il manque : {manque.join(', ')}.</p>
          <Bouton href="/logement/justificatifs" variante="secondaire">Compléter le dossier</Bouton>
        {:else}
          <div class="boutons">
            <Bouton onclick={lancer}>{decision && !decision.approuve ? 'Relancer la décision' : 'Lancer la décision'}</Bouton>
            {#if decision && !decision.approuve}<Bouton variante="secondaire" href="/logement/avance">Modifier ma simulation</Bouton>{/if}
            <Bouton variante="discret" onclick={abandonner}>Abandonner le dossier</Bouton>
          </div>
        {/if}
      {/if}
    {/snippet}
  </Ecran>
{/if}

<style>
  .succes { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; } .grand { width: 60px; height: 60px; border-radius: 20px; background: rgba(61, 213, 152, 0.16); color: var(--bon); display: grid; place-items: center; }
  h2 { font-size: 22px; font-weight: 650; letter-spacing: -0.02em; } h3 { font-size: 16px; font-weight: 650; } .titre { margin-bottom: 8px; }
  .sur { font-size: 10.5px; letter-spacing: 0.12em; color: var(--primaire-clair); } .montant { font-size: 34px; font-weight: 500; letter-spacing: -0.03em; margin: 6px 0; } .ref { margin-top: 10px; font-size: 10.5px; letter-spacing: 0.08em; color: var(--muted); }
  .rang { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 4px 0; font-size: 14px; } .gros { font-size: 28px; display: block; } .bon { color: var(--bon); font-size: 12.5px; } small { font-size: 12.5px; }
  dl { margin: 12px 0; } dl div { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--ligne); font-size: 14px; } dl div:last-child { border: 0; } dt { color: var(--muted); } dd { text-align: right; }
  .controles { list-style: none; display: flex; flex-direction: column; gap: 8px; }
  .controles li { display: grid; grid-template-columns: 26px 1fr; gap: 4px 12px; padding: 12px; border-radius: 16px; background: var(--carte); border: 1px solid rgba(61, 213, 152, 0.3); }
  .controles li.ko { border-color: rgba(255, 114, 114, 0.45); } .controles li div { display: flex; flex-direction: column; gap: 3px; } .controles li b { font-size: 14.5px; } .controles li small { color: var(--muted); line-height: 1.4; }
  .controles li :global(.p) { grid-column: 2; justify-self: start; }
  .pastille { width: 24px; height: 24px; border-radius: 12px; display: grid; place-items: center; background: rgba(61, 213, 152, 0.18); color: var(--bon); margin-top: 1px; } .ko .pastille { background: rgba(255, 114, 114, 0.18); color: var(--danger); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .err { color: var(--danger); font-size: 13.5px; margin-top: 10px; } .demo { font-size: 10.5px; letter-spacing: 0.08em; color: var(--alerte); margin-top: 10px; }
  .boutons { display: flex; flex-direction: column; gap: 6px; } .manque { font-size: 13px; color: var(--alerte); margin-bottom: 8px; text-align: center; }
</style>
