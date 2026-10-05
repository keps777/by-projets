<script lang="ts">
  // Installation sur l'écran d'accueil (planche Installer) : 4 étapes à cocher, gardées sur l'appareil.
  import EcranPage from '../../ui/EcranPage.svelte';
  import Icone from '../../ui/Icone.svelte';
  import type { NomIcone } from '../../ui/icones.ts';
  import { estInstallee } from './push.ts';

  let { params: _ = {} }: { params?: Record<string, string> } = $props();

  const CLE = 'luther-life:installer';
  const ETAPES: { titre: string; sous: string; icone: NomIcone }[] = [
    { titre: 'Ouvre l’app dans Safari', sous: 'À l’adresse que tu as reçue', icone: 'monde' },
    { titre: 'Touche le bouton Partager', sous: 'La flèche vers le haut, en bas de l’écran', icone: 'partager' },
    { titre: 'Choisis « Sur l’écran d’accueil »', sous: 'Fais défiler la liste vers le bas', icone: 'plus' },
    { titre: 'Ouvre l’app depuis son icône', sous: 'Pas depuis Safari : c’est ce qui active les notifications', icone: 'telephone' }
  ];
  const installee = estInstallee();

  function lire(): boolean[] {
    if (installee) return ETAPES.map(() => true);
    try {
      const v = JSON.parse(localStorage.getItem(CLE) ?? 'null');
      if (Array.isArray(v) && v.length === ETAPES.length) return v.map(Boolean);
    } catch { /* rien de mémorisé */ }
    return [true, false, false, false];
  }
  let faites = $state<boolean[]>(lire());
  const toutes = $derived(faites.every(Boolean));

  function basculer(i: number): void {
    faites = faites.map((x, k) => (k === i ? !x : x));
    try { localStorage.setItem(CLE, JSON.stringify(faites)); } catch { /* stockage indisponible */ }
  }
</script>

{#snippet pied()}
  <a class="cta" href="/autoriser-notifications">{toutes ? 'C’est fait, continuer' : 'Continuer'}</a>
  <a class="plus-tard" href="/autoriser-notifications">Plus tard</a>
{/snippet}

<EcranPage onglets={false} gap={18} {pied}>
  <div class="tete">
    <span class="etape">Étape 1 sur 2</span>
    <h1 class="titre">Ajoute l’app à l’écran d’accueil</h1>
    <p class="intro">Les notifications ne fonctionnent que depuis l’icône de l’écran d’accueil. Ça prend 20 secondes.</p>
  </div>

  {#if installee}
    <div class="installee"><Icone nom="coche" taille={18} trait={2.6} />L’app est déjà ouverte depuis son icône.</div>
  {/if}

  <div class="etapes">
    {#each ETAPES as e, i (i)}
      <button type="button" class="etape-btn" class:faite={faites[i]} aria-pressed={faites[i]} onclick={() => basculer(i)}>
        <span class="pastille mono">{#if faites[i]}<Icone nom="coche" taille={16} trait={3.2} />{:else}{i + 1}{/if}</span>
        <span class="textes"><span class="t">{e.titre}</span><span class="muted s">{e.sous}</span></span>
        <span class="icone"><Icone nom={e.icone} taille={22} /></span>
      </button>
    {/each}
  </div>

  <div class="astuce">Ouvre ce lien dans <b>Safari</b>. Dans un autre navigateur, l’option « Sur l’écran d’accueil » peut manquer.</div>
</EcranPage>

<style>
  .tete { display: flex; flex-direction: column; gap: 8px; padding: 36px 4px 0; }
  .etape { font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent-encre); }
  h1 { font-size: 32px; line-height: 1.08; }
  .intro { font-size: 15px; line-height: 1.45; color: var(--muted); }
  .installee { display: flex; align-items: center; gap: 10px; background: var(--bon-fond); color: var(--bon); border-radius: 16px; padding: 12px 14px; font-size: 14px; font-weight: 600; }
  .etapes { display: flex; flex-direction: column; gap: 8px; }
  .etape-btn { width: 100%; border: 1px solid var(--ligne); background: var(--champ); text-align: left; border-radius: 20px; padding: 14px; min-height: 64px; display: flex; align-items: center; gap: 12px; }
  .etape-btn.faite { border-color: color-mix(in srgb, var(--accent) 40%, var(--accent-fond)); background: var(--accent-fond); }
  .pastille { flex: none; width: 32px; height: 32px; border-radius: 16px; background: var(--ligne); font-size: 14px; display: flex; align-items: center; justify-content: center; }
  .faite .pastille { background: var(--accent); color: var(--accent-texte); }
  .textes { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .t { font-size: 16px; font-weight: 600; }
  .s { font-size: 13px; }
  .icone { flex: none; width: 44px; height: 44px; border-radius: 12px; background: var(--surface-2); display: flex; align-items: center; justify-content: center; color: var(--muted); }
  .astuce { background: var(--surface); border-radius: 18px; padding: 12px 14px; font-size: 13px; line-height: 1.5; color: var(--muted); }
  .astuce b { color: var(--texte); }
  .cta { height: 56px; border-radius: 18px; background: var(--accent); color: var(--accent-texte); font-size: 16px; font-weight: 600; display: flex; align-items: center; justify-content: center; }
  .plus-tard { color: var(--muted); font-size: 13px; min-height: 44px; display: flex; align-items: center; justify-content: center; }
</style>
