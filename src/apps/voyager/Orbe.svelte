<script lang="ts">
  import { onMount } from 'svelte';
  import { aller, retour } from '../../router.svelte.ts';
  import { analyser, libelleJour, VILLES } from '../../core/voix.ts';
  import { app, aujourdhui } from '../../data/store.svelte.ts';
  import { billetsDe, connecter, personneCourante } from '../../domain/actions.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { choisirJour, choisirTrajet, initRecherche } from './etat.ts';
  import { offresDuJour } from './offres.ts';
  import { moduleActif } from '../patron/modules.ts';

  /** L'orbe : toutes les actions d'AfriMove en grille, avec une recherche qui comprend aussi « douala demain », un code de colis ou un code de billet. */
  interface Action { label: string; href: string; icone: string; mots?: string; aq?: boolean }
  interface Groupe { titre: string; actions: Action[]; demo?: boolean }
  const P = {
    reseau: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM3.5 12h17M12 3.5c3 3 3 14 0 17M12 3.5c-3 3-3 14 0 17', entier: 'M3 20a9 9 0 0 1 18 0M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z', proche: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
    relais: 'M3 10l9-6 9 6v10H3zM9 20v-6h6v6', ussd: 'M9 2.5h6a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-13a3 3 0 0 1 3-3ZM10 18h4', signaler: 'M12 3l9.5 17h-19zM12 10v4M12 17.5v.5',
    reglages: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1',
    agent: 'M5.5 4h13a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM3.5 10h17M8 15h4', patron: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z', parcours: 'M4 6h16M4 12h10M4 18h7'
  };
  const GROUPES: Groupe[] = [
    { titre: 'Voyager', actions: [
      { label: 'Départs', href: '/', icone: 'bus', aq: true, mots: 'bus panorama voyager horaires' }, { label: 'Destination', href: '/destination', icone: 'pin', mots: 'ville gare ou aller' },
      { label: 'Date, heure', href: '/calendrier', icone: 'calendrier', mots: 'calendrier jour quand' }, { label: 'Mes billets', href: '/pass', icone: 'billet', mots: 'pass qr ticket' },
      { label: 'Mon bus', href: '/direct', icone: 'direct', mots: 'suivre en direct retard' }, { label: 'Réseau', href: '/reseau', icone: P.reseau, mots: 'carte lignes villes' },
      { label: 'Covoiturage', href: '/covoit', icone: 'groupe', mots: 'voiture conducteur' }, { label: 'Bus entier', href: '/groupe', icone: P.entier, mots: 'groupe privatiser' },
      { label: 'Un proche', href: '/proche', icone: P.proche, mots: 'payer pour maman famille offrir' }] },
    { titre: 'Colis', actions: [
      { label: 'Envoyer', href: '/colis/envoi', icone: 'colis', aq: true, mots: 'expédier paquet' }, { label: 'Suivre', href: '/colis/suivi', icone: 'recherche', mots: 'colis code suivi' },
      { label: 'Points relais', href: '/relais', icone: P.relais, mots: 'retrait dépôt' }] },
    { titre: 'Sans internet · aide', actions: [
      { label: '*123#', href: '/ussd', icone: P.ussd, mots: 'ussd téléphone sans internet' }, { label: 'Signaler', href: '/litige', icone: P.signaler, mots: 'litige problème réclamation' },
      { label: 'Réglages', href: '/reglages', icone: P.reglages, mots: 'langue notifications compte' }] }
  ];
  const DEMO: (Action & { qui?: string })[] = [
    { label: 'Agent de gare', href: '/guichet', icone: P.agent, qui: 'p-fatou' }, { label: 'Patron', href: '/patron', icone: P.patron, qui: 'p-luther' }, { label: 'Tous les parcours', href: '/parcours', icone: P.parcours }
  ];
  const SUGGESTIONS = ['douala demain', 'colis AM-C-9Q2', 'billet AM7F3K22', 'payer pour maman'];

  const R = initRecherche();
  let q = $state(''), champ: HTMLInputElement | undefined = $state();
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const code = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const terme = $derived(norm(q.trim()));
  /** Services que le patron peut désactiver (Modules) : leurs entrées disparaissent de l'orbe. */
  const MODULE_DE: Record<string, string> = { '/covoit': 'covoiturage', '/groupe': 'groupe', '/proche': 'groupe', '/colis/envoi': 'colis', '/colis/suivi': 'colis', '/relais': 'relais', '/ussd': 'ussd' };
  const permis = (a: Action) => !MODULE_DE[a.href] || moduleActif(MODULE_DE[a.href]);
  const groupes = $derived(GROUPES.map((g) => ({ ...g, actions: g.actions.filter((a) => permis(a) && (!terme || norm(`${a.label} ${a.mots ?? ''}`).includes(terme))) })).filter((g) => g.actions.length));
  const demo = $derived(DEMO.filter((a) => !terme || norm(a.label).includes(terme)));
  const ref = aujourdhui();
  const comp = $derived(q.trim() ? analyser(q, ref, VILLES) : null);
  const moi = $derived(personneCourante());
  /** Résultats « intelligents » : trajet dit en clair, colis ou billet reconnu par son code. */
  const aTrouve = $derived(((): { titre: string; sous: string; agir: () => void }[] => {
    const res: { titre: string; sous: string; agir: () => void }[] = [];
    if (comp?.destination) {
      const de = comp.origine ?? (comp.destination === R.de ? R.vers : R.de), jour = comp.jour ?? R.jour, n = offresDuJour(jour, de, comp.destination).length;
      res.push({ titre: `${de} → ${comp.destination} · ${libelleJour(jour, ref).toLowerCase()}`, sous: n ? `${n} départ${n > 1 ? 's' : ''} à voir dans le panorama` : 'Aucun départ ce jour-là', agir: () => { choisirTrajet(R, de, comp.destination!); choisirJour(R, jour, comp.fenetre?.[0] ?? null); aller('/'); } });
    }
    const c = code(q.replace(/colis|billet|ticket/gi, ''));
    if (c.length >= 4) {
      for (const col of app.monde.colis.filter((x) => (x.expediteurId === moi?.id || x.destinataire.tel === moi?.tel) && code(x.code).includes(c))) res.push({ titre: `Colis ${col.code}`, sous: `${col.depart} → ${col.arrivee}`, agir: () => aller(`/colis/suivi?colis=${col.id}`) });
      for (const b of moi ? billetsDe(moi.id).filter((x) => code(x.code).includes(c)) : []) res.push({ titre: `Billet ${b.code}`, sous: `${b.passager.nom}${b.siege ? ` · place ${b.siege}` : ''}`, agir: () => aller(`/pass?billet=${b.id}`) });
    }
    return res;
  })());
  const rienTrouve = $derived(!!terme && !groupes.length && !demo.length && !aTrouve.length);

  const go = (e: MouseEvent, href: string) => { e.preventDefault(); aller(href); };
  function changerDePersonnage(a: Action & { qui?: string }, e: MouseEvent) { e.preventDefault(); if (a.qui) connecter(a.qui); aller(a.href); }
  onMount(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); champ?.focus(); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });
