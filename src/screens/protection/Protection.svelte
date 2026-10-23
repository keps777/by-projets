<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Champ from '../../ui/Champ.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Pastille from '../../ui/Pastille.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Etiquette from '../_services/Etiquette.svelte';
  import Choix from '../_services/Choix.svelte';
  import Verrou from '../_services/Verrou.svelte';
  import { horloge } from '../_services/horloge.svelte.ts';
  import { chiffres, ini2 } from '../_services/format.ts';
  import { CAPITAUX, AGE_MAX_ENTREE } from '../../core/protection.ts';
  import { NOM_NIVEAU, PLAFOND_CAPITAL, niveauPourCapital } from '../../core/services.ts';
  import { court, fcfa } from '../../core/money.ts';
  import { libelleProchaine } from '../../data/paie.ts';
  import { aChange, couverts, couvertsDeSouscription, etapesSinistre, primeSelection, sousTitre, verifierSouscription } from './calcul.ts';
  import { activer, ajouterAssure, avancer, basculer, declarer, definirAge, niveau, resilier } from './actions.ts';
  import { etat, LIENS, QUAND, type Lien, type Quand } from './etat.ts';

  const e = etat();
  const h = horloge(30_000);
  $effect(() => { avancer(h.t); });
  const lvl = $derived(niveau());
  const nb = $derived(couverts(e).length);
  const prix = $derived(primeSelection(e));
  const erreur = $derived(verifierSouscription(e, lvl));
  const change = $derived(aChange(e));
  const active = $derived(e.souscription !== null);
  const bloque = $derived(CAPITAUX.find((c) => c > PLAFOND_CAPITAL[lvl]) ?? null);

  // Feuilles : déclaration (3 étapes), ajout d'un assuré, âge.
  let feuille = $state<'' | 'decl' | 'ajout' | 'age'>('');
  let ouverte = $state(false);
  $effect(() => { if (!ouverte) feuille = ''; });
  const ouvrir = (f: 'decl' | 'ajout' | 'age') => { feuille = f; ouverte = true; err = ''; };
  let err = $state('');
  let etape = $state(0); let qui = $state(''); let ville = $state('Douala'); let quand = $state<Quand>('aujourdhui'); let numero = $state('');
  const eligibles = $derived(couvertsDeSouscription(e).filter((a) => a.lien !== 'vous' && !a.dossier));
  const cible = $derived(eligibles.find((a) => a.id === qui));
  function ouvrirDecl() { etape = 0; numero = ''; qui = eligibles[0]?.id ?? ''; ouvrir('decl'); }
  function suite() {
    err = '';
    if (etape < 2) { etape++; return; }
    const r = declarer(qui, ville, quand);
    if (!r.ok) { err = r.erreur; return; }
    numero = r.numero; etape = 3; montrer(`Déclaration envoyée · dossier ${r.numero}`);
  }
  const retour = () => { if (etape === 0 || etape === 3) ouverte = false; else etape--; };

  let nom = $state(''); let lien = $state<Lien>('conjoint'); let age = $state(''); let villeA = $state(''); let ageId = $state('moi');
  function validerAjout() {
    const r = ajouterAssure(nom, lien, age === '' ? null : Number(age), villeA);
    if (!r.ok) { err = r.erreur; return; }
    nom = ''; age = ''; villeA = ''; ouverte = false; montrer('Personne ajoutée à la liste');
  }
  function validerAge() {
    const r = definirAge(ageId, age === '' ? null : Number(age));
    if (!r.ok) { err = r.erreur; return; }
    age = ''; ouverte = false;
  }
  function toucher(id: string) {
    const a = e.assures.find((x) => x.id === id)!;
    if (a.age === null) { ageId = id; age = ''; ouvrir('age'); return; }
    const r = basculer(id); if (!r.ok) montrer(r.erreur, a.dossier ? 'danger' : 'bon');
  }
  function valider() {
    const misAJour = active;
    const r = activer();
    if (!r.ok) { montrer(r.erreur, 'danger'); return; }
    montrer(misAJour ? 'Protection mise à jour' : 'Protection famille activée');
  }
  function arreter() { const r = resilier(); if (r.ok) montrer('Protection arrêtée'); }
</script>

