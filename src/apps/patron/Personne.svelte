<script lang="ts">
  import { jourCourt } from '../../core/dates.ts';
  import { activite, ageActivite, ETIQUETTE_ROLE, initiales, ROLES_DE_GARE } from '../../core/equipe.ts';
  import { jourDeTs } from '../../core/indicateurs.ts';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { param, aller } from '../../router.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Colonne from './Colonne.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { changerGare, reinitialiserPin, suspendrePersonne } from './actions.ts';
  import { dockPatron } from './dockPatron.ts';
  import { contexte, francs, gareNom, signe } from './lecture.ts';

  const now = maintenant();
  const ctx = $derived(contexte(now));
  const p = $derived(app.monde.personnes.find((x) => x.id === param('personne')));
  const a = $derived(p ? activite({ billets: app.monde.billets, caisses: app.monde.caisses, evenements: app.monde.evenements }, p.id, { jour: ctx.jour, now }) : null);
  const vend = $derived(!!p && ['guichet', 'convoyeur', 'vendeur'].includes(p.role));
  const gares = $derived(app.monde.gares.filter((g) => g.id !== p?.gareId));
  let action = $state<null | 'suspendre' | 'pin' | 'gare'>(null), nouvelleGare = $state(''), pinDemo = $state(''), message = $state('');
  const lier = (e: MouseEvent, vers: string) => { e.preventDefault(); aller(vers); };
  const tel = (t: string) => t.replace(/^(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1 $2 $3 $4 $5');
  function typeEvt(t: string, texte: string): [string, string] {
    if (t === 'caisse' && /écart [−+-]\d/.test(texte)) return ['écart', 'wa'];
    if (t === 'securite') return ['alerte', 'er']; if (t === 'rapport' || t === 'formation' || t === 'caisse') return ['ok', 'ok']; return ['info', 'inf'];
  }
  function confirmer() {
    if (!p) return;
    const r: { ok: boolean; message?: string; raison?: string; pin?: string } = action === 'suspendre' ? suspendrePersonne(p.id, p.actif) : action === 'pin' ? reinitialiserPin(p.id) : changerGare(p.id, nouvelleGare);
    if (r.ok) { montrer(r.message ?? 'Fait', 'ok'); if (action === 'pin' && r.pin) pinDemo = r.pin; message = ''; action = null; } else { message = r.raison ?? 'Action impossible'; montrer(message, 'er'); }
  }
  const demanderAction = (x: 'suspendre' | 'pin' | 'gare') => { action = x; message = ''; pinDemo = ''; nouvelleGare = gares[0]?.id ?? ''; };
</script>

<Mobile titre={p ? `${p.prenom} ${p.nom}` : 'Personne introuvable'} retourVers="/patron/equipe" dock={dockPatron('gares')}>
  {#snippet droite()}{#if p}<a class="pl ac lien" href="/siege/config/personne?personne={p.id}" onclick={(e) => lier(e, `/siege/config/personne?personne=${p!.id}`)}>modifier</a>{/if}{/snippet}
<Colonne>

  {#if !p || !a}
    <div class="center"><span class="ttl t20">Cette personne n’existe pas</span><a class="b p" href="/patron/equipe" onclick={(e) => lier(e, '/patron/equipe')}>Mes gens</a></div>
  {:else}
    <div class="gl hero row g12">
      <span class="av" class:hot={p.role === 'guichet' || p.role === 'controleur'} aria-hidden="true">{initiales(p)}</span>
      <span class="col grow">
        <span class="t16 b7">{ETIQUETTE_ROLE[p.role][0].toUpperCase()}{ETIQUETTE_ROLE[p.role].slice(1)}{p.gareId ? ` · ${gareNom(p.gareId)}` : ''}</span>
        <span class="t13 mut">{tel(p.tel)}{p.vehicule ? ` · ${p.vehicule}` : ''}</span>
        <span class="row g8 wrapf" style="margin-top: 6px"><span class="pl {p.actif ? 'ok' : 'er'}">{p.actif ? 'actif' : 'suspendu'}</span><span class="pl">{p.pin ? 'PIN défini' : 'sans PIN'}</span>{#if p.visage}<span class="pl">visage</span>{/if}</span>
      </span>
    </div>
    <div class="trois">
      {#if vend}
        <div class="gl grow col g4"><span class="lab">Billets 30 j</span><span class="ttl t20">{a.billets30}</span><span class="t12 mut nowrap">{francs(a.recette30)}</span></div>
      {:else}
        <div class="gl grow col g4"><span class="lab">{p.role === 'quai' ? 'Scans 30 j' : 'Clôtures'}</span><span class="ttl t20">{p.role === 'quai' ? a.scans30 : a.clotures}</span><span class="t12 mut">{p.role === 'quai' ? 'billets scannés' : 'caisses suivies'}</span></div>
      {/if}
      <div class="gl grow col g4"><span class="lab">Écarts 90 j</span><span class="ttl t20">{a.ecarts90.length}</span><span class="t12 mut">{a.ecarts90.length ? a.ecarts90.slice(0, 3).map((c) => signe(c.ecart ?? 0)).join(' · ') : 'aucun'}</span></div>
      <div class="gl grow col g4"><span class="lab">Activité</span><span class="ttl t20">{a.derniere ? new Date(a.derniere.ts).toTimeString().slice(0, 5) : '—'}</span><span class="t12 mut">{ageActivite(a.derniere?.ts, now).replace(/ · .*/, '')}</span></div>
    </div>
    {#if vend && a.billets30 > 0}
      <div class="gl"><div class="row sp" style="margin-bottom: 8px"><span class="lab">30 derniers jours</span><span class="t12 mut">billets vendus</span></div><div class="spark" role="img" aria-label="Billets vendus par jour">{#each a.parJour as h, i (i)}<i class:hi={h === 100} style="height: {Math.max(3, h)}%"></i>{/each}</div></div>
    {/if}

    <span class="lab">Journal</span>
    <div class="gl col" style="gap: 0">
      {#each a.evenements as e (e.id)}
        {@const [nom, ton] = typeEvt(e.type, e.texte)}
        <div class="li"><span class="pl {ton}">{nom}</span><span class="col grow"><span class="t14 b7">{e.texte}</span><span class="t12 mut">{jourCourt(jourDeTs(e.ts))} · {new Date(e.ts).toTimeString().slice(0, 5)}</span></span></div>
      {:else}
        <span class="t13 mut" style="padding: 12px 0">Aucune activité enregistrée pour {p.prenom} pour l’instant.</span>
      {/each}
    </div>

    {#if pinDemo}<div class="gl ac col g4" role="status"><span class="t14 b7">PIN provisoire envoyé par SMS (simulé)</span><span class="t13 mut">Pour la démonstration : <span class="mono b7">{pinDemo}</span></span></div>{/if}

    {#if action}
      <div class="gl col g12" role="group" aria-label="Confirmation">
        {#if action === 'suspendre'}
          <span class="t14 b7">{p.actif ? `Suspendre ${p.prenom} ?` : `Réactiver ${p.prenom} ?`}</span>
          <span class="t13 mut">{p.actif ? 'Elle ou il ne pourra plus se connecter. Une caisse ouverte reste à clôturer par le superviseur.' : 'L’accès est rétabli avec le même PIN.'}</span>
        {:else if action === 'pin'}
          <span class="t14 b7">Nouveau PIN pour {p.prenom} ?</span><span class="t13 mut">Un PIN provisoire est envoyé par SMS. L’ancien ne marche plus.</span>
        {:else}
          <label class="fld"><span class="t14 b7">Changer {p.prenom} de gare</span>
            <select class="inp" bind:value={nouvelleGare}>{#each gares as g (g.id)}<option value={g.id}>{gareNom(g.id)}</option>{/each}</select></label>
        {/if}
        {#if message}<span class="t13 erc" role="alert">{message}</span>{/if}
        <div class="row g8"><button type="button" class="b s" onclick={() => (action = null)}>Annuler</button><button type="button" class="b {action === 'suspendre' && p.actif ? 'd' : 'p'}" onclick={confirmer}>Confirmer</button></div>
      </div>
    {:else}
      <div class="row g8 wrapf pied">
        {#if p.role !== 'patron'}<button type="button" class="b s grow" onclick={() => demanderAction('suspendre')}>{p.actif ? `Suspendre` : `Réactiver ${p.prenom}`}</button>{/if}
        {#if p.role !== 'patron'}<button type="button" class="b s grow" onclick={() => demanderAction('pin')}>Nouveau PIN</button>{/if}
        {#if ROLES_DE_GARE.includes(p.role)}<button type="button" class="b s grow" onclick={() => demanderAction('gare')}>Changer de gare</button>{/if}
      </div>
    {/if}
  {/if}
</Colonne>
</Mobile>

<style>
  .trois { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; } .trois .gl { padding: 12px; min-height: 96px; }
  .hero .av { width: 64px; height: 64px; font-size: 22px; }
  .lien { text-decoration: none; min-height: 44px; padding: 0 14px; } .nowrap { white-space: nowrap; }
  .pied { margin-top: auto; } .pied .b { min-width: 120px; }
  select.inp { appearance: auto; background: rgba(255, 255, 255, 0.08); } select.inp option { color: #06080f; }
  .spark { height: 56px; }
</style>
