<script lang="ts">
  import Icone from '../../ui/Icone.svelte';
  import Logo from '../../ui/Logo.svelte';
  import { app } from '../../data/store.svelte.ts';
  import { aller, retour } from '../../router.svelte.ts';
  import { AEROPORT_DEFAUT, REGIONS, codeAeroport, langueValide, regionDe, texte, type Langue } from './dico.ts';
  import { choisirLangue, enregistrerRegion, entree } from './etat.ts';
  import PcEntete from './PcEntete.svelte';
  import PcPied from './PcPied.svelte';

  /** Langue et région. Seuls les textes de cet écran basculent FR/EN (petit dictionnaire local) ; le reste de l'application reste en français. */
  const langue = $derived(langueValide(app.session.langue));
  const t = $derived(texte(langue));
  const memo = entree();
  let region = $state<string>(memo.region);
  let aeroport = $state(memo.aeroport || AEROPORT_DEFAUT);
  const code = $derived(codeAeroport(aeroport));
  const CARTES: { l: Langue; sigle: string; nom: string; exemple: string }[] = [
    { l: 'fr', sigle: 'FR', nom: 'Français', exemple: '« Votre vol pour Paris part à 18 h 05. »' },
    { l: 'en', sigle: 'EN', nom: 'English', exemple: '“Your flight to Paris departs at 6:05 PM.”' }
  ];
  /** Flèches : se déplacer entre les deux langues (groupe de boutons radio). */
  function touche(e: KeyboardEvent) {
    const sens = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0; if (!sens) return;
    e.preventDefault(); const suivante = CARTES[(CARTES.findIndex((c) => c.l === langue) + sens + CARTES.length) % CARTES.length].l;
    choisirLangue(suivante); document.getElementById(`langue-${suivante}`)?.focus();
  }
  const exemple = $derived(CARTES.find((c) => c.l === langue)?.exemple ?? '');
  const regionAffichee = $derived(regionDe(region).libelle[langue]);
  function continuer(e: MouseEvent) { e.preventDefault(); enregistrerRegion(region, aeroport); aller('/promesses'); }
</script>

