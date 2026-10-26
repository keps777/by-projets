<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { app } from '../../data/store.svelte.ts';
  import { fmt, fmtPct } from '../../core/argent.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { compagnieDe, droitDe } from '../../domain/marche.ts';
  import { jourCourt } from '../voyager/format.ts';
  import { va } from '../voyager/lien.ts';
  import { tempsReel } from '../voyager/temps.svelte.ts';
  import BilletRV from './BilletRV.svelte';
  import Pic from './Pic.svelte';
  import { achatDe, bagagesVue, chaineDe, courbeValeur, jourAnnee, vueDroit } from './droit.ts';

  /** Mon droit de voyage (verso, nuit) : billet recto/verso, valeur indicative, actions selon l'état, bagages, détenteur et voyageur, chaîne de détention. */
  let { droitId = '' }: { droitId?: string } = $props();
  const temps = tempsReel(30_000), compte = $derived(compteCourant());
  const droit = $derived((() => { const d = droitDe(droitId); return d && compte && d.detenteurId === compte.id ? d : undefined; })());
  const vue = $derived(droit ? vueDroit(app.monde, droit, temps.maintenant) : undefined);
  const ville = (code: string) => app.monde.aeroports.find((a) => a.code === code)?.ville ?? code;
  const compagnie = $derived(vue ? compagnieDe(vue.vol).nom : '');
  const nom = $derived(compte ? `${compte.prenom} ${compte.nom ? `${compte.nom[0].toUpperCase()}.` : ''}`.trim() : '');
  const initiales = $derived(compte ? `${compte.prenom[0] ?? ''}${compte.nom[0] ?? ''}` : '');
  const courbe = $derived(vue ? courbeValeur(vue.droit, vue.vol) : null);
  const achat = $derived(vue ? achatDe(vue.droit) : undefined);
  const chaine = $derived(vue ? chaineDe(app.monde, vue.droit, temps.maintenant) : []);
  const bag = $derived(vue ? bagagesVue(app.monde, vue.droit) : undefined);
  const acheteurs = $derived(vue?.acheteurs);
  const sens = $derived(vue?.ecart.sens ?? 'stable');
  let volet = $state<'' | 'transfert' | 'rachat'>('');
  const basculer = (v: 'transfert' | 'rachat') => (volet = volet === v ? '' : v);
  const icone: Record<string, string> = { revendre: 'etiquette', nommer: 'identite', transferer: 'proche', liquidite: 'echange' };
  const idEnc = $derived(droit ? encodeURIComponent(droit.id) : '');
  const nomme = $derived(!!vue?.droit.voyageur);
  const jourDate = (ms: number) => jourAnnee(ms, temps.maintenant);
</script>

