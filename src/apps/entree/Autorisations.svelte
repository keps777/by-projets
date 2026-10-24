<script lang="ts">
  import { onMount } from 'svelte';
  import Mobile from '../../ui/Mobile.svelte';
  import { dockVoyageur } from '../../ui/dockVoyageur.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { preferences, PERMISSIONS, type ClePermission } from './etat.ts';
  import { demander, etatAffiche, FICHES, lireEtat, type ReponseDemande } from './permissions.ts';

  /** Cinq accès, chacun pour une raison précise. L'état vient du navigateur ; activer fait la vraie demande, couper arrête l'usage dans l'app. */
  const prefs = preferences();
  let sys = $state<Record<ClePermission, ReponseDemande>>({ camera: { etat: 'a_demander' }, position: { etat: 'a_demander' }, notifications: { etat: 'a_demander' }, contacts: { etat: 'a_demander' }, micro: { etat: 'a_demander' } });
  let occupe = $state<ClePermission | null>(null), charge = $state(false);
  onMount(async () => { for (const c of PERMISSIONS) sys[c] = { etat: await lireEtat(c) }; charge = true; });

  const actif = (c: ClePermission) => prefs.permissions[c] && sys[c].etat === 'accorde';
  const nb = $derived(PERMISSIONS.filter(actif).length);
  async function basculer(c: ClePermission) {
    if (occupe) return;
    if (actif(c)) { prefs.permissions[c] = false; montrer(`${FICHES.find((f) => f.cle === c)!.nom} coupée dans l’app`, 'wa'); return; }
    prefs.permissions[c] = true;
    if (sys[c].etat === 'accorde') return;
    occupe = c; const r = await demander(c); sys[c] = r; occupe = null;
    if (r.etat === 'refuse') montrer('Bloqué par le navigateur : autorise-le dans les réglages du site', 'er');
    else if (r.etat === 'indisponible') montrer(r.detail ?? 'Non disponible sur cet appareil', 'wa');
  }
</script>

<Mobile titre="Autorisations" retourVers="/reglages" dock={dockVoyageur('moi')}>
  {#snippet droite()}<span class="pl ac" aria-label="{nb} sur 5 autorisées">{nb} / 5</span>{/snippet}
  <p class="t13 mut" style="margin: 0">Chaque accès sert à une chose précise. Tu peux tout couper : l’app marche encore, avec moins de magie.</p>
  {#each FICHES as f (f.cle)}
    {@const e = etatAffiche(f, prefs.permissions[f.cle], sys[f.cle].etat, sys[f.cle].detail)}
    <div class="gl row g12" data-permission={f.cle}>
      <span class="bub" class:aq={actif(f.cle)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={f.icone} /></svg></span>
      <span class="col grow"><span class="t15 b7" id="p-{f.cle}">{f.nom}</span><span class="t12 mut">{f.pourquoi}</span><span class="t12 {e.ton}" aria-live="polite">{occupe === f.cle ? 'demande en cours…' : e.texte}</span></span>
      <button type="button" role="switch" class="sw" class:on={actif(f.cle)} aria-checked={actif(f.cle)} aria-labelledby="p-{f.cle}" disabled={!charge || occupe === f.cle} onclick={() => basculer(f.cle)}></button>
    </div>
  {/each}
  <div class="toast"><span class="bub aq"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /></svg></span><span class="t13 grow">Ton visage ne quitte jamais le téléphone. Aucune image n’est envoyée à AfriMove.</span></div>
</Mobile>

<style>
  .sw { position: relative; }
  .sw::before { content: ''; position: absolute; inset: -8px -4px; }
  .sw:disabled { opacity: 0.5; }
</style>
