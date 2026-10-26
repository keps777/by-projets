<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import { dollars } from './montants.ts';
  import { echeanceDe, peutEchanger, plafond } from '../../core/regles.ts';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { aujourdhui } from '../../data/horloge.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { compagnieDe } from '../../domain/marche.ts';
  import { routeur } from '../../router.svelte.ts';
  import { alerteActive, basculerAlerte, trouverOffre } from './actions.ts';
  import { chaineDe } from './chaine.ts';
  import Courbe from './Courbe.svelte';
  import { fmtDuree, fmtEscales, fmtInstant, fmtInstantCourt, fmtJourAnnee, fmtJourLong } from './dates.ts';
  import { lienAgence, va } from './nav.ts';
  import { departDuVol, fmtEcart } from './offres.ts';
  import Pictos from './Pictos.svelte';
  import { versUrl, rechercheVide } from './params.ts';
  import { largeur } from './largeur.svelte.ts';

  /** Détail d'une offre (revente, neuf, agence) : le billet, le prix et son écart signé, le graphique du prix équivalent, ce que le détenteur peut faire (droits), le vendeur et sa chaîne, les conditions, l'alerte de prix et l'achat. */
  let { offreId = '' }: { offreId?: string } = $props(); // vide l'espace d'un instant quand le routeur change d'écran
  const compte = $derived(compteCourant()), compteId = $derived(compte?.id);
  const res = $derived(trouverOffre(offreId, compteId));
  const etatForce = $derived(new URLSearchParams(routeur.recherche).get('etat'));
  const auj = $derived(aujourdhui());
  const o = $derived(res.ok ? res.offre : undefined), vol = $derived(res.ok ? res.vol : undefined);
  const ville = (code: string) => app.monde.aeroports.find((a) => a.code === code)?.ville ?? code;
  const depart = $derived(vol ? departDuVol(vol) : 0), echeance = $derived(vol ? echeanceDe(depart) : 0);
  const ouvert = $derived(vol ? peutEchanger(depart, maintenant()) : false);
  const titre = $derived(!res.ok ? 'Offre indisponible' : o!.type === 'revente' ? 'Offre de revente' : o!.type === 'agence' ? 'Offre d’agence' : 'Offre neuve');
  const chaine = $derived(res.ok ? chaineDe(o!.type as 'revente' | 'neuf' | 'agence', { droit: res.droit, agence: res.agence?.nom }) : null);
  const libellePrix = $derived(o?.type === 'revente' ? 'Prix demandé' : o?.type === 'agence' ? 'Prix de l’agence' : 'Prix neuf');
  const baisse = $derived((o?.ecartPct ?? 0) < 0), hausse = $derived((o?.ecartPct ?? 0) > 0);
  const alerteOn = $derived(res.ok ? alerteActive(compteId, res.vol, res.offre.prix) : false);
  let annonce = $state('');

  function alerte() {
    if (!res.ok) return;
    if (!compteId) { annonce = 'Connectez-vous pour créer une alerte de prix.'; setTimeout(() => (annonce = ''), 3500); return; }
    annonce = basculerAlerte(compteId, res.vol, res.offre.prix) ? '' : 'Alerte retirée.';
    if (annonce) setTimeout(() => (annonce = ''), 3500);
  }
  const urlTrajet = $derived(res.vol ? versUrl({ ...rechercheVide(res.vol.de), vers: res.vol.vers, jour: res.vol.jour }) : '/rechercher');
  const paiement = $derived(o ? `/paiement/${encodeURIComponent(o.id)}` : '#');
  const peutAcheter = $derived(!!res.ok && !res.laMienne && ouvert);
  const retourPc = $derived(vol ? urlTrajet : '/rechercher');
</script>

