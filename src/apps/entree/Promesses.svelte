<script lang="ts">
  import { onMount } from 'svelte';
  import Icone from '../../ui/Icone.svelte';
  import Logo from '../../ui/Logo.svelte';
  import { aller, retour } from '../../router.svelte.ts';
  import { NB, PROMESSES, annonce, apresTouche, compteARebours, decompteSuivant, indexDepuisDefilement, libellePoint } from './promesses.ts';
  import { marquerTutoVu } from './etat.ts';
  import PcEntete from './PcEntete.svelte';
  import PcPied from './PcPied.svelte';

  /** Trois promesses : carrousel à défilement CSS (scroll-snap). Balayage, flèches du clavier, points cliquables, aria-live. */
  const reduit = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let page = $state(0);
  let piste: HTMLDivElement | undefined = $state();
  let reste = $state(86382);
  const dernier = $derived(page === NB - 1);
  $effect(() => { if (dernier) marquerTutoVu(); });

  function aPage(i: number) {
    const v = Math.max(0, Math.min(NB - 1, i)); page = v;
    piste?.scrollTo({ left: v * piste.clientWidth, behavior: reduit ? 'auto' : 'smooth' });
  }
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  /** Après un balayage, la diapositive visible est lue sur la position de défilement (une fois le défilement posé). */
  function surDefilement() {
    clearTimeout(minuterie);
    minuterie = setTimeout(() => { if (piste) page = indexDepuisDefilement(piste.scrollLeft, piste.clientWidth); }, 90);
  }
  function surTouche(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest('a,input,select,textarea')) return;
    const v = apresTouche(e.key, page); if (v === null) return; e.preventDefault(); aPage(v);
  }
  function sortir(vers: string) { marquerTutoVu(); aller(vers); }
  const va = (e: MouseEvent, vers: string) => { e.preventDefault(); sortir(vers); };
  onMount(() => {
    // Le redimensionnement (rotation) garde la diapositive courante.
    const recaler = () => piste?.scrollTo({ left: page * piste.clientWidth, behavior: 'auto' });
    addEventListener('resize', recaler);
    const t = reduit ? undefined : setInterval(() => (reste = decompteSuivant(reste)), 1000);
    return () => { removeEventListener('resize', recaler); clearInterval(t); clearTimeout(minuterie); };
  });
</script>

