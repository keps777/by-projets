<script lang="ts">
  import { app } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { deconnecter, personneCourante } from '../../domain/actions.ts';
  import { NOM_ROLE } from '../../domain/acces.ts';
  import { formaterTel } from '../../core/guichet.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import { dockAgent } from './dock.ts';
  import { ouvrirNotifications } from '../../ui/overlays.svelte.ts';
  import { basculerReseau } from './actions.ts';

  const moi = $derived(personneCourante());
  const gareNom = $derived(app.monde.gares.find((g) => g.id === moi?.gareId)?.nom);
  const compagnie = $derived(app.monde.compagnies.find((c) => c.id === moi?.compagnieId)?.nom);
  const enLigne = $derived(!app.session.hors_ligne);
  function sortir() { deconnecter(); aller('/entree'); }
  function reseau() { const r = basculerReseau(); montrer(r.ligne ? (r.synchronises ? `${r.synchronises} vente(s) synchronisée(s)` : 'En ligne') : 'Hors ligne : espèces seulement', r.ligne ? 'ok' : 'wa'); }
</script>

<Mobile titre="Moi" sous={moi ? NOM_ROLE[moi.role] : ''} retourVers="/guichet" dock={dockAgent('moi')}>
  {#if moi}
    <div class="gl row g12"><span class="av hot" aria-hidden="true">{moi.prenom[0]}{moi.nom[0]}</span><div class="col"><span class="ttl t18">{moi.prenom} {moi.nom}</span><span class="t13 mut">{NOM_ROLE[moi.role]}{gareNom ? ` · gare de ${gareNom}` : ''}{compagnie ? ` · ${compagnie}` : ''}</span><span class="t13 mono mut3">{formaterTel(moi.tel)}</span></div></div>
    <div class="gl row sp"><span class="col"><span class="t14 b7">Connexion</span><span class="t12 mut">{enLigne ? 'En ligne · ventes synchronisées' : 'Hors ligne · espèces seulement'}</span></span><button type="button" class="sw" class:on={enLigne} role="switch" aria-checked={enLigne} aria-label="En ligne" onclick={reseau}></button></div>
    <button type="button" class="b s" aria-haspopup="dialog" onclick={ouvrirNotifications}>Mes notifications</button>
    <button type="button" class="b s" onclick={sortir}>Me déconnecter</button>
  {/if}
</Mobile>
