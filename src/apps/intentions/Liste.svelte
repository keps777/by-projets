<script lang="ts">
  import { onMount } from 'svelte';
  import Ecran from '../../ui/Ecran.svelte';
  import { ecran } from '../achat/ecranPc.svelte.ts';
  import Picto from '../bagages/Picto.svelte';
  import { aller, param } from '../../router.svelte.ts';
  import { app, jourDe, maintenant } from '../../data/store.svelte.ts';
  import { fmt } from '../../core/argent.ts';
  import { echeanceDe } from '../../core/regles.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { compagnieDe, departDuVol, droitDe, volDe } from '../../domain/marche.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { actualiser, critereDe, retirerIntention } from './actions.ts';
  import { reperes, villeDe } from './compat.ts';
  import { accordDe, detailDe, lire, type MotifFin } from './modele.ts';
  import { ONGLETS, comptesOnglets, lignesPropositions, ouvertes, vueVendeurs, type Onglet } from './vues.ts';
  import { decaler, fenetre, instantJourMois, jourMois, joursRestants, pluriel } from './temps.ts';

  /** Mes intentions et propositions (planche m3-25) : Actives / Conclues / Expirées. */
  const compte = $derived(compteCourant());
  const onglets = $derived(compte ? comptesOnglets(compte.id) : { actives: [], conclues: [], expirees: [] });
  const depart = param('onglet');
  let actif = $state<Onglet>(ONGLETS.some((o) => o.id === depart) ? (depart as Onglet) : 'actives');
  let retrait = $state<string | null>(null), erreur = $state('');
  onMount(() => { if (compte) actualiser(compte.id); });

  const boutons: Record<string, HTMLButtonElement> = {};
  function clavier(e: KeyboardEvent) {
    const i = ONGLETS.findIndex((o) => o.id === actif); let n = i;
    if (e.key === 'ArrowRight') n = (i + 1) % ONGLETS.length; else if (e.key === 'ArrowLeft') n = (i + ONGLETS.length - 1) % ONGLETS.length; else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = ONGLETS.length - 1; else return;
    e.preventDefault(); actif = ONGLETS[n].id; boutons[actif]?.focus();
  }
  function retirer(id: string) {
    if (!compte) return; erreur = '';
    try { const libere = retirerIntention(compte.id, id); retrait = null; montrer(`Intention retirée · ${fmt(libere)} libérés`, 'ok'); }
    catch (e) { erreur = e instanceof Error ? e.message : 'Impossible de retirer cette intention.'; }
  }
  const accordHref = (id: string) => `/intentions/${id}/accord`;
  const go = (e: MouseEvent, h: string) => { e.preventDefault(); aller(h); };
  const phraseRetrait = (nb: number, montant: number) => `${nb > 0 ? `${nb > 1 ? `Les ${nb} propositions seront déclinées` : 'La proposition sera déclinée'} et les ` : 'Les '}${fmt(montant)} réservés seront libérés immédiatement. Rien n’est prélevé.`;
  const finLibelle = (m: MotifFin | undefined) => (m === 'expiree' ? 'Expirée' : 'Retirée');
</script>

