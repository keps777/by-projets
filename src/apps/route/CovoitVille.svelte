<script lang="ts">
  import { initiales, nomVehicule, placesRestantes, departOffreMs } from '../../core/covoit.ts';
  import { fmtF } from '../../core/tarif.ts';
  import { personne } from '../../domain/actions.ts';
  import Icone from '../../ui/Icone.svelte';
  import Mobile from '../../ui/Mobile.svelte';
  import { dockVoyageur } from '../../ui/dockVoyageur.ts';
  import { amorcerVille, offresVilleProches } from './actions.ts';
  import Relief from './Relief.svelte';
  import { horloge } from './temps.svelte.ts';
  import { nav } from './nav.ts';

  const h = horloge(15_000);
  amorcerVille(); // s'il n'y a plus de départ à venir, en crée (démo) : action appelée depuis le script, pas depuis un $derived
  const offres = $derived(offresVilleProches(h.ms));
  let choisie = $state<string | null>(null), az = $state(0);
  const sel = $derived(offres.find((o) => o.id === choisie) ?? offres[0]);
  const POS = [{ x: 120, y: 95 }, { x: 235, y: 110 }, { x: 280, y: 70 }, { x: 175, y: 70 }, { x: 70, y: 135 }];
  const dans = (o: (typeof offres)[number]) => Math.max(0, Math.round((departOffreMs(o) - h.ms) / 60_000));
  const note = (n?: number) => (n ? String(n).replace('.', ',') : '—');
  const nomDe = (o: (typeof offres)[number]) => personne(o.conducteurId)?.prenom ?? 'Conducteur';
</script>

<Mobile titre="Covoit en ville" sous="Bastos → Mvan · maintenant" retourVers="/covoit" dock={dockVoyageur('voyager')}>
  {#snippet droite()}<span class="pl ok"><span class="dot"></span>{offres.length} départ{offres.length > 1 ? 's' : ''}</span>{/snippet}
  {#snippet bas()}
    {#if sel}
      {@const libres = placesRestantes(sel)}
      <div class="sheet bas">
        <div class="row sp"><span class="col"><span class="lab">Avec {nomDe(sel)}</span><span class="ttl t20">{fmtF(sel.prix)} · {sel.heure}</span><span class="t13 mut">payé à l’arrivée · annulation gratuite</span></span></div>
        {#if libres > 0}<a class="b p" href="/paiement?covoit={sel.id}" use:nav>Réserver avec {nomDe(sel)}</a>{:else}<span class="b s" style="cursor: default; opacity: 0.6">Complet</span>{/if}
      </div>
    {/if}
  {/snippet}

  <div class="seg2" role="group" aria-label="Type de covoiturage">
    <a class="b g" href="/covoit" use:nav style="flex: 1; min-height: 44px; border-radius: 14px; font-size: 14px">Interurbain</a>
    <button type="button" class="on" aria-pressed="true">En ville</button>
  </div>

  <Relief label="Carte en relief : les conducteurs autour de toi. Glisse pour tourner." bind:az hauteur={215} echelle={1.05} incl={52}>
    {#each offres as o, i (o.id)}
      <button type="button" class="pin rl-pied" class:on={sel?.id === o.id} style="left: {POS[i % POS.length].x}px; top: {POS[i % POS.length].y}px" aria-label="{nomDe(o)}, {nomVehicule(o.vehicule)}, part dans {dans(o)} min" aria-pressed={sel?.id === o.id} onclick={() => (choisie = o.id)}><span class="orb">{personne(o.conducteurId)?.prenom[0]}</span></button>
    {/each}
    <span class="moi rl-pied" style="left: 180px; top: 165px" role="img" aria-label="Toi, pharmacie Bastos"><span class="orb pt"></span></span>
    <span class="pl moi-t rl-pied" style="left: 180px; top: 165px">toi · pharmacie Bastos</span>
  </Relief>

  {#each offres as o (o.id)}
    {@const c = personne(o.conducteurId)}
    {@const libres = placesRestantes(o)}
    <button type="button" class="rd" class:on={sel?.id === o.id} aria-pressed={sel?.id === o.id} onclick={() => (choisie = o.id)}>
      <span class="av" class:hot={c?.note === 4.8}>{initiales(c?.prenom ?? '?')}</span>
      <span class="col grow"><span class="t15 b7 ell">{c?.prenom} · {nomVehicule(o.vehicule)}</span><span class="t12 mut ell">part dans {dans(o)} min · {libres} place{libres > 1 ? 's' : ''} · ★ {note(c?.note)}</span></span>
      <span class="col" style="align-items: flex-end"><span class="t16 b7">{fmtF(o.prix)}</span><span class="t12 mut3">{o.heure}</span></span>
    </button>
  {:else}
    <div class="center">
      <div class="ill" aria-hidden="true"><Icone nom="taxi" taille={64} trait={1.6} /></div>
      <span class="ttl t20">Aucun départ pour l’instant</span><span class="t14 mut">Les conducteurs de ton quartier apparaissent ici dès qu’ils publient un trajet.</span>
    </div>
    <a class="b p" href="/covoit" use:nav>Voir le covoiturage interurbain</a>
  {/each}

</Mobile>

<style>
  .pin { padding: 10px; margin-top: 8px; background: transparent; border: 0; cursor: pointer; }
  .orb { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; font: 700 14px 'Sora Variable', 'Sora', sans-serif; color: #06080f; background: linear-gradient(135deg, #8b7cff, #3de0ff); box-shadow: 0 0 0 6px rgba(61, 224, 255, 0.15); }
  .pin.on .orb { background: #ff5bde; box-shadow: 0 0 0 8px rgba(255, 91, 222, 0.25); }
  .moi { padding: 12px; margin-top: 10px; }
  .orb.pt { width: 20px; height: 20px; background: #ff5bde; box-shadow: 0 0 0 8px rgba(255, 91, 222, 0.2); }
  .moi-t { margin-top: 34px; background: rgba(5, 7, 13, 0.85); }
  .bas { margin: 0 0 96px; border-radius: 28px 28px 0 0; padding-bottom: 12px; }
  .rd { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 18px; border: 1px solid rgba(255, 255, 255, 0.12); background: rgba(255, 255, 255, 0.06); color: #f2f4ff; cursor: pointer; font: inherit; text-align: left; width: 100%; min-height: 64px; }
  .rd.on { background: linear-gradient(135deg, rgba(139, 124, 255, 0.25), rgba(61, 224, 255, 0.15)); border-color: #8b7cff; }
  .t15 { font-size: 15px; }
</style>
