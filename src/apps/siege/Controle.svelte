<script lang="ts">
  import { jourSemaineLong } from '../../core/dates.ts';
  import { fcfa } from '../../core/money.ts';
  import { sante } from '../../core/sante.ts';
  import { etapesRoute, LIMITE_VITESSE, prochaineEtape, vitesseA } from '../../core/telemetrie.ts';
  import { SEUIL_RETARD_MIN } from '../../core/analyses.ts';
  import { app, aujourdhui, maintenant } from '../../data/store.svelte.ts';
  import { avancerMonde } from '../../domain/simulation.ts';
  import { compagnieDe, heureLocale, ligneDe, personne, personneCourante, placesLibres } from '../../domain/actions.ts';
  import type { Depart } from '../../domain/types.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { chauffeurPrevenu, prevenirChauffeur } from './actions.ts';
  import Defile from './Defile.svelte';
  import { injecterDemo } from './demo.ts';
  import { chauffeurDe } from './donnees.ts';
  import { lireSiege } from './etat.ts';
  import Lien from './Lien.svelte';
  import Siege from './Siege.svelte';

  injecterDemo();
  const moi = personneCourante();
  let tick = $state(0), compagnie = $state<string>(moi?.compagnieId ?? 'BX'), selection = $state<string | null>(null), filtre = $state(0);
  $effect(() => { const t = setInterval(() => { avancerMonde(); tick++; }, 5000); return () => clearInterval(t); });

  const VILLES: Record<string, [number, number]> = { Yaoundé: [330, 160], Douala: [120, 230], Bafoussam: [250, 60], Bamenda: [80, 110], Kribi: [420, 260] };
  const maintenantMs = $derived.by(() => { void tick; return maintenant(); });
  const immat = (id: string) => app.monde.bus.find((b) => b.id === id)?.immat ?? id;
  const route = (d: Depart) => { const l = ligneDe(d); return `${l.de} → ${l.vers}`; };
  const buses = $derived(app.monde.departs.filter((d) => d.statut === 'parti' && (compagnie === 'toutes' || compagnieDe(d).id === compagnie)).map((d) => {
    const l = ligneDe(d), [x0, y0] = VILLES[l.de] ?? [380, 150], [x1, y1] = VILLES[l.vers] ?? [380, 150], v = vitesseA(d.id, d.avancement), ch = chauffeurDe(d.id, l.compagnieId, d.busId), etape = prochaineEtape(l.de, l.vers, d.avancement, l.dureeMin);
    const bord = d.capacite - placesLibres(d), alerte = v > LIMITE_VITESSE, retard = d.retardMin >= SEUIL_RETARD_MIN;
    return { d, l, immat: immat(d.busId), x: x0 + (x1 - x0) * d.avancement, y: y0 + (y1 - y0) * d.avancement, v, ch, etape, bord, alerte, retard, ton: alerte ? 'er' : retard ? 'wa' : '' };
  }));
  const choisi = $derived(buses.find((b) => b.d.id === selection) ?? buses.find((b) => b.alerte) ?? buses[0]);
  const alertes = $derived(buses.filter((b) => b.alerte)), enRetard = $derived(buses.filter((b) => b.retard && !b.alerte));
  const passagers = $derived(buses.reduce((s, b) => s + b.bord, 0));
  const nbGares = $derived(new Set(app.monde.lignes.filter((l) => compagnie === 'toutes' || l.compagnieId === compagnie).map((l) => l.gareDe)).size);
  const auj = $derived(aujourdhui());
  const heure = $derived(heureLocale(maintenantMs));

  const billetsHeure = $derived(app.monde.billets.filter((b) => b.creeLe >= maintenantMs - 3_600_000 && b.creeLe <= maintenantMs && (b.statut === 'valide' || b.statut === 'scanne')));
  const parMin = $derived(Math.round((billetsHeure.length / 60) * 100) / 100), partApp = $derived(billetsHeure.length ? Math.round((billetsHeure.filter((b) => b.canal === 'app').length / billetsHeure.length) * 100) : 0);
  const scans = $derived(app.monde.billets.filter((b) => b.statut === 'scanne' && (b.scanneLe ?? 0) >= new Date(`${auj}T00:00:00`).getTime()).length);
  const refus = $derived(app.monde.evenements.filter((e) => e.type.includes('refus') && e.ts >= new Date(`${auj}T00:00:00`).getTime()).length);
  const sa = $derived(sante({ minute: Math.floor(maintenantMs / 60_000), omRelancee: lireSiege().omRelancee, paiementsAttente: 0, horsLigneLocal: app.session.hors_ligne }));

  const TYPES: Record<string, { pl: string; plc: string; k: number }> = {
    alerte: { pl: 'alerte', plc: 'er', k: 1 }, retard: { pl: 'retard', plc: 'wa', k: 1 }, annulation: { pl: 'annulation', plc: 'wa', k: 1 }, vente: { pl: 'vente', plc: 'ok', k: 2 }, scan: { pl: 'scan', plc: 'ok', k: 2 }, caisse: { pl: 'caisse', plc: 'wa', k: 2 },
    acces: { pl: 'accès', plc: 'ok', k: 2 }, ouverture: { pl: 'gares', plc: 'ok', k: 2 }, colis: { pl: 'colis', plc: 'inf', k: 3 }, config: { pl: 'config', plc: 'inf', k: 2 }, rapprochement: { pl: 'compta', plc: 'inf', k: 2 }, cloture: { pl: 'compta', plc: 'inf', k: 2 }
  };
  const flux = $derived.by(() => {
    const vivants = alertes.map((b) => ({ id: `v-${b.d.id}`, ts: maintenantMs, type: 'alerte', texte: `Excès de vitesse · ${b.immat} · ${b.v} km/h`, acteurId: b.ch?.id, live: true }));
    return [...vivants, ...app.monde.evenements.map((e) => ({ ...e, live: false }))].map((e) => ({ ...e, ...(TYPES[e.type] ?? { pl: e.type, plc: '', k: 2 }) })).filter((e) => filtre === 0 || e.k === filtre).slice(0, 40);
  });
  const FILTRES = ['tout', 'alertes', 'gares', 'colis'];
  const pos = (b: (typeof buses)[number]) => `left: ${(b.x / 760) * 100}%; top: ${(b.y / 300) * 100}%`;
  function prevenir() {
    if (!choisi) return;
    if (prevenirChauffeur(choisi.d.id, choisi.ch?.id, choisi.v, moi?.id)) { tick++; montrer(`${choisi.ch!.prenom} est prévenu(e)`); } else montrer('Personne à prévenir pour ce bus', 'er');
  }
  const routes = $derived([...new Set(app.monde.lignes.filter((l) => compagnie === 'toutes' || l.compagnieId === compagnie).map((l) => [l.de, l.vers].sort().join('|')))].map((k) => k.split('|')));
