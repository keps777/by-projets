<script lang="ts">
  import { fcfa } from '../../core/money.ts';
  import { formaterTel, libellePart, PARTS_EMPLOYEUR, PLAFOND_PART_EMPLOYEUR, type Erreurs } from '../../core/entreprise.ts';
  import { partEmployeurPass, partMembrePass } from '../../core/prelevement.ts';
  import { PRIX_PASS } from '../../core/sante.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Champ from '../../ui/Champ.svelte';
  import { enregistrerParametres } from './actions.ts';
  import { ent } from './etat.ts';
  import { copier, lien } from './nav.ts';

  const e = ent().entreprise!;
  let nom = $state(e.contact.nom), fonction = $state(e.contact.fonction), tel = $state(formaterTel(e.contact.telephone)), jour = $state(String(e.jourPaie)), part: number = $state(e.part);
  let erreurs: Erreurs = $state({});
  const exemples = $derived((['essentiel', 'famille', 'premium'] as const).map((p) => ({ p, prix: PRIX_PASS[p], emp: partEmployeurPass(PRIX_PASS[p], part, PLAFOND_PART_EMPLOYEUR), sal: partMembrePass(PRIX_PASS[p], part, PLAFOND_PART_EMPLOYEUR) })));
  const modifie = $derived(nom !== e.contact.nom || fonction !== e.contact.fonction || tel !== formaterTel(e.contact.telephone) || jour !== String(e.jourPaie) || part !== e.part);

  function enregistrer(ev: SubmitEvent) {
    ev.preventDefault();
    const r = enregistrerParametres({ contactNom: nom, contactFonction: fonction, contactTelephone: tel, jourPaie: jour, part });
    if (!r.ok) { erreurs = r.erreurs; montrer('Corrigez les champs signalés', 'danger'); return; }
    erreurs = {}; tel = formaterTel(e.contact.telephone); montrer('Paramètres enregistrés');
  }
  async function copierCode() { montrer((await copier(e.code)) ? "Code de l'entreprise copié" : 'Copie impossible : notez le code à la main', 'bon'); }
</script>

<div><h1>Paramètres</h1><p class="doux">Contact RH, jour de paie et part du Pass prise en charge.</p></div>

<div class="grille">
  <form class="carte" onsubmit={enregistrer} novalidate aria-label="Paramètres de l'espace employeur">
    <h2>Contact RH et paie</h2>
    <Champ etiquette="Nom du contact RH" bind:valeur={nom} erreur={erreurs.contactNom} />
    <Champ etiquette="Fonction" bind:valeur={fonction} erreur={erreurs.contactFonction} />
    <Champ etiquette="Téléphone" type="tel" inputmode="tel" bind:valeur={tel} erreur={erreurs.contactTelephone} />
    <Champ etiquette="Jour de paie" inputmode="numeric" suffixe="du mois" bind:valeur={jour} erreur={erreurs.jourPaie} />

    <fieldset>
      <legend>Part du Pass prise en charge par l'employeur</legend>
      <div class="choix" role="radiogroup" aria-label="Part du Pass prise en charge">
        {#each PARTS_EMPLOYEUR as p (p)}<label class="radio" class:on={part === p}><input type="radio" name="part-param" value={p} checked={part === p} onchange={() => (part = p)} /><b>{libellePart(p)}</b></label>{/each}
      </div>
      <div class="tableau"><table>
        <caption class="sr">Répartition du prix du Pass par mois</caption>
        <thead><tr><th scope="col">Pass</th><th scope="col" class="num">Prix</th><th scope="col" class="num">Vous</th><th scope="col" class="num">Salarié</th></tr></thead>
        <tbody>{#each exemples as x (x.p)}<tr><th scope="row" class="cap">{x.p}</th><td class="num mono">{fcfa(x.prix)}</td><td class="num mono">{fcfa(x.emp)}</td><td class="num mono">{fcfa(x.sal)}</td></tr>{/each}</tbody>
      </table></div>
      <p class="doux note">Plafond : {fcfa(PLAFOND_PART_EMPLOYEUR)} FCFA par salarié et par mois. {e.statut === 'valide' ? 'Le changement s\'applique au prochain prélèvement du Pass.' : 'Sans effet tant que le dossier n\'est pas validé.'}</p>
    </fieldset>
    <button class="btn prim" type="submit" disabled={!modifie}>Enregistrer</button>
  </form>

  <div class="colonne">
    <section class="carte">
      <h2>Code de l'entreprise</h2>
      <p class="doux">Vos salariés saisissent ce code à leur inscription pour rejoindre l'entreprise.</p>
      <p class="code mono" aria-label="Code de l'entreprise">{e.code}</p>
      <button class="btn" onclick={copierCode}>Copier le code</button>
    </section>
    <section class="carte">
      <h2>Dossier</h2>
      <dl>
        <dt>Raison sociale</dt><dd>{e.raisonSociale}</dd><dt>RCCM</dt><dd class="mono">{e.rccm}</dd><dt>NIU</dt><dd class="mono">{e.niu}</dd>
        <dt>Siège</dt><dd>{e.ville} · {e.secteur}</dd><dt>Effectif déclaré</dt><dd>{e.effectif} salariés</dd>
        <dt>Statut</dt><dd>{e.statut === 'valide' ? 'Validé par AssureMe' : 'En cours de validation'}</dd>
      </dl>
      <a class="btn" href="/portail/entreprise/inscription" use:lien>Modifier le dossier</a>
    </section>
  </div>
</div>

<style>
  .grille { display: grid; gap: 18px; grid-template-columns: 1fr; align-items: start; } @media (min-width: 900px) { .grille { grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); } }
  form, .colonne, .carte { display: flex; flex-direction: column; gap: 14px; } .colonne { gap: 18px; } .carte p { margin: 0; }
  fieldset { border: 0; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  .choix { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .radio { position: relative; display: flex; align-items: center; justify-content: center; min-height: 52px; border-radius: 14px; border: 1px solid var(--ligne-forte); cursor: pointer; background: var(--carte); }
  .radio b { font-size: 18px; } .radio.on { border: 2px solid var(--primaire); background: var(--primaire-fond); } .radio:focus-within { outline: 2px solid var(--primaire); outline-offset: 2px; } .radio input { position: absolute; opacity: 0; inset: 0; cursor: pointer; }
  .note { font-size: 13px; }
  .code { font-size: 28px; font-weight: 700; letter-spacing: 0.08em; background: var(--carte2); border-radius: 12px; padding: 10px 14px; align-self: flex-start; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; font-size: 14px; } dt { color: var(--muted); } dd { min-width: 0; overflow-wrap: anywhere; }
</style>
