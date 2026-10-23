<script lang="ts">
  import { onMount } from 'svelte';
  import { aller } from '../../router.svelte.ts';
  import Bouton from '../../ui/Bouton.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { codeTropSimple, forceCode, LONGUEUR_CODE } from '../../core/auth.ts';
  import { codeEstNaissance, lireNaissance } from '../../core/inscription.ts';
  import Alerte from './Alerte.svelte';
  import Clavier from './Clavier.svelte';
  import Etape from './Etape.svelte';
  import SaisieCode from './SaisieCode.svelte';
  import { etatAuth } from './etat.ts';
  import { temp } from './memoire.svelte.ts';

  const b = etatAuth().brouillon;
  onMount(() => { if (b.etape < 4) aller(b.etape < 3 ? '/inscription/identite' : '/inscription/pass', { remplacer: true }); });
  let code = $state('');
  let visible = $state(false);
  const complet = $derived(code.length === LONGUEUR_CODE);
  const simple = $derived(complet && codeTropSimple(code));
  const naissance = $derived(complet && codeEstNaissance(code, lireNaissance(b.naissance)));
  const force = $derived(forceCode(code));
  const valide = $derived(complet && !simple && !naissance);
  const teinte = $derived(['#6e778c', 'var(--alerte)', 'var(--primaire-clair)', 'var(--bon)'][force.score]);
  const manque = $derived(LONGUEUR_CODE - code.length);
  function chiffre(d: string) { if (code.length < LONGUEUR_CODE) code += d; }
  function continuer() { if (!valide) return; temp.premierCode = code; aller('/inscription/confirmer-code'); }
</script>

<Etape retourVers="/inscription/pass" repere="SÉCURITÉ 1 / 4 · CODE DE L'APP" segments={4} segmentActif={1} titre="Créez le code de votre app." sous="6 chiffres. Il protège vos paiements et votre salaire. Évitez 123456 et votre date de naissance.">
  <SaisieCode valeur={code} {visible} ton={simple || naissance ? 'alerte' : 'neutre'} etiquette="Nouveau code" />
  <button type="button" class="voir" onclick={() => (visible = !visible)} aria-pressed={visible}><Icone nom="oeil" taille={18} />{visible ? 'Masquer le code' : 'Afficher le code'}</button>
  <div class="etat" aria-live="polite">
    {#if simple}<Alerte ton="avert">Code trop simple. Évitez les suites et les chiffres répétés.</Alerte>
    {:else if naissance}<Alerte ton="avert">Ce code ressemble à votre date de naissance. Choisissez-en un autre.</Alerte>
    {:else}
      <div class="force"><span>Solidité du code</span><b style:color={teinte}>{force.libelle || `${manque} chiffre${manque > 1 ? 's' : ''} à saisir`}</b></div>
      <div class="segs" aria-hidden="true">{#each [1, 2, 3] as i (i)}<i style:background={i <= force.score ? teinte : '#1e2638'}></i>{/each}</div>
    {/if}
  </div>
  <div class="espace"></div>
  <Clavier onchiffre={chiffre} oneffacer={() => (code = code.slice(0, -1))} />
  {#snippet pied()}
    <Bouton desactive={!valide} onclick={continuer}>Continuer<Icone nom="fleche" taille={18} trait={2.2} /></Bouton>
  {/snippet}
</Etape>

<style>
  .voir { align-self: center; display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 14px; color: var(--muted); font-size: 13.5px; font-weight: 550; }
  .etat { min-height: 56px; display: flex; flex-direction: column; gap: 8px; justify-content: center; }
  .force { display: flex; justify-content: space-between; font: 500 11px var(--mono); letter-spacing: 0.1em; color: var(--muted); text-transform: uppercase; }
  .segs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; } .segs i { height: 5px; border-radius: 3px; transition: background 0.25s; }
  .espace { flex: 1; }
</style>
