<script lang="ts">
  import { app } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import Bouton from '../../ui/Bouton.svelte';
  import Carte from '../../ui/Carte.svelte';
  import Champ from '../../ui/Champ.svelte';
  import Ecran from '../../ui/Ecran.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Pastille from '../../ui/Pastille.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { formaterTel, LONGUEUR_CODE } from '../../core/auth.ts';
  import { niveauDuScore, type Pass } from '../../core/credit.ts';
  import { enDate, moisAnnee, jourDe } from '../../core/dates.ts';
  import { fcfa, lireMontant } from '../../core/money.ts';
  import { initiales, planDe, tarifPass, trouverEmployeur } from '../../core/inscription.ts';
  import { CODE_DEMO } from '../../data/constantes.ts';
  import { libelleProchaine } from '../../data/paie.ts';
  import Alerte from './Alerte.svelte';
  import Clavier from './Clavier.svelte';
  import Interrupteur from './Interrupteur.svelte';
  import ListePass from './ListePass.svelte';
  import ProchesFamille from './ProchesFamille.svelte';
  import SaisieCode from './SaisieCode.svelte';
  import { activerDemo, changerPass, lirePermissionNotif, mettreAJourInfos, quitterDemo } from './actions.ts';
  import { etatAuth } from './etat.ts';
  import { tarifPassMembre } from './tarif.ts';

  const e = etatAuth();
  const c = $derived(app.compte);
  const niveau = $derived(niveauDuScore(app.score.valeur));
  const plan = $derived(c ? planDe(c.pass) : planDe('famille'));
  const tarif = $derived(c ? tarifPassMembre(c, c.pass, e.facturation, e.employeurCode) : null);
  const permission = lirePermissionNotif();
  const depuis = $derived(c ? moisAnnee(jourDe(new Date(c.cree))) : '');

  type Panneau = '' | 'infos' | 'pass' | 'famille' | 'demo' | 'vierge';
  let panneau = $state<Panneau>('');

  // --- infos de paie
  let employeur = $state(''); let codeEmp = $state(''); let salaire = $state(''); let jour = $state(''); let erreurInfos = $state('');
  function ouvrirInfos() {
    employeur = c?.employeur ?? ''; codeEmp = e.employeurCode; salaire = c?.salaireNet ? String(c.salaireNet) : ''; jour = String(c?.jourPaie ?? 28); erreurInfos = ''; panneau = 'infos';
  }
  function enregistrerInfos() {
    const montant = salaire.trim() === '' ? 0 : lireMontant(salaire);
    if (montant == null) { erreurInfos = 'Salaire net : montant illisible.'; return; }
    const r = mettreAJourInfos({ employeur, codeEmployeur: codeEmp, salaireNet: montant, jourPaie: Number(jour) });
    if (r) { erreurInfos = r; return; }
    panneau = ''; montrer('Informations enregistrées');
  }

  // --- Pass
  let passChoisi = $state<Pass>('famille'); let facturation = $state(e.facturation);
  const tarifChoisi = $derived(c ? tarifPassMembre(c, passChoisi, facturation, e.employeurCode) : tarifPass(passChoisi, facturation, trouverEmployeur(e.employeurCode)));
  function ouvrirPass() { passChoisi = c?.pass ?? 'famille'; facturation = e.facturation; panneau = 'pass'; }
  function enregistrerPass() { changerPass(passChoisi, facturation); panneau = ''; montrer(`Pass ${planDe(passChoisi).nom} enregistré`); }

  // --- mode démo
  let code = $state(''); let faux = $state(false); let secousse = $state(0); let occupe = $state(false);
  function ouvrirDemo() { code = ''; faux = false; panneau = 'demo'; }
  async function chiffre(d: string) {
    if (occupe || code.length >= LONGUEUR_CODE) return;
    if (faux) { code = ''; faux = false; }
    code += d;
    if (code.length < LONGUEUR_CODE) return;
    if (code !== CODE_DEMO) { faux = true; secousse++; return; }
    occupe = true; await activerDemo(); occupe = false; panneau = ''; montrer('Mode démonstration activé'); aller('/');
  }
  function quitter() { quitterDemo(); panneau = ''; aller('/bienvenue', { remplacer: true }); }
  function basculerDemo() { if (app.mode === 'demo') panneau = 'vierge'; else ouvrirDemo(); }
