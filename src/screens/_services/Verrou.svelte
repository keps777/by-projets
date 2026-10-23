<script lang="ts">
  import Icone from '../../ui/Icone.svelte';
  import { NOM_NIVEAU } from '../../core/services.ts';
  import { SEUILS_NIVEAU, type Niveau } from '../../core/credit.ts';
  import { aller } from '../../router.svelte.ts';
  import { app } from '../../data/store.svelte.ts';
  /** Bandeau « niveau insuffisant » : dit quel niveau ouvre la fonction et combien de points manquent. */
  let { requis, quoi }: { requis: Niveau | null; quoi: string } = $props();
  const manque = $derived(requis ? Math.max(0, SEUILS_NIVEAU[requis] - app.score.valeur) : 0);
</script>

<a class="v" href="/score" onclick={(e) => { e.preventDefault(); aller('/score'); }}>
  <span class="ico" aria-hidden="true"><Icone nom="verrou" taille={18} /></span>
  <span class="t">
    <b>{requis ? `${quoi} dès le niveau ${NOM_NIVEAU[requis]}` : `${quoi} : pas disponible`}</b>
    <small>{requis ? `Il vous manque ${manque} point${manque > 1 ? 's' : ''} sur votre AssureScore (${app.score.valeur} sur ${SEUILS_NIVEAU[requis]}).` : 'Au-delà du plafond de tous les niveaux.'}</small>
  </span>
  <Icone nom="suivant" taille={16} />
</a>

<style>
  .v { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 16px; background: rgba(255, 122, 47, 0.1); border: 1px solid rgba(255, 122, 47, 0.35); min-height: 56px; }
  .ico { width: 34px; height: 34px; border-radius: 12px; display: grid; place-items: center; background: rgba(255, 122, 47, 0.16); color: var(--alerte); flex: none; }
  .t { flex: 1; display: flex; flex-direction: column; gap: 2px; } b { font-size: 13.5px; } small { color: var(--muted); font-size: 12.5px; }
</style>
