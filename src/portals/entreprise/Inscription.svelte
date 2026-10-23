<script lang="ts">
  import './portail.css';
  import { fcfa } from '../../core/money.ts';
  import { libellePart, PARTS_EMPLOYEUR, PLAFOND_PART_EMPLOYEUR, validerEtape, type ChampsInscription, type Erreurs } from '../../core/entreprise.ts';
  import { partEmployeurPass, partMembrePass } from '../../core/prelevement.ts';
  import { PRIX_PASS } from '../../core/sante.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Champ from '../../ui/Champ.svelte';
  import Choix from './Choix.svelte';
  import { lien } from './nav.ts';
  import Entete from './Entete.svelte';
  import { champsInitiaux, enregistrerBrouillon, envoyerDossier } from './actions.ts';
  import { ent } from './etat.ts';

  const existante = !!ent().entreprise; // modification d'un dossier déjà envoyé
  let c: ChampsInscription = $state(champsInitiaux());
  let etape: 1 | 2 | 3 = $state(1);
  let atteinte: 1 | 2 | 3 = $state(existante ? 3 : 1);
  let erreurs: Erreurs = $state({});
  let envoye = $state(false);
  let titreEtape: HTMLElement | undefined = $state();

  const ETAPES = ['Votre entreprise', 'Contact RH', 'Paie et Pass'];
  const SECTEURS = ['Transport et logistique', 'Commerce', 'BTP', 'Agro-industrie', 'Services', 'Industrie', 'Autre'];
  const VILLES = ['Douala', 'Yaoundé', 'Bafoussam', 'Garoua', 'Autre'];

  const aller = (n: 1 | 2 | 3) => { etape = n; atteinte = Math.max(atteinte, n) as 1 | 2 | 3; erreurs = {}; setTimeout(() => titreEtape?.focus(), 0); };
  function suivant() {
    const e = validerEtape(etape, c);
    if (Object.keys(e).length) { erreurs = e; montrer('Corrigez les champs signalés', 'danger'); return; }
    if (etape < 3) aller((etape + 1) as 2 | 3); else envoyer();
  }
  function envoyer() {
    const r = envoyerDossier(c);
    if (!r.ok) { erreurs = r.erreurs; etape = r.etape; montrer('Corrigez les champs signalés', 'danger'); return; }
    envoye = true; montrer(existante ? 'Dossier mis à jour' : 'Dossier envoyé');
    setTimeout(() => titreEtape?.focus(), 0);
  }
  function brouillon() { enregistrerBrouillon(c); montrer('Brouillon enregistré'); }
  function exemple() {
    if (etape === 1) c = { ...c, raisonSociale: 'NDIBA LOGISTIQUE', rccm: 'RC/DLA/2014/B/1287', niu: 'M012345678901', secteur: 'Transport et logistique', ville: 'Douala', effectif: '260' };
    else if (etape === 2) c = { ...c, contactNom: 'Ndiba RH', contactFonction: 'Responsable des ressources humaines', contactTelephone: '6 91 22 48 21' };
    else c = { ...c, jourPaie: '28', part: 0.5, signature: c.contactNom || 'Ndiba RH', convention: true };
    erreurs = {};
  }
  const effacer = (k: keyof ChampsInscription) => () => { if (erreurs[k]) { const { [k]: _, ...reste } = erreurs; erreurs = reste; } };
  const exemplesPass = $derived((['essentiel', 'famille', 'premium'] as const).map((p) => ({ p, prix: PRIX_PASS[p], emp: partEmployeurPass(PRIX_PASS[p], c.part, PLAFOND_PART_EMPLOYEUR), salarie: partMembrePass(PRIX_PASS[p], c.part, PLAFOND_PART_EMPLOYEUR) })));
  const entree = $derived(ent().entreprise);
</script>

