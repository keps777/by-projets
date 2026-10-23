<script lang="ts">
  import { onMount } from 'svelte';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { niveauDuScore } from '../../core/credit.ts';
  import { CARTES_MAX, codeParrain, dureeCourte, numerosMembre, planDe, trouverEmployeurParNom, validiteCarte } from '../../core/inscription.ts';
  import Bouton from '../../ui/Bouton.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Logo from './Logo.svelte';
  import ProchesFamille from './ProchesFamille.svelte';
  import { etatAuth } from './etat.ts';

  const e = etatAuth();
  onMount(() => { if (!app.compte) aller('/bienvenue', { remplacer: true }); });
  const c = $derived(app.compte);
  const plan = $derived(c ? planDe(c.pass) : planDe('famille'));
  const niveau = $derived(niveauDuScore(app.score.valeur));
  const nums = $derived(numerosMembre(c?.telephone ?? ''));
  const parrain = $derived(c ? codeParrain(c.prenom, c.numeroMembre) : '');
  const employeur = $derived(c ? trouverEmployeurParNom(c.employeur) : null);
  const duree = e.brouillon.debut ? dureeCourte(maintenant() - e.brouillon.debut) : '';
  const famille = $derived(c ? CARTES_MAX[c.pass] > 1 : false);

  let retournee = $state(false);
  let feuille = $state<'' | 'famille' | 'parrain'>('');
  async function copier() {
    try { await navigator.clipboard.writeText(parrain); montrer(`Code ${parrain} copié`); } catch { montrer(`Votre code : ${parrain}`); }
    feuille = '';
  }
  const partage = (canal: string) => { feuille = ''; montrer(`Invitation ${canal} prête`); };
  const lienParrain = $derived(`https://assureme.cm/?parrain=${encodeURIComponent(parrain)}`);
</script>

