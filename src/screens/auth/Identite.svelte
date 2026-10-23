<script lang="ts">
  import { onMount } from 'svelte';
  import { maintenant } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import Bouton from '../../ui/Bouton.svelte';
  import Champ from '../../ui/Champ.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { verifierIdentite } from '../../core/inscription.ts';
  import Etape from './Etape.svelte';
  import { etatAuth } from './etat.ts';

  const b = etatAuth().brouillon;
  onMount(() => { if (b.etape < 2) aller('/inscription/telephone', { remplacer: true }); });

  /** Lecture simulée de la CNI : aucune caméra n'est ouverte, les champs sont pré-remplis pour être corrigés. */
  const LECTURE = { nomComplet: 'NGONO Aïcha Marthe', cni: '1162 ···· ···· 07', naissance: '14 · 03 · 1991' };
  const GALERIE = ['IMG_2041', 'CNI_recto', 'IMG_1987'];
  let nomComplet = $state(b.nomComplet);
  let cni = $state(b.cni);
  let naissance = $state(b.naissance);
  let touche = $state({ nom: false, cni: false, naissance: false });

  const lecture = $derived(b.lecture);
  const verif = $derived(verifierIdentite({ nomComplet, cni, naissance }, maintenant()));
  function capturer() {
    if (b.lecture !== 'attente') return;
    b.lecture = 'capture';
    setTimeout(() => {
      b.lecture = 'faite';
      if (!b.nomComplet) { nomComplet = LECTURE.nomComplet; cni = LECTURE.cni; naissance = LECTURE.naissance; }
    }, 450);
  }
  function reprendre() { b.lecture = 'attente'; }
  function continuer() {
    if (!verif.ok) { touche = { nom: true, cni: true, naissance: true }; return; }
    b.nomComplet = nomComplet.trim().replace(/\s+/g, ' '); b.cni = cni.trim(); b.naissance = naissance.trim();
    b.etape = Math.max(b.etape, 3) as typeof b.etape;
    aller('/inscription/pass');
  }
  const libelleViseur = $derived(lecture === 'faite' ? 'LECTURE · 98 %' : lecture === 'capture' ? 'CAPTURE…' : b.source === 'cam' ? 'CADRÉ · APPUYEZ POUR PHOTOGRAPHIER' : 'IMPORT');
</script>