</script>

{#snippet entete()}
  <div class="halo" aria-hidden="true"></div>
  <header class="hd">
    <a class="ib" href="/" aria-label="Fermer" onclick={(e) => { e.preventDefault(); retour('/'); }}><Icone nom="fermer" /></a>
    <span class="ttl t18">Tout AfriMove</span>
    <span class="pl ac">orbe</span>
  </header>
{/snippet}

{#snippet pastille(d: string)}
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path {d} /></svg>
{/snippet}

<Mobile enteteLibre={entete}>
  <label class="inp on" for="orbe-q"><Icone nom="recherche" taille={20} trait={2} />
    <input id="orbe-q" class="champ grow" type="search" placeholder="Chercher une action, une ville, un billet…" autocomplete="off" bind:value={q} bind:this={champ} />
    <span class="pl" aria-hidden="true">⌘ K</span></label>
  {#if !q.trim()}
    <div class="chips" role="group" aria-label="Exemples de recherche">{#each SUGGESTIONS as s (s)}<button type="button" class="ch" onclick={() => { q = s; champ?.focus(); }}>{s}</button>{/each}</div>
  {/if}
  {#if aTrouve.length}
    <span class="lab">Résultats</span>
    <div class="gl col" style="gap: 0">
      {#each aTrouve as r (r.titre)}<button type="button" class="li res" onclick={r.agir}><span class="col grow"><span class="t14 b7">{r.titre}</span><span class="t12 mut">{r.sous}</span></span><Icone nom="suivant" taille={18} /></button>{/each}
    </div>
  {/if}
  {#each groupes as g (g.titre)}
    <span class="lab">{g.titre}</span>
    <div class="pal">
      {#each g.actions as a (a.href)}
        <a href={a.href} onclick={(e) => go(e, a.href)}><span class="bub" class:aq={a.aq}>{#if a.icone.length < 12}<Icone nom={a.icone} taille={20} />{:else}{@render pastille(a.icone)}{/if}</span>{a.label}</a>
      {/each}
    </div>
  {/each}
  {#if demo.length}
    <span class="lab">Changer de personnage (démo)</span>
    <div class="pal">
      {#each demo as a (a.href)}<a class="k" href={a.href} onclick={(e) => changerDePersonnage(a, e)}><span class="bub" style="color: #FF5BDE">{@render pastille(a.icone)}</span>{a.label}</a>{/each}
    </div>
  {/if}
  {#if rienTrouve}<div class="gl" role="status"><span class="t14 b7">Rien ne correspond à « {q} »</span><p class="t12 mut">Essaie « douala demain », un code de colis ou de billet, ou « colis ».</p></div>{/if}
</Mobile>

<style>
  .halo { position: absolute; left: 50%; top: 40px; width: min(420px, 100%); height: 420px; margin-left: calc(min(420px, 100%) / -2); border-radius: 50%; background: radial-gradient(circle, rgba(139, 124, 255, 0.35), transparent 60%); pointer-events: none; }
  .champ { background: transparent; border: 0; outline: 0; color: inherit; font: inherit; min-height: 44px; min-width: 0; }
  .champ::placeholder { color: #a1accb; }
  .pal { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .pal a { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; min-height: 84px; padding: 8px; border-radius: 18px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); text-decoration: none; color: #f2f4ff; font: 600 12px 'Sora Variable', 'Sora', sans-serif; text-align: center; overflow-wrap: anywhere; }
  .pal a .bub { width: 36px; height: 36px; border-radius: 12px; }
  .pal a.k { background: rgba(255, 91, 222, 0.1); border-color: rgba(255, 91, 222, 0.3); }
  .res { width: 100%; background: transparent; border: 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); text-align: left; cursor: pointer; font: inherit; color: inherit; }
  .ch { display: inline-flex; align-items: center; min-height: 44px; padding: 0 14px; border-radius: 14px; border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.06); color: #b7c0db; font: 600 14px 'Sora Variable', 'Sora', sans-serif; cursor: pointer; }
  :global(.bd) > * { flex: none; }
</style>