<svelte:head><title>Inscription entreprise · AssureMe</title></svelte:head>
<div class="pe">
  {#snippet snippetConnexion()}<a class="btn" href="/portail/entreprise" use:lien>Déjà partenaire ? Ouvrir l'espace employeur</a>{/snippet}
  <Entete droite={existante ? undefined : snippetConnexion} />

  <div class="page">
    <div class="principal">
      <h1 bind:this={titreEtape} tabindex="-1">{envoye ? 'Dossier envoyé' : existante ? 'Modifier votre dossier' : 'Rejoignez AssureMe'}</h1>
      {#if !envoye}<p class="doux intro">Entreprise employeuse : vos salariés accèdent à la santé, l'école, l'épargne et au crédit, retenus sur leur paie. {existante ? '' : 'Environ 5 minutes.'}</p>{/if}

      {#if envoye}
        <section class="carte fin" aria-live="polite">
          <div class="rond" aria-hidden="true">✓</div>
          <h2>{c.raisonSociale}</h2>
          <p>Votre dossier est entre les mains de l'équipe partenaires (vérification du RCCM et du NIU). Dès sa validation, vos salariés peuvent s'inscrire avec le code de votre entreprise{#if entree}&nbsp;: <b class="mono code">{entree.code}</b>{/if}.</p>
          <p class="doux">{c.part === 0 ? 'Vos salariés paieront la totalité de leur Pass.' : `Vous prendrez en charge ${libellePart(c.part)} du Pass de chaque salarié, dans la limite de ${fcfa(PLAFOND_PART_EMPLOYEUR)} FCFA par mois.`}</p>
          <div class="actions"><a class="btn prim" href="/portail/entreprise" use:lien>Ouvrir le tableau de bord employeur</a><button class="btn" onclick={() => { envoye = false; aller(3); }}>Modifier le dossier</button></div>
        </section>
      {:else}
        <ol class="etapes" aria-label="Étapes de l'inscription">
          {#each ETAPES as nom, i (nom)}
            {@const n = (i + 1) as 1 | 2 | 3}
            <li><button class="etape" class:cur={etape === n} class:fait={n < etape} aria-current={etape === n ? 'step' : undefined} disabled={n > atteinte} onclick={() => aller(n)}><span class="n" aria-hidden="true">{n < etape ? '✓' : n}</span><span>{nom}</span></button></li>
          {/each}
        </ol>

        <form class="carte formulaire" onsubmit={(e) => { e.preventDefault(); suivant(); }} novalidate>
          <div class="tete"><h2>{ETAPES[etape - 1]}</h2><span class="doux">Étape {etape} sur 3</span><button type="button" class="btn lien" onclick={exemple}>Remplir avec un exemple</button></div>

          {#if etape === 1}
            <Champ etiquette="Raison sociale" bind:valeur={c.raisonSociale} erreur={erreurs.raisonSociale} oninput={effacer('raisonSociale')} />
            <div class="deux">
              <Champ etiquette="Numéro RCCM" placeholder="RC/DLA/2014/B/1287" bind:valeur={c.rccm} erreur={erreurs.rccm} oninput={effacer('rccm')} />
              <Champ etiquette="Numéro contribuable (NIU)" placeholder="M012345678901" bind:valeur={c.niu} erreur={erreurs.niu} oninput={effacer('niu')} />
            </div>
            <div class="deux">
              <Choix etiquette="Secteur d'activité" options={SECTEURS} bind:valeur={c.secteur} />
              <Choix etiquette="Ville du siège" options={VILLES} bind:valeur={c.ville} erreur={erreurs.ville} />
            </div>
            <Champ etiquette="Nombre de salariés (déclarés à la CNPS)" inputmode="numeric" bind:valeur={c.effectif} erreur={erreurs.effectif} oninput={effacer('effectif')} />
            <p class="doux note">Les numéros RCCM et NIU sont vérifiés par l'équipe partenaires (simulation : seul le format est contrôlé ici).</p>
          {:else if etape === 2}
            <Champ etiquette="Nom complet" placeholder="Prénom et nom" bind:valeur={c.contactNom} erreur={erreurs.contactNom} oninput={effacer('contactNom')} />
            <Champ etiquette="Fonction" placeholder="Directeur général, DRH…" bind:valeur={c.contactFonction} erreur={erreurs.contactFonction} oninput={effacer('contactFonction')} />
            <Champ etiquette="Téléphone" type="tel" inputmode="tel" placeholder="+237 6 XX XX XX XX" bind:valeur={c.contactTelephone} erreur={erreurs.contactTelephone} oninput={effacer('contactTelephone')} />
            <p class="doux note">Nous vous contactons par téléphone et SMS uniquement, jamais par e-mail.</p>
          {:else}
            <Champ etiquette="Jour de paie (chaque mois)" inputmode="numeric" suffixe="du mois" bind:valeur={c.jourPaie} erreur={erreurs.jourPaie} oninput={effacer('jourPaie')} />
            <fieldset class="parts" class:err={!!erreurs.part}>
              <legend>Part du Pass prise en charge par l'employeur</legend>
              <div class="choix" role="radiogroup" aria-label="Part du Pass prise en charge">
                {#each PARTS_EMPLOYEUR as p (p)}
                  <label class="radio" class:on={c.part === p}><input type="radio" name="part" value={p} checked={c.part === p} onchange={() => (c.part = p)} /><b>{libellePart(p)}</b><small>{p === 0 ? 'Le salarié paie tout' : p === 0.5 ? 'La moitié du Pass' : 'Tout le Pass, plafonné'}</small></label>
                {/each}
              </div>
              {#if erreurs.part}<span class="msg" role="alert">{erreurs.part}</span>{/if}
              <div class="tableau"><table>
                <caption class="sr">Répartition du prix du Pass par mois</caption>
                <thead><tr><th scope="col">Pass</th><th scope="col" class="num">Prix</th><th scope="col" class="num">Vous</th><th scope="col" class="num">Salarié</th></tr></thead>
                <tbody>{#each exemplesPass as x (x.p)}<tr><th scope="row" class="cap">{x.p}</th><td class="num mono">{fcfa(x.prix)}</td><td class="num mono">{fcfa(x.emp)}</td><td class="num mono">{fcfa(x.salarie)}</td></tr>{/each}</tbody>
              </table></div>
              <p class="doux note">Votre participation est plafonnée à {fcfa(PLAFOND_PART_EMPLOYEUR)} FCFA par salarié et par mois, pour chaque salarié ayant un Pass.</p>
            </fieldset>

            <div class="convention">
              <h3>Convention de prélèvement</h3>
              <ul>
                <li>Vous retenez chaque mois, sur la paie des salariés inscrits, les mensualités que vous indique le fichier de retenues AssureMe.</li>
                <li>Les crédits d'un salarié ne dépassent jamais 33 % de son salaire net : AssureMe plafonne le fichier à votre place.</li>
                <li>Vous reversez le total à AssureMe sous 2 jours ouvrés après la paie. Les avances sur salaire sont financées par AssureMe, jamais par votre trésorerie.</li>
              </ul>
            </div>
            <Champ etiquette="Signature : tapez votre nom" placeholder="Nom du représentant légal" bind:valeur={c.signature} erreur={erreurs.signature} oninput={effacer('signature')} />
            <div class="champ" class:err={!!erreurs.convention}>
              <label class="case"><input type="checkbox" bind:checked={c.convention} onchange={effacer('convention')} aria-invalid={!!erreurs.convention} /><span>J'ai lu la convention de prélèvement et j'engage {c.raisonSociale.trim() || "l'entreprise"} à la respecter.</span></label>
              {#if erreurs.convention}<span class="msg" role="alert">{erreurs.convention}</span>{/if}
            </div>
          {/if}

          <div class="pied">
            {#if etape > 1}<button type="button" class="btn" onclick={() => aller((etape - 1) as 1 | 2)}>Retour</button>{/if}
            {#if !existante}<button type="button" class="btn" onclick={brouillon}>Enregistrer le brouillon</button>{/if}
            <button type="submit" class="btn prim suiv">{etape < 3 ? 'Continuer' : existante ? 'Enregistrer les modifications' : 'Envoyer pour validation'}</button>
          </div>
        </form>
      {/if}
    </div>

    <aside class="cote" aria-label="Pourquoi rejoindre AssureMe">
      <section class="carte"><h3>Ce que vos salariés obtiennent</h3><ul><li>Frais scolaires payés à la rentrée, remboursés sur 10 mois</li><li>Assurance santé famille dans les hôpitaux du réseau</li><li>Crédit auto, caution de loyer, avance sur salaire</li></ul></section>
      <section class="carte"><h3>Ce que vous y gagnez</h3><ul><li>Un seul fichier de retenues par mois, prêt pour votre logiciel de paie.</li><li>Plus d'avances sur salaire à gérer en interne.</li><li>Des équipes mieux couvertes, qui restent plus longtemps.</li></ul></section>
      <p class="doux engagement">Votre engagement : retenir les mensualités sur la paie et les reverser à AssureMe sous 2 jours ouvrés.</p>
    </aside>
  </div>
</div>

<style>
  .page { display: grid; gap: 20px; grid-template-columns: 1fr; align-items: start; }
  @media (min-width: 900px) { .page { grid-template-columns: minmax(0, 1fr) 320px; gap: 28px; } }
  .principal { display: flex; flex-direction: column; gap: 14px; min-width: 0; } h1:focus { outline: none; }
  .intro { max-width: 60ch; }
  .etapes { list-style: none; display: flex; gap: 8px; flex-wrap: wrap; }
  .etape { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 14px 0 8px; border-radius: 99px; border: 1px solid transparent; color: var(--muted); font-weight: 500; }
  .etape:disabled { opacity: 0.6; cursor: default; }
  .etape .n { width: 28px; height: 28px; border-radius: 14px; display: grid; place-items: center; font: 600 13px var(--mono); border: 1px solid var(--ligne-forte); }
  .etape.cur { background: var(--carte); border-color: var(--ligne); color: var(--texte); font-weight: 700; } .etape.cur .n { background: var(--texte); color: var(--carte); border-color: transparent; }
  .etape.fait .n { background: var(--primaire); color: #fff; border-color: transparent; }
  .formulaire { display: flex; flex-direction: column; gap: 16px; padding: 22px; }
  .tete { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; } .tete .btn { margin-left: auto; }
  .deux { display: grid; gap: 16px; grid-template-columns: 1fr; } @media (min-width: 640px) { .deux { grid-template-columns: 1fr 1fr; } }
  .note { font-size: 13px; }
  fieldset.parts { border: 0; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  .choix { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .radio { position: relative; display: flex; flex-direction: column; gap: 2px; padding: 12px; min-height: 76px; border-radius: 14px; border: 1px solid var(--ligne-forte); cursor: pointer; background: var(--carte); }
  .radio b { font-size: 20px; } .radio small { color: var(--muted); font-size: 12.5px; }
  .radio.on { border: 2px solid var(--primaire); background: var(--primaire-fond); padding: 11px; }
  .radio:focus-within { outline: 2px solid var(--primaire); outline-offset: 2px; }
  .radio input { position: absolute; opacity: 0; inset: 0; cursor: pointer; }
  .convention { background: var(--carte2); border-radius: 14px; padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; }
  ul { padding-left: 18px; display: flex; flex-direction: column; gap: 6px; line-height: 1.4; font-size: 14px; }
  .case { display: flex; gap: 12px; align-items: flex-start; min-height: 44px; cursor: pointer; line-height: 1.4; }
  .case input { width: 24px; height: 24px; flex: none; margin-top: 0; accent-color: var(--primaire); }
  .pied { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; margin-top: 4px; } .suiv { min-width: 180px; }
  .cote { display: flex; flex-direction: column; gap: 14px; } .cote h3 { margin-bottom: 8px; } .engagement { font-size: 13px; }
  .fin { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; padding: 28px; }
  .rond { width: 56px; height: 56px; border-radius: 28px; background: #dcf5ea; color: #0b6b44; display: grid; place-items: center; font-size: 28px; font-weight: 700; }
  .code { background: var(--carte2); padding: 2px 8px; border-radius: 8px; }
  .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 6px; }
</style>
