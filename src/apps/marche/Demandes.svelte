<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { fmt } from '../../core/argent.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { demandesPour, filtrer, fondsTotal, texteCompat, trier, type FiltreDemandes, type TriDemandes } from './demandes.ts';
  import { naviguer } from './lien.ts';
  import { pluriel } from './format.ts';
  import Pic from './Pic.svelte';
  import Plaque from './Plaque.svelte';

  /** Tableau de la demande : les intentions d'achat d'autres voyageurs (fonds déjà réservés), vues par un vendeur. */
  const compte = $derived(compteCourant());
  const toutes = $derived(compte ? demandesPour(compte.id) : []);
  let filtre = $state<FiltreDemandes | undefined>(), tri = $state<TriDemandes>('expiration');
  const mes = $derived(filtrer(toutes, 'mes'));
  const actif = $derived<FiltreDemandes>(filtre ?? (mes.length ? 'mes' : 'tous'));
  const vues = $derived(trier(filtrer(toutes, actif), tri));
  const chips: { cle: FiltreDemandes; titre: string }[] = [{ cle: 'mes', titre: 'Mes vols' }, { cle: 'tous', titre: 'Tous' }, { cle: 'Caraïbes', titre: 'Caraïbes' }, { cle: 'Europe', titre: 'Europe' }];
  const libelle = $derived(`${pluriel(vues.length, 'intention')}${actif === 'mes' ? ' sur vos vols' : actif === 'Caraïbes' ? ' vers les Caraïbes' : actif === 'Europe' ? ' vers l’Europe' : ' au total'}`);
  const nbp = (n: number) => `${n} ${pluriel(n, 'voyageur')}`;
</script>

