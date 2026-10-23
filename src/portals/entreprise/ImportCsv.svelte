<script lang="ts">
  import { analyserImport, formaterTel, MAX_IMPORT, MODELE_CSV } from '../../core/entreprise.ts';
  import { fcfa } from '../../core/money.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { importerSalaries, matriculesConnus, telephonesConnus } from './actions.ts';
  import { lignes } from './vues.ts';
  import { telecharger } from './nav.ts';
  import Panneau from './Panneau.svelte';

  let { ouvert = $bindable(false) }: { ouvert?: boolean } = $props();
  const TAILLE_MAX = 1_000_000;
  let texte = $state('');
  let nomFichier = $state('');
  let erreurLecture = $state('');
  let seulementErreurs = $state(false);
  const existants = $derived(ouvert ? { matricules: matriculesConnus(), telephones: [...telephonesConnus(), ...lignes().map((l) => l.telephone)] } : { matricules: [], telephones: [] });
  const analyse = $derived(texte.trim() ? analyserImport(texte, existants) : null);
  const enErreur = $derived(analyse ? analyse.lignes.length - analyse.valides.length : 0);
  const vues = $derived(analyse ? analyse.lignes.filter((l) => !seulementErreurs || l.erreurs.length).slice(0, 100) : []);
  $effect(() => { if (ouvert) { texte = ''; nomFichier = ''; erreurLecture = ''; seulementErreurs = false; } });

  const telAffiche = (t: string) => (t.length === 9 && !Number.isNaN(Number(t)) ? formaterTel(t) : t || '—');
  async function choisir(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0]; erreurLecture = '';
    if (!f) return;
    if (f.size > TAILLE_MAX) { erreurLecture = 'Fichier trop volumineux (1 Mo au maximum).'; return; }
    if (/\.(xlsx?|ods)$/i.test(f.name)) { erreurLecture = "Enregistrez d'abord le fichier Excel au format CSV (séparateur point-virgule)."; return; }
    try { texte = await f.text(); nomFichier = f.name; } catch { erreurLecture = 'Impossible de lire ce fichier.'; }
  }
  function importer() {
    if (!analyse?.valides.length) return;
    const ignorees = enErreur;
    const n = importerSalaries(analyse.valides);
    montrer(`${n} salarié${n > 1 ? 's' : ''} importé${n > 1 ? 's' : ''}${ignorees ? ` · ${ignorees} ligne${ignorees > 1 ? 's' : ''} ignorée${ignorees > 1 ? 's' : ''}` : ''}. Invitations envoyées par SMS (simulation).`);
    ouvert = false;
  }
</script>

<Panneau bind:ouvert titre="Importer des salariés (CSV)" sous="Colonnes : nom, matricule, téléphone (salaire net et service facultatifs)" large>
  <div class="source">
    <label class="fichier btn">Choisir un fichier CSV<input type="file" accept=".csv,.txt,text/csv,text/plain" onchange={choisir} /></label>
    <button class="btn" onclick={() => telecharger('modele-salaries.csv', '﻿' + MODELE_CSV)}>Télécharger le modèle</button>
    <span class="doux" aria-live="polite">{nomFichier ? `Fichier lu : ${nomFichier}` : 'Aucun fichier choisi'}</span>
  </div>
  {#if erreurLecture}<p class="msg" role="alert">{erreurLecture}</p>{/if}
  <div class="champ">
    <label class="et" for="csv-texte">Ou collez le contenu</label>
    <textarea id="csv-texte" bind:value={texte} placeholder={'nom;matricule;telephone;salaire_net;service\nJean Exemple;NDL-0001;6 90 00 00 00;350000;Logistique'} spellcheck="false"></textarea>
  </div>

  {#if analyse}
    <div aria-live="polite">
      {#each analyse.erreursGlobales as g (g)}<p class="msg" role="alert">{g}</p>{/each}
      {#if analyse.lignes.length}
        <p class="resume"><b>{analyse.lignes.length}</b> ligne{analyse.lignes.length > 1 ? 's' : ''} lue{analyse.lignes.length > 1 ? 's' : ''} · <span class="ok"><b>{analyse.valides.length}</b> valide{analyse.valides.length > 1 ? 's' : ''}</span> · <span class:ko-txt={enErreur > 0}><b>{enErreur}</b> en erreur</span></p>
      {/if}
    </div>
    {#if analyse.lignes.length}
      {#if enErreur}<label class="case"><input type="checkbox" bind:checked={seulementErreurs} /> Afficher seulement les lignes en erreur</label>{/if}
      <div class="tableau"><table>
        <caption class="sr">Aperçu de l'import, ligne par ligne</caption>
        <thead><tr><th scope="col">Ligne</th><th scope="col">Nom</th><th scope="col">Matricule</th><th scope="col">Téléphone</th><th scope="col" class="num">Salaire net</th><th scope="col">Contrôle</th></tr></thead>
        <tbody>
          {#each vues as l (l.ligne)}
            <tr class:ko={l.erreurs.length > 0}>
              <td class="mono">{l.ligne}</td><td>{l.nom || '—'}</td><td class="mono">{l.matricule || '—'}</td><td class="mono">{telAffiche(l.telephone)}</td>
              <td class="num mono">{l.salaire ? fcfa(l.salaire) : '—'}</td>
              <td>{#if l.erreurs.length}<ul class="errs">{#each l.erreurs as m (m)}<li class="msg">{m}</li>{/each}</ul>{:else}<span class="puce bon">OK</span>{/if}</td>
            </tr>
          {/each}
        </tbody>
      </table></div>
      {#if analyse.lignes.length > 100 && !seulementErreurs}<p class="doux">Aperçu des 100 premières lignes sur {analyse.lignes.length}. Tout le fichier est contrôlé.</p>{/if}
    {/if}
  {:else}
    <p class="doux">Maximum {MAX_IMPORT} salariés par import. Les lignes en erreur sont signalées une à une et ignorées ; les lignes valides sont importées.</p>
  {/if}

  <div class="pied">
    <button class="btn" onclick={() => (ouvert = false)}>Annuler</button>
    <button class="btn prim" onclick={importer} disabled={!analyse?.valides.length}>{analyse?.valides.length ? `Importer ${analyse.valides.length} salarié${analyse.valides.length > 1 ? 's' : ''} valide${analyse.valides.length > 1 ? 's' : ''}` : 'Importer'}</button>
  </div>
</Panneau>

<style>
  .source { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .fichier { position: relative; cursor: pointer; } .fichier input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; }
  .fichier:focus-within { outline: 2px solid var(--primaire); outline-offset: 2px; }
  .resume { font-size: 15px; } .ok { color: #0b6b44; } .ko-txt { color: #b32626; } td.mono { white-space: nowrap; }
  .case { display: flex; gap: 10px; align-items: center; min-height: 44px; } .case input { width: 22px; height: 22px; accent-color: var(--primaire); }
  tr.ko td { background: #fff7f7; } .errs { list-style: none; display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
  .pied { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; position: sticky; bottom: 0; background: var(--carte); padding-top: 8px; }
</style>
