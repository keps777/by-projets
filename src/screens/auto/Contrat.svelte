<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Champ from '../../ui/Champ.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Signature from './Signature.svelte';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { ASSURANCES, premierPrelevement } from '../../core/auto.ts';
  import { jourCourt, jourDe, jourLong } from '../../core/dates.ts';
  import { fcfa } from '../../core/money.ts';
  import { auto, monDossier } from './etat.ts';
  import { estSigne, offreValide, signer } from './actions.ts';

  const t = auto();
  const d = $derived(monDossier());
  const c = $derived(app.compte);
  $effect(() => {
    if (!d || !d.decision?.approuve || d.etape === 'refusee' || d.etape === 'annulee') aller('/auto/decision', { remplacer: true });
    else if (estSigne(d)) aller('/auto/livraison', { remplacer: true });
  });
  const premier = $derived(d && c ? premierPrelevement(jourDe(new Date(maintenant())), c.jourPaie) : '');

  let trace = $state('');
  let accord = $state(false);
  let lecture = $state(false);
  let code = $state('');
  let saisieCode = $state(false);
  let erreur = $state('');
  let envoi = $state(false);
  const pret = $derived(!!trace && accord);
  const manque = $derived(!trace ? 'Signez dans le cadre pour continuer' : 'Cochez la case pour continuer');

  async function valider() {
    if (!trace || envoi) return;
    envoi = true; erreur = '';
    const e = await signer(trace, code.trim());
    envoi = false;
    if (e) { erreur = e; code = ''; return; }
    saisieCode = false;
    montrer('Contrat signé');
    aller('/auto/livraison');
  }
  const nom = $derived(c ? `${c.prenom} ${c.nom} · ${jourCourt(jourDe(new Date(maintenant())))} · ${c.ville}`.toUpperCase() : '');
</script>

