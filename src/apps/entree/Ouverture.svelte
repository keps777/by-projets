<script lang="ts">
  import { onMount } from 'svelte';
  import Icone from '../../ui/Icone.svelte';
  import Palette from './Palette.svelte';
  import { compteCourant } from '../../domain/compte.ts';
  import { aller, param } from '../../router.svelte.ts';
  import { ALT_TABLEAU, DEPARTS, MARQUE, PAS_MS, PAS_TOTAL, cellule, poseLigne, poseMarque } from './panneau.ts';

  /** Lancement : le panneau qui tourne. Un compte déjà connecté saute l'ouverture. */
  const connecte = $derived(!!compteCourant());
  $effect(() => { if (connecte) aller('/', { remplacer: true }); });

  const chargement = $derived(param('etat') === 'chargement');
  let horsLigne = $state(typeof navigator !== 'undefined' && !navigator.onLine);
  const hors = $derived(horsLigne || param('etat') === 'horsligne');

  // Animation : un pas toutes les 55 ms jusqu'à ce que tout soit posé ; aucune animation sous « mouvement réduit ».
  const reduit = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let pas = $state(reduit ? PAS_TOTAL : 0);
  onMount(() => {
    const maj = () => (horsLigne = !navigator.onLine);
    addEventListener('online', maj); addEventListener('offline', maj);
    let t: ReturnType<typeof setInterval> | undefined;
    if (!reduit) t = setInterval(() => { pas += 1; if (pas >= PAS_TOTAL) { clearInterval(t); t = undefined; } }, PAS_MS);
    return () => { removeEventListener('online', maj); removeEventListener('offline', maj); if (t) clearInterval(t); };
  });
  const marque = $derived(MARQUE.split('').map((c, i) => cellule(c, i + 5, poseMarque(i), pas)));
  const lignes = $derived(DEPARTS.map((d, ri) => ({ ...d, cases: d.code.split('').map((c, j) => cellule(c, ri * 3 + j, poseLigne(ri, j), pas)) })));
  const va = (e: MouseEvent, vers: string) => { e.preventDefault(); aller(vers); };
</script>