<Ecran titre="Protection famille" sur="Sans questionnaire médical">
  {#snippet droite()}{#if active}<Pastille ton="bon">Active</Pastille>{/if}{/snippet}

  <section class="hero" aria-labelledby="cap">
    <div class="ligne"><span id="cap" class="mono">CAPITAL VERSÉ EN 48 H</span><span class="mono">{nb} PERSONNE{nb > 1 ? 'S' : ''}</span></div>
    <b class="mono grand">{fcfa(e.capital)}</b><span class="mono pp">par personne</span>
    <Choix nom="Capital par personne" bind:valeur={e.capital} options={CAPITAUX.map((c) => ({ valeur: c as number, label: `${c / 1_000_000} M${c > PLAFOND_CAPITAL[lvl] ? ' · ' + NOM_NIVEAU[niveauPourCapital(c) ?? 'ELITE'] : ''}`, desactive: c > PLAFOND_CAPITAL[lvl] }))} />
    <p class="couv">Obsèques, rapatriement, 3 mois de loyer et d'école pris en charge</p>
    <div class="prix"><b class="mono" aria-live="polite">{fcfa(prix)}</b><span>/ mois</span></div>
  </section>
  {#if bloque}<Verrou requis={niveauPourCapital(bloque)} quoi={`Capital de ${court(bloque)}`} />{/if}

  <section class="bloc" aria-labelledby="qui">
    <Etiquette id="qui">Qui est couvert ? · touchez pour ajouter</Etiquette>
    <div class="gens">
      {#each e.assures as a (a.id)}
        {@const on = a.couvert && !a.dossier}
        <button type="button" class="gen" class:on class:dos={!!a.dossier} aria-pressed={on} onclick={() => toucher(a.id)}>
          <span class="av">{ini2(a.nom)}</span>
          <span class="m"><b>{a.nom}</b><small>{a.dossier ? `Sinistre · ${a.dossier}` : sousTitre(a)}</small></span>
          <span class="pt" aria-hidden="true">{#if on}<Icone nom="ok" taille={13} trait={3} />{/if}</span>
        </button>
      {/each}
      <button type="button" class="gen plus" onclick={() => { nom = ''; age = ''; villeA = ''; ouvrir('ajout'); }}><span class="av"><Icone nom="plus" taille={16} /></span><span class="m"><b>Ajouter une personne</b><small>Âge maximum à l'entrée : {AGE_MAX_ENTREE} ans</small></span></button>
    </div>
  </section>

  <div class="stats" role="list">
    <div role="listitem"><b class="mono">48 h</b><small>pour verser</small></div>
    <div role="listitem"><b class="mono">0</b><small>papier à fournir</small></div>
    <div role="listitem"><b class="mono">{AGE_MAX_ENTREE} ans</b><small>âge max à l'entrée</small></div>
  </div>

  {#if active}
    <p class="info"><Icone nom="calendrier" taille={16} />Prime de {fcfa(e.souscription!.prime)} prélevée sur votre salaire chaque mois{libelleProchaine() ? ` · prochain prélèvement le ${libelleProchaine()}` : ''}. {e.souscription!.primesPayees} prime{e.souscription!.primesPayees > 1 ? 's' : ''} payée{e.souscription!.primesPayees > 1 ? 's' : ''}.</p>
  {/if}

  <button type="button" class="decl" onclick={ouvrirDecl}>
    <span class="ico"><Icone nom="document" taille={20} /></span>
    <span class="m"><b>Déclarer un décès</b><small>3 étapes, un conseiller vous rappelle dans l'heure</small></span>
    <Icone nom="suivant" taille={16} />
  </button>

  {#if e.sinistres.length}
    <section class="bloc" aria-labelledby="dos">
      <Etiquette id="dos">Dossiers de sinistre</Etiquette>
      {#each e.sinistres as s (s.id)}
        <div class="dossier">
          <div class="entete"><b>{s.numero} · {s.nom}</b><Pastille ton={s.verse ? 'bon' : 'primaire'}>{s.verse ? 'Versé' : 'En cours'}</Pastille></div>
          <small class="muted">{s.ville} · {QUAND[s.quand].toLowerCase()} · capital {fcfa(s.capital)}</small>
          <ol>{#each etapesSinistre(s, h.t) as p (p.titre)}<li class:fait={p.atteinte}><span class="pt" aria-hidden="true">{#if p.atteinte}<Icone nom="ok" taille={11} trait={3} />{/if}</span><span><b>{p.titre}</b> <small>{p.sous}</small></span></li>{/each}</ol>
        </div>
      {/each}
    </section>
  {/if}

  {#if active}<button type="button" class="arret" onclick={arreter}>Arrêter la protection</button>{/if}

  {#snippet pied()}
    {#if erreur}<p class="alerte" role="alert">{erreur}</p>{/if}
    {#if active && !change}<Bouton variante="secondaire" href="/">Protection active · Retour à l'accueil</Bouton>
    {:else}<Bouton desactive={!!erreur} onclick={valider}>{active ? `Mettre à jour · ${fcfa(prix)} / mois` : `Activer pour ${fcfa(prix)} / mois`}</Bouton>{/if}
  {/snippet}
</Ecran>

<Feuille bind:ouverte titre={feuille === 'decl' ? 'Déclarer un décès' : feuille === 'ajout' ? 'Ajouter une personne' : 'Votre âge'}>
  {#if feuille === 'decl'}
    {#if !active}
      <p class="muted">Activez d'abord la protection : seuls les proches couverts peuvent faire l'objet d'une déclaration.</p>
      <Bouton onclick={() => (ouverte = false)}>Compris</Bouton>
    {:else if !eligibles.length && etape < 3}
      <p class="muted">Aucune personne couverte à déclarer (hors vous-même). Ajoutez et couvrez vos proches avant toute déclaration.</p>
      <Bouton onclick={() => (ouverte = false)}>Fermer</Bouton>
    {:else if etape === 3}
      <div class="fin" role="status"><span class="coche"><Icone nom="ok" taille={26} trait={3} /></span><b>Dossier {numero}</b><p class="muted">Un conseiller vous rappelle dans l'heure. Le capital de {fcfa(e.souscription?.capital ?? e.capital)} FCFA est versé sous 48 h, sans document à fournir maintenant.</p><Bouton onclick={() => (ouverte = false)}>Fermer</Bouton></div>
    {:else}
      <p class="muted petit">Étape {etape + 1} sur 3 · {etape === 0 ? 'Qui est concerné ?' : etape === 1 ? 'Où et quand ?' : 'Vérifiez et envoyez'}</p>
      <div class="barres" aria-hidden="true">{#each [0, 1, 2] as i (i)}<i class:on={i <= etape}></i>{/each}</div>
      {#if etape === 0}
        <div class="radios" role="radiogroup" aria-label="Personne concernée">
          {#each eligibles as a (a.id)}<button type="button" role="radio" aria-checked={qui === a.id} class:on={qui === a.id} onclick={() => (qui = a.id)}><b>{a.nom}</b><small>{sousTitre(a)}</small></button>{/each}
        </div>
      {:else if etape === 1}
        <Champ bind:valeur={ville} etiquette="Ville" erreur={err} />
        <Etiquette>Quand ?</Etiquette>
        <Choix nom="Date du décès" bind:valeur={quand} options={(Object.keys(QUAND) as Quand[]).map((q) => ({ valeur: q, label: QUAND[q] }))} />
      {:else}
        <dl><div><dt>Personne</dt><dd>{cible?.nom}</dd></div><div><dt>Lieu</dt><dd>{ville}</dd></div><div><dt>Date</dt><dd>{QUAND[quand]}</dd></div><div><dt>Capital versé</dt><dd class="mono">{fcfa(e.souscription?.capital ?? 0)} FCFA</dd></div></dl>
        <p class="muted petit">Aucun document à fournir maintenant. Le conseiller vous aidera pour l'acte de décès.</p>
      {/if}
      {#if err && etape !== 1}<p class="alerte" role="alert">{err}</p>{/if}
      <div class="duo"><Bouton variante="secondaire" onclick={retour}>{etape === 0 ? 'Annuler' : 'Retour'}</Bouton><Bouton onclick={suite} desactive={etape === 0 && !qui}>{etape === 2 ? 'Envoyer' : 'Continuer'}</Bouton></div>
    {/if}
  {:else if feuille === 'ajout'}
    <Champ bind:valeur={nom} etiquette="Prénom" />
    <Choix nom="Lien" bind:valeur={lien} options={(['conjoint', 'enfant', 'parent', 'autre'] as Lien[]).map((l) => ({ valeur: l, label: LIENS[l] }))} />
    <Champ bind:valeur={age} etiquette="Âge" inputmode="numeric" suffixe="ans" oninput={() => (age = chiffres(age, 3))} />
    <Champ bind:valeur={villeA} etiquette="Ville (facultatif)" />
    {#if err}<p class="alerte" role="alert">{err}</p>{/if}
    <Bouton onclick={validerAjout}>Ajouter et couvrir</Bouton>
  {:else if feuille === 'age'}
    <p class="muted">Votre âge sert à calculer la prime. Âge maximum à l'entrée : {AGE_MAX_ENTREE} ans.</p>
    <Champ bind:valeur={age} etiquette="Âge" inputmode="numeric" suffixe="ans" oninput={() => (age = chiffres(age, 3))} />
    {#if err}<p class="alerte" role="alert">{err}</p>{/if}
    <Bouton onclick={validerAge}>Enregistrer</Bouton>
  {/if}
</Feuille>

<style>
  .hero { border-radius: 24px; padding: 18px; display: flex; flex-direction: column; gap: 10px; background: linear-gradient(150deg, rgba(61, 213, 152, 0.18), rgba(48, 80, 255, 0.12) 70%), var(--carte); border: 1px solid rgba(61, 213, 152, 0.35); }
  .ligne { display: flex; justify-content: space-between; font-size: 10.5px; letter-spacing: 0.1em; color: var(--doux); gap: 8px; } .grand { font-size: 38px; font-weight: 500; letter-spacing: -0.03em; line-height: 1; } .pp { font-size: 12px; color: var(--muted); margin-top: -6px; }
  .couv { font-size: 13px; color: var(--doux); line-height: 1.4; } .prix { display: flex; align-items: baseline; gap: 6px; border-top: 1px solid var(--ligne-forte); padding-top: 10px; } .prix b { font-size: 26px; font-weight: 500; } .prix span { color: var(--muted); }
  .bloc { display: flex; flex-direction: column; gap: 8px; } .gens { display: flex; flex-direction: column; gap: 8px; }
  .gen { display: flex; align-items: center; gap: 12px; padding: 10px 14px; min-height: 60px; width: 100%; text-align: left; border-radius: 16px; background: var(--carte); border: 1px solid var(--ligne); }
  .gen.on { background: var(--primaire-fond); border-color: var(--primaire); } .gen.dos { opacity: 0.6; } .plus { border-style: dashed; }
  .av { width: 38px; height: 38px; border-radius: 19px; background: var(--carte2); color: var(--muted); display: grid; place-items: center; font: 600 11px var(--mono); flex: none; } .on .av { background: var(--primaire); color: var(--sur-primaire); }
  .m { flex: 1; min-width: 0; display: flex; flex-direction: column; } .m b { font-size: 14.5px; } .m small { color: var(--muted); font-size: 12.5px; }
  .pt { width: 20px; height: 20px; border-radius: 10px; border: 1.5px solid var(--ligne-forte); display: grid; place-items: center; flex: none; color: #07090f; } .on .pt, .fait .pt { background: var(--bon); border-color: var(--bon); }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; } .stats div { padding: 12px 8px; border-radius: 16px; background: var(--carte); border: 1px solid var(--ligne); text-align: center; display: flex; flex-direction: column; gap: 2px; } .stats b { font-size: 18px; font-weight: 500; } .stats small { font-size: 11px; color: var(--muted); }
  .info { display: flex; gap: 10px; align-items: flex-start; padding: 10px 14px; border-radius: 14px; background: var(--carte); border: 1px solid var(--ligne); font-size: 12.5px; color: var(--muted); line-height: 1.4; } .info :global(svg) { flex: none; color: var(--primaire-clair); margin-top: 1px; }
  .decl { display: flex; align-items: center; gap: 12px; padding: 14px; min-height: 64px; width: 100%; text-align: left; border-radius: 18px; background: var(--carte); border: 1px solid var(--ligne-forte); }
  .ico { width: 40px; height: 40px; border-radius: 14px; background: rgba(255, 122, 47, 0.14); color: var(--alerte); display: grid; place-items: center; flex: none; }
  .dossier { padding: 14px; border-radius: 16px; background: var(--carte); border: 1px solid var(--ligne); display: flex; flex-direction: column; gap: 6px; } .entete { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  ol { list-style: none; display: flex; flex-direction: column; gap: 6px; margin-top: 4px; } li { display: flex; gap: 10px; align-items: center; font-size: 13px; color: var(--muted); } li small { color: var(--muted); font-size: 12px; } li.fait b { color: var(--texte); }
  .arret { align-self: center; min-height: 44px; color: var(--muted); font-size: 13px; text-decoration: underline; }
  .alerte { color: var(--danger); font-size: 13px; text-align: center; margin-bottom: 8px; } .petit { font-size: 12.5px; }
  .barres { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; } .barres i { height: 4px; border-radius: 2px; background: var(--ligne-forte); } .barres i.on { background: var(--primaire); }
  .radios { display: flex; flex-direction: column; gap: 8px; } .radios button { display: flex; flex-direction: column; text-align: left; padding: 12px 14px; min-height: 56px; border-radius: 14px; background: var(--carte2); border: 1px solid var(--ligne); } .radios button.on { background: var(--primaire-fond); border-color: var(--primaire); } .radios small { color: var(--muted); font-size: 12.5px; }
  dl { display: flex; flex-direction: column; gap: 8px; } dl div { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; } dt { color: var(--muted); }
  .duo { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .fin { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; } .coche { width: 60px; height: 60px; border-radius: 30px; background: var(--bon); color: #07090f; display: grid; place-items: center; }
</style>