{#if d && c}
<Ecran titre="Contrat de financement" sur="Étape 4 / 5 · N° {d.numero}" retourVers="/auto/decision">
  {#if !offreValide(d)}<p class="alerte" role="alert">L'offre a expiré. <a href="/auto/simulation" onclick={(e) => { e.preventDefault(); aller('/auto/simulation'); }}>Relancer une simulation</a></p>{/if}
  <section class="essentiel">
    <header><h2>L'essentiel, en clair</h2><small>4 points · 1 min</small></header>
    <ol>
      <li><span class="n">1</span><p><b class="mono">{fcfa(d.mensualite)} FCFA</b> prélevés sur votre salaire le {c.jourPaie} de chaque mois, {d.duree} fois, à partir du {premier ? jourLong(premier) : '—'}.</p></li>
      <li><span class="n">2</span><p>Le véhicule est <b>gagé</b> et équipé d'un traceur GPS jusqu'à la dernière mensualité. Il peut être immobilisé après 2 impayés.</p></li>
      <li><span class="n">3</span><p><b>Assurance {ASSURANCES[d.assurance].libelle.toLowerCase()}</b> et assurance décès-invalidité incluses : en cas de coup dur, la famille ne doit rien.</p></li>
      <li><span class="n">4</span><p>Remboursement anticipé <b>sans frais</b> à tout moment depuis l'app.</p></li>
    </ol>
    <button class="lien" onclick={() => (lecture = true)}>Lire le contrat complet<Icone nom="suivant" taille={16} trait={2.2} /></button>
  </section>

  <Signature bind:trace enregistree={t.signatureEnregistree} {nom} />

  <label class="accord" class:on={accord}>
    <input type="checkbox" bind:checked={accord} />
    <span class="case" aria-hidden="true">{#if accord}<Icone nom="ok" taille={14} trait={3} />{/if}</span>
    <span>J'ai lu les 4 points et le contrat. J'autorise {c.employeur} à retenir <b class="mono">{fcfa(d.mensualite)} FCFA</b> par mois sur ma paie au profit de [ÉTABLISSEMENT AGRÉÉ COBAC].</span>
  </label>
  {#if erreur && !saisieCode}<p class="alerte" role="alert">{erreur}</p>{/if}

  {#snippet pied()}
    {#if pret}<Bouton onclick={() => { erreur = ''; code = ''; saisieCode = true; }}><Icone nom="verrou" taille={18} />Signer avec mon code AssureMe</Bouton>
    {:else}<p class="manque" role="status">{manque}</p>{/if}
  {/snippet}
</Ecran>

<Feuille bind:ouverte={lecture} titre="Contrat {d.numero}" sous="Extrait">
  <p class="muted">Extrait. La version complète est archivée dans votre coffre de documents après signature.</p>
  <article class="clauses">
    <div><small>Article 1 · Objet</small><p>Financement de {fcfa(d.financement)} FCFA pour l'achat d'une {d.vehiculeTitre}, avec un apport de {fcfa(d.apport)} FCFA prélevé sur votre coffre voiture.</p></div>
    <div><small>Article 2 · Remboursement</small><p>{d.duree} mensualités de {fcfa(d.mensualite)} FCFA, prélevées le {c.jourPaie} de chaque mois sur le salaire versé par {c.employeur}, à partir de la remise des clés.</p></div>
    <div><small>Article 3 · Garantie</small><p>Gage sur le véhicule et traceur GPS. Après 2 impayés consécutifs, le véhicule peut être immobilisé après mise en demeure.</p></div>
    <div><small>Article 4 · Assurances</small><p>Assurance {ASSURANCES[d.assurance].libelle.toLowerCase()} et décès-invalidité incluses, souscrites auprès de [ASSUREUR AGRÉÉ CIMA].</p></div>
    <div><small>Article 5 · Rétractation</small><p>Vous pouvez renoncer sous 48 h, sans frais, tant que le véhicule n'est pas livré.</p></div>
  </article>
  <Bouton onclick={() => (lecture = false)}>J'ai lu</Bouton>
</Feuille>

<Feuille bind:ouverte={saisieCode} titre="Confirmez avec votre code" sous="6 chiffres">
  <p class="muted">Votre code AssureMe vaut signature électronique du contrat {d.numero}.</p>
  <Champ bind:valeur={code} etiquette="Code AssureMe" type="password" inputmode="numeric" placeholder="••••••" erreur={erreur} autofocus />
  <Bouton onclick={valider} desactive={code.trim().length !== 6 || envoi}>{envoi ? 'Vérification…' : 'Signer le contrat'}</Bouton>
</Feuille>
{/if}

<style>
  .essentiel { padding: 16px; border-radius: 22px; background: var(--carte); border: 1px solid var(--ligne); display: flex; flex-direction: column; gap: 10px; }
  header { display: flex; justify-content: space-between; align-items: baseline; } h2 { font-size: 17px; } small { color: var(--muted); font: 500 10.5px var(--mono); letter-spacing: 0.1em; text-transform: uppercase; }
  ol { list-style: none; display: flex; flex-direction: column; gap: 12px; } li { display: flex; gap: 12px; align-items: flex-start; } li p { font-size: 14.5px; line-height: 1.42; }
  .n { flex: none; width: 24px; height: 24px; border-radius: 12px; display: grid; place-items: center; background: var(--primaire-fond); color: var(--pale); font: 600 12px var(--mono); }
  .lien { display: inline-flex; align-items: center; gap: 4px; align-self: flex-start; min-height: 44px; color: var(--primaire-clair); font-weight: 600; }
  .accord { display: flex; gap: 12px; align-items: flex-start; padding: 14px; min-height: 56px; border-radius: 16px; background: var(--carte); border: 1px solid var(--ligne); font-size: 13.5px; line-height: 1.45; cursor: pointer; position: relative; }
  .accord.on { border-color: color-mix(in srgb, var(--primaire) 60%, transparent); } .accord input { position: absolute; opacity: 0; inset: 0; width: 100%; height: 100%; cursor: pointer; }
  .accord:has(input:focus-visible) { outline: 2px solid var(--primaire-clair); outline-offset: 2px; }
  .case { flex: none; width: 24px; height: 24px; border-radius: 8px; border: 2px solid #3a4566; display: grid; place-items: center; color: #fff; } .on .case { background: var(--primaire); border-color: var(--primaire); }
  .manque { text-align: center; color: var(--muted); font-size: 14px; padding: 16px 0; } .alerte { color: var(--alerte); font-size: 13.5px; } .alerte a { text-decoration: underline; }
  .clauses { display: flex; flex-direction: column; gap: 14px; } .clauses p { margin-top: 4px; font-size: 14px; line-height: 1.45; }
</style>
