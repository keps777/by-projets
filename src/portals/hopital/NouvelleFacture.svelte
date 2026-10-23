<script lang="ts">
  import Carte from '../../ui/Carte.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Champ from '../../ui/Champ.svelte';
  import Icone from '../../ui/Icone.svelte';
    import { fcfa, lireMontant } from '../../core/money.ts';
  import { CATEGORIES, DELAI_REGLEMENT_JOURS, erreursLignes, repartirActes, tauxDe, type CategorieActe, type LigneActe } from '../../core/sante-facture.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { emettreFacture, type Droits } from '../../screens/sante/actions.ts';
  import { couvertureDe, type FactureSante } from '../../screens/sante/etat.ts';

  let { droits, patient, onemise }: { droits: Extract<Droits, { ok: true }> | null; patient: string; onemise: (f: FactureSante, brouillon: boolean) => void } = $props();
  interface Saisie { cat: CategorieActe; nom: string; sous: string; montant: string }
  let acte = $state(''); let medecin = $state(''); let essai = $state(false); let erreurs = $state<string[]>([]);
  let lignes = $state<Saisie[]>([{ cat: 'consultation', nom: '', sous: '', montant: '' }]);
  const ACTES = ['Consultation pédiatrie', 'Consultation générale', 'Analyses de laboratoire', 'Hospitalisation'];
  const NOMS_CAT = Object.entries(CATEGORIES) as [CategorieActe, (typeof CATEGORIES)[CategorieActe]][];

  /** Montant entier de francs : toute autre saisie (signe, virgule, lettres) est refusée. */
  const lire = (t: string) => (/^[\d\s\u00a0\u202f]*(fcfa)?\s*$/i.test(t) ? lireMontant(t) : null);
  const couv = $derived(couvertureDe());
  const actes = $derived<LigneActe[]>(lignes.map((l) => ({ categorie: l.cat, nom: l.nom, sous: l.sous, montant: lire(l.montant) ?? 0 })));
  const rep = $derived(couv && droits ? repartirActes(actes.filter((a) => a.montant > 0), couv, droits.restant) : null);
  const inactif = $derived(!droits);

  const ajouter = (cat: CategorieActe, nom = '') => { lignes.push({ cat, nom, sous: '', montant: '' }); };
  const retirer = (i: number) => { lignes.splice(i, 1); };
  function emettre(brouillon: boolean) {
    essai = true;
    if (!droits) { erreurs = ['Vérifiez d’abord le patient.']; return; }
    const saisies: LigneActe[] = lignes.map((l) => ({ categorie: l.cat, nom: l.nom, sous: l.sous, montant: l.montant.trim() === '' ? 0 : (lire(l.montant) ?? -1) }));
    const e = erreursLignes(saisies); if (e.length) { erreurs = e; return; }
    const r = emettreFacture({ beneficiaire: patient, medecin, acte: acte || saisies[0].nom, lignes: saisies }, brouillon);
    if (!r.ok) { erreurs = [r.erreur]; return; }
    erreurs = []; essai = false; acte = ''; medecin = ''; lignes = [{ cat: 'consultation', nom: '', sous: '', montant: '' }];
    montrer(brouillon ? 'Brouillon enregistré' : 'Facture validée'); onemise(r.facture, brouillon);
  }
</script>