{#if !vue || !droit}
  <Ecran titre="Droit de voyage" face="nuit" retour="/portefeuille">
    <div class="erreur" role="alert">
      <span class="ico-err"><Icone nom="alerte" taille={26} /></span>
      <p class="t-section">Droit introuvable</p>
      <p class="t-sec">Ce droit de voyage n’existe pas ou n’est plus dans votre portefeuille : il a peut-être été revendu, transféré ou le lien est incomplet. Vos droits actifs vous attendent dans le portefeuille.</p>
      <a class="btn" href="/portefeuille" onclick={(e) => va(e, '/portefeuille')}>Voir mon portefeuille</a>
      <a class="btn sec" href="/rechercher" onclick={(e) => va(e, '/rechercher')}>Chercher un voyage</a>
    </div>
  </Ecran>
{:else}
  <Ecran titre="Droit de voyage" face="nuit" retour="/portefeuille" large>
    <div class="pc-duo etroit"><div class="pc-col colle">
    <BilletRV {vue} now={temps.maintenant} {compagnie} ville={ville(vue.vol.vers)} villeDepart={ville(vue.vol.de)} detenteur={nom} />

    <section class="valeur" aria-labelledby="val-h">
      <div class="entete"><h2 id="val-h" class="t-sur">Valeur indicative</h2><a class="cours" href="/cours/{vue.vol.id}" onclick={(e) => va(e, `/cours/${vue.vol.id}`)}>Voir le cours<Pic nom="chevron" taille={18} /></a></div>
      <div class="deux">
        <div class="col g2"><span class="lib">Payé le {achat ? jourDate(achat.quand) : ''}</span><span class="m22" data-testid="paye">{fmt(vue.droit.prixPaye)}</span><span class="pet">{achat?.titre}</span></div>
        <div class="col g2"><span class="lib">Prix équivalent aujourd’hui</span><span class="m22" data-testid="equivalent">{fmt(vue.vol.prixNeuf)}</span>
          <span class="ecart {sens}" data-testid="ecart"><Pic nom={sens === 'baisse' ? 'baisse' : sens === 'hausse' ? 'hausse' : 'stable'} taille={14} />{fmtPct(vue.ecart.pct)}</span></div>
      </div>
      {#if courbe}
        <div class="graph" aria-hidden="true">
          <svg viewBox="0 0 312 100" width="100%" preserveAspectRatio="none" style="display:block;height:auto;aspect-ratio:312/100">
            <polygon points={`${courbe.points} ${courbe.fin.x},90 10,90`} fill="rgba(98,199,255,0.10)" />
            <line x1="10" y1={courbe.debutY} x2="302" y2={courbe.debutY} stroke="var(--line-strong)" stroke-width="1.5" stroke-dasharray="4 4" />
            <polyline points={courbe.points} fill="none" stroke="var(--up)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
          </svg>
          <div class="axe"><span>{achat ? jourDate(achat.quand) : ''} · payé</span><span>{jourCourt(temps.maintenant)} · aujourd’hui</span></div>
        </div>
      {/if}
      <p class="note">Prix d’un billet neuf équivalent sur ce vol, relevé chaque mois depuis l’achat. Indicatif, non garanti.</p>
    </section>
    </div><div class="pc-col">

    {#if vue.actions.length}
      <section class="que-faire" aria-labelledby="act-h">
        <h2 id="act-h" class="t-section">Que faire de ce droit ?</h2>
        <div class="grille">
          {#each vue.actions as a (a.id)}
            {#if a.volet}
              <button type="button" class="tuile" class:ouvert={volet === 'transfert'} aria-expanded={volet === 'transfert'} aria-controls="volet-transfert" onclick={() => basculer('transfert')}>
                <span class="puce-i"><Pic nom="proche" taille={20} trait={1.75} /></span><span class="col g2"><span class="tt">{a.titre}</span><span class="ts">{a.sous}</span></span>
              </button>
            {:else}
              <a class="tuile" class:principale={a.principale} href={a.href} onclick={(e) => va(e, a.href)}>
                <span class="puce-i">{#if a.id === 'revendre'}<Pic nom="etiquette" taille={20} trait={1.75} />{:else if a.id === 'nommer'}<Pic nom="identite" taille={20} trait={1.75} />{:else}<Pic nom="echange" taille={20} trait={1.75} />{/if}</span>
                <span class="col g2"><span class="tt">{a.titre}</span><span class="ts">{a.sous}</span></span>
              </a>
            {/if}
          {/each}
        </div>
        {#if vue.retirerAnnonce}
          <p class="info-vente" role="status"><Icone nom="info" taille={16} trait={1.75} /><span>Votre annonce à {fmt(vue.retirerAnnonce.prix)} est visible dans la revente. Elle sera retirée automatiquement à l’échéance (J-1).</span></p>
        {/if}
        {#if acheteurs}
          <a class="rang vert" href="/marche-intentions" onclick={(e) => va(e, '/marche-intentions')}>
            <Pic nom="proche" taille={20} trait={1.75} />
            <span class="grow"><span class="col g2"><span><span class="mono">{acheteurs.n}</span> acheteur{acheteurs.n > 1 ? 's' : ''} cherche{acheteurs.n > 1 ? 'nt' : ''} ce vol · max <span class="mono">{fmt(acheteurs.max)}</span></span>
              {#if acheteurs.fonds}<span class="fonds"><Pic nom="cadenas" taille={13} trait={2} />Fonds réservés</span>{/if}</span></span>
            <Pic nom="chevron" taille={18} trait={1.75} />
          </a>
        {/if}
        <button type="button" class="rang" class:ouvert={volet === 'rachat'} aria-expanded={volet === 'rachat'} aria-controls="volet-rachat" onclick={() => basculer('rachat')}><Pic nom="rachat" taille={20} trait={1.75} /><span class="grow">Demander un rachat à NexG-TT</span><Pic nom={volet === 'rachat' ? 'bas' : 'chevron'} taille={18} trait={1.75} /></button>
        {#if volet === 'transfert'}
          <div id="volet-transfert" class="volet">
            <div class="v-ent"><h3>Transférer à un proche</h3><button type="button" class="fermer" aria-label="Fermer" onclick={() => (volet = '')}><Pic nom="croix" taille={20} trait={2} /></button></div>
            <p>Votre proche, titulaire d’un compte NexG-TT, devient détenteur de ce droit, sans vente. C’est lui qui nommera le voyageur avant le {vue.actions.find((x) => x.id === 'nommer')?.sous.replace('Avant le ', '')}. Votre statut passe à « cédé ».</p>
            <p class="t-aide">Frais de transfert : hypothèse à valider.</p>
            <a class="btn" href="/transferer/{idEnc}" onclick={(e) => va(e, `/transferer/${idEnc}`)}>Choisir le proche<Pic nom="fleche" taille={20} /></a>
          </div>
        {/if}
        {#if volet === 'rachat'}
          <div id="volet-rachat" class="volet">
            <div class="v-ent"><h3>Rachat par NexG-TT</h3><button type="button" class="fermer" aria-label="Fermer" onclick={() => (volet = '')}><Pic nom="croix" taille={20} trait={2} /></button></div>
            <p>NexG-TT vous propose un prix ferme, versé immédiatement, en échange de ce droit. Le montant n’est connu qu’à la demande et peut être inférieur au prix équivalent ({fmt(vue.vol.prixNeuf)}).</p>
            <p class="t-aide">Règles de rachat : hypothèse à valider.</p>
            <a class="btn sec" href="/liquidite/{idEnc}" onclick={(e) => va(e, `/liquidite/${idEnc}`)}>Comparer rachat et revente</a>
          </div>
        {/if}
      </section>
    {:else if vue.message}
      <section class="message {vue.message.ton}" role={vue.message.ton === 'err' ? 'alert' : 'status'} aria-labelledby="msg-h">
        <span class="m-ico">{#if vue.message.ton === 'err'}<Pic nom="cadenas" taille={22} />{:else if vue.message.ton === 'ok'}<Pic nom="coche" taille={22} />{:else}<Icone nom="info" taille={22} />{/if}</span>
        <div class="col g4"><h2 id="msg-h" class="m-t">{vue.message.titre}</h2><p class="t-sec">{vue.message.texte}</p>
          <span class="m-liens">{#each vue.message.liens as l (l.href)}<a href={l.href} onclick={(e) => va(e, l.href)}>{l.texte}<Pic nom="chevron" taille={16} /></a>{/each}</span></div>
      </section>
    {/if}

    {#if bag && vue.statut !== 'gele'}
      <section class="bagages" aria-labelledby="bag-h">
        <div class="entete"><h2 id="bag-h" class="t-section">Bagages</h2><span class="puce">Même vol uniquement</span></div>
        <div class="b-haut">
          <span class="etq" aria-hidden="true"><span class="etq-in"><span class="etq-code">{vue.vol.vers}</span><span class="etq-v">{vue.vol.numero}<br />{jourCourt(vue.departMs).toUpperCase()}</span><span class="etq-bar"></span></span></span>
          <div class="col g4 grow"><span class="b-gros">{bag.resume.inclus} × {bag.kg} kg inclus</span>
            <span class="b-sous">{bag.prevus} prévu{bag.prevus > 1 ? 's' : ''}{#if bag.enVente} · <b class="jaune">{bag.enVente} en vente</b>{/if}{#if bag.resume.revendus} · {bag.resume.revendus} revendu{bag.resume.revendus > 1 ? 's' : ''}{/if}</span>
            <span class="b-aide">En soute, {compagnie} {vue.vol.numero.split(' ')[1]} du {jourCourt(vue.departMs)}. Franchise du tarif : hypothèse démo.</span></div>
        </div>
        <div class="col g4">
          {#if bag.vendable}<a class="rang" href="/bagages/vendre?droit={idEnc}" onclick={(e) => va(e, `/bagages/vendre?droit=${idEnc}`)}><Icone nom="sac" taille={20} /><span class="grow">Revendre le bagage inutilisé</span><Pic nom="chevron" taille={18} trait={1.75} /></a>{/if}
          <a class="rang" href="/bagages?droit={idEnc}" onclick={(e) => va(e, `/bagages?droit=${idEnc}`)}><Pic nom="soute" taille={20} trait={1.75} /><span class="grow">Mes bagages de ce vol</span><Pic nom="chevron" taille={18} trait={1.75} /></a>
          <a class="lien-soute" href="/soute/{vue.vol.id}" onclick={(e) => va(e, `/soute/${vue.vol.id}`)}><span class="grow">Voir la soute du vol</span>{#if bag.dePrix !== undefined}<span class="mono petit">dès {fmt(bag.dePrix)}</span>{/if}<Pic nom="chevron" taille={18} trait={1.75} /></a>
        </div>
        <p class="note">Un bagage ne se revend qu’aux passagers de ce vol (même numéro, même date). Plafond : prix compagnie {fmt(vue.vol.prixBagageCompagnie)} (règle provisoire). Transfert confirmé par la compagnie, sous réserve d’un accord avec {compagnie} — hypothèse.</p>
      </section>
    {/if}

    <section class="dv" aria-labelledby="dv-h">
      <h2 id="dv-h" class="t-section">Détenteur et voyageur</h2>
      <div class="paire">
        <div class="boite"><span class="sur-p">Détenteur</span><span class="perso"><span class="avatar" aria-hidden="true">{initiales}</span><span class="pn">{nom}</span></span><span class="ps">Vous, sur NexG-TT</span></div>
        <span class="lien-p" aria-hidden="true"><Pic nom="fleche" taille={20} trait={1.75} /></span>
        {#if nomme && vue.droit.voyageur}
          <div class="boite"><span class="sur-p">Voyageur</span><span class="perso"><span class="avatar" aria-hidden="true">{(vue.droit.voyageur.prenom[0] ?? '') + (vue.droit.voyageur.nom[0] ?? '')}</span><span class="pn">{vue.droit.voyageur.prenom} {vue.droit.voyageur.nom}</span></span><span class="ps">Nommé · transmis à {compagnie}</span></div>
        {:else}
          <div class="boite pointille"><span class="sur-p">Voyageur</span><span class="perso"><span class="avatar vide" aria-hidden="true">?</span><span class="pn att">À nommer</span></span><span class="ps">Chez {compagnie}, au plus tard le {jourCourt(vue.echeanceMs)}</span></div>
        {/if}
      </div>
      <p class="t-sec grande">{#if nomme}Le voyageur est nommé : plus aucune revente ni aucun transfert. Le nom est transmis à {compagnie}.{:else}Vous êtes détenteur. Votre place est réservée chez {compagnie} par NexG-TT ; le nom du voyageur est transmis à la finalisation.{/if}</p>
    </section>

    <section class="chaine" aria-labelledby="ch-h">
      <div class="entete bas"><h2 id="ch-h" class="t-section">Chaîne de détention</h2><span class="t-aide">Registre NexG-TT</span></div>
      <ol class="etapes">
        {#each chaine as e (e.id)}
          <li class={e.repere}>
            <span class="e-date">{e.date}{#if e.heure}<br />{e.heure}{/if}</span>
            <span class="e-rail" aria-hidden="true"><span class="pt {e.repere}"></span><span class="tige" class:fin={e.repere === 'depart'}></span></span>
            <span class="col g2 e-txt"><span class="e-t">{e.titre}</span><span class="e-d">{e.detail}</span></span>
          </li>
        {/each}
      </ol>
    </section>
    </div></div>
    <p class="aide-c">Prix indicatifs. Un droit de voyage n’est pas un placement financier.</p>
  </Ecran>
{/if}

<style>
  @media (min-width: 900px) { .aide-c { text-align: center; } }
  .col { display: flex; flex-direction: column; } .g2 { gap: 2px; } .g4 { gap: 4px; } .grow { flex: 1; min-width: 0; }
  .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .petit { font-size: 12px; color: var(--ink2); }
  .t-section { text-transform: uppercase; letter-spacing: 0.04em; }
  .erreur { display: flex; flex-direction: column; gap: 12px; padding: 20px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
  .ico-err { width: 48px; height: 48px; border-radius: 999px; display: grid; place-items: center; background: var(--err-soft); color: var(--err); }
  .valeur, .bagages, .dv { display: flex; flex-direction: column; gap: 14px; padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
  .entete { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; } .entete.bas { align-items: baseline; padding: 0; }
  .cours { display: inline-flex; align-items: center; gap: 4px; min-height: 44px; margin: -10px 0; font: 600 14px/1 'Barlow', sans-serif; color: var(--accent); }
  .deux { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .lib { font-size: 13px; color: var(--ink2); }
  .m22 { font: 600 22px/28px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .pet { font-size: 12px; color: var(--ink3); }
  .ecart { display: inline-flex; align-items: center; gap: 3px; font: 600 13px/1 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .ecart.hausse { color: var(--up); } .ecart.baisse { color: var(--down); } .ecart.stable { color: var(--ink2); }
  .graph { display: flex; flex-direction: column; gap: 6px; } .axe { display: flex; justify-content: space-between; gap: 8px; font: 400 11px/14px 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink3); }
  .note { font-size: 12px; line-height: 17px; color: var(--ink3); } .bagages .note { padding-top: 12px; border-top: 1px solid var(--line); }
  .que-faire { display: flex; flex-direction: column; gap: 12px; }
  .grille { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .tuile { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; min-height: 112px; padding: 14px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); color: var(--ink); text-align: left; cursor: pointer; font: inherit; }
  .tuile.ouvert { border-color: var(--accent); } .tuile .puce-i { width: 36px; height: 36px; border-radius: 10px; background: var(--surface3); display: grid; place-items: center; }
  .tuile.principale { background: var(--signal); color: #0d0e11; border-color: var(--signal); } .tuile.principale .puce-i { background: rgba(13, 14, 17, 0.12); } .tuile.principale .ts { color: #0d0e11; font-weight: 500; }
  .tt { font-size: 15px; font-weight: 700; line-height: 19px; } .ts { font-size: 12px; line-height: 16px; color: var(--ink2); }
  .rang { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 8px 14px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); color: var(--ink); font: 600 15px/20px 'Barlow', sans-serif; text-align: left; cursor: pointer; width: 100%; box-sizing: border-box; }
  .rang.ouvert { border-color: var(--accent); } .rang.vert { background: var(--ok-soft); border-color: rgba(124, 227, 181, 0.35); } .fonds { display: inline-flex; align-items: center; gap: 4px; font: 700 12px/16px 'Barlow', sans-serif; color: var(--ok); }
  .info-vente { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border-radius: 12px; background: rgba(98, 199, 255, 0.1); color: var(--ink2); font-size: 13px; line-height: 18px; } .info-vente :global(svg) { color: var(--up); margin-top: 1px; }
  .volet { display: flex; flex-direction: column; gap: 10px; padding: 16px; border-radius: 16px; background: var(--surface2); border: 1px solid var(--line-strong); }
  .volet p { font-size: 14px; line-height: 20px; color: var(--ink2); } .volet p.t-aide { font-size: 12px; } .v-ent { display: flex; align-items: center; justify-content: space-between; } .v-ent h3 { font-size: 16px; font-weight: 700; }
  .fermer { width: 44px; height: 44px; margin: -10px -10px -10px 0; border: 0; border-radius: 999px; background: transparent; color: var(--ink2); display: grid; place-items: center; cursor: pointer; }
  .message { display: flex; gap: 14px; padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); } .message.err { border-color: var(--err); } .message.ok { border-color: rgba(124, 227, 181, 0.45); } .message.signal { border-color: rgba(255, 210, 63, 0.45); }
  .m-ico { width: 40px; height: 40px; flex: none; border-radius: 12px; display: grid; place-items: center; background: var(--surface3); } .message.err .m-ico { background: var(--err-soft); color: var(--err); } .message.ok .m-ico { background: var(--ok-soft); color: var(--ok); } .message.signal .m-ico { background: var(--signal-soft); color: var(--accent); }
  .m-t { font: 600 20px/24px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; } .m-liens { display: flex; flex-direction: column; margin-top: 6px; } .m-liens a { display: inline-flex; align-items: center; gap: 4px; min-height: 44px; font: 600 14px/1 'Barlow', sans-serif; color: var(--accent); }
  .b-haut { display: flex; align-items: center; gap: 16px; }
  .etq { position: relative; flex: none; width: 76px; height: 100px; margin: 12px 0 0 4px; transform: rotate(-4deg); } .etq-in { position: absolute; inset: 0; box-sizing: border-box; padding-top: 22px; display: flex; flex-direction: column; align-items: center; gap: 2px; overflow: hidden; border-radius: 10px; background: #fff; color: #121418; clip-path: polygon(16px 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%, 0 16px); }
  .etq-code { font: 700 30px/30px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; } .etq-v { font: 600 10px/12px 'IBM Plex Mono', ui-monospace, monospace; color: #555c6b; text-align: center; } .etq-bar { margin-top: auto; width: 100%; height: 20px; background: repeating-linear-gradient(90deg, #121418 0 2px, transparent 2px 4px, #121418 4px 5px, transparent 5px 8px); }
  .b-gros { font: 600 18px/24px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .b-sous { font-size: 14px; color: var(--ink2); } .jaune { color: var(--accent); } .b-aide { font-size: 12px; line-height: 16px; color: var(--ink3); }
  .lien-soute { display: flex; align-items: center; gap: 6px; min-height: 44px; font: 600 14px/1 'Barlow', sans-serif; color: var(--accent); }
  .paire { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: stretch; gap: 8px; } .lien-p { align-self: center; color: var(--ink3); display: flex; }
  .boite { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 14px; background: var(--surface2); min-width: 0; } .boite.pointille { background: transparent; border: 1.5px dashed var(--line-strong); }
  .sur-p { font: 700 11px/14px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); } .perso { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .avatar { width: 32px; height: 32px; flex: none; border-radius: 999px; background: var(--ink); color: #0d0e11; display: grid; place-items: center; font: 700 12px/1 'Barlow', sans-serif; } .avatar.vide { background: transparent; border: 1.5px dashed var(--ink3); color: var(--ink3); font-size: 14px; }
  .pn { font-size: 15px; font-weight: 700; overflow-wrap: anywhere; } .pn.att { color: var(--ink2); } .ps { font-size: 12px; line-height: 16px; color: var(--ink2); } .grande { font-size: 14px; line-height: 20px; }
  .chaine { display: flex; flex-direction: column; gap: 14px; }
  .etapes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .etapes li { display: grid; grid-template-columns: 52px 20px minmax(0, 1fr); gap: 10px; }
  .e-date { padding-top: 1px; text-align: right; font: 400 12px/16px 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink2); } li.aujourdhui .e-date { color: var(--ink); } li.echeance .e-date { color: var(--accent); }
  .e-rail { display: flex; flex-direction: column; align-items: center; } .pt { width: 12px; height: 12px; margin-top: 3px; border-radius: 999px; background: var(--ink3); box-sizing: border-box; flex: none; }
  .pt.aujourdhui { width: 14px; height: 14px; margin-top: 2px; background: var(--ink); border: 3px solid var(--bg); box-shadow: 0 0 0 2px var(--ink); } .pt.echeance { background: var(--accent); } .pt.depart { background: transparent; border: 2px solid var(--ink3); }
  .tige { flex: 1; width: 2px; margin-top: 4px; background: var(--ink3); } li.aujourdhui .tige, li.echeance .tige { width: 0; background: none; border-left: 2px dashed var(--line-strong); } .tige.fin { display: none; }
  .e-txt { padding-bottom: 18px; } li.depart .e-txt { padding-bottom: 0; } .e-t { font-size: 15px; font-weight: 600; } li.echeance .e-t { color: var(--accent); } .e-d { font-size: 13px; line-height: 18px; color: var(--ink2); }
  .aide-c { text-align: center; font-size: 12px; line-height: 17px; color: var(--ink3); }
</style>