<div class="nx racine" data-face="jour">
  <PcEntete>
    {#snippet liens()}
      <a href="/explorer" onclick={(e) => { e.preventDefault(); aller('/explorer'); }}>Explorer sans compte</a>
      <a href="/connexion" onclick={(e) => { e.preventDefault(); aller('/connexion'); }}>J’ai déjà un compte</a>
    {/snippet}
  </PcEntete>
  <header class="entete">
    <button type="button" class="rond" aria-label={t.retour} onclick={() => retour('/ouverture')}><Icone nom="retour" /></button>
    <div class="logo" aria-hidden="true"><Logo taille={20} /></div><span class="vide" aria-hidden="true"></span>
  </header>

  <main id="contenu" class="principal">
    <button type="button" class="retour-pc" onclick={() => retour('/ouverture')}><Icone nom="retour" taille={18} />{t.retour}</button>
    <div class="mise"><div class="gauche">
    <section class="intro">
      <p class="sur">Bienvenue · <span lang="en">Welcome</span></p>
      <h1>Choisissez votre langue</h1>
      <p class="en" lang="en">Choose your language</p>
    </section>

    <div role="radiogroup" aria-label={t.groupeLangue} class="cartes">
      {#each CARTES as c (c.l)}
        {@const on = langue === c.l}
        <button type="button" id={`langue-${c.l}`} role="radio" lang={c.l} aria-checked={on} tabindex={on ? 0 : -1} class="carte-l" class:on onclick={() => choisirLangue(c.l)} onkeydown={touche}>
          <span class="tuile" aria-hidden="true">{c.sigle}</span>
          <span class="txt"><span class="nom">{c.nom}</span><span class="ex">{c.exemple}</span></span>
          <span class="coche" aria-hidden="true">{#if on}<Icone nom="ok" taille={16} trait={2.5} />{/if}</span>
        </button>
      {/each}
      <p class="note" lang={langue}><Icone nom="info" taille={16} />{t.autresLangues}</p>
    </div>

    <section class="region" aria-labelledby="reg-titre" lang={langue}>
      <div class="col g4"><h2 id="reg-titre">{t.regionTitre}</h2><p class="aide-r">{t.regionAide}</p></div>
      <div class="col g8">
        <label for="region">{t.regionLabel}</label>
        <div class="champ-i">
          <span class="pic"><Icone nom="globe" taille={20} /></span>
          <select id="region" bind:value={region}>{#each REGIONS as r (r.code)}<option value={r.code}>{r.libelle[langue]}</option>{/each}</select>
          <span class="chev" aria-hidden="true"><Icone nom="suivant" taille={20} /></span>
        </div>
        <span class="aide">{t.regionDetectee}</span>
      </div>
      <div class="col g8">
        <label for="airport">{t.aeroportLabel}</label>
        <div class="champ-i">
          <span class="pic"><Icone nom="avion" taille={20} /></span>
          <input id="airport" type="text" bind:value={aeroport} autocomplete="off" aria-describedby="airport-help" />
          <span class="code" aria-hidden="true">{code}</span>
        </div>
        <span id="airport-help" class="aide">{t.aeroportAide}</span>
      </div>
    </section>
    <a class="continuer pc-continuer" href="/promesses" lang={langue} onclick={continuer}>{t.continuer}<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></a>
    </div>

    <section class="apercu nx-panneau" aria-labelledby="apercu-titre">
      <h2 id="apercu-titre">Aperçu</h2>
      <div class="depart" role="img" aria-label="Ligne de tableau des départs : 18:05, Paris CDG, à l’heure">
        <span class="h">18:05</span><span class="pal" aria-hidden="true"><span>C</span><span>D</span><span>G</span></span><span class="v">Paris</span><span class="s">À l’heure</span>
      </div>
      <p class="echantillon" lang={langue}>{exemple}</p>
      <div class="bloc"><span class="k">Région</span><span class="val">{regionAffichee}</span></div>
      <div class="bloc"><span class="k">Départ</span><span class="val">{aeroport}</span></div>
      <p class="hyp"><span class="pastille-h">[H]</span><span>Régions et devises proposées : à valider. Le marché pilote est Montréal, en dollars canadiens, en français.</span></p>
    </section>
    </div>
  </main>
  <PcPied />

  <div class="barre">
    <a class="continuer" href="/promesses" lang={langue} onclick={continuer}>{t.continuer}<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></a>
  </div>
</div>

<style>
  .racine { width: min(100%, 520px); margin: 0 auto; min-height: 100dvh; display: flex; flex-direction: column; overflow-x: clip; }
  .entete { display: grid; grid-template-columns: 44px 1fr 44px; align-items: center; gap: 8px; padding: max(52px, env(safe-area-inset-top)) 12px 8px; }
  .rond { width: 44px; height: 44px; border-radius: 999px; background: var(--surface); border: 1px solid var(--line); color: var(--ink); display: grid; place-items: center; cursor: pointer; padding: 0; }
  .logo { display: flex; justify-content: center; } .vide { width: 44px; height: 44px; }
  .principal { flex: 1; display: flex; flex-direction: column; gap: 22px; padding: 12px 20px 24px; min-width: 0; }
  .intro { display: flex; flex-direction: column; gap: 6px; } .sur { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); }
  h1 { font: 600 40px/40px 'Barlow Condensed', 'Arial Narrow', sans-serif; text-wrap: balance; } .en { font-size: 15px; color: var(--ink2); }
  .cartes { display: flex; flex-direction: column; gap: 12px; }
  .carte-l { position: relative; display: grid; grid-template-columns: 64px minmax(0, 1fr) 28px; align-items: center; gap: 14px; width: 100%; min-height: 104px; padding: 16px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); color: var(--ink); font-family: inherit; text-align: left; cursor: pointer; transition: box-shadow 200ms ease; }
  .carte-l.on { border: 2px solid var(--accent); padding: 15px; box-shadow: var(--ombre); }
  .tuile { width: 64px; height: 64px; border-radius: 16px; background: var(--surface2); color: var(--ink2); display: flex; align-items: center; justify-content: center; font: 700 30px/1 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; transition: background-color 200ms ease; }
  .on .tuile { background: var(--ink); color: #fff; }
  .txt { display: flex; flex-direction: column; gap: 4px; min-width: 0; } .nom { font-size: 18px; font-weight: 700; } .ex { font-size: 14px; line-height: 20px; color: var(--ink2); }
  .coche { width: 28px; height: 28px; border-radius: 999px; border: 2px solid var(--line-strong); background: var(--surface); color: #fff; display: flex; align-items: center; justify-content: center; }
  .on .coche { border: 0; background: var(--accent); }
  .note { display: flex; align-items: center; gap: 8px; font-size: 13px; line-height: 18px; color: var(--ink3); }
  .region { display: flex; flex-direction: column; gap: 14px; padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
  h2 { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); } .aide-r { font-size: 14px; line-height: 20px; color: var(--ink2); }
  label { font-size: 13px; font-weight: 500; color: var(--ink2); } .aide { font-size: 13px; color: var(--ink3); }
  .champ-i { position: relative; } .pic, .chev { position: absolute; top: 0; height: 52px; display: flex; align-items: center; pointer-events: none; color: var(--ink); } .pic { left: 14px; } .chev { right: 14px; transform: rotate(90deg); transform-origin: center; }
  select, input { width: 100%; height: 52px; padding: 0 44px; border-radius: 12px; background: var(--surface); border: 1px solid #7A8597; color: var(--ink); font: 600 16px 'Barlow', sans-serif; appearance: none; -webkit-appearance: none; } select { cursor: pointer; } input { padding-right: 72px; }
  .code { position: absolute; right: 14px; top: 9px; font: 700 30px/34px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; color: var(--ink); pointer-events: none; }
  .barre { position: sticky; bottom: 0; padding: 12px 20px calc(28px + env(safe-area-inset-bottom)); background: #fff; border-top: 1px solid var(--line); }
  .continuer { display: flex; align-items: center; justify-content: center; gap: 8px; height: 52px; border-radius: 14px; background: var(--signal); color: #0B1B2E; font-weight: 700; font-size: 16px; } .continuer:hover { background: var(--signal-2); color: #0B1B2E; }
  /* PC (≥ 900 px) : retour, titre et cartes à gauche, aperçu sombre collant à droite. Planche WebLangue. */
  .retour-pc, .apercu, .pc-continuer { display: none; } .mise, .gauche { display: contents; }
  @media (min-width: 900px) {
    .racine { width: 100%; max-width: none; }
    .entete, .barre { display: none; }
    .principal { flex: 1; gap: 18px; padding: 16px max(32px, calc((100% - 1120px) / 2)) 28px; }
    .retour-pc { display: inline-flex; align-self: flex-start; align-items: center; gap: 6px; min-height: 44px; padding: 0 12px 0 6px; margin-left: -6px; border: 0; border-radius: 12px; background: none; color: var(--accent); font: 700 15px/1 'Barlow', sans-serif; cursor: pointer; }
    .mise { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 24px; }
    .gauche { display: flex; flex: 999 1 560px; min-width: 0; flex-direction: column; gap: 20px; }
    .intro { gap: 10px; } .sur { color: #3E4F66; } .en { font-size: 17px; line-height: 24px; color: #3E4F66; }
    .cartes { flex-direction: row; flex-wrap: wrap; }
    .carte-l { display: flex; flex: 1 1 260px; width: auto; min-width: 0; min-height: 84px; padding: 14px 16px; border-radius: 18px; } .carte-l.on { padding: 13px 15px; }
    .tuile { flex: none; width: 56px; height: 56px; border-radius: 14px; font-size: 26px; font-weight: 700; } .coche { flex: none; } .txt { flex: 1; gap: 3px; } .nom { font-size: 19px; } .ex { color: #3E4F66; }
    .note { flex: 0 0 100%; align-items: flex-start; margin-top: 8px; font-size: 14px; line-height: 20px; color: #3E4F66; }
    .region { gap: 14px; padding: 22px; }
    h2 { font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; color: var(--ink); } .aide-r { font-size: 15px; line-height: 22px; color: #3E4F66; }
    label, .aide { color: #3E4F66; } select { padding: 0 44px 0 48px; } input { padding: 0 84px 0 48px; }
    .pic, .chev { top: 0; height: 52px; } .chev { color: var(--accent); }
    .code { right: 8px; top: 8px; min-width: 52px; height: 36px; padding: 0 6px; border-radius: 8px; background: #0B1B2E; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 20px; line-height: 1; letter-spacing: 0.06em; font-weight: 700; }
    .pc-continuer { display: flex; align-self: flex-start; min-width: 280px; height: auto; min-height: 56px; padding: 8px 22px; font-size: 17px; }
    .apercu { display: flex; flex-direction: column; gap: 14px; flex: 1 1 320px; max-width: 460px; min-width: 0; position: sticky; top: 16px; padding: 22px; border-radius: 20px; background: #0B1B2E; color: #fff; }
    .apercu h2 { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: #C9D3DF; }
    .depart { display: grid; grid-template-columns: auto auto 1fr auto; align-items: center; gap: 12px; min-height: 56px; }
    .depart .h { font: 500 17px/1 'IBM Plex Mono', ui-monospace, monospace; } .depart .v { font-size: 16px; font-weight: 500; color: #C9D3DF; } .depart .s { font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #7CE3B5; }
    .pal { display: flex; gap: 3px; } .pal span { position: relative; width: 26px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 6px; background: #1B2D45; box-shadow: inset 0 -18px 0 #15263C; font: 600 19px/1 'IBM Plex Mono', ui-monospace, monospace; color: #FFD23F; }
    .echantillon { font: 600 28px/32px 'Barlow Condensed', 'Arial Narrow', sans-serif; text-wrap: balance; }
    .bloc { display: flex; flex-direction: column; gap: 2px; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.14); }
    .k { font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #C9D3DF; } .val { font-size: 16px; font-weight: 600; overflow-wrap: anywhere; }
    .hyp { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; line-height: 20px; color: #C9D3DF; }
    .pastille-h { flex: none; display: inline-flex; align-items: center; height: 20px; padding: 0 6px; border-radius: 6px; background: rgba(255, 210, 63, 0.16); color: #FFD23F; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; }
  }
</style>