{#if c}
<main class="pret">
  <header>
    <button type="button" class="rond" aria-label="Retour" onclick={() => aller('/notifications-permission', { remplacer: true })}><Icone nom="retour" taille={18} trait={2.2} /></button>
    <span class="repere">ÉTAPE 5 / 5{duree ? ` · ${duree}` : ''}</span>
  </header>

  <div class="tete">
    <span class="succes" aria-hidden="true"><Icone nom="ok" taille={26} trait={2.6} /></span>
    <h1>Bienvenue, {c.prenom}.</h1>
    <p>Votre compte {c.pass === 'essentiel' ? 'est ouvert' : c.pass === 'famille' ? 'famille est ouvert' : 'premium est ouvert'}.</p>
  </div>

  <button type="button" class="scene" onclick={() => (retournee = !retournee)} aria-label="Retourner la carte" aria-pressed={retournee}>
    <span class="carte" class:retournee>
      <span class="face recto">
        <span class="ligne1"><Logo taille={28} nom fond="sombre" /><span class="niveau">NIVEAU {niveau}</span></span>
        <span class="num mono">{c.numeroMembre.replace(/^AM/, 'AM ')} ···· {nums.fin}</span>
        <span class="bas"><span><small>PASS {plan.nom.toUpperCase()}</small><b>{c.prenom} {c.nom}</b></span><span class="score"><small>ASSURESCORE</small><b class="mono">{app.score.valeur}</b></span></span>
      </span>
      <span class="face verso">
        <span class="bande"></span>
        <b>À PRÉSENTER À L'ACCUEIL</b>
        <span class="txt">Clinique, pharmacie ou école partenaire : ils scannent, vous ne sortez rien.</span>
        <span class="bas2 mono"><span>URGENCE 24 H · 8 4 2 1</span><span>VALABLE {validiteCarte(c.cree)}</span></span>
        <span class="mono petit">{c.numeroMembre.replace(/^AM/, 'AM ')} ···· {nums.fin}</span>
      </span>
    </span>
  </button>
  <p class="aide" aria-hidden="true">TOUCHEZ LA CARTE POUR LA RETOURNER</p>

  <ul class="faits">
    <li><span class="v"><Icone nom="score" taille={16} /></span>{employeur ? `Score de départ ${app.score.valeur} grâce à ${employeur.nom.replace('Groupe ', '')}` : `Score de départ ${app.score.valeur} : il monte à chaque paiement à l'heure`}</li>
    <li><span class="v"><Icone nom="sante" taille={16} /></span>Carte santé active dès demain 8 h</li>
  </ul>

  <div class="actions">
    {#if famille}
      <button type="button" class="ligne" onclick={() => (feuille = 'famille')}>
        <span class="pastille" class:fait={e.cartesDemandees && e.proches.length > 0}>{#if e.cartesDemandees && e.proches.length > 0}<Icone nom="ok" taille={14} trait={2.6} />{/if}</span>
        <span class="t">{e.cartesDemandees && e.proches.length > 0 ? `${e.proches.length} proche${e.proches.length > 1 ? 's' : ''} ajouté${e.proches.length > 1 ? 's' : ''} à la carte famille` : 'Ajoutez vos proches à la carte famille'}</span>
        <em>{e.cartesDemandees && e.proches.length > 0 ? 'modifier' : '2 min'}</em>
      </button>
    {/if}
    <Bouton variante="secondaire" onclick={() => (feuille = 'parrain')}><Icone nom="plus" taille={18} />Partager mon code parrain</Bouton>
    <Bouton onclick={() => aller('/')}>Ouvrir mon app<Icone nom="fleche" taille={18} trait={2.2} /></Bouton>
  </div>
</main>

<Feuille bind:ouverte={() => feuille === 'parrain', (v) => { if (!v) feuille = ''; }} titre="Invitez vos proches" sous="Parrainage">
  <p class="muted">Chaque proche qui active un Pass vous fait gagner 5 000 FCFA.</p>
  <div class="code mono" aria-label="Votre code parrain">{parrain}</div>
  <div class="trois">
    <Bouton variante="secondaire" onclick={copier}>Copier</Bouton>
    <Bouton variante="secondaire" onclick={() => partage('WhatsApp')}>WhatsApp</Bouton>
    <Bouton variante="secondaire" onclick={() => partage('SMS')}>SMS</Bouton>
  </div>
  <p class="lien mono">{lienParrain}</p>
  <Bouton variante="discret" onclick={() => (feuille = '')}>Fermer</Bouton>
</Feuille>

<Feuille bind:ouverte={() => feuille === 'famille', (v) => { if (!v) feuille = ''; }} titre="Carte famille" sous="Pass {plan.nom}">
  <ProchesFamille onfini={() => (feuille = '')} />
</Feuille>
{/if}

<style>
  .pret { display: flex; flex-direction: column; min-height: 100dvh; padding: calc(env(safe-area-inset-top) + 12px) 20px calc(env(safe-area-inset-bottom) + 16px); gap: 14px; }
  header { display: flex; align-items: center; gap: 12px; min-height: 44px; } .rond { width: 44px; height: 44px; border-radius: 22px; background: var(--carte); border: 1px solid var(--ligne); display: grid; place-items: center; }
  .repere { font: 500 11px var(--mono); letter-spacing: 0.12em; color: var(--muted); }
  .tete { display: flex; flex-direction: column; gap: 6px; } .succes { width: 52px; height: 52px; border-radius: 26px; background: rgba(61, 213, 152, 0.14); color: var(--bon); display: grid; place-items: center; box-shadow: 0 0 36px rgba(61, 213, 152, 0.35); margin-bottom: 6px; }
  h1 { font-size: 30px; font-weight: 650; letter-spacing: -0.04em; } .tete p { color: var(--muted); }
  .scene { perspective: 1000px; display: block; width: 100%; min-height: 200px; padding: 0; text-align: left; }
  .carte { position: relative; display: block; width: 100%; height: 200px; transform-style: preserve-3d; transition: transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1); } .carte.retournee { transform: rotateY(180deg); }
  .face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius: 22px; padding: 18px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 24px 50px -24px rgba(48, 80, 255, 0.7); }
  .recto { background: linear-gradient(135deg, #2a3fd6, #1a2370 60%, #0f1530); border: 1px solid rgba(124, 147, 255, 0.4); }
  .verso { transform: rotateY(180deg); background: linear-gradient(135deg, #161d2f, #0b0f1a); border: 1px solid var(--ligne-forte); gap: 8px; justify-content: flex-start; }
  .ligne1 { display: flex; justify-content: space-between; align-items: center; } .niveau { font: 500 10.5px var(--mono); letter-spacing: 0.14em; padding: 4px 10px; border-radius: 99px; background: rgba(255, 255, 255, 0.14); }
  .num { font-size: 18px; letter-spacing: 0.1em; } .bas { display: flex; justify-content: space-between; align-items: flex-end; } .bas small, .score small { display: block; font: 500 9.5px var(--mono); letter-spacing: 0.12em; color: rgba(255, 255, 255, 0.65); } .bas b { font-size: 16px; } .score { text-align: right; } .score b { font-size: 24px; }
  .bande { height: 34px; margin: 0 -18px; background: #000; } .verso b { font: 600 12px var(--mono); letter-spacing: 0.1em; margin-top: 4px; } .txt { font-size: 13px; color: var(--doux); line-height: 1.4; } .bas2 { margin-top: auto; display: flex; justify-content: space-between; font-size: 10.5px; color: var(--muted); } .petit { font-size: 10.5px; color: var(--faint); }
  .aide { text-align: center; font: 400 10px var(--mono); letter-spacing: 0.14em; color: var(--faint); }
  .faits { list-style: none; display: flex; flex-direction: column; gap: 10px; } .faits li { display: flex; gap: 10px; align-items: center; font-size: 13.5px; color: var(--doux); } .v { width: 30px; height: 30px; border-radius: 10px; background: rgba(61, 213, 152, 0.12); color: var(--bon); display: grid; place-items: center; flex: none; }
  .actions { margin-top: auto; display: flex; flex-direction: column; gap: 10px; padding-top: 6px; }
  .ligne { display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 0 14px; border-radius: 16px; background: var(--carte); border: 1px solid var(--ligne); text-align: left; } .t { flex: 1; font-size: 14px; } em { font: 500 11px var(--mono); color: var(--primaire-clair); font-style: normal; }
  .pastille { width: 22px; height: 22px; border-radius: 11px; border: 2px solid #3a4566; display: grid; place-items: center; flex: none; } .pastille.fait { background: var(--bon); border-color: var(--bon); color: #07090f; }
  .code { text-align: center; font-size: 26px; font-weight: 500; letter-spacing: 0.12em; padding: 16px; border-radius: 16px; background: var(--carte2); border: 1px dashed var(--ligne-forte); }
  .trois { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; } .trois :global(.b) { padding: 0 8px; font-size: 14px; } .lien { font-size: 11px; color: var(--faint); text-align: center; word-break: break-all; }
</style>
