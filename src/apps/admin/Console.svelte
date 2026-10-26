<script lang="ts">
  import type { Snippet } from 'svelte';
  import { aller } from '../../router.svelte.ts';
  import { deconnecter, compteCourant } from '../../domain/compte.ts';
  import Icone from '../../ui/Icone.svelte';
  import Logo from '../../ui/Logo.svelte';
  /** Cadre de la console d'administration (face nuit, pleine largeur, conçue pour le PC) : logo, étiquette « Administration », trois onglets, MFA et identifiant de l'administrateur, pied de page. Ne sert qu'aux écrans `/admin/*`. */
  export type OngletAdmin = 'droits' | 'drops' | 'audit';
  let { actif, titre, sous, badge, children }: { actif: OngletAdmin; titre: string; sous?: string; badge?: Snippet; children: Snippet } = $props();
  const moi = $derived(compteCourant());
  const ONGLETS: { id: OngletAdmin; label: string; href: string; icone: string }[] = [
    { id: 'droits', label: 'Droits de voyage', href: '/admin/droits', icone: 'avion' }, { id: 'drops', label: 'Drops et agences', href: '/admin/drops', icone: 'drops' }, { id: 'audit', label: 'Journal d’audit', href: '/admin/audit', icone: 'horloge' }
  ];
  const id = $derived(moi ? `adm-${moi.id.replace(/\D/g, '') || '01'}`.replace('adm-adm', 'adm') : 'adm-01');
</script>

<div class="nx console" data-face="nuit">
  <header class="haut">
    <div class="ligne"><a class="marque" href="/admin/droits" onclick={(e) => { e.preventDefault(); aller('/admin/droits'); }} aria-label="NexG-TT, administration"><Logo /></a><span class="etiquette">Administration</span>
      <nav aria-label="Administration">{#each ONGLETS as o (o.id)}<a href={o.href} class:on={actif === o.id} aria-current={actif === o.id ? 'page' : undefined} onclick={(e) => { e.preventDefault(); aller(o.href); }}><Icone nom={o.icone} taille={18} />{o.label}</a>{/each}</nav></div>
    <div class="ligne bas"><span class="puce ready"><Icone nom="verifie" taille={14} trait={2} />MFA vérifiée</span><span class="mono ident">{id}</span><span class="t-aide">(vous)</span>
      <button type="button" class="sortie" onclick={() => { deconnecter(); aller('/admin'); }}>Se déconnecter</button></div>
  </header>
  <main id="contenu" class="corps">
    <div class="titre"><div class="col g4"><h1 class="t-display">{titre}</h1>{#if sous}<p class="t-sec">{sous}</p>{/if}</div>{#if badge}<div>{@render badge()}</div>{/if}</div>
    {@render children()}
  </main>
  <footer class="pied"><span class="puce info">Mode démo</span><span class="t-aide">Comptes pseudonymisés (ACC-…, adm-…), agences et références inventées. Aucun nom, courriel ni identité de voyageur. Un droit de voyage est une inscription au registre interne de NexG-TT.</span></footer>
</div>

<style>
  .console { min-height: 100dvh; display: flex; flex-direction: column; }
  .haut { padding: 20px max(24px, calc((100% - 1440px) / 2)) 12px; display: flex; flex-direction: column; gap: 14px; border-bottom: 1px solid var(--line); }
  .ligne { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; } .bas { gap: 12px; }
  .etiquette { padding: 4px 10px; border-radius: 6px; background: var(--surface3); color: var(--ink); font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.14em; text-transform: uppercase; }
  nav { display: flex; gap: 6px; flex-wrap: wrap; }
  nav a { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 16px; border-radius: 12px; color: var(--ink2); font: 700 16px/1 'Barlow', sans-serif; border: 1px solid transparent; }
  nav a.on { color: var(--ink); border-color: var(--signal); background: var(--accent-soft); }
  .ident { color: var(--ink); } .sortie { margin-left: auto; min-height: 44px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--line-strong); background: transparent; color: var(--ink2); cursor: pointer; font: 600 14px/1 'Barlow', sans-serif; }
  .corps { flex: 1; padding: 28px max(24px, calc((100% - 1440px) / 2)) 40px; display: flex; flex-direction: column; gap: 20px; }
  .titre { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
  .pied { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 16px max(24px, calc((100% - 1440px) / 2)) 24px; border-top: 1px solid var(--line); }
</style>