{#snippet contenu(p: import('./vues.ts').LigneProposition)}
    <span class="p-prix"><span class="mono p1">{fmt(p.prix)}</span><span class="mono p2" class:vert-t={p.sens === 'egal'}>{p.delta}</span></span>
    <span class="p-corps"><span class="pt">{p.titre}</span><span class="t-sec">{p.sous}</span><span class="badge" class:vert={p.ton === 'vert'}>{p.badge}</span></span>
{/snippet}

{#snippet pied()}<a class="btn" href="/intention/nouvelle" onclick={(e) => go(e, '/intention/nouvelle')}><Picto nom="plus" taille={20} />Nouvelle intention</a>{/snippet}

<Ecran titre="Mes intentions" face="jour" retour="/" large pied={ecran.pc ? undefined : pied}>
<div class="pc-col">
  <h1 class="sr">Mes intentions</h1>
  <div class="onglets" role="tablist" aria-label="Intentions par état" tabindex="-1" onkeydown={clavier}>
    {#each ONGLETS as o (o.id)}
      <button type="button" role="tab" id="tab-{o.id}" aria-selected={actif === o.id} aria-controls="panel-{o.id}" tabindex={actif === o.id ? 0 : -1} bind:this={boutons[o.id]} onclick={() => (actif = o.id)}>{o.libelle} · {onglets[o.id].length}</button>
    {/each}
  </div>

  {#if actif === 'actives'}
    <div id="panel-actives" role="tabpanel" aria-labelledby="tab-actives" class="panneau">
      {#each onglets.actives as i (i.id)}
        {@const d = detailDe(i)}{@const rep = reperes(critereDe(d), i.budget, i.compteId)}{@const lignes = lignesPropositions(i)}{@const nb = ouvertes(i).length}{@const vv = vueVendeurs(i, compte)}
        <section class="billet" aria-label="Intention {i.id}, le billet que vous cherchez">
          <div class="b-haut">
            <div class="ent"><span class="sur">Le billet que vous cherchez</span><span class="mono ref">{i.id}</span></div>
            <div class="codes"><span class="code">{i.de}</span><span class="liaison" aria-hidden="true"><span class="pts"></span><Picto nom="avion" taille={20} trait={1.75} /><span class="pts"></span></span><span class="code">{i.vers}</span></div>
            <div class="villes"><span>{villeDe(i.de)}</span><span class="fenetre">{fenetre(d.du, d.au)} · {d.aller === 'simple' ? 'aller simple' : 'aller-retour'} · {pluriel(d.voyageurs, 'voyageur')}</span><span>{villeDe(i.vers)}</span></div>
          </div>
          <div class="perf" aria-hidden="true"><span class="tiret"></span><span class="e g"></span><span class="e d"></span></div>
          <div class="b-bas">
            <div class="max"><span class="col g2"><span class="sur">Prix maximum</span><span class="mono prix">{fmt(i.budget)}</span></span>
              <span class="pastille-n"><span class="pulse" aria-hidden="true"></span>{nb === 0 ? 'Aucune proposition' : pluriel(nb, 'proposition')}</span></div>
            <div class="chips">
              {#if i.fondsReserves > 0}<span class="chip vert"><Picto nom="ok" taille={14} trait={2.25} />Fonds réservés</span>{/if}
              <span class="chip"><Picto nom="horloge" taille={14} />Expire dans {joursRestants(d.expire, maintenant())}&nbsp;j</span>
              {#if d.auto}<span class="chip">Accord auto ≤ {fmt(i.budget)}</span>{/if}
            </div>
          </div>
        </section>

        <section class="col g10" aria-labelledby="props-{i.id}">
          <div class="ent bas"><h2 id="props-{i.id}" class="t-bloc">Propositions reçues</h2><span class="aide">{rep.vendeurs ? `${pluriel(rep.vendeurs, 'vendeur')} compatible${rep.vendeurs > 1 ? 's' : ''}` : 'Aucun vendeur compatible'}</span></div>
          {#if lignes.length}
            <div class="liste">
              {#each lignes as p, k (p.id)}
                {#if p.ouverte}
                  <a href="/intentions/{i.id}/proposition/{p.id}" class="ligne" class:sep={k > 0} aria-label={p.aria} onclick={(e) => go(e, `/intentions/${i.id}/proposition/${p.id}`)}>
                    {@render contenu(p)}<Picto nom="suivant" taille={20} trait={1.75} />
                  </a>
                {:else}
                  <div class="ligne expiree" class:sep={k > 0} role="group" aria-label={p.aria}>{@render contenu(p)}<span class="vide-ico" aria-hidden="true"></span></div>
                {/if}
              {/each}
            </div>
          {:else}
            <p class="vide-liste">Aucune proposition pour l’instant. Les vendeurs de ce trajet voient votre intention et peuvent vous répondre à tout moment.</p>
          {/if}
          <p class="aide">Les propositions au-dessus de votre prix sont facultatives&nbsp;: accepter, refuser ou contre-proposer, c’est vous qui décidez.</p>
        </section>

        <aside class="vendeurs" aria-label="Ce que voient les vendeurs"><span class="sur">Ce que voient les vendeurs</span>
          <div class="apercu"><span class="ini" aria-hidden="true">{vv.initiale}</span><span class="ap-t">{vv.trajet} · {vv.fenetre} · max <span class="mono fort">{vv.max}</span></span>{#if vv.fonds}<span class="mini-vert"><Picto nom="ok" taille={12} trait={2.25} />Fonds réservés</span>{/if}</div>
          <p class="t-sec">Votre initiale, votre trajet et votre prix max. Jamais votre nom complet ni le détail de votre carte.</p></aside>

        <button type="button" class="lien" aria-expanded={retrait === i.id} aria-controls="retrait-{i.id}" onclick={() => { retrait = retrait === i.id ? null : i.id; erreur = ''; }}>Retirer cette intention</button>
        {#if retrait === i.id}
          <div id="retrait-{i.id}" role="region" aria-label="Retirer l’intention" class="retrait">
            <p>{phraseRetrait(nb, i.fondsReserves)}</p>
            {#if erreur}<p class="err" role="alert"><Picto nom="alerte" taille={16} />{erreur}</p>{/if}
            <div class="duo"><button type="button" class="b-sec" onclick={() => (retrait = null)}>Garder</button><button type="button" class="b-danger" onclick={() => retirer(i.id)}>Retirer (démo)</button></div>
          </div>
        {/if}
      {:else}
        <div class="vide-etat"><span class="ticket-v" aria-hidden="true"><Picto nom="etiquette" taille={28} trait={1.5} /></span><h2 class="t-bloc">Aucune intention active</h2><p class="t-sec">Dites votre prix : les vendeurs d’un billet compatible viennent à vous. Vos fonds restent réservés, jamais débités sans accord.</p></div>
      {/each}
    </div>
  {:else if actif === 'conclues'}
    <div id="panel-conclues" role="tabpanel" aria-labelledby="tab-conclues" class="panneau">
      {#each onglets.conclues as i (i.id)}
        {@const a = accordDe(i)}{@const droit = a ? droitDe(a.droitId) : undefined}{@const v = droit ? volDe(droit.volId) : undefined}
        {#if a && droit && v}
          <div class="col g12">
            <a class="billet blanc" href={accordHref(i.id)} onclick={(e) => go(e, accordHref(i.id))} aria-label="Accord conclu {i.de} vers {i.vers} à {fmt(a.prix)}, voir l’accord">
              <div class="b-haut"><div class="ent"><span class="sur">{compagnieDe(v).nom} · accord du {instantJourMois(a.quand)} {new Date(a.quand).getFullYear()}</span><span class="mono ref">{i.id}</span></div>
                <div class="codes"><span class="code m">{i.de}</span><span class="liaison bleu" aria-hidden="true"><span class="pts"></span><Picto nom="avion" taille={20} trait={1.75} /><span class="pts"></span></span><span class="code m">{i.vers}</span></div>
                <div class="villes"><span>{villeDe(i.de)}</span><span class="fenetre">{jourMois(v.jour)} {v.jour.slice(0, 4)} · {v.escales.length ? pluriel(v.escales.length, 'escale') : 'direct'}</span><span>{villeDe(i.vers)}</span></div></div>
              <div class="perf" aria-hidden="true"><span class="tiret"></span><span class="e g"></span><span class="e d"></span></div>
              <div class="b-bas dispo"><span class="col g2"><span class="sur">Accord conclu à</span><span class="mono prix2">{fmt(a.prix)}</span><span class="t-sec">Prix max demandé&nbsp;: <span class="mono">{fmt(i.budget)}</span> · {a.prix > i.budget ? `${fmt(a.prix - i.budget)} de plus` : '0 $ de plus'}</span></span>
                <span class="chip gris">{droit.statut === 'nomme' ? 'Nommé' : droit.statut === 'en_vente' ? 'En vente' : droit.statut === 'detenu' ? 'Détenu' : 'Voyagé'}</span></div>
            </a>
            <p class="aide">Ce droit de voyage est dans votre portefeuille. {droit.statut === 'nomme' ? 'Voyageur nommé.' : `À nommer avant le ${jourMois(jourDe(echeanceDe(departDuVol(v))))} ${jourDe(echeanceDe(departDuVol(v))).slice(0, 4)}.`}</p>
          </div>
        {/if}
      {:else}
        <div class="vide-etat"><span class="ticket-v" aria-hidden="true"><Picto nom="ok" taille={28} trait={1.5} /></span><h2 class="t-bloc">Aucun accord pour l’instant</h2><p class="t-sec">Quand un vendeur accepte votre prix, le droit de voyage arrive dans votre portefeuille et l’accord apparaît ici.</p></div>
      {/each}
    </div>
  {:else}
    <div id="panel-expirees" role="tabpanel" aria-labelledby="tab-expirees" class="panneau">
      {#each onglets.expirees as i (i.id)}
        {@const d = detailDe(i)}
        <div class="vide-etat gauche"><div class="ent"><span class="sur">{finLibelle('expiree')} · {i.id}</span><span class="aide">{instantJourMois(d.expire)}</span></div>
          <p class="trj">{i.de} → {i.vers}</p><p class="t-sec">{fenetre(d.du, d.au)} · max <span class="mono">{fmt(i.budget)}</span> · aucun accord, fonds libérés.</p>
          <button type="button" class="btn sec" onclick={() => aller(`/intention/nouvelle?de=${i.de}&vers=${i.vers}&jour=${decaler(d.du, 3)}`)}>Republier</button></div>
      {:else}
        <div class="vide-etat" role="status"><span class="ticket-v pointille" aria-hidden="true"><Picto nom="horloge" taille={28} trait={1.75} /></span><h2 class="t-bloc">Aucune intention expirée</h2><p class="t-sec">Quand une intention arrive au bout de sa validité sans accord, les fonds sont libérés automatiquement et elle apparaît ici. Vous pourrez la republier en un geste.</p></div>
      {/each}
    </div>
  {/if}
{#if ecran.pc}{@render pied()}{/if}
</div>
  {#snippet droite()}<a class="rond-plus" href="/intention/nouvelle" aria-label="Nouvelle intention" onclick={(e) => go(e, '/intention/nouvelle')}><Picto nom="plus" taille={22} trait={1.75} /></a>{/snippet}
</Ecran>

<style>
  .onglets { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; padding: 4px; border-radius: 14px; background: #e3eaf2; margin-bottom: -4px; }
  .onglets button { height: 44px; border: 0; border-radius: 10px; background: transparent; color: #3e4f66; font: 600 clamp(13px, 3.9vw, 15px)/1 'Barlow', sans-serif; cursor: pointer; padding: 0 2px; white-space: nowrap; } .onglets button[aria-selected='true'] { background: #fff; color: #0b1b2e; box-shadow: 0 1px 2px rgba(11, 27, 46, 0.16); }
  .panneau { display: flex; flex-direction: column; gap: 20px; }
  .sur { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: #3e4f66; margin: 0; } .ref { font: 500 12px/16px 'IBM Plex Mono', ui-monospace, monospace; color: #5e6e84; }
  .billet { position: relative; display: block; border-radius: 18px; border: 2px dashed #5e6e84; background: rgba(255, 255, 255, 0.55); color: inherit; text-decoration: none; } .billet.blanc { background: #fff; border: 0; box-shadow: 0 1px 0 #d3dce6, 0 12px 32px rgba(11, 27, 46, 0.1); }
  .b-haut { padding: 14px 18px 12px; display: flex; flex-direction: column; gap: 10px; } .ent { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; } .ent.bas { align-items: baseline; }
  .codes { display: flex; align-items: center; gap: 10px; } .code { font: 700 clamp(38px, 12.3vw, 48px)/48px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; color: #0b1b2e; } .code.m { font-size: clamp(36px, 11.3vw, 44px); line-height: 44px; }
  .liaison { flex: 1; display: flex; align-items: center; gap: 6px; color: #5e6e84; } .liaison.bleu { color: #1a64c8; } .pts { flex: 1; border-top: 2px dotted #b9c5d3; }
  .villes { display: flex; align-items: center; justify-content: space-between; gap: 8px; font: 400 13px/18px 'Barlow', sans-serif; color: #3e4f66; } .fenetre { font-weight: 600; color: #0b1b2e; text-align: center; }
  .perf { position: relative; height: 22px; } .tiret { position: absolute; left: 18px; right: 18px; top: 10px; border-top: 2px dashed #b9c5d3; } .e { position: absolute; top: 0; width: 22px; height: 22px; box-sizing: border-box; border-radius: 999px; background: var(--bg); } .e.g { left: -12px; border-right: 2px dashed #5e6e84; } .e.d { right: -12px; border-left: 2px dashed #5e6e84; }
  .blanc .perf .tiret { border-color: #d3dce6; } .blanc .e { left: -11px; border: 0; } .blanc .e.d { left: auto; right: -11px; }
  .b-bas { padding: 2px 18px 16px; display: flex; flex-direction: column; gap: 10px; } .b-bas.dispo { flex-direction: row; align-items: center; justify-content: space-between; gap: 12px; }
  .max { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; } .prix { font: 600 32px/36px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .prix2 { font: 600 28px/32px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .pastille-n { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 999px; background: #0b1b2e; color: #fff; font: 700 13px/1 'Barlow', sans-serif; } .pulse { width: 8px; height: 8px; border-radius: 999px; background: #ffd23f; animation: nx-pulse 1.6s ease-in-out infinite; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; } .chip { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 999px; background: #e3eaf2; color: #3e4f66; font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; } .chip.vert { background: rgba(11, 122, 85, 0.1); color: #0b7a55; }
  .t-bloc { margin: 0; font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; } .aide { margin: 0; font: 400 13px/18px 'Barlow', sans-serif; color: #5e6e84; }
  .col.g2 { gap: 2px; } .col.g10 { gap: 10px; } .col.g12 { gap: 12px; }
  .liste { border-radius: 20px; background: #fff; border: 1px solid #d3dce6; overflow: hidden; }
  .ligne { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; min-height: 84px; padding: 12px 14px; color: #0b1b2e; text-decoration: none; } .ligne.sep { border-top: 1px solid #d3dce6; } .ligne.expiree { opacity: 0.6; grid-template-columns: auto 1fr; }
  .ligne:focus-visible { outline-offset: -3px; } .vide-ico { display: none; }
  .p-prix { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 84px; } .p1 { font: 600 22px/26px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .p2 { font: 600 12px/16px 'IBM Plex Mono', ui-monospace, monospace; color: #3e4f66; font-variant-numeric: tabular-nums; } .p2.vert-t { color: #0b7a55; }
  .p-corps { display: flex; flex-direction: column; gap: 4px; min-width: 0; } .pt { font: 600 15px/20px 'Barlow', sans-serif; } .badge { align-self: flex-start; display: inline-flex; align-items: center; min-height: 24px; padding: 3px 8px; box-sizing: border-box; border-radius: 999px; background: #e3eaf2; color: #3e4f66; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.04em; } .badge.vert { background: rgba(11, 122, 85, 0.1); color: #0b7a55; }
  .vide-liste { margin: 0; padding: 16px; border-radius: 16px; background: #fff; border: 1px solid #d3dce6; font: 400 14px/20px 'Barlow', sans-serif; color: #3e4f66; }
  .vendeurs { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border-radius: 16px; background: #fff; border: 1px solid #d3dce6; }
  .apercu { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px; background: #0b1b2e; color: #fff; } .ini { flex: none; width: 32px; height: 32px; border-radius: 999px; background: rgba(255, 255, 255, 0.12); display: grid; place-items: center; font: 700 14px/1 'Barlow', sans-serif; } .ap-t { flex: 1; min-width: 0; font: 400 13px/18px 'Barlow', sans-serif; } .fort { font-weight: 600; font-variant-numeric: tabular-nums; }
  .mini-vert { flex: none; display: inline-flex; align-items: center; gap: 4px; height: 22px; padding: 0 8px; border-radius: 999px; background: rgba(124, 227, 181, 0.18); color: #7ce3b5; font: 700 11px/1 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; }
  .lien { display: flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 8px; border: 0; background: transparent; color: #1a64c8; font: 600 15px/1 'Barlow', sans-serif; cursor: pointer; }
  .retrait { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border-radius: 16px; background: #fff; border: 1px solid #d3dce6; } .retrait p { margin: 0; font: 400 14px/20px 'Barlow', sans-serif; color: #3e4f66; }
  .duo { display: flex; gap: 8px; } .duo button { flex: 1; height: 44px; border-radius: 12px; background: #fff; font: 600 15px/1 'Barlow', sans-serif; cursor: pointer; } .b-sec { border: 1px solid #b9c5d3; color: #0b1b2e; } .b-danger { border: 1px solid #c2362f; color: #c2362f; }
  .err { display: flex; align-items: center; gap: 6px; font: 500 13px/18px 'Barlow', sans-serif; color: #c2362f !important; }
  .vide-etat { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 36px 24px; border-radius: 20px; background: #fff; border: 1px solid #d3dce6; text-align: center; } .vide-etat.gauche { align-items: stretch; text-align: left; padding: 18px; gap: 8px; } .vide-etat .btn { align-self: flex-start; width: auto; }
  .ticket-v { position: relative; width: 120px; height: 72px; border-radius: 12px; border: 2px dashed #b9c5d3; display: grid; place-items: center; color: #5e6e84; } .trj { margin: 0; font: 700 28px/30px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; }
  .chip.gris { background: #e3eaf2; } .rond-plus { width: 44px; height: 44px; box-sizing: border-box; border-radius: 999px; background: #fff; border: 1px solid #d3dce6; display: grid; place-items: center; color: #0b1b2e; text-decoration: none; }
  /* PC (≥ 900 px) : pas de planche ; colonne centrée de 640 px au plus (la barre d'action suit le contenu). */
  .pc-col { display: contents; }
  @media (min-width: 900px) { .pc-col { display: flex; flex-direction: column; gap: 20px; width: 100%; max-width: 640px; margin-inline: auto; } }
</style>