{#snippet pied()}
  {#if res.ok && !etatForce && o && vol}
    <div role="status" aria-live="polite" class="vivant">
      {#if alerteOn}<p class="statut"><Pictos nom="cloche" taille={18} trait={2} />Alerte créée : vous serez prévenu si le prix change.</p>
      {:else if annonce}<p class="statut"><Pictos nom="info" taille={18} trait={2} />{annonce}</p>{/if}
    </div>
    {#if res.laMienne}
      <p class="mienne" role="note"><Pictos nom="info" taille={18} />C’est votre annonce : gérez-la depuis votre portefeuille.</p>
    {:else if !ouvert}
      <p class="mienne err" role="alert"><Pictos nom="alerte" taille={18} />L’échéance de ce vol est passée : plus aucune transaction n’est possible.</p>
    {/if}
    <div class="achat">
      {#if res.laMienne || !ouvert}
        <button type="button" class="btn go" aria-disabled="true" onclick={(e) => e.preventDefault()}>Acheter · <span class="mono">{dollars(o.prix)}</span></button>
      {:else}
        <a class="btn go" href={paiement} onclick={(e) => va(e, paiement)}>Acheter · <span class="mono">{dollars(o.prix)}</span></a>
      {/if}
      <button type="button" class="cloche" class:on={alerteOn} aria-label="Créer une alerte" aria-pressed={alerteOn} onclick={alerte}><Pictos nom="cloche" taille={22} /></button>
    </div>
  {/if}
{/snippet}

<Ecran titre={largeur.pc ? undefined : titre} face="jour" large onglet={largeur.pc ? 'rechercher' : undefined} retour={vol ? undefined : '/rechercher'} pied={largeur.pc ? undefined : pied}>
  {#if largeur.pc}
    <a class="retour-res" href={retourPc} onclick={(e) => va(e, retourPc)}><Pictos nom="retour" taille={18} trait={2} />Résultats</a>
    <header class="tete-pc"><h1>{titre}</h1>{#if vol}<p class="sous-pc">Voyager · {vol.de} → {vol.vers} · {fmtJourAnnee(vol.jour)}</p>{/if}</header>
  {:else}<h1 class="sr">{titre}</h1>{/if}
  <div class="grille-pc"><div class="col-main">
  {#if etatForce === 'chargement'}
    <div class="squelette" aria-busy="true"><p class="sr" role="status">Chargement de l’offre…</p><span class="s1"></span><span class="s2"></span><span class="s2"></span></div>
  {:else if etatForce === 'erreur'}
    <section class="erreur-bloc"><p class="alerte" role="alert"><Pictos nom="alerte" taille={20} /><span><strong>L’offre n’a pas pu être chargée.</strong><br />Vérifiez votre connexion puis réessayez.</span></p>
      <a class="btn" href={`/offre/${encodeURIComponent(offreId ?? '')}`} onclick={(e) => va(e, `/offre/${encodeURIComponent(offreId ?? '')}`)}>Réessayer</a></section>
  {:else if !res.ok}
    <section class="erreur-bloc" aria-labelledby="indispo">
      <p class="alerte" role="alert"><Pictos nom="alerte" taille={20} /><span><strong id="indispo">{res.raison === 'vendue' ? 'Cette offre n’existe plus' : res.raison === 'drop' ? 'Ce drop n’est pas une offre ordinaire' : 'Offre introuvable'}</strong><br />{res.message}</span></p>
      {#if res.raison === 'drop'}
        <a class="btn" href={res.message.includes('Pass') ? '/pass' : '/drops'} onclick={(e) => va(e, res.message.includes('Pass') ? '/pass' : '/drops')}>{res.message.includes('Pass') ? 'Découvrir le Pass NexG' : 'Voir les drops'}</a>
      {:else if res.vol}
        <p class="t-sec">Il reste peut-être d’autres offres pour ce vol.</p>
        <a class="btn" href={urlTrajet} onclick={(e) => va(e, urlTrajet)}>Voir les offres de ce trajet</a>
      {/if}
      <a class="btn sec" href="/rechercher" onclick={(e) => va(e, '/rechercher')}>Rechercher un autre vol</a>
    </section>
  {:else if o && vol && chaine}
    <section class="ticket" aria-label="Billet {ville(vol.de)} {vol.de} vers {ville(vol.vers)} {vol.vers}">
      <div class="haut">
        <div class="ligne"><span class="sur">{compagnieDe(vol).nom} · Vol {vol.numero.split(' ').slice(1).join(' ')}</span><span class="puce">{vol.cabine}</span></div>
        <div class="route"><span class="gros">{vol.de}</span><span class="fil" aria-hidden="true"><i></i><Pictos nom="avion" taille={20} /><i></i></span><span class="gros">{vol.vers}</span></div>
        <div class="heures">
          <div class="col"><span class="h">{vol.heureDepart}</span><span class="v">{ville(vol.de)}</span></div>
          <span class="dur">{fmtDuree(vol.dureeMin)} · {vol.escales.length ? fmtEscales(vol.escales) : 'direct'}</span>
          <div class="col fin"><span class="h2"><span class="h">{vol.heureArrivee}</span>{#if vol.plusJours > 0}<span class="plus" aria-label="le lendemain">+{vol.plusJours}</span>{/if}</span><span class="v">{ville(vol.vers)}</span></div>
        </div>
        <div class="date"><Pictos nom="calendrier" taille={18} />{fmtJourLong(vol.jour)}</div>
      </div>
      <div class="perfo" aria-hidden="true"><span class="trait"></span><span class="rond g"></span><span class="rond d"></span></div>
      <div class="bas">
        <span class="sur">{libellePrix}</span>
        <div class="prixl"><span class="prix">{dollars(o.prix)}</span>
          {#if o.ecartPct !== 0}<span class="ecart" class:baisse class:hausse><Pictos nom={baisse ? 'baisse' : 'hausse'} taille={14} trait={2.25} />{fmtEcart(o.ecartPct)} vs neuf</span>{/if}</div>
        <div class="equiv"><span>Prix équivalent neuf aujourd’hui</span><span class="mono">{dollars(vol.prixNeuf)}</span></div>
      </div>
    </section>

    <a class="cours" href="/cours/{encodeURIComponent(vol.id)}" onclick={(e) => va(e, `/cours/${encodeURIComponent(vol!.id)}`)}>
      <span class="cours-i" aria-hidden="true"><Pictos nom="lune" taille={18} /></span>
      <span class="col g1"><span class="c1">Retourner le billet : voir son cours</span><span class="c2">Historique, offres et demandes</span></span><Pictos nom="suivant" taille={18} trait={2} />
    </a>

    <Courbe courbe={vol.courbe} prixDemande={o.type === 'neuf' ? undefined : o.prix} etiquetteDemande={libellePrix} aujourdhui={auj} />

    <section aria-labelledby="rights-title" class="bloc">
      <h2 id="rights-title" class="h2c">Vos droits avec ce billet</h2>
      <ul class="droits liste-plain">
        <li><span class="ic"><Pictos nom="etiquette" /></span><span class="col g2"><span class="d1">Revendre jusqu’à J-1</span><span class="d2">Mettez-le en vente jusqu’au {fmtInstant(echeance)}.</span></span></li>
        <li><span class="ic"><Pictos nom="transfert" /></span><span class="col g2"><span class="d1">Transférer à un proche</span><span class="d2">Donnez-le à un autre compte NexG-TT.</span></span></li>
        <li><span class="ic"><Pictos nom="sac" /></span><span class="col g6"><span class="d1">Bagages inclus revendables</span><span class="d2">Un bagage inclus non utilisé se revend aux passagers du même vol (même numéro, même date), sous réserve d’accord compagnie.</span><span class="puce">Hypothèse</span></span></li>
        <li><span class="ic jaune"><Pictos nom="identite" /></span><span class="col g2"><span class="d1">Nommer le voyageur avant le {fmtInstantCourt(echeance)}</span><span class="d2">Vous ou un proche. Le billet devient alors nominatif.</span></span></li>
        <li><span class="ic"><Pictos nom="bouclier" /></span><span class="col g6"><span class="d1">Plafond de revente</span><span class="d2">Le prix de revente est encadré pour éviter la spéculation. Sur ce vol : {dollars(plafond(vol.prixNeuf))} au plus, le prix équivalent neuf.</span><span class="puce">Règle à valider</span></span></li>
      </ul>
    </section>

    <div class="duo">
    <section aria-labelledby="seller-title" class="vendeur">
      <h2 id="seller-title" class="sur">Vendeur</h2>
      <div class="v-ent"><span class="v-i" aria-hidden="true"><Pictos nom={o.type === 'revente' ? 'bouclier-ok' : o.type === 'agence' ? 'agence' : 'avion'} taille={22} /></span>
        <span class="col g2"><span class="v-t">{chaine.titre}</span><span class="d2">{chaine.sous}</span></span></div>
      {#if o.type === 'agence' && res.agence}<a class="lien-agence" href={lienAgence(res.agence.id)} onclick={(e) => va(e, lienAgence(res.agence!.id))}>Voir la vitrine de {res.agence.nom}<Pictos nom="suivant" taille={18} trait={2} /></a>{/if}
      <div class="chaine"><span class="ligne-ch" aria-hidden="true"></span>
        <ol aria-label="Historique de détention" style="grid-template-columns: repeat({chaine.etapes.length}, minmax(0, 1fr))">
          {#each chaine.etapes as e, i (i)}<li class="e-{e.etat}"><span class="pt" aria-hidden="true"></span><span class="lb">{e.libelle}</span></li>{/each}
        </ol></div>
      <p class="d3">Chaque changement de détenteur est inscrit au registre interne de NexG-TT.</p>
    </section>

    <section aria-labelledby="cond-title" class="bloc">
      <h2 id="cond-title" class="h2c">Conditions</h2>
      <dl class="cond">
        <div><dt>Bagages</dt><dd>Selon le tarif de la compagnie <span class="puce">À confirmer</span></dd></div>
        <div><dt>Si la compagnie annule</dt><dd>Remboursement au détenteur <span class="puce">À valider</span></dd></div>
      </dl>
    </section>
    </div>
  {/if}
  </div>
  {#if largeur.pc && res.ok && !etatForce && o && vol}
    <aside class="achat-pc" aria-labelledby="achat-pc-t">
      <h2 id="achat-pc-t">Acheter ce billet</h2>
      <p class="intro-achat">{o.type === 'revente' ? 'Prix demandé par le détenteur, comparé au prix d’un billet neuf équivalent (indicatif).' : o.type === 'agence' ? 'Prix de l’agence, comparé au prix d’un billet neuf équivalent (indicatif).' : 'Prix neuf de référence, émis via NexG-TT (indicatif).'}</p>
      {#if res.laMienne}<p class="mienne" role="note"><Pictos nom="info" taille={18} />C’est votre annonce : gérez-la depuis votre portefeuille.</p>
      {:else if !ouvert}<p class="mienne err" role="alert"><Pictos nom="alerte" taille={18} />L’échéance de ce vol est passée : plus aucune transaction n’est possible.</p>{/if}
      {#if peutAcheter}<a class="btn go" href={paiement} onclick={(e) => va(e, paiement)}>Acheter · <span class="mono">{dollars(o.prix)}</span></a>
      {:else}<button type="button" class="btn go" aria-disabled="true" onclick={(e) => e.preventDefault()}>Acheter · <span class="mono">{dollars(o.prix)}</span></button>{/if}
      <button type="button" class="btn sec alerte-pc" class:on={alerteOn} aria-pressed={alerteOn} onclick={alerte}><Pictos nom="cloche" taille={18} trait={2} />{alerteOn ? 'Alerte activée' : 'Créer une alerte'}</button>
      <div role="status" aria-live="polite">{#if alerteOn}<p class="statut-pc"><Pictos nom="ok" taille={16} trait={2} />Alerte créée : vous serez prévenu si le prix change.</p>{:else if annonce}<p class="statut-pc"><Pictos nom="info" taille={16} trait={2} />{annonce}</p>{/if}</div>
      <ul class="rappels liste-plain">
        <li><Pictos nom="identite" taille={18} /><span>Nommer le voyageur avant le {fmtInstantCourt(echeance)}. À l’échéance, le détenteur est nommé voyageur par défaut.</span></li>
        <li><Pictos nom="etiquette" taille={18} /><span>Revente possible jusqu’à J-1 ; prix de revente encadré (règle à valider).</span></li>
        <li><Pictos nom="bouclier-ok" taille={18} /><span>{o.type === 'revente' ? 'Détenteur vérifié. ' : ''}Le changement de détenteur est inscrit au registre interne.</span></li>
      </ul>
    </aside>
  {/if}
  </div>

</Ecran>

<style>
  .col { display: flex; flex-direction: column; } .g1 { gap: 1px; min-width: 0; } .g2 { gap: 2px; min-width: 0; } .g6 { gap: 6px; min-width: 0; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); margin: 0; } .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .sur { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); margin: 0; }
  .ticket { position: relative; background: var(--surface); border-radius: 18px; box-shadow: var(--ombre); }
  .haut { padding: 16px 18px 14px; display: flex; flex-direction: column; gap: 12px; } .ligne { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .route { display: flex; align-items: center; gap: 10px; } .gros { font: 700 48px/48px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; }
  .fil { flex: 1; display: flex; align-items: center; gap: 6px; color: var(--accent); } .fil i { flex: 1; border-top: 2px dotted var(--line-strong); }
  .heures { display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; gap: 8px; } .h { font: 600 18px/22px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .v { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .fin { align-items: flex-end; } .h2 { display: flex; align-items: flex-start; gap: 2px; } .plus { font: 600 12px/14px 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink2); } .dur { font: 500 13px/18px 'Barlow', sans-serif; color: var(--ink2); text-align: center; }
  .date { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 12px; border-radius: 10px; background: var(--bg); font: 600 14px/20px 'Barlow', sans-serif; } .date :global(svg) { color: var(--ink2); }
  .perfo { position: relative; height: 22px; } .trait { position: absolute; left: 18px; right: 18px; top: 10px; border-top: 2px dashed var(--line); } .rond { position: absolute; top: 0; width: 22px; height: 22px; border-radius: 999px; background: var(--bg); } .rond.g { left: -11px; } .rond.d { right: -11px; }
  .bas { padding: 4px 18px 18px; display: flex; flex-direction: column; gap: 6px; } .prixl { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px 12px; }
  .prix { font: 600 40px/44px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .ecart { display: inline-flex; align-items: center; gap: 4px; height: 28px; padding: 0 10px; border-radius: 999px; background: var(--bg); font: 600 13px/1 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; white-space: nowrap; } .ecart.baisse { color: var(--down); } .ecart.hausse { color: var(--up); }
  .equiv { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 6px; padding-top: 10px; border-top: 1px solid var(--line); font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); } .equiv .mono { font-weight: 600; font-size: 16px; color: var(--ink); }
  .cours { display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 8px 14px; border-radius: 14px; background: var(--ink); color: #fff; } .cours > :global(svg) { flex: none; color: #c9d3df; }
  .cours-i { flex: none; width: 36px; height: 36px; border-radius: 10px; background: rgba(255, 255, 255, 0.1); color: var(--signal); display: grid; place-items: center; } .c1 { font: 600 15px/20px 'Barlow', sans-serif; } .c2 { font: 400 13px/18px 'Barlow', sans-serif; color: #c9d3df; } .cours .col { flex: 1; }
  .bloc { display: flex; flex-direction: column; gap: 10px; } .h2c { margin: 0; font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; }
  .droits { margin: 0; padding: 0 16px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); } .droits li { display: flex; align-items: flex-start; gap: 12px; padding: 14px 0; } .droits li + li { border-top: 1px solid var(--line); }
  .ic { flex: none; width: 40px; height: 40px; border-radius: 12px; background: var(--bg); color: var(--ink); display: grid; place-items: center; } .ic.jaune { background: var(--signal-soft); color: var(--signal-ink); }
  .d1 { font: 600 15px/20px 'Barlow', sans-serif; } .d2 { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); } .d3 { margin: 0; font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink3); } .puce { align-self: flex-start; }
  .vendeur { display: flex; flex-direction: column; gap: 14px; padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
  .v-ent { display: flex; align-items: center; gap: 12px; } .v-i { flex: none; width: 44px; height: 44px; border-radius: 999px; background: var(--ok-soft); color: var(--ok); display: grid; place-items: center; } .v-t { font: 600 16px/20px 'Barlow', sans-serif; }
  .lien-agence { display: flex; align-items: center; justify-content: space-between; min-height: 44px; padding: 0 14px; border-radius: 12px; background: var(--accent-soft); color: var(--accent); font: 600 14px/18px 'Barlow', sans-serif; }
  .chaine { position: relative; } .ligne-ch { position: absolute; left: 6%; right: 6%; top: 6px; border-top: 2px solid var(--line); }
  ol { list-style: none; margin: 0; padding: 0; position: relative; display: grid; } ol li { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; min-width: 0; }
  .pt { width: 14px; height: 14px; box-sizing: border-box; border-radius: 999px; background: var(--ink3); border: 3px solid var(--surface); } .lb { font: 600 12px/16px 'Barlow', sans-serif; color: var(--ink2); overflow-wrap: anywhere; }
  li.e-vendeur .pt { background: var(--ok); } li.e-vendeur .lb { color: var(--ink); } li.e-vous .pt { background: var(--surface); border: 2px dashed var(--ink); } li.e-vous .lb { color: var(--ink); font-weight: 700; } li.e-suite .pt { background: var(--line-strong); }
  .cond { margin: 0; padding: 0 16px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); } .cond > div { display: flex; flex-direction: column; gap: 4px; padding: 14px 0; } .cond > div + div { border-top: 1px solid var(--line); }
  dt { font: 600 13px/18px 'Barlow', sans-serif; color: var(--ink2); } dd { margin: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; font: 400 15px/20px 'Barlow', sans-serif; flex-wrap: wrap; }
  .statut { margin: 0; display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 14px; background: var(--ink); color: #fff; font: 500 14px/20px 'Barlow', sans-serif; box-shadow: 0 12px 32px rgba(11, 27, 46, 0.2); } .statut :global(svg) { color: var(--signal); }
  .mienne { margin: 0; display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border-radius: 12px; background: var(--surface2); color: var(--ink2); font: 500 13px/18px 'Barlow', sans-serif; } .mienne.err { background: var(--err-soft); color: var(--err); }
  .achat { display: flex; gap: 10px; } .go { flex: 1; gap: 8px; width: auto; } .cloche { flex: none; width: 52px; height: 52px; padding: 0; border-radius: 14px; background: var(--surface); border: 1px solid var(--line-strong); color: var(--ink); display: grid; place-items: center; cursor: pointer; } .cloche.on { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
  .erreur-bloc { display: flex; flex-direction: column; gap: 14px; padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); } .alerte { display: flex; gap: 10px; align-items: flex-start; padding: 12px; border-radius: 12px; background: var(--err-soft); color: var(--err); font: 500 14px/20px 'Barlow', sans-serif; } .alerte strong { font-weight: 700; }
  .squelette { display: flex; flex-direction: column; gap: 14px; } .s1, .s2 { display: block; border-radius: 20px; background: var(--surface2); animation: nx-pulse 1.4s ease-in-out infinite; } .s1 { height: 300px; } .s2 { height: 120px; }

  .col-main, .grille-pc, .duo { display: contents; } .retour-pc-x { display: none; }
  /* PC (≥ 900 px) : planche WebOffre. Billet horizontal (itinéraire à gauche, prix à droite), cours, courbe, droits, vendeur et conditions côte à côte ; panneau « Acheter ce billet » collant à droite. */
  @media (min-width: 900px) {
    .retour-res { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 12px 0 6px; margin-left: -6px; border-radius: 12px; color: var(--accent); font: 700 15px/1 'Barlow', sans-serif; }
    .tete-pc { display: flex; flex-direction: column; gap: 6px; margin-top: -6px; } .tete-pc h1 { margin: 0; font: 600 44px/44px 'Barlow Condensed', 'Arial Narrow', sans-serif; text-transform: uppercase; letter-spacing: 0.01em; } .sous-pc { margin: 0; font: 600 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
    .grille-pc { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 24px; } .col-main { display: flex; flex-direction: column; gap: 18px; flex: 999 1 560px; min-width: 0; }
    .duo { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 18px; } .duo > * { flex: 1 1 320px; min-width: 0; }
    .ticket { display: flex; align-items: stretch; } .haut { flex: 1 1 auto; min-width: 0; padding: 20px 24px; gap: 14px; } .gros { font-size: 72px; line-height: 72px; } .h { font-size: 20px; line-height: 24px; } .v { font-size: 14px; }
    .perfo { flex: none; width: 0; height: auto; margin: 22px 0; border-left: 2px dashed var(--line); } .trait { display: none; } .perfo .rond { left: -12px; right: auto; } .perfo .rond.g { top: -33px; } .perfo .rond.d { top: auto; bottom: -33px; }
    .bas { flex: 0 0 280px; padding: 20px 22px; justify-content: center; gap: 8px; } .prixl { flex-direction: column; align-items: flex-start; gap: 8px; } .ecart { background: var(--bg); }
    .achat-pc { position: sticky; top: 16px; flex: 1 1 320px; max-width: 420px; min-width: 0; display: flex; flex-direction: column; gap: 14px; padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
    .achat-pc h2 { margin: 0; font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; } .intro-achat { margin: 0; font: 400 14px/20px 'Barlow', sans-serif; color: var(--ink2); }
    .achat-pc .btn.go { min-height: 52px; } .alerte-pc { min-height: 48px; } .alerte-pc.on { background: var(--accent-soft); border-color: var(--accent); }
    .statut-pc { margin: 0; display: flex; align-items: center; gap: 8px; font: 400 13px/18px 'Barlow', sans-serif; }
    .rappels { display: flex; flex-direction: column; gap: 10px; padding: 12px 0 0; border-top: 1px solid var(--line); font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); } .rappels li { display: flex; gap: 8px; } .rappels :global(svg) { flex: none; margin-top: 0; color: var(--ink); }
    .droits { padding: 0 16px; }
    .vendeur { padding: 18px; }
  }
</style>