</script>

<Siege actif="controle">
  <div class="top">
    <div class="col"><h1 class="ttl">Salle de contrôle</h1><span class="t13 mut" aria-live="polite">{jourSemaineLong(auj)} · {heure} · {nbGares} gares, {buses.length} bus en route, {fcfa(passagers)} passagers à bord</span></div>
    <div class="row g8 wrapf">
      <div class="seg2" role="group" aria-label="Compagnie"><button type="button" class:on={compagnie !== 'toutes'} aria-pressed={compagnie !== 'toutes'} onclick={() => (compagnie = moi?.compagnieId ?? 'BX')}>Bêta Express</button><button type="button" class:on={compagnie === 'toutes'} aria-pressed={compagnie === 'toutes'} onclick={() => (compagnie = 'toutes')}>Toutes</button></div>
      <span class="pl {sa.statut === 'ok' ? 'ok' : 'wa'}"><span class="dot"></span>{sa.statut === 'ok' ? 'plateforme ok' : 'plateforme dégradée'}</span><Lien href="/siege/controle/sante" class="b s sm">Santé du système</Lien>
    </div>
  </div>

  <div class="kpis">
    <div class="gl"><span class="lab">Bus en route</span><span class="ttl t24">{buses.length}</span><span class="t12 mut">{buses.length - alertes.length - enRetard.length} à l’heure · {enRetard.length} en retard · {alertes.length} alerte{alertes.length > 1 ? 's' : ''}</span></div>
    <div class="gl"><span class="lab">Ventes / min</span><span class="ttl t24">{parMin.toLocaleString('fr-FR')}</span><span class="t12 {billetsHeure.length ? 'okc' : 'mut'}">{billetsHeure.length ? `${billetsHeure.length} billet${billetsHeure.length > 1 ? 's' : ''} dans l’heure · app ${partApp} %` : 'aucune vente dans l’heure'}</span></div>
    <div class="gl"><span class="lab">Scans quai</span><span class="ttl t24">{fcfa(scans)}</span><span class="t12 mut">{refus} refus aujourd’hui</span></div>
    <div class="gl" style={alertes.length ? 'border-color: rgba(255,107,107,.5)' : ''}><span class="lab">Alerte</span><span class="ttl t24 {alertes.length ? 'erc' : 'okc'}">{alertes[0] ? alertes[0].immat : 'RAS'}</span><span class="t12 mut">{alertes[0] ? `${alertes[0].v} km/h · ${alertes[0].ch?.prenom ?? 'chauffeur à affecter'}${chauffeurPrevenu(alertes[0].d.id, maintenantMs) ? ' · prévenu' : ''}` : 'aucun excès de vitesse'}</span></div>
  </div>

  <div class="c21">
    <div class="gl" style="padding: 10px">
      <div class="map" role="group" aria-label="Carte des bus en route">
        <svg class="fond" viewBox="0 0 760 300" preserveAspectRatio="none" aria-hidden="true">
          {#each routes as [a, b] (a + b)}{@const [xa, ya] = VILLES[a] ?? [0, 0]}{@const [xb, yb] = VILLES[b] ?? [0, 0]}<path d="M{xa} {ya} L{xb} {yb}" stroke={a === 'Kribi' || b === 'Kribi' ? 'rgba(255,194,75,.35)' : 'rgba(61,224,255,.35)'} stroke-width="4" fill="none" stroke-linecap="round" stroke-dasharray={a === 'Kribi' || b === 'Kribi' ? '8 8' : undefined} vector-effect="non-scaling-stroke" />{/each}
        </svg>
        {#each Object.entries(VILLES) as [nom, [x, y]] (nom)}<span class="pt" aria-hidden="true" style="left: {(x / 760) * 100}%; top: {(y / 300) * 100}%"></span><span class="vil" style="left: {(x / 760) * 100}%; top: {(y / 300) * 100}%">{nom}</span>{/each}
        {#each buses as b (b.d.id)}<button type="button" class="bus {b.ton} {choisi?.d.id === b.d.id ? 'on' : ''}" style={pos(b)} aria-label="{b.immat} · {b.d.heure} {route(b.d)}{b.alerte ? ' · excès de vitesse' : b.retard ? ' · en retard' : ''}" aria-pressed={choisi?.d.id === b.d.id} onclick={() => (selection = b.d.id)}>
          <span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3.5" width="16" height="13.5" rx="3" /><path d="M4 11h16" /></svg></span></button>{/each}
        {#if buses.length === 0}<p class="vide">Aucun bus en route pour le moment. {#if compagnie !== 'toutes'}Essaie « Toutes ».{/if}</p>{/if}
      </div>
      {#if choisi}
        <div class="row sp wrapf" style="margin-top: 10px"><span class="col"><span class="t15 b7">{choisi.immat} · {choisi.d.heure} {route(choisi.d)}</span><span class="t13 mut">{choisi.ch?.prenom ?? 'chauffeur à affecter'} · {choisi.v} km/h · {choisi.etape ? `${choisi.etape.nom} dans ${choisi.etape.minutes} min` : 'arrivée imminente'} · {choisi.bord} à bord{choisi.retard ? ` · +${choisi.d.retardMin} min` : ''}</span></span>
          <div class="row g8 wrapf">{#if choisi.alerte}<button type="button" class="b d sm xs" disabled={chauffeurPrevenu(choisi.d.id, maintenantMs)} onclick={prevenir}>{chauffeurPrevenu(choisi.d.id, maintenantMs) ? 'Chauffeur prévenu' : 'Prévenir le chauffeur'}</button>{/if}
            <Lien href="/siege/analyses/bus?bus={choisi.d.busId}" class="b s sm">Fiche bus</Lien><Lien href="/chauffeur" class="b s sm">Écran chauffeur</Lien><Lien href="/direct?depart={choisi.d.id}" class="b s sm">Vue client</Lien></div></div>
      {/if}
      <details class="alt"><summary>Voir les bus en tableau</summary>
        <Defile label="Bus en route" ><table class="tbl"><caption class="sr">Bus en route</caption><thead><tr><th scope="col">Bus</th><th scope="col">Trajet</th><th scope="col" class="r">Avancement</th><th scope="col" class="r">Vitesse</th><th scope="col">Prochaine étape</th><th scope="col" class="r">À bord</th></tr></thead><tbody>
          {#each buses as b (b.d.id)}<tr><td>{b.immat}</td><td>{b.d.heure} {route(b.d)}</td><td class="r mono">{Math.round(b.d.avancement * 100)} %</td><td class="r mono {b.alerte ? 'erc' : ''}">{b.v} km/h</td><td>{b.etape?.nom ?? etapesRoute(b.l.de, b.l.vers).at(-1)?.nom}</td><td class="r">{b.bord}</td></tr>{:else}<tr><td colspan="6" class="vide-etat">Aucun bus en route.</td></tr>{/each}
        </tbody></table></Defile>
      </details>
    </div>
    <div class="gl">
      <div class="row sp wrapf"><span class="t15 b7">Flux en direct</span><div class="row g4" role="group" aria-label="Filtrer le flux">{#each FILTRES as n, i (n)}<button type="button" class="ch {filtre === i ? 'on' : ''}" style="min-height: 44px; font-size: 12px; padding: 0 10px" aria-pressed={filtre === i} onclick={() => (filtre = i)}>{n}</button>{/each}</div></div>
      <div class="feed" role="log" aria-live="polite" aria-label="Événements en direct" style="margin-top: 6px">
        {#each flux as e (e.id)}<div class="ev"><span class="pl {e.plc}">{e.pl}</span><span class="col grow"><span class="t13 b6">{e.texte}</span><span class="t12 mut">{personne(e.acteurId)?.prenom ?? 'système'}{e.live ? ' · en direct' : ''}</span></span><span class="mono t12 mut3">{heureLocale(e.ts)}</span></div>
        {:else}<p class="vide-etat">Rien à signaler. Vends un billet au guichet ou scanne-en un au quai : il apparaîtra ici.</p>{/each}
      </div>
    </div>
  </div>
</Siege>
