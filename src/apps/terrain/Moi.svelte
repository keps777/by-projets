<script lang="ts">
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { aller } from '../../router.svelte.ts';
  import { maintenant } from '../../data/store.svelte.ts';
  import { quand } from '../../core/dates.ts';
  import { ACCUEIL, NOM_ROLE } from '../../domain/acces.ts';
  import { gare, notificationsDe, personneCourante } from '../../domain/actions.ts';
  import { deconnecter, marquerLue, toutMarquerLu } from './actions.ts';
  import { initiales } from './commun.ts';
  import { dockAgent } from './dock.ts';

  const p = $derived(personneCourante());
  const notifs = $derived(p ? notificationsDe(p.id).slice(0, 12) : []);
  const nonLues = $derived(notifs.filter((n) => !n.lu).length);
  const tel = (t: string) => `+237 ${t[0]} ${t.slice(1, 3)} ${t.slice(3, 5)} ${t.slice(5, 7)} ${t.slice(7)}`;
  function sortir() { deconnecter(); aller('/connexion'); }
  function ouvrir(id: string, lien?: string) { marquerLue(id); if (lien) aller(lien); }
</script>

<Mobile titre="Moi" retourVers={p ? ACCUEIL[p.role] : '/entree'} dock={dockAgent(p?.role, 'moi')}>
  {#if p}
    <div class="gl ac row g12"><span class="av">{initiales(p)}</span>
      <span class="col grow"><span class="ttl t18">{p.prenom} {p.nom}</span><span class="t13 mut">{NOM_ROLE[p.role]}{p.gareId ? ` · gare ${gare(p.gareId)?.nom ?? p.gareId}` : ''}{p.zone ? ` · ${p.zone}` : ''}</span><span class="t12 mut3 mono">{tel(p.tel)}</span></span></div>
    {#if p.commission}<div class="gl row sp"><span class="t14">Commission</span><span class="ttl t18 okc">{p.commission} %</span></div>{/if}
    <div class="row sp"><span class="lab">Notifications{nonLues ? ` · ${nonLues} non lue${nonLues > 1 ? 's' : ''}` : ''}</span>{#if nonLues}<button type="button" class="t13 aq" style="background: none; border: 0; min-height: 44px; cursor: pointer" onclick={() => toutMarquerLu(p.id)}>Tout marquer lu</button>{/if}</div>
    <div class="gl col" style="gap: 0">
      {#each notifs as n (n.id)}
        <button type="button" class="li nt" onclick={() => ouvrir(n.id, n.lien)}>
          <span class="bub aq" style:opacity={n.lu ? 0.5 : 1}><Icone nom="cloche" taille={18} /></span>
          <span class="col grow"><span class="t14" class:b7={!n.lu}>{n.titre}</span><span class="t12 mut">{n.sous}</span><span class="t12 mut3">{quand(n.ts, maintenant())}</span></span>
          {#if !n.lu}<span class="dot aq" aria-label="non lue"></span>{/if}
        </button>
      {:else}<span class="t13 mut" style="padding: 12px 0">Aucune notification.</span>{/each}
    </div>
    <div class="col g8" style="margin-top: auto">
      <a class="b s" href="/entree" onclick={(e) => { e.preventDefault(); aller('/entree'); }}>Changer de personne (démo)</a>
      <button type="button" class="b d" onclick={sortir}>Se déconnecter</button>
    </div>
  {/if}
</Mobile>

<style>
  .nt { background: none; border: 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); width: 100%; text-align: left; color: inherit; font: inherit; cursor: pointer; }
  .nt:last-child { border-bottom: 0; }
</style>