<Carte rayon={16}>
  <h2>Nouvelle facture{droits ? ` · ${patient}` : ''}</h2>
  {#if inactif}<p class="bloque" role="status"><Icone nom="verrou" taille={16} />Vérifiez d'abord le patient pour établir une facture.</p>{/if}
  <fieldset disabled={inactif}>
    <div class="deux">
      <label class="s" for="acte"><span class="et">Acte principal</span><input id="acte" list="actes" bind:value={acte} placeholder="Consultation pédiatrie" autocomplete="off" /><datalist id="actes">{#each ACTES as a (a)}<option value={a}></option>{/each}</datalist></label>
      <Champ etiquette="Médecin" bind:valeur={medecin} placeholder="Dr Mbarga" />
    </div>
    <ul class="lignes">
      {#each lignes as l, i (i)}
        <li>
          <label class="s" for="cat-{i}"><span class="et">Type</span><select id="cat-{i}" bind:value={l.cat}>{#each NOMS_CAT as [k, v] (k)}<option value={k}>{v.libelle}</option>{/each}</select></label>
          <Champ etiquette="Libellé" bind:valeur={l.nom} placeholder="Consultation, NFS, paracétamol…" />
          <Champ etiquette="Montant" bind:valeur={l.montant} inputmode="numeric" suffixe="FCFA" placeholder="15 000" />
          {#if lignes.length > 1}<button class="x" onclick={() => retirer(i)} aria-label="Retirer la ligne {i + 1}"><Icone nom="fermer" taille={18} /></button>{/if}
        </li>
      {/each}
    </ul>
    <div class="ajouts"><span class="et">Ajouter</span>
      <button onclick={() => ajouter('consultation')}>+ Consultation</button><button onclick={() => ajouter('examen')}>+ Examen</button><button onclick={() => ajouter('medicament')}>+ Médicaments</button><button onclick={() => ajouter('hospitalisation')}>+ Hospitalisation</button></div>
  </fieldset>

  {#if rep && rep.total > 0}
    <div class="rep" aria-live="polite">
      <table><thead><tr><th>Ligne</th><th class="n">Montant</th><th class="n">AssureMe</th><th class="n">Patient</th></tr></thead>
        <tbody>{#each rep.lignes as l, i (i)}<tr><td>{l.nom || CATEGORIES[l.categorie].libelle} <small>{Math.round(tauxDe(l.categorie, couv!) * 100)} %</small></td><td class="n mono">{fcfa(l.montant)}</td><td class="n mono">{fcfa(l.assureMe)}</td><td class="n mono">{fcfa(l.patient)}</td></tr>{/each}</tbody></table>
      <div class="deux tot"><div class="am"><span>AssureMe paie la clinique</span><b class="mono">{fcfa(rep.assureMe)} FCFA</b></div><div class="pt"><span>Le patient règle dans l'application</span><b class="mono">{fcfa(rep.patient)} FCFA</b></div></div>
      {#if rep.plafondDepasse}<p class="avert" role="alert"><Icone nom="attention" taille={16} />Plafond restant ({fcfa(droits?.restant ?? 0)}) insuffisant : l'excédent est à la charge du patient.</p>{/if}
    </div>
  {/if}
  {#if erreurs.length && essai}<ul class="erreurs" role="alert">{#each erreurs as e (e)}<li>{e}</li>{/each}</ul>{/if}
  <div class="boutons"><Bouton plein={false} onclick={() => emettre(false)} desactive={inactif}>Valider la facture</Bouton><Bouton variante="secondaire" plein={false} onclick={() => emettre(true)} desactive={inactif}>Enregistrer en brouillon</Bouton></div>
  {#if droits}<p class="muted note">Le patient la voit aussitôt dans son application et la règle sous {DELAI_REGLEMENT_JOURS} jours.</p>{/if}
</Carte>

<style>
  h2 { font-size: 17px; margin-bottom: 12px; } fieldset { border: 0; display: flex; flex-direction: column; gap: 12px; min-width: 0; } fieldset:disabled { opacity: 0.5; }
  .bloque { display: flex; gap: 8px; align-items: center; padding: 10px 12px; border-radius: 12px; background: var(--carte2); font-size: 13.5px; margin-bottom: 12px; }
  .deux { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; } .s { display: flex; flex-direction: column; gap: 6px; } .et { font: 500 10.5px var(--mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
  input, select { min-height: 52px; padding: 0 14px; border-radius: 14px; background: var(--carte); border: 1px solid var(--ligne-forte); font-size: 16px; width: 100%; }
  .lignes { list-style: none; display: flex; flex-direction: column; gap: 14px; } .lignes li { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)) 44px; gap: 10px; align-items: end; padding: 12px; border: 1px solid var(--ligne); border-radius: 14px; background: var(--fond); }
  .lignes li:not(:has(.x)) { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
  .x { width: 44px; height: 52px; display: grid; place-items: center; color: var(--muted); }
  .ajouts { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; } .ajouts button { min-height: 44px; padding: 0 14px; border-radius: 22px; border: 1px solid var(--ligne-forte); background: var(--carte); font-size: 13.5px; font-weight: 550; }
  .rep { margin-top: 16px; border-top: 1px solid var(--ligne); padding-top: 12px; display: flex; flex-direction: column; gap: 12px; } table { width: 100%; border-collapse: collapse; font-size: 13.5px; } th { text-align: left; color: var(--muted); font-weight: 500; font-size: 12px; padding: 4px 0; }
  td { padding: 7px 0; border-top: 1px solid var(--ligne); } .n { text-align: right; } small { color: var(--muted); }
  .tot > div { padding: 12px; border-radius: 12px; display: flex; flex-direction: column; gap: 2px; } .tot span { font-size: 12.5px; } .tot b { font-size: 20px; } .am { background: #ebeeff; color: #1f35b8; } .pt { background: #fff1e6; color: #8a3c05; }
  .avert { display: flex; gap: 8px; align-items: center; color: #8a3c05; font-size: 13.5px; } .erreurs { margin-top: 12px; padding: 10px 12px 10px 28px; border-radius: 12px; background: #fdecea; color: #8a1f17; font-size: 13.5px; }
  .boutons { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; } .note { margin-top: 10px; font-size: 12.5px; }
</style>