<Ecran titre="Intentions d’achat" face="nuit" retour="/portefeuille">
  {#snippet droite()}<a class="plus" href="/intention/nouvelle" aria-label="Publier ma propre intention d’achat" onclick={(e) => naviguer(e, '/intention/nouvelle')}><Icone nom="plus" /></a>{/snippet}

  <section class="resume carte" aria-label="Résumé des intentions">
    <p class="t-sur">Tableau de la demande · fonds déjà réservés</p>
    <div class="deux">
      <div><span class="n mono" data-testid="total">{toutes.length}</span><span class="t">{pluriel(toutes.length, 'intention active', 'intentions actives')}, dont <span class="mono clair">{mes.length}</span> sur vos vols</span></div>
      <div class="sep"><span class="n mono">{fmt(fondsTotal(toutes))}</span><span class="t">de fonds réservés au total</span></div>
    </div>
    <p class="note"><Icone nom="avion" taille={14} trait={2} />Vols au départ de Montréal (YUL). Acheteurs anonymisés : initiale seulement.</p>
  </section>

  <section class="filtres" aria-label="Filtres">
    <div role="group" aria-label="Filtrer les intentions" class="chips">{#each chips as c}
      <button type="button" aria-pressed={actif === c.cle} onclick={() => (filtre = c.cle)}>{#if c.cle === 'mes'}<Pic nom="portefeuille" taille={16} />{/if}{c.titre}</button>{/each}</div>
    <div class="ligne"><p role="status" class="compte"><span class="mono clair">{vues.length}</span> {libelle} · <span class="mono clair">{fmt(fondsTotal(vues))}</span> réservés</p>
      <div role="group" aria-label="Trier les intentions" class="tri"><button type="button" aria-pressed={tri === 'prix'} onclick={() => (tri = 'prix')}>Prix max</button><button type="button" aria-pressed={tri === 'expiration'} onclick={() => (tri = 'expiration')}>Expiration</button></div></div>
  </section>

  {#if !toutes.length}
    <section class="carte vide"><p class="t-section">Aucune intention d’achat pour l’instant</p><p class="t-sec">Quand un voyageur réserve des fonds pour un trajet, sa demande apparaît ici. Vous pouvez aussi publier la vôtre.</p><a class="btn" href="/intention/nouvelle" onclick={(e) => naviguer(e, '/intention/nouvelle')}>Dire mon prix</a></section>
  {:else if !vues.length}
    <section class="carte vide"><p class="t-section">Aucune intention pour ce filtre</p><p class="t-sec">{actif === 'mes' ? 'Aucune demande ne correspond à vos billets en vente pour l’instant.' : 'Essayez un autre filtre.'}</p><button type="button" class="btn sec" onclick={() => (filtre = 'tous')}>Voir toutes les intentions</button></section>
  {:else}
    <section class="tableau" aria-label="Tableau des intentions d’achat">
      <div class="tete" aria-hidden="true"><span>Dest.</span><span>Acheteur · fenêtre</span><span class="d">Prix max</span></div>
      <ul>{#each vues as d (d.intention.id)}
        {@const href = `/marche-intentions/proposer/${d.intention.id}`}
        <li class:compat={d.meme}>
          {#if d.meme}<a class="rang" {href} onclick={(e) => naviguer(e, href)} aria-label="Acheteur {d.initiale}, {d.ville}, prix maximum {fmt(d.max)} : proposer mon billet">{@render ligne(d)}</a>
          {:else}<div class="rang">{@render ligne(d)}</div>{/if}
        </li>{/each}</ul>
    </section>
  {/if}

  <section class="aide carte" aria-label="Comment ça marche"><span class="ic"><Icone nom="cadenas" taille={20} /></span><p><strong>Une intention = un acheteur qui a déjà réservé les fonds.</strong> Si vous acceptez son prix, la vente est immédiate. Vous pouvez aussi proposer plus cher : il accepte, refuse ou contre-propose.</p></section>
  <p class="t-aide mentions">Fonds réservés : non débités tant qu’aucun accord, libérés à l’expiration de l’intention. Un droit de voyage n’est pas un placement financier. Démo.</p>
</Ecran>

{#snippet ligne(d: import('./demandes.ts').Demande)}
  <span class="grille">
    <span class="dest"><span class="de">De {d.intention.de}</span><Plaque code={d.intention.vers} taille="s" /></span>
    <span class="qui"><span class="t">Acheteur {d.initiale}</span><span class="mono fen">{d.intention.de} → {d.intention.vers} · {d.fenetre}</span><span class="meta">{d.ville} · {nbp(d.detail.voyageurs)} · {d.detail.aller === 'retour' ? 'aller-retour' : 'aller simple'}</span></span>
    <span class="px"><span class="mono max">{fmt(d.max)}</span><span class="exp" class:bientot={d.joursRestants <= 7}><Icone nom="horloge" taille={12} trait={2.25} />expire dans {d.joursRestants} j</span></span>
  </span>
  <span class="puces"><span class="puce ready"><Icone nom="ok" taille={13} trait={2.5} />Fonds réservés</span>
    {#if texteCompat(d)}<span class="marque" class:ok={d.meme}><Pic nom="etiquette" taille={13} />{texteCompat(d)}</span>{/if}</span>
{/snippet}

<style>
  .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .clair { color: var(--ink); } .t-section { text-transform: uppercase; letter-spacing: 0.04em; }
  .plus { width: 44px; height: 44px; border-radius: 999px; display: grid; place-items: center; background: var(--surface); border: 1px solid var(--line); color: var(--accent); }
  .resume { display: flex; flex-direction: column; gap: 10px; padding: 16px 18px; } .t-sur { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); }
  .deux { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .deux > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; } .sep { padding-left: 12px; border-left: 1px solid var(--line); }
  .n { font-weight: 600; font-size: clamp(26px, 8.7vw, 34px); line-height: 36px; white-space: nowrap; } .t { font-size: 13px; line-height: 17px; color: var(--ink2); }
  .note { display: flex; align-items: center; gap: 8px; font-size: 12px; line-height: 17px; color: var(--ink3); }
  .filtres { display: flex; flex-direction: column; gap: 10px; } .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chips button { flex: none; display: inline-flex; align-items: center; gap: 6px; height: 44px; padding: 0 14px; border-radius: 999px; font: 700 13px 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; background: var(--surface); color: var(--ink2); border: 1px solid var(--line); }
  .chips button[aria-pressed='true'] { background: var(--ink); color: var(--bg); border-color: var(--ink); }
  .ligne { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; } .compte { font-size: 13px; color: var(--ink2); }
  .tri { display: flex; gap: 2px; padding: 2px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line); } .tri button { min-height: 40px; padding: 0 10px; border: 0; border-radius: 10px; cursor: pointer; font: 700 13px 'Barlow', sans-serif; background: transparent; color: var(--ink2); } .tri button[aria-pressed='true'] { background: var(--ink); color: var(--bg); }
  .vide { display: flex; flex-direction: column; gap: 12px; padding: 20px; align-items: stretch; } .btn.sec { background: var(--surface2); border-color: var(--line-strong); color: var(--ink); }
  .tableau { border-radius: 16px; background: #060708; border: 1px solid var(--line); overflow: hidden; } .tete { display: grid; grid-template-columns: 72px 1fr auto; gap: 12px; padding: 10px 14px 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink3); } .tete .d { text-align: right; }
  ul { list-style: none; margin: 0; padding: 0; } li { border-top: 1px solid #1a1c21; } li.compat { background: rgba(255, 210, 63, 0.05); }
  .rang { display: flex; flex-direction: column; gap: 10px; min-height: 60px; padding: 12px 14px; color: var(--ink); text-decoration: none; } a.rang:hover { background: rgba(255, 210, 63, 0.08); }
  .grille { display: grid; grid-template-columns: 72px 1fr auto; gap: 12px; align-items: center; } .dest { display: flex; flex-direction: column; gap: 3px; } .de { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink3); }
  .qui { display: flex; flex-direction: column; gap: 2px; min-width: 0; } .qui .t { font-size: 15px; font-weight: 600; color: var(--ink); } .fen { font-size: 12px; line-height: 16px; color: var(--ink2); } .meta { font-size: 12px; line-height: 16px; color: var(--ink3); }
  .px { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; } .max { font-weight: 600; font-size: clamp(18px, 5.6vw, 22px); line-height: 24px; white-space: nowrap; } .exp { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 600; white-space: nowrap; color: var(--ink3); } .exp.bientot { color: var(--accent); }
  .puces { display: flex; flex-wrap: wrap; gap: 6px; } .marque { display: inline-flex; align-items: center; gap: 5px; min-height: 26px; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; line-height: 14px; background: var(--surface3); color: var(--ink2); } .marque.ok { background: var(--accent-soft); color: var(--accent); }
  .aide { display: flex; gap: 12px; padding: 14px 16px; border-radius: 16px; } .aide p { font-size: 14px; line-height: 20px; color: var(--ink2); } .aide strong { color: var(--ink); } .ic { width: 36px; height: 36px; flex: none; border-radius: 10px; background: var(--ok-soft); color: var(--ok); display: grid; place-items: center; }
  .mentions { font-size: 12px; line-height: 17px; }
</style>