</script>

<Ecran titre="Profil" sansRetour>
  {#if !c}
    <Carte><p class="muted">Aucun compte n'est ouvert sur cet appareil.</p><Bouton href="/inscription/telephone">Créer mon compte</Bouton></Carte>
  {:else}
    <section class="tete" aria-label="Mon identité">
      <span class="av" aria-hidden="true">{initiales(c.prenom, c.nom)}</span>
      <div class="id"><h2>{c.prenom} {c.nom}</h2><p class="mono">{c.numeroMembre} · membre depuis {depuis}</p></div>
      <div class="tags"><Pastille ton="primaire">Pass {plan.nom}</Pastille><Pastille ton="bon">Niveau {niveau}</Pastille>{#if app.mode === 'demo'}<Pastille ton="alerte">Démo</Pastille>{/if}</div>
    </section>

    <Carte>
      <div class="titre"><h3>Mon compte</h3><button type="button" class="lien" onclick={ouvrirInfos}>Modifier</button></div>
      <dl>
        <div><dt>Téléphone</dt><dd class="mono">+237 {formaterTel(c.telephone)}</dd></div>
        <div><dt>Employeur</dt><dd>{c.employeur || 'Non renseigné'}</dd></div>
        <div><dt>Salaire net</dt><dd class="mono">{c.salaireNet > 0 ? `${fcfa(c.salaireNet)} FCFA` : 'À renseigner'}</dd></div>
        <div><dt>Jour de paie</dt><dd>le {c.jourPaie} du mois{#if c.salaireNet > 0} · prochaine le {libelleProchaine()}{/if}</dd></div>
        {#if c.ville}<div><dt>Ville</dt><dd>{c.ville}{c.quartier ? `, ${c.quartier}` : ''}</dd></div>{/if}
        {#if c.anciennete}<div><dt>Ancienneté</dt><dd>{c.anciennete}</dd></div>{/if}
      </dl>
      {#if c.salaireNet === 0}<p class="note">Renseignez votre salaire net pour calculer ce que vous pouvez emprunter (33 % maximum du salaire).</p>{/if}
    </Carte>

    <Carte accent="var(--primaire)">
      <div class="titre"><h3>Mon Pass</h3><button type="button" class="lien" onclick={ouvrirPass}>Changer</button></div>
      <div class="pass"><b>Pass {plan.nom}</b>{#if tarif}<span class="mono">{fcfa(tarif.membre)} FCFA / {tarif.unite}</span>{/if}</div>
      {#if tarif}<p class="note">{tarif.employeur > 0 ? `Votre employeur prend ${fcfa(tarif.employeur)} FCFA en charge sur ${fcfa(tarif.total)}. ` : ''}Prélevé sur salaire{e.facturation === 'annuel' ? ', une fois par an (10 % de remise)' : ' chaque mois'}.</p>{/if}
      {#if c.pass !== 'essentiel'}<button type="button" class="lien bas" onclick={() => (panneau = 'famille')}>Carte famille · {e.proches.length} proche{e.proches.length > 1 ? 's' : ''}<Icone nom="suivant" taille={14} trait={2.2} /></button>{/if}
    </Carte>

    <Carte>
      <h3>Sécurité</h3>
      <a class="rang" href="/profil/appareils" onclick={(ev) => { ev.preventDefault(); aller('/profil/appareils'); }}>
        <span class="ic"><Icone nom="verrou" taille={20} /></span><span class="t"><b>Appareils et code</b><small>{app.auth.appareils.length} appareil{app.auth.appareils.length > 1 ? 's' : ''} de confiance · {app.auth.biometrie ? 'biométrie active' : 'biométrie inactive'}</small></span><Icone nom="suivant" taille={16} />
      </a>
    </Carte>

    <Carte>
      <h3>Notifications</h3>
      <Interrupteur bind:actif={e.notif.paiements} titre="Paiements et factures" aide="Chaque débit, chaque reçu signé" />
      <Interrupteur bind:actif={e.notif.salaire} titre="Prélèvement sur salaire" aide="Le jour de paie, ce qui est prélevé" />
      <Interrupteur bind:actif={e.notif.score} titre="AssureScore" aide="Points gagnés, changement de niveau" />
      <div class="perm">
        <span>{permission === 'accordee' ? 'Notifications autorisées sur cet appareil.' : permission === 'refusee' ? 'Notifications bloquées par le navigateur.' : permission === 'indisponible' ? 'Notifications non disponibles sur ce navigateur.' : 'Notifications pas encore autorisées.'}</span>
        {#if permission !== 'accordee'}<button type="button" class="lien" onclick={() => aller('/notifications-permission?depuis=profil')}>Autoriser</button>{/if}
      </div>
    </Carte>

    <Carte>
      <h3>Réglages</h3>
      <Interrupteur controle actif={app.mode === 'demo'} titre="Mode démonstration" aide={app.mode === 'demo' ? "Vous voyez les données d'exemple d'Aïcha Ndiba." : "Charge les données d'exemple d'Aïcha Ndiba (code démo requis)."} onchange={basculerDemo} />
      <p class="note">Les données sont enregistrées sur cet appareil. Aucun e-mail n'est jamais envoyé : les rappels passent par les notifications.</p>
    </Carte>

    <Bouton variante="danger" href="/deconnexion"><Icone nom="fermer" taille={18} />Se déconnecter</Bouton>
    <p class="version mono">AssureMe · version 0.1 · données sur cet appareil</p>
    <div class="espace" aria-hidden="true"></div>
  {/if}
</Ecran>

<Feuille bind:ouverte={() => panneau === 'infos', (v) => { if (!v) panneau = ''; }} titre="Mon compte" sous="Informations de paie">
  <Champ etiquette="Employeur" bind:valeur={employeur} placeholder="Nom de l'entreprise" />
  <Champ etiquette="Code employeur (facultatif)" bind:valeur={codeEmp} placeholder="NDIBA-2026" />
  <Champ etiquette="Salaire net mensuel" bind:valeur={salaire} inputmode="numeric" suffixe="FCFA" placeholder="520 000" />
  <Champ etiquette="Jour de paie (1 à 31)" bind:valeur={jour} inputmode="numeric" placeholder="28" />
  {#if erreurInfos}<Alerte ton="erreur">{erreurInfos}</Alerte>{/if}
  <Bouton onclick={enregistrerInfos}>Enregistrer</Bouton>
  <Bouton variante="discret" onclick={() => (panneau = '')}>Annuler</Bouton>
</Feuille>

<Feuille bind:ouverte={() => panneau === 'pass', (v) => { if (!v) panneau = ''; }} titre="Changer de Pass" sous="Sans engagement">
  <ListePass bind:pass={passChoisi} bind:facturation employeur={trouverEmployeur(e.employeurCode)} />
  <p class="note">À prélever sur votre salaire : <b class="mono">{fcfa(tarifChoisi.membre)} FCFA / {tarifChoisi.unite}</b>{tarifChoisi.employeur > 0 ? ` (après ${fcfa(tarifChoisi.employeur)} pris en charge par l'employeur)` : ''}.</p>
  <Bouton onclick={enregistrerPass}>Enregistrer le Pass {planDe(passChoisi).nom}</Bouton>
  <Bouton variante="discret" onclick={() => (panneau = '')}>Annuler</Bouton>
</Feuille>

<Feuille bind:ouverte={() => panneau === 'famille', (v) => { if (!v) panneau = ''; }} titre="Carte famille" sous="Pass {plan.nom}">
  <ProchesFamille onfini={() => (panneau = '')} />
</Feuille>

<Feuille bind:ouverte={() => panneau === 'demo', (v) => { if (!v) panneau = ''; }} titre="Mode démonstration" sous="Code démo">
  <p class="muted">Saisissez le code démo ({CODE_DEMO}) pour charger le compte d'Aïcha Ndiba. {#if app.auth.hash && app.mode === 'vierge'}<b>Votre compte actuel sera remplacé sur cet appareil.</b>{/if}</p>
  <SaisieCode valeur={code} variante="points" ton={faux ? 'mauvais' : 'neutre'} {secousse} etiquette="Code démo" />
  <div class="msg" aria-live="polite">{#if faux}<Alerte ton="erreur">Code démo incorrect.</Alerte>{/if}</div>
  <Clavier compact onchiffre={chiffre} oneffacer={() => { code = faux ? '' : code.slice(0, -1); faux = false; }} desactive={occupe} />
</Feuille>

<Feuille bind:ouverte={() => panneau === 'vierge', (v) => { if (!v) panneau = ''; }} titre="Quitter la démonstration ?" sous="Mode démo">
  <p class="muted">Les données d'exemple seront effacées et l'application repartira d'un compte vierge (aucun solde, aucun crédit).</p>
  <Bouton variante="danger" onclick={quitter}>Revenir à un compte vierge</Bouton>
  <Bouton variante="discret" onclick={() => (panneau = '')}>Rester en démonstration</Bouton>
</Feuille>

<style>
  .tete { display: grid; grid-template-columns: 64px 1fr; gap: 6px 14px; align-items: center; padding: 6px 2px 4px; }
  .av { grid-row: span 2; width: 64px; height: 64px; border-radius: 32px; background: var(--carte2); border: 2px solid rgba(124, 147, 255, 0.5); display: grid; place-items: center; font-weight: 600; font-size: 22px; color: #c9d2ff; box-shadow: 0 0 30px rgba(48, 80, 255, 0.35); }
  .id h2 { font-size: 21px; font-weight: 650; letter-spacing: -0.03em; } .id p { font-size: 12px; color: var(--muted); letter-spacing: 0.02em; } .tags { grid-column: 2; display: flex; gap: 6px; flex-wrap: wrap; }
  h3 { font: 500 11px var(--mono); letter-spacing: 0.12em; color: var(--muted); text-transform: uppercase; margin-bottom: 4px; } .titre { display: flex; justify-content: space-between; align-items: center; } .titre h3 { margin: 0; }
  .lien { min-height: 44px; padding: 0 4px; color: var(--primaire-clair); font-weight: 600; font-size: 14px; display: inline-flex; align-items: center; gap: 4px; } .lien.bas { margin-top: 2px; }
  dl { display: flex; flex-direction: column; } dl div { display: flex; justify-content: space-between; gap: 16px; padding: 10px 0; border-bottom: 1px solid var(--ligne); font-size: 14px; } dl div:last-child { border: 0; } dt { color: var(--muted); flex: none; } dd { text-align: right; font-weight: 500; }
  .note { font-size: 12.5px; color: var(--muted); line-height: 1.45; margin-top: 6px; }
  .pass { display: flex; justify-content: space-between; align-items: baseline; margin-top: 4px; } .pass b { font-size: 17px; } .pass span { font-size: 14px; color: var(--pale); }
  .rang { display: flex; align-items: center; gap: 12px; min-height: 56px; color: var(--muted); } .ic { width: 40px; height: 40px; border-radius: 12px; background: var(--primaire-fond); color: var(--primaire-clair); display: grid; place-items: center; flex: none; } .t { flex: 1; display: flex; flex-direction: column; } .t b { color: var(--texte); font-size: 14.5px; } small { color: var(--muted); font-size: 12.5px; }
  .perm { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding-top: 6px; font-size: 12.5px; color: var(--muted); }
  .version { text-align: center; font-size: 10.5px; color: var(--faint); letter-spacing: 0.06em; } .espace { height: 76px; } .msg { min-height: 46px; }
</style>