<div class="nx racine" data-face="jour">
  <PcEntete>
    {#snippet liens()}
      <a href="/explorer" onclick={(e) => va(e, '/explorer')}>Explorer sans compte</a>
      <a href="/connexion" onclick={(e) => va(e, '/connexion')}>J’ai déjà un compte</a>
    {/snippet}
  </PcEntete>
  <header class="entete">
    <button type="button" class="rond" aria-label="Retour" onclick={() => retour('/langue')}><Icone nom="retour" /></button>
    <div class="logo" aria-hidden="true"><Logo taille={20} /></div>
    <a class="passer" href="/inscription" onclick={(e) => va(e, '/inscription')}>Passer</a>
  </header>

  <main id="contenu" class="principal">
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <section aria-roledescription="carrousel" aria-label="Découvrir NexG-TT" class="carrousel" onkeydown={surTouche}>
      <p class="sr" role="status" aria-live="polite">{annonce(page)}</p>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div class="piste" bind:this={piste} onscroll={surDefilement} tabindex="0" role="group" aria-label="Diapositives, balayer ou utiliser les flèches du clavier">
        {#each PROMESSES as p, i (p.id)}
          <div class="slide" class:actif={page === i} role="group" aria-roledescription="diapositive" aria-label={`${i + 1} sur ${NB}`} aria-hidden={page === i ? undefined : 'true'}>
            {#if p.id === 'voyager'}
              <div class="visuel ciel" aria-hidden="true">
                <span class="orbite"></span>
                <span class="puce-r"><Icone nom="chercher" taille={14} trait={2} />Montréal → Paris</span>
                <span class="vol">
                  <span class="trajet"><span class="iata">YUL</span><span class="pointille"></span><span class="avion"><Icone nom="avion" taille={22} trait={2} /></span><span class="pointille"></span><span class="iata">CDG</span></span>
                  <span class="date">Lun. 14 déc. · 1 voyageur</span>
                </span>
                <span class="offres">
                  <span class="offre"><span class="etq">Neuf</span><span class="of-t">Aérolys · 18:05</span><span class="prix">1 120 $</span></span>
                  <span class="offre sel"><span class="etq bleu">Revente</span><span class="of-t">Aérolys · 18:05</span><span class="prix">980 $</span></span>
                </span>
                <span class="fictifs">Prix fictifs</span>
              </div>
            {:else if p.id === 'revendre'}
              <div class="visuel nuit" role="img" aria-label="Un billet passe de votre main à celle d’un autre voyageur">
                <span class="puce-n"><Icone nom="echange" taille={14} trait={2} />Revente encadrée</span>
                <span class="rail"></span>
                <span class="passe" class:vif={page === i}>
                  <span class="b-corps"><span class="b-trajet">YUL → CDG</span><span class="b-date">14 DÉC. · 18:05</span><span class="b-etat">En revente</span></span>
                  <span class="b-talon"><span class="b-t1"></span><span class="b-t2"></span><span class="code"></span></span>
                </span>
                <span class="bras g"><span class="manche"></span><span class="main"></span><span class="pouce"></span><span class="ligne"></span></span>
                <span class="bras d"><span class="manche"></span><span class="main"></span><span class="pouce"></span><span class="ligne"></span></span>
                <span class="qui l"><span class="q1">Vous</span><span class="q2">Plans changés</span></span>
                <span class="qui r"><span class="q1">Paul B.</span><span class="q2">Part à votre place</span></span>
              </div>
            {:else}
              <div class="visuel ciel col3" aria-hidden="true">
                <span class="echeance">
                  <span class="e-tete"><span>Échéance de nommage</span><span class="e-etat"><span class="pt" class:bat={page === i}></span>En cours</span></span>
                  <span class="e-corps">
                    <span class="cases"><span class="cel">J<span class="charn"></span></span><span class="cel">-<span class="charn"></span></span><span class="cel">1<span class="charn"></span></span></span>
                    <span class="e-txt"><span class="decompte">{compteARebours(reste)}</span><span class="e-sous">avant l’envoi du nom</span></span>
                  </span>
                </span>
                <span class="b3"><span class="b3-h"><span class="b3-t">YUL → CDG</span><span class="b3-d">14 déc. · 18:05</span></span><span class="tiret"></span>
                  <span class="b3-v"><span class="b3-l">Voyageur</span><span class="champ-v">Vous ou un proche<span class="curseur" class:vif={page === i}></span></span></span></span>
                <span class="pastille"><Icone nom="horloge" taille={14} trait={2} />Nommer avant le 13 déc. 18:05</span>
              </div>
            {/if}
            <div class="texte">
              <p class="sur">{p.kicker}</p>
              <h1>{p.titre}</h1>
              <p class="para">{p.texte}</p>
            </div>
          </div>
        {/each}
      </div>

      <div class="bas">
        <div class="points">
          {#each PROMESSES as _, i (i)}
            <button type="button" class="point" aria-label={libellePoint(i)} aria-current={page === i ? 'step' : 'false'} onclick={() => aPage(i)}><span class:on={page === i}></span></button>
          {/each}
        </div>
        <div class="actions">
          {#if page > 0}<button type="button" class="prec" aria-label="Précédent" onclick={() => aPage(page - 1)}><Icone nom="retour" /></button>{/if}
          {#if !dernier}
            <button type="button" class="principal-b" onclick={() => aPage(page + 1)}>Suivant<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></button>
          {:else}
            <a class="principal-b" href="/inscription" onclick={(e) => va(e, '/inscription')}>Créer mon compte<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></a>
          {/if}
        </div>
        {#if dernier}
          <div class="liens"><a class="lien" href="/connexion" onclick={(e) => va(e, '/connexion')}>J’ai déjà un compte</a><a class="lien" href="/explorer" onclick={(e) => va(e, '/explorer')}>Explorer sans compte</a></div>
        {/if}
      </div>
    </section>
    <!-- PC (≥ 900 px) : les trois promesses côte à côte, sans carrousel (planche WebPromesse). -->
    <div class="pc-contenu">
      <div class="pc-haut"><button type="button" class="retour-pc" onclick={() => retour('/langue')}><Icone nom="retour" taille={18} />Retour</button><a class="passer-pc" href="/inscription" onclick={(e) => va(e, '/inscription')}>Passer</a></div>
      <h1 class="pc-h1">Ce que vous pouvez faire</h1>
      <div class="pc-cartes">
        <article class="pc-promesse" aria-labelledby="pr1-titre">
          <div class="pc-visuel clair" aria-hidden="true">
            <span class="puce-r pc-puce"><Icone nom="chercher" taille={14} trait={2} />Montréal → Paris</span>
            <span class="pc-vol"><span class="trajet"><span class="iata">YUL</span><span class="pointille"></span><span class="avion"><Icone nom="avion" taille={22} trait={2} /></span><span class="pointille"></span><span class="iata">CDG</span></span><span class="date">Lun. 14 déc. · 1 voyageur</span></span>
            <span class="pc-offres">
              <span class="offre"><span class="etq">Neuf</span><span class="of-t">Aérolys · 18:05</span><span class="prix">1 120 $</span></span>
              <span class="offre sel"><span class="etq bleu">Revente</span><span class="of-t">Aérolys · 18:05</span><span class="prix">980 $</span></span>
            </span>
            <span class="fictifs pc-fictifs">Prix fictifs</span>
          </div>
          <div class="pc-texte"><p class="sur">{PROMESSES[0].kicker}</p><h2 id="pr1-titre">{PROMESSES[0].titre}</h2><p class="para">{PROMESSES[0].texte}</p></div>
        </article>
        <article class="pc-promesse" aria-labelledby="pr2-titre">
          <div class="pc-visuel sombre" role="img" aria-label="Un billet passe de votre main à celle d’un autre voyageur">
            <span class="pc-puce-n"><Icone nom="echange" taille={16} trait={2} />Revente encadrée</span>
            <span class="pc-billet"><span class="pc-b-corps"><span class="pc-b-trajet">YUL → CDG</span><span class="pc-b-date">14 DÉC. · 18:05</span><span class="pc-b-etat">En revente</span></span><span class="pc-b-talon"></span></span>
            <span class="pc-rail"></span>
            <span class="pc-passe">
              <span class="pc-qui"><span class="pc-rond bleu"><Icone nom="moi" taille={22} /></span><span class="pc-q"><span class="q1">Vous</span><span class="q2">Plans changés</span></span></span>
              <span class="pc-fleche"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span>
              <span class="pc-qui d"><span class="pc-rond jaune"><Icone nom="moi" taille={22} /></span><span class="pc-q d"><span class="q1">Paul B.</span><span class="q2">Part à votre place</span></span></span>
            </span>
          </div>
          <div class="pc-texte"><p class="sur">{PROMESSES[1].kicker}</p><h2 id="pr2-titre">{PROMESSES[1].titre}</h2><p class="para">{PROMESSES[1].texte}</p></div>
        </article>
        <article class="pc-promesse" aria-labelledby="pr3-titre">
          <div class="pc-visuel clair" aria-hidden="true">
            <span class="echeance">
              <span class="e-tete"><span>Échéance de nommage</span><span class="e-etat"><span class="pc-pt"></span>En cours</span></span>
              <span class="e-corps">
                <span class="cases"><span class="cel">J<span class="charn"></span></span><span class="cel">-<span class="charn"></span></span><span class="cel">1<span class="charn"></span></span></span>
                <span class="e-txt"><span class="decompte">{compteARebours(reste)}</span><span class="e-sous">avant l’envoi du nom</span></span>
              </span>
            </span>
            <span class="b3"><span class="b3-h"><span class="b3-t">YUL → CDG</span><span class="b3-d">14 déc. · 18:05</span></span><span class="tiret"></span>
              <span class="b3-v"><span class="b3-l">Voyageur</span><span class="champ-v pc-champ">Vous ou un proche</span></span></span>
            <span class="pastille"><Icone nom="horloge" taille={14} trait={2} />Nommer avant le 13 déc. 18:05</span>
          </div>
          <div class="pc-texte"><p class="sur">{PROMESSES[2].kicker}</p><h2 id="pr3-titre">{PROMESSES[2].titre}</h2><p class="para">{PROMESSES[2].texte}</p>
            <p class="pc-hyp"><span class="pastille-h">[H]</span><span>Échéance de nommage : la veille du départ (J-1) est une hypothèse à valider.</span></p></div>
        </article>
      </div>
      <div class="pc-cta">
        <a class="principal-b pc-creer" href="/inscription" onclick={(e) => va(e, '/inscription')}>Créer mon compte<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></a>
        <a class="lien pc-explorer" href="/explorer" onclick={(e) => va(e, '/explorer')}>Explorer sans compte</a>
      </div>
    </div>
  </main>
  <PcPied />
</div>

<style>
  .racine { width: min(100%, 520px); margin: 0 auto; height: 100dvh; min-height: 640px; display: flex; flex-direction: column; overflow: clip; }
  .entete { display: grid; grid-template-columns: 76px 1fr 76px; align-items: center; gap: 8px; padding: max(52px, env(safe-area-inset-top)) 12px 8px; }
  .rond { width: 44px; height: 44px; border-radius: 999px; background: var(--surface); border: 1px solid var(--line); color: var(--ink); display: grid; place-items: center; cursor: pointer; padding: 0; }
  .logo { display: flex; justify-content: center; } .passer { justify-self: end; display: flex; align-items: center; min-height: 44px; padding: 0 8px; font-size: 16px; font-weight: 600; }
  .principal { flex: 1; min-height: 0; display: flex; flex-direction: column; } .carrousel { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .piste { flex: 1; min-height: 0; display: flex; overflow-x: auto; overflow-y: auto; scroll-snap-type: x mandatory; overscroll-behavior-x: contain; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
  .piste::-webkit-scrollbar { display: none; }
  .slide { flex: 0 0 100%; min-width: 0; scroll-snap-align: start; scroll-snap-stop: always; padding: 8px 20px 0; display: flex; flex-direction: column; gap: 20px; }
  .visuel { line-height: normal; position: relative; flex: none; height: 312px; border-radius: 24px; overflow: hidden; } .ciel { background: #DCE7F3; } .nuit { background: #0B1B2E; color: #fff; }
  .texte { display: flex; flex-direction: column; gap: 8px; } .sur { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); }
  h1 { font: 600 36px/38px 'Barlow Condensed', 'Arial Narrow', sans-serif; text-wrap: balance; } .para { font-size: 16px; line-height: 24px; color: var(--ink2); }
  /* Diapositive 1 */
  .orbite { position: absolute; left: -60px; top: 40px; width: 520px; height: 420px; border-radius: 999px; border: 2px dashed var(--line-strong); }
  .puce-r { position: absolute; left: 20px; top: 20px; display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: 999px; background: #fff; font-size: 13px; font-weight: 700; color: var(--ink); }
  .vol { position: absolute; left: 20px; right: 20px; top: 66px; display: flex; flex-direction: column; gap: 10px; padding: 16px; border-radius: 18px; background: #fff; box-shadow: var(--ombre); }
  .trajet { display: flex; align-items: center; gap: 10px; } .iata { font: 700 38px/38px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; } .pointille { flex: 1; min-width: 0; border-top: 2px dotted var(--line-strong); } .avion { color: var(--accent); display: flex; }
  .date { font-size: 13px; color: var(--ink2); } .offres { position: absolute; left: 20px; right: 20px; top: 190px; display: flex; flex-direction: column; gap: 8px; }
  .offre { display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 0 14px; border-radius: 14px; background: #fff; border: 1px solid var(--line); } .offre.sel { border: 2px solid var(--accent); padding: 0 13px; }
  .etq { display: inline-flex; align-items: center; height: 24px; padding: 0 9px; border-radius: 999px; background: var(--surface2); color: var(--ink2); font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; } .etq.bleu { background: var(--accent-soft); color: var(--accent); }
  .of-t { flex: 1; min-width: 0; font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .prix { font: 600 16px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .fictifs { position: absolute; right: 20px; bottom: 12px; font-size: 12px; color: var(--ink2); }
  /* Diapositive 2 */
  .puce-n { position: absolute; left: 20px; top: 20px; display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: 999px; background: #1B2D45; color: #C9D3DF; font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
  .rail { position: absolute; left: 40px; right: 40px; top: 214px; border-top: 2px dashed #2D4A6E; }
  .passe { position: absolute; left: calc(50% - 82px); top: 92px; width: 164px; display: flex; } .passe.vif { animation: nx-pass 3.6s ease-in-out infinite alternate; }
  .b-corps { position: relative; flex: 1; display: flex; flex-direction: column; gap: 4px; padding: 12px 10px 12px 14px; border-radius: 12px 0 0 12px; background: #fff; color: #121418; }
  .b-trajet { font: 700 26px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; white-space: nowrap; } .b-date { font-size: 11px; font-weight: 600; color: #555C6B; }
  .b-etat { align-self: flex-start; display: inline-flex; align-items: center; height: 20px; padding: 0 8px; border-radius: 999px; background: rgba(26, 100, 200, 0.1); color: #1A64C8; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
  .b-talon { position: relative; width: 34px; border-left: 2px dashed #E2E4E9; border-radius: 0 12px 12px 0; background: #fff; }
  .b-t1, .b-t2 { position: absolute; left: -9px; width: 16px; height: 16px; border-radius: 999px; background: #0B1B2E; } .b-t1 { top: -8px; } .b-t2 { bottom: -8px; }
  .code { position: absolute; left: 9px; top: 12px; bottom: 12px; width: 12px; background: repeating-linear-gradient(0deg, #121418 0 2px, transparent 2px 5px); }
  .bras { position: absolute; top: 196px; width: 150px; height: 64px; } .bras.g { left: 0; } .bras.d { right: 0; }
  .bras span { position: absolute; background: #C9D3DF; }
  .g .manche { left: 0; top: 12px; width: 52px; height: 40px; border-radius: 0 10px 10px 0; background: #1A64C8; } .g .main { left: 46px; top: 14px; width: 96px; height: 34px; border-radius: 8px 20px 24px 14px; } .g .pouce { left: 116px; top: 2px; width: 30px; height: 18px; border-radius: 12px; transform: rotate(-32deg); } .g .ligne { left: 60px; top: 38px; width: 70px; height: 2px; background: #A9B6C6; }
  .d .manche { right: 0; top: 12px; width: 52px; height: 40px; border-radius: 10px 0 0 10px; background: #FFD23F; } .d .main { right: 46px; top: 14px; width: 96px; height: 34px; border-radius: 20px 8px 14px 24px; } .d .pouce { right: 116px; top: 2px; width: 30px; height: 18px; border-radius: 12px; transform: rotate(32deg); } .d .ligne { right: 60px; top: 38px; width: 70px; height: 2px; background: #A9B6C6; }
  .qui { position: absolute; bottom: 16px; display: flex; flex-direction: column; gap: 2px; } .qui.l { left: 20px; } .qui.r { right: 20px; align-items: flex-end; }
  .q1 { font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #C9D3DF; } .q2 { font-size: 14px; font-weight: 600; }
  /* Diapositive 3 */
  .col3 { display: flex; flex-direction: column; gap: 14px; padding: 18px 20px; }
  .echeance { display: flex; flex-direction: column; gap: 10px; padding: 16px; border-radius: 18px; background: #0B1B2E; color: #fff; }
  .e-tete { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #C9D3DF; } .e-etat { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
  .pt { width: 6px; height: 6px; border-radius: 999px; background: #FFD23F; } .pt.bat { animation: nx-pulse 1.4s ease-in-out infinite; }
  .e-corps { display: flex; align-items: center; gap: 12px; } .cases { display: flex; gap: 4px; }
  .cel { position: relative; width: 38px; height: 54px; display: flex; align-items: center; justify-content: center; border-radius: 6px; background: #1B2D45; box-shadow: inset 0 -27px 0 #15263C; font: 600 32px/1 'IBM Plex Mono', ui-monospace, monospace; color: #FFD23F; } .charn { position: absolute; left: 0; right: 0; top: 26px; height: 2px; background: #0B1B2E; }
  .e-txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; } .decompte { font: 600 22px/1.2 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .e-sous { font-size: 12px; color: #C9D3DF; }
  .b3 { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border-radius: 16px; background: #fff; color: #121418; box-shadow: var(--ombre); }
  .b3-h { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; } .b3-t { font: 700 26px/28px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; white-space: nowrap; } .b3-d { font-size: 12px; font-weight: 600; color: #555C6B; white-space: nowrap; }
  .tiret { border-top: 2px dashed #E2E4E9; } .b3-v { display: flex; flex-direction: column; gap: 4px; } .b3-l { font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #555C6B; }
  .champ-v { display: flex; align-items: center; gap: 2px; min-height: 30px; padding: 0 10px; border-radius: 8px; border: 1px dashed var(--line-strong); font-size: 15px; font-weight: 600; color: var(--ink2); }
  .curseur { width: 2px; height: 18px; margin-left: 2px; background: var(--accent); } .curseur.vif { animation: nx-caret 1s steps(1) infinite; }
  .pastille { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 0 12px; border-radius: 999px; background: var(--signal-soft); color: var(--signal-ink); font-size: 13px; font-weight: 700; }
  /* Bas : points, boutons */
  .bas { flex: none; display: flex; flex-direction: column; gap: 6px; padding: 4px 20px calc(28px + env(safe-area-inset-bottom)); }
  .points { display: flex; justify-content: center; } .point { width: 44px; height: 44px; padding: 0; border: 0; background: transparent; display: flex; align-items: center; justify-content: center; cursor: pointer; }
  .point span { display: block; width: 8px; height: 8px; border-radius: 999px; background: var(--line-strong); transition: width 240ms ease, background-color 240ms ease; } .point span.on { width: 24px; background: var(--ink); }
  .actions { display: flex; gap: 10px; }
  .prec { flex: none; width: 52px; height: 52px; padding: 0; border-radius: 14px; background: var(--surface); border: 1px solid var(--line-strong); color: var(--ink); display: flex; align-items: center; justify-content: center; cursor: pointer; }
  .principal-b { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: center; gap: 8px; height: 52px; border-radius: 14px; background: var(--signal); color: #0B1B2E; font: 700 16px 'Barlow', sans-serif; border: 0; cursor: pointer; } .principal-b:hover { background: var(--signal-2); color: #0B1B2E; }
  .liens { display: flex; flex-wrap: wrap; justify-content: center; gap: 0 16px; } .lien { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 4px; font-size: 16px; font-weight: 600; }
  @keyframes nx-pass { 0%, 8% { transform: translateX(-80px) rotate(-7deg); } 46%, 54% { transform: translateX(0) translateY(-22px) rotate(0deg); } 92%, 100% { transform: translateX(80px) rotate(6deg); } }
  @keyframes nx-caret { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
  @media (max-width: 359px) { .cel { width: 30px; height: 46px; font-size: 26px; } .charn { top: 22px; } .cel { box-shadow: inset 0 -23px 0 #15263C; } .decompte { font-size: 18px; } .iata { font-size: 32px; } }
  @media (prefers-reduced-motion: reduce) { .passe.vif, .pt.bat, .pc-pt, .curseur.vif { animation: none; } .piste { scroll-behavior: auto; } .point span { transition: none; } }
  /* PC (≥ 900 px) : les trois promesses côte à côte, sans carrousel ni points. Planche WebPromesse. */
  .pc-contenu { display: none; }
  @media (min-width: 900px) {
    .racine { width: 100%; max-width: none; height: auto; min-height: 100dvh; overflow: visible; }
    .entete, .carrousel { display: none; }
    .principal { flex: 1; padding: 16px max(32px, calc((100% - 1120px) / 2)) 28px; }
    .pc-contenu { display: flex; flex-direction: column; gap: 18px; }
    .pc-haut { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
    .retour-pc, .passer-pc { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 12px; border: 0; border-radius: 12px; background: none; color: var(--accent); font: 700 15px/1 'Barlow', sans-serif; cursor: pointer; } .retour-pc { padding-left: 6px; margin-left: -6px; }
    .pc-h1 { font: 600 40px/40px 'Barlow Condensed', 'Arial Narrow', sans-serif; text-wrap: balance; }
    .pc-cartes { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 24px; }
    .pc-promesse { flex: 1 1 300px; min-width: 0; display: flex; flex-direction: column; gap: 20px; }
    .pc-visuel { box-sizing: border-box; min-height: 344px; padding: 18px 20px; border-radius: 24px; display: flex; flex-direction: column; gap: 14px; } .pc-visuel.clair { background: #E3EAF2; } .pc-visuel.sombre { background: #0B1B2E; color: #fff; }
    .pc-texte { display: flex; flex-direction: column; gap: 8px; } .pc-texte h2 { font: 600 34px/36px 'Barlow Condensed', 'Arial Narrow', sans-serif; text-wrap: balance; } .pc-texte .sur { color: #3E4F66; } .pc-texte .para { color: #3E4F66; }
    /* 1 */
    .pc-puce { position: static; align-self: flex-start; } .pc-vol { display: flex; flex-direction: column; gap: 10px; padding: 16px; border-radius: 18px; background: #fff; box-shadow: 0 1px 0 #D3DCE6, 0 12px 32px rgba(11, 27, 46, 0.10); }
    .pc-visuel .pointille { border-top-color: #7A8597; } .pc-visuel .date { color: #3E4F66; }
    .pc-offres { display: flex; flex-direction: column; gap: 8px; } .pc-visuel .offre { min-height: 48px; } .pc-visuel .etq { height: 24px; font-size: 12px; border: 1px solid #7A8597; } .pc-visuel .etq.bleu { border: 0; color: #124C9C; }
    .pc-fictifs { position: static; align-self: flex-end; color: #3E4F66; }
    /* 2 */
    .pc-puce-n { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: 999px; background: rgba(255, 255, 255, 0.12); color: #C9D3DF; font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
    .pc-billet { align-self: center; display: flex; border-radius: 12px; overflow: hidden; background: #fff; color: #0B1B2E; }
    .pc-b-corps { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; } .pc-b-trajet { font: 700 28px/28px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; white-space: nowrap; } .pc-b-date { font-size: 12px; font-weight: 600; color: #3E4F66; }
    .pc-b-etat { align-self: flex-start; display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 999px; background: rgba(26, 100, 200, 0.10); color: #124C9C; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
    .pc-b-talon { width: 28px; border-left: 2px dashed #B9C5D3; background: repeating-linear-gradient(0deg, #0B1B2E 0 2px, transparent 2px 5px) 8px 12px / 12px calc(100% - 24px) no-repeat; }
    .pc-rail { border-top: 2px dashed rgba(255, 255, 255, 0.18); margin: 6px 0; }
    .pc-passe { display: flex; align-items: flex-start; gap: 12px; } .pc-qui { flex: 1; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; } .pc-qui.d { align-items: flex-end; text-align: right; }
    .pc-q { display: flex; flex-direction: column; gap: 2px; } .pc-q.d { align-items: flex-end; } .pc-q .q2 { font-size: 15px; }
    .pc-rond { width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border-radius: 999px; } .pc-rond.bleu { background: #1A64C8; color: #fff; } .pc-rond.jaune { background: #FFD23F; color: #0B1B2E; }
    .pc-fleche { flex: none; display: flex; color: #C9D3DF; padding-top: 10px; }
    /* 3 */
    .pc-visuel.clair .echeance { gap: 10px; } .pc-visuel .e-sous { font-size: 13px; } .pc-champ { min-height: 32px; border-color: #7A8597; color: #3E4F66; }
    .pc-visuel .b3-d { font-size: 13px; color: #3E4F66; } .pc-visuel .b3-l { color: #3E4F66; } .pc-visuel .tiret { border-top-color: #B9C5D3; } .pc-visuel .pastille { min-height: 32px; background: rgba(255, 210, 63, 0.30); color: #5C4600; }
    .pc-pt { width: 6px; height: 6px; border-radius: 999px; background: #FFD23F; animation: nx-pulse 1.4s ease-in-out infinite; }
    .pc-hyp { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; line-height: 20px; color: #3E4F66; }
    .pastille-h { flex: none; display: inline-flex; align-items: center; height: 20px; padding: 0 6px; border-radius: 6px; background: rgba(255, 210, 63, 0.30); color: #5C4600; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; }
    .pc-visuel > *, .pc-visuel .b3-h { min-width: 0; } .pc-visuel .b3-h { flex-wrap: wrap; gap: 2px 8px; } .pc-visuel .b3-t, .pc-visuel .b3-d { white-space: normal; } .pc-visuel .pastille { white-space: normal; } .pc-visuel .e-corps { flex-wrap: wrap; }
    .pc-cta { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; margin-top: 8px; }
    .pc-creer { flex: none; min-width: 280px; height: auto; min-height: 56px; padding: 8px 22px; font-size: 17px; }
    .pc-explorer { min-height: 48px; font-size: 16px; font-weight: 700; color: var(--accent); }
  }
  @media (min-width: 900px) and (max-width: 1199px) {
    .pc-visuel { padding: 16px 14px; } .pc-visuel .iata { font-size: 32px; line-height: 32px; } .pc-visuel .offre { gap: 8px; padding: 0 10px; } .pc-visuel .offre.sel { padding: 0 9px; } .pc-visuel .prix { font-size: 15px; }
    .pc-visuel .cel { width: 34px; height: 48px; font-size: 28px; box-shadow: inset 0 -24px 0 #15263C; } .pc-visuel .charn { top: 23px; } .pc-visuel .decompte { font-size: 20px; }
    .pc-b-trajet { font-size: 24px; line-height: 24px; } .pc-q .q2 { font-size: 14px; }
  }
</style>