{#if !connecte}
<div class="nx racine" data-face="nuit">
  <main id="contenu" class="principal">
    <div class="meta"><span class="gauche"><Icone nom="avion" taille={16} />Départs · Departures</span><span>YUL · 12 oct.</span></div>
    {#if chargement}<p class="sr" role="status">Chargement du tableau des départs…</p>{/if}
    {#if hors}
      <div class="hors" role="status" id="msg-hors-ligne"><Icone nom="hors_ligne" taille={20} /><span class="col g4"><strong>Hors ligne</strong><span>Vous pouvez parcourir cette présentation et choisir votre langue. Se connecter ou créer un compte demande le réseau : rien n’a été envoyé.</span></span></div>
    {/if}
    <section class="tableau" role="img" aria-label={ALT_TABLEAU}>
      <div class="ligne tete"><span>Heure</span><span>Dest.</span><span>Ville</span><span>Statut</span></div>
      <div class="marque">
        <div class="cases">{#each marque as c}<Palette ch={chargement ? '·' : c.ch} pose={!chargement && c.pose} grande />{/each}</div>
        <span class="legende">Next Generation Travel Ticket</span>
      </div>
      {#if chargement}
        {#each [0, 1, 2] as i (i)}<div class="ligne" aria-hidden="true"><span class="sq" style="width:44px;height:14px"></span><span class="sq" style="width:64px;height:26px"></span><span class="sq" style="width:70%;height:14px"></span><span class="sq" style="width:64px;height:12px"></span></div>{/each}
      {:else}
        {#each lignes as l}
          <div class="ligne"><span class="heure">{l.heure}</span><span class="cases p">{#each l.cases as c}<Palette ch={c.ch} pose={c.pose} />{/each}</span><span class="ville">{l.ville}</span>
            <span class="statut" style="color:var(--{l.teinte === 'ok' ? 'ok' : l.teinte === 'info' ? 'up' : 'signal'})"><span class="pt" class:bat={l.pulse}></span>{l.statut}</span></div>
        {/each}
      {/if}
    </section>
    <div class="titre">
      <h1>Un billet,<br /><span>deux faces.</span></h1>
      <p>Réservez votre vol. Revendez-le si vos plans changent. Nommez le voyageur avant le départ.</p>
    </div>
  </main>

  <section class="feuille nx" data-face="jour" aria-label="Commencer">
    <div class="billet" aria-hidden="true">
      <span class="face recto"><span class="sur"><Icone nom="soleil" taille={14} trait={2} />Recto</span><span class="gros">Voyager</span><span class="pet">Chercher, réserver, partir</span></span>
      <span class="face verso"><span class="sur"><Icone nom="lune" taille={14} trait={2} />Verso</span><span class="gros">Gérer</span><span class="pet">Revendre, transférer, nommer</span></span>
      <span class="perfo"></span><span class="enc haut"></span><span class="enc bas"></span>
    </div>
    <a class="commencer" href="/langue" onclick={(e) => va(e, '/langue')}>Commencer<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></a>
    <div class="liens">
      {#if hors}<span class="lien inactif" role="link" aria-disabled="true" tabindex="0" aria-describedby="msg-hors-ligne">J’ai déjà un compte</span>
      {:else}<a class="lien" href="/connexion" onclick={(e) => va(e, '/connexion')}>J’ai déjà un compte</a>{/if}
      <a class="lien" href="/explorer" onclick={(e) => va(e, '/explorer')}>Explorer sans compte</a>
    </div>
    <p class="demo">Prototype · données fictives · aucun paiement réel</p>
  </section>
</div>
{/if}

<style>
  .racine { width: min(100%, 520px); margin: 0 auto; min-height: 100dvh; display: flex; flex-direction: column; color: var(--ink); overflow-x: clip; }
  .principal { flex: 1; display: flex; flex-direction: column; gap: 16px; padding: max(52px, env(safe-area-inset-top)) 20px 20px; min-width: 0; }
  .meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 24px; font: 500 12px/1 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); }
  .gauche { display: inline-flex; align-items: center; gap: 8px; }
  .hors { display: flex; gap: 10px; padding: 12px 14px; border-radius: 14px; background: var(--surface2); border: 1px solid var(--line-strong); font-size: 14px; line-height: 20px; color: var(--ink2); } .hors strong { color: var(--ink); font-size: 15px; }
  .tableau { border-radius: 18px; background: #060708; border: 1px solid var(--line); overflow: hidden; }
  .ligne { display: grid; grid-template-columns: 52px 66px minmax(0, 1fr) auto; align-items: center; gap: 10px; min-height: 42px; padding: 0 14px; border-top: 1px solid #1A1C21; }
  .tete { min-height: 0; padding-top: 10px; padding-bottom: 6px; border-top: 0; font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink3); }
  .marque { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 12px 14px 14px; border-top: 1px solid #1A1C21; }
  .cases { display: flex; gap: 5px; max-width: 100%; justify-content: center; } .cases.p { gap: 3px; justify-content: flex-start; }
  .legende { font: 500 11px/1 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: 0.22em; text-transform: uppercase; color: var(--ink3); text-align: center; }
  .heure { font: 500 14px/1 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .ville { font-size: 14px; font-weight: 500; color: var(--ink2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .statut { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; white-space: nowrap; }
  .pt { width: 6px; height: 6px; border-radius: 999px; background: currentColor; } .bat { animation: nx-pulse 1.4s ease-in-out infinite; }
  .sq { display: block; border-radius: 10px; background: var(--surface3); animation: nx-pulse 1.4s ease-in-out infinite; }
  .titre { display: flex; flex-direction: column; gap: 10px; animation: nx-fade 520ms cubic-bezier(.2, .7, .2, 1) 1500ms both; }
  h1 { font: 600 46px/44px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.005em; } h1 span { color: var(--signal); }
  .titre p { font-size: 15px; line-height: 22px; color: var(--ink2); }
  .feuille { position: sticky; bottom: 0; display: flex; flex-direction: column; gap: 12px; padding: 20px 20px calc(26px + env(safe-area-inset-bottom)); border-radius: 28px 28px 0 0; color: var(--ink); animation: nx-rise 640ms cubic-bezier(.2, .8, .2, 1) 1700ms both; }
  .billet { position: relative; display: grid; grid-template-columns: 1fr 1fr; border-radius: 16px; overflow: hidden; box-shadow: var(--ombre); }
  .face { display: flex; flex-direction: column; gap: 2px; min-width: 0; } .recto { padding: 12px 14px 12px 16px; background: #fff; color: #0B1B2E; } .verso { padding: 12px 16px 12px 18px; background: #0B1B2E; color: #fff; }
  .sur { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; } .recto .sur, .recto .pet { color: #3E4F66; } .verso .sur, .verso .pet { color: #C9D3DF; }
  .gros { font: 600 24px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; } .pet { font-size: 12px; line-height: 16px; }
  .perfo { position: absolute; left: 50%; top: 10px; bottom: 10px; border-left: 2px dashed var(--line-strong); }
  .enc { position: absolute; left: calc(50% - 10px); width: 20px; height: 20px; border-radius: 999px; background: var(--bg); } .haut { top: -10px; } .bas { bottom: -10px; }
  .commencer { display: flex; align-items: center; justify-content: center; gap: 8px; height: 56px; border-radius: 14px; background: var(--signal); color: #0B1B2E; font-weight: 700; font-size: 17px; } .commencer:hover { background: var(--signal-2); color: #0B1B2E; }
  .liens { display: flex; flex-wrap: wrap; justify-content: center; gap: 0 16px; margin-top: -4px; }
  .lien { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 4px; font-size: 16px; font-weight: 600; cursor: pointer; } .inactif { color: var(--ink2); cursor: not-allowed; }
  .demo { margin-top: -4px; text-align: center; font-size: 12px; color: var(--ink3); }
  @keyframes nx-fade { 0% { opacity: 0; transform: translateY(12px); } 100% { opacity: 1; transform: translateY(0); } }
  @keyframes nx-rise { 0% { transform: translateY(100%); } 100% { transform: translateY(0); } }
  @media (prefers-reduced-motion: reduce) { .titre, .feuille, .bat, .sq { animation: none; } }
</style>