<Etape retourVers="/inscription/code" repere="ÉTAPE 3 / 5 · IDENTITÉ" segments={5} segmentActif={3} titre="Posez votre CNI dans le cadre." sous="Lecture automatique. Corrigez ensuite si besoin.">
  {#if b.source === 'gal' && lecture === 'attente'}
    <div class="galerie" role="group" aria-label="Galerie : touchez la photo de votre CNI">
      <p class="lib">GALERIE · TOUCHEZ LA PHOTO DE VOTRE CNI</p>
      <div class="vignettes">{#each GALERIE as g (g)}<button type="button" onclick={capturer} aria-label="Choisir {g}">{g}</button>{/each}</div>
    </div>
  {:else}
    <div class="viseur" class:fait={lecture === 'faite'} class:flash={lecture === 'capture'}>
      <div class="coin hg"></div><div class="coin hd"></div><div class="coin bg"></div><div class="coin bd"></div>
      <div class="cni" style:transform="scale({lecture === 'faite' ? 0.97 : 1})">
        <div class="photo"><Icone nom="profil" taille={30} /></div>
        <div class="lignes"><i></i><i></i><i class="c"></i><i></i></div>
        {#if lecture === 'attente'}<span class="balai" aria-hidden="true"></span>{/if}
      </div>
      <p class="etat" role="status">{libelleViseur}</p>
    </div>
  {/if}

  {#if lecture === 'faite'}
    <div class="form">
      <Champ etiquette="Nom et prénoms (comme sur la CNI)" bind:valeur={nomComplet} erreur={touche.nom || nomComplet ? verif.erreurs.nom ?? '' : ''} oninput={() => (touche.nom = true)} />
      <Champ etiquette="N° CNI" bind:valeur={cni} erreur={touche.cni ? verif.erreurs.cni ?? '' : ''} oninput={() => (touche.cni = true)} />
      <Champ etiquette="Née le" bind:valeur={naissance} placeholder="JJ / MM / AAAA" inputmode="numeric" erreur={touche.naissance ? verif.erreurs.naissance ?? '' : ''} oninput={() => (touche.naissance = true)} />
      <div class="selfie"><span class="vis" aria-hidden="true"><Icone nom="profil" taille={22} /></span><div><b>Selfie de vérification</b><small>Comparé à la photo de la CNI</small></div><span class="ok"><Icone nom="ok" taille={16} trait={2.4} />Correspond</span></div>
    </div>
  {:else if lecture === 'attente'}
    <ul class="conseils"><li>Posez la carte à plat, bien éclairée</li><li>Évitez les reflets sur la photo</li><li>Les 4 coins doivent rester visibles</li></ul>
  {/if}

  <p class="confiance"><Icone nom="verrou" taille={16} />Vos données sont chiffrées et ne servent qu'à ouvrir votre compte, conformément à la loi camerounaise sur les données personnelles.</p>

  {#snippet pied()}
    {#if lecture === 'faite'}
      <Bouton variante="discret" onclick={reprendre}>Reprendre la photo</Bouton>
      <Bouton desactive={!verif.ok} onclick={continuer}>C'est bien moi<Icone nom="fleche" taille={18} trait={2.2} /></Bouton>
    {:else if b.source === 'cam'}
      <Bouton variante="discret" onclick={() => (b.source = 'gal')}>Importer depuis la galerie</Bouton>
      <Bouton desactive={lecture === 'capture'} onclick={capturer}><Icone nom="camera" taille={20} />Prendre la photo</Bouton>
    {:else}
      <Bouton variante="discret" onclick={() => (b.source = 'cam')}>Utiliser l'appareil photo</Bouton>
      <p class="choix muted">Choisissez l'image de votre CNI</p>
    {/if}
  {/snippet}
</Etape>

<style>
  .viseur { position: relative; padding: 22px; border-radius: 24px; background: #0b0f1a; border: 1px solid var(--ligne); display: flex; flex-direction: column; gap: 14px; align-items: center; transition: border-color 0.3s; }
  .viseur.fait { border-color: rgba(61, 213, 152, 0.5); } .flash::after { content: ''; position: absolute; inset: 0; background: #fff; opacity: 0.9; border-radius: 24px; animation: flash 0.45s forwards; }
  .coin { position: absolute; width: 22px; height: 22px; border: 3px solid #7c93ff; } .fait .coin { border-color: var(--bon); }
  .hg { top: 10px; left: 10px; border-right: 0; border-bottom: 0; border-radius: 8px 0 0 0; } .hd { top: 10px; right: 10px; border-left: 0; border-bottom: 0; border-radius: 0 8px 0 0; }
  .bg { bottom: 34px; left: 10px; border-right: 0; border-top: 0; border-radius: 0 0 0 8px; } .bd { bottom: 34px; right: 10px; border-left: 0; border-top: 0; border-radius: 0 0 8px 0; }
  .cni { position: relative; width: 100%; max-width: 300px; aspect-ratio: 1.58; border-radius: 14px; background: linear-gradient(135deg, #1f2c5a, #0f1422); border: 1px solid var(--ligne-forte); display: flex; gap: 14px; padding: 16px; overflow: hidden; transition: transform 0.3s; }
  .photo { width: 70px; height: 86px; border-radius: 10px; background: rgba(255, 255, 255, 0.08); display: grid; place-items: center; color: var(--muted); flex: none; }
  .lignes { flex: 1; display: flex; flex-direction: column; gap: 10px; padding-top: 6px; } .lignes i { display: block; height: 8px; border-radius: 4px; background: rgba(255, 255, 255, 0.14); } .lignes .c { width: 60%; }
  .balai { position: absolute; left: 0; right: 0; height: 2px; background: #7c93ff; box-shadow: 0 0 14px #7c93ff; animation: balai 1.6s ease-in-out infinite; }
  .etat { font: 500 10.5px var(--mono); letter-spacing: 0.12em; color: var(--muted); } .fait .etat { color: var(--bon); }
  .galerie { padding: 16px; border-radius: 24px; background: #0b0f1a; border: 1px solid var(--ligne); display: flex; flex-direction: column; gap: 12px; } .lib { font: 500 10.5px var(--mono); letter-spacing: 0.1em; color: var(--muted); }
  .vignettes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; } .vignettes button { aspect-ratio: 1; min-height: 88px; border-radius: 14px; background: linear-gradient(135deg, #1a2340, #26304d); border: 1px solid var(--ligne); font: 500 11px var(--mono); color: var(--doux); display: grid; place-items: end start; padding: 8px; }
  .form { display: flex; flex-direction: column; gap: 12px; }
  .selfie { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; background: var(--carte); border: 1px solid var(--ligne); } .selfie div { flex: 1; display: flex; flex-direction: column; } .selfie b { font-size: 14px; } .selfie small { color: var(--muted); font-size: 12px; }
  .vis { width: 40px; height: 40px; border-radius: 12px; background: var(--carte2); display: grid; place-items: center; color: var(--muted); } .ok { display: inline-flex; align-items: center; gap: 4px; color: var(--bon); font: 500 11px var(--mono); letter-spacing: 0.06em; }
  .conseils { list-style: none; display: flex; flex-direction: column; gap: 6px; color: var(--muted); font-size: 13.5px; } .conseils li::before { content: '•'; color: var(--primaire-clair); margin-right: 8px; }
  .confiance { display: flex; gap: 10px; align-items: flex-start; font-size: 12px; color: var(--faint); line-height: 1.45; } .confiance :global(svg) { flex: none; margin-top: 1px; }
  .choix { text-align: center; font-size: 13px; }
  @keyframes balai { 0%, 100% { top: 6%; } 50% { top: 90%; } } @keyframes flash { to { opacity: 0; } }
</style>
