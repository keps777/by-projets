<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { fmt, fmtSigne } from '../../core/argent.ts';
  import { delaiVenteEstime, departDe, echeanceDe, prixSuggere } from '../../core/regles.ts';
  import { maintenant } from '../../data/store.svelte.ts';
  import { annoncesDuVol } from '../../domain/carnet.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { compagnieDe, droitDe, volDe } from '../../domain/marche.ts';
  import { blocageDe, ErreurRevente, mettreEnVente, modifierAnnonce, retirerAnnonce } from '../../domain/revente.ts';
  import { param } from '../../router.svelte.ts';
  import { reseau } from '../achat/reseau.svelte.ts';
  import Absent from './Absent.svelte';
  import { texteBlocage } from './Blocage.ts';
  import { rachatAccepte, memoriserRachat } from './etat.ts';
  import { heure, jourComplet, jourHeure, jours as nbJours } from './format.ts';
  import { naviguer } from './lien.ts';
  import Pic from './Pic.svelte';
  import { bornesVente, caleVente, rangAnnonce, recu } from './vente.ts';

  /** Revendre : fixer le prix (sous le plafond), comparer aux annonces du vol, voir ce qu'on reçoit, mettre en vente. */
  let { id = '' }: { id?: string } = $props();
  const compte = $derived(compteCourant());
  const droit = $derived(droitDe(id));
  const vol = $derived(droit ? volDe(droit.volId) : undefined);
  const blocage = $derived(compte ? blocageDe(id, compte.id) : 'introuvable');
  const neuf = $derived(vol?.prixNeuf ?? 0), bornes = $derived(bornesVente(neuf));
  const suggere = $derived(Math.min(neuf, prixSuggere(neuf)));
  const enVente = $derived(droit?.statut === 'en_vente');
  let choisi = $state<number | undefined>(), saisie = $state<string | undefined>(), erreurSaisie = $state(''), erreur = $state(''), resultat = $state<{ prix: number; mode: 'vente' | 'maj' | 'retrait' } | undefined>();
  let rachatOn = $state<boolean | undefined>();
  const depart = $derived(vol ? departDe(vol.jour, vol.heureDepart) : 0);
  const prix = $derived.by(() => {
    if (choisi !== undefined) return choisi;
    const url = Number(param('prix')); const initial = enVente ? droit?.annonce?.prix : Number.isFinite(url) && url > 0 ? url : suggere;
    return caleVente(initial ?? suggere, neuf) ?? suggere;
  });
  const pass = $derived(!!compte?.pass.actif);
  const autres = $derived(annoncesDuVol(vol?.id ?? '', droit?.id));
  const rang = $derived(rangAnnonce(prix, autres));
  const r = $derived(recu(prix, droit?.prixPaye ?? 0, pass));
  const delai = $derived(delaiVenteEstime(suggere, neuf));
  const appliquee = $derived(prix === suggere);
  const surRachat = $derived(rachatOn ?? (compte ? rachatAccepte(compte.id, id) : false));
  const lignes = $derived([...autres.map((p) => ({ moi: false, p })), { moi: true, p: prix }].sort((a, b) => a.p - b.p || (a.moi ? -1 : 1)));
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - bornes.min) / Math.max(1, bornes.max - bornes.min)) * 100)).toFixed(2)}%`;

  function fixer(v: number) { choisi = v; saisie = undefined; erreurSaisie = ''; erreur = ''; }
  function valider(e: Event) {
    const brut = (e.currentTarget as HTMLInputElement).value.replace(/[\s $]/g, '').replace(',', '.'), n = Number(brut);
    if (!brut || !Number.isFinite(n) || n <= 0) { erreurSaisie = 'Indiquez un prix supérieur à 0 $.'; saisie = (e.currentTarget as HTMLInputElement).value; return; }
    const cale = caleVente(n, neuf)!; fixer(cale);
    if (n > neuf) erreurSaisie = `Le prix ne peut pas dépasser le plafond : ${fmt(neuf)} (prix équivalent neuf).`;
    else if (cale !== n) erreurSaisie = `Prix ajusté à ${fmt(cale)} (pas de 10 $, minimum ${fmt(bornes.min)}).`;
  }
  function agir(mode: 'vente' | 'maj' | 'retrait') {
    erreur = ''; if (!compte || !droit) return;
    if (!reseau.enLigne) { erreur = 'Vous êtes hors ligne : la mise en vente demande une connexion.'; return; }
    if (mode !== 'retrait' && erreurSaisie.startsWith('Indiquez')) return;
    try {
      if (mode === 'retrait') retirerAnnonce(droit.id, compte.id); else if (mode === 'maj') modifierAnnonce(droit.id, compte.id, prix); else mettreEnVente(droit.id, compte.id, prix);
      memoriserRachat(compte.id, droit.id, surRachat); resultat = { prix, mode };
    } catch (e) { erreur = e instanceof ErreurRevente ? e.message : 'Impossible de mettre en vente pour l’instant.'; }
  }
  const invalide = $derived(erreurSaisie.startsWith('Indiquez') || !(prix > 0));
</script>

{#if !id}
  <!-- ancien écran réinstancié brièvement -->
{:else if resultat && vol}
  <Ecran titre="Revendre" face="nuit" sansRetour>
    <section class="carte fait" role="status" aria-live="polite" data-testid="vente-faite"><span class="rond-ok"><Icone nom="ok" taille={30} trait={2.25} /></span>
      {#if resultat.mode === 'retrait'}<h2 class="t-section">Annonce retirée</h2><p class="t-sec">Votre droit {vol.de} → {vol.vers} reste dans votre portefeuille.</p>
      {:else}<h2 class="t-section">{resultat.mode === 'maj' ? 'Annonce mise à jour' : 'En vente'} à {fmt(resultat.prix)}</h2>
        <p class="t-sec">Vous recevez {fmt(recu(resultat.prix, droit?.prixPaye ?? 0, pass).net)} si la vente a lieu (commission {r.tauxLabel}, hypothèse). L’annonce est retirée automatiquement à J-1, le {jourHeure(echeanceDe(depart))}.</p>{/if}
      <a class="btn" href="/cours/{vol.id}" onclick={(e) => naviguer(e, `/cours/${vol.id}`)}>Voir le cours du vol</a><a class="btn sec" href="/portefeuille" onclick={(e) => naviguer(e, '/portefeuille')}>Retour au portefeuille</a></section>
  </Ecran>
{:else if !droit || !vol || blocage}
  {@const t = texteBlocage(blocage ?? 'introuvable')}
  <Absent titre={t.titre} message={t.message} details={t.details} lien="/portefeuille" libelleLien="Voir mon portefeuille" retour="/portefeuille" />
{:else}
  {@const cie = compagnieDe(vol)}
  <Ecran titre="Revendre" face="nuit" retour="/portefeuille" large>
    <div class="pc-duo"><div class="pc-col">
    <div class="billet" aria-label="Votre droit"><span class="route">{vol.de} → {vol.vers}</span><span class="detail">{jourComplet(depart)}<br />{cie.nom} {vol.numero.split(' ')[1]} · {vol.heureDepart}</span><span class="paye"><span class="l">Payé</span><span class="m mono">{fmt(droit.prixPaye)}</span></span></div>
    {#if enVente}<p class="en-vente" role="status"><Pic nom="etiquette" taille={18} />Votre droit est en vente à <span class="mono">{fmt(droit.annonce?.prix ?? 0)}</span> depuis le {jourHeure(droit.annonce?.depuis ?? 0)}. Modifiez le prix ou retirez l’annonce.</p>{/if}

    <section class="prix carte-noire" aria-labelledby="prix-l">
      <label id="prix-l" for="prix-champ" class="t-sur">Votre prix de vente</label>
      <p class="gros mono" data-testid="prix">{fmt(prix)}</p>
      {#if prix < neuf}<p class="t-sec"><span class="mono clair">{fmt(neuf - prix)}</span> sous le prix équivalent neuf ({fmt(neuf)})</p>{:else}<p class="jaune petit">Au plafond : égal au prix équivalent neuf</p>{/if}
      <div class="champ-prix"><input id="prix-champ" type="text" inputmode="numeric" autocomplete="off" value={saisie ?? String(prix)} onchange={valider} aria-invalid={!!erreurSaisie && erreurSaisie.startsWith('Indiquez')} aria-describedby="prix-regle prix-msg" /><span class="u" aria-hidden="true">$</span></div>
      <p id="prix-msg" role="alert" class:erreur-s={!!erreurSaisie} class="msg">{#if erreurSaisie}<Icone nom="alerte" taille={16} trait={2} />{erreurSaisie}{/if}</p>
      <input class="curseur" type="range" min={bornes.min} max={bornes.max} step="10" value={prix} oninput={(e) => fixer(Number((e.currentTarget as HTMLInputElement).value))} aria-label="Prix de vente, curseur" aria-valuetext={fmt(prix)} />
      <div class="bornes" aria-hidden="true"><span>{fmt(bornes.min)}</span><span>Plafond {fmt(neuf)}</span></div>
      <p id="prix-regle" class="regle">Plafond = prix équivalent d’un billet neuf sur ce vol. Règle provisoire anti-spéculation, à valider.</p>
    </section>

    <section class="suggestion carte" aria-labelledby="ia-h"><div class="ligne"><span class="ic"><Pic nom="etincelle" taille={20} trait={1.75} /></span><h2 id="ia-h" class="t-sur grow">Suggestion · estimation</h2>
        {#if appliquee}<span class="ok-app"><Icone nom="ok" taille={18} trait={2.25} />Appliquée</span>{:else}<button type="button" class="appliquer" onclick={() => fixer(suggere)}>Appliquer</button>{/if}</div>
      <div class="vals"><span class="mono s">{fmt(suggere)}</span><span class="t-sec">vente estimée sous {nbJours(delai)}</span></div><p class="regle">D’après les annonces et la demande sur ce vol. Estimation, non garantie.</p></section>

    <section aria-labelledby="mk-h" class="annonces"><div class="entete"><h2 id="mk-h" class="t-section">Annonces sur ce vol</h2><span class="rang" data-testid="rang">{rang.label}</span></div>
      <div class="boite"><div class="bande" aria-hidden="true"><div class="axe"><span class="fil"></span>{#each autres as p}<span class="pt" style="left: calc({pos(p)} - 5px)"></span>{/each}<span class="est" style="left: calc({pos(suggere)} - 1px)"></span><span class="vous-pt" style="left: calc({pos(prix)} - 9px)"></span></div>
          <div class="leg"><span class="mono">{fmt(bornes.min)}</span><span class="cles"><span><i class="g"></i>Annonces</span><span><i class="j"></i>Vous</span><span><i class="b"></i>Estimation</span></span><span class="mono">{fmt(neuf)}</span></div></div>
        <ul>{#each lignes as l}<li class:vous={l.moi}><span class="n">{l.moi ? 'Votre annonce' : 'Autre détenteur'}</span><span class="mono p">{fmt(l.p)}</span></li>{/each}</ul>
        {#if !autres.length}<p class="seule">Aucune autre annonce sur ce vol : la vôtre serait la seule.</p>{/if}</div></section>

    </div><div class="pc-col">
    <section class="calcul carte" aria-labelledby="calc-h"><h2 id="calc-h" class="t-section">Ce que vous recevez</h2>
      <dl><div class="l1"><dt>Prix de vente</dt><dd class="mono">{fmt(prix)}</dd></div>
        <div class="l2"><dt>Commission NexG-TT (hypothèse)<span class="mono sous">{r.tauxLabel}{pass ? ' · membre Pass' : ' · sans Pass'}</span></dt><dd class="mono" data-testid="commission">{r.commission === 0 ? fmt(0) : `−${fmt(r.commission)}`}</dd></div>
        <div class="l3"><dt>Vous recevez</dt><dd class="mono" data-testid="net">{fmt(r.net)}</dd></div></dl>
      <p class="diff"><span>Par rapport au prix payé ({fmt(droit.prixPaye)}), si la vente a lieu</span><span class="mono d" class:hausse={r.sens === 'hausse'} class:baisse={r.sens === 'baisse'} data-testid="diff">{fmtSigne(r.diff)}</span></p>
      <div class="taux"><span class="t-sur">Commission</span><div class="deux"><span aria-current={pass ? 'true' : undefined} class:cur={pass}><span class="mono t">{pass ? r.tauxLabel : recu(prix, 0, true).tauxLabel}</span><span class="e">Membre Pass{pass ? ' · vous' : ''}</span></span><span aria-current={!pass ? 'true' : undefined} class:cur={!pass}><span class="mono t">{r.tauxSansPass}</span><span class="e">Sans Pass{!pass ? ' · vous' : ''}</span></span></div></div>
      <p class="regle">Taux hypothétiques (10 à 20 %), prélevés seulement si la vente a lieu. {compte?.prenom} {(compte?.nom ?? '').charAt(0)}. {pass ? 'est membre Pass : le taux membre s’applique' : 'n’est pas membre Pass : le taux sans Pass s’applique'}.</p></section>

    <label class="rachat" for="rachat"><input id="rachat" type="checkbox" checked={surRachat} onchange={(e) => (rachatOn = (e.currentTarget as HTMLInputElement).checked)} />
      <span class="col"><span class="n">Accepter une offre de rachat NexG-TT</span><span class="t-sec">Liquidité immédiate : NexG-TT peut vous proposer un prix ferme. Il vous est soumis avant toute vente — règle à valider.</span></span></label>
    <p class="retrait"><Icone nom="horloge" taille={16} trait={2} /><span>Retrait automatique de l’annonce à J-1 ({jourHeure(echeanceDe(depart))}).</span></p>
    {#if erreur}<p class="erreur" role="alert"><Icone nom="alerte" taille={18} trait={2} /><span>{erreur}</span></p>{/if}
    <p class="t-aide centre">Prix indicatifs. Un droit de voyage n’est pas un placement financier.</p>
    </div></div>

    {#snippet pied()}
      <p class="resume"><span>Vous recevez <span class="mono clair">{fmt(r.net)}</span></span><span>Commission {r.tauxLabel} (hypothèse)</span></p>
      <button type="button" class="btn grand" disabled={invalide} onclick={() => agir(enVente ? 'maj' : 'vente')}><Pic nom="etiquette" taille={20} />{enVente ? 'Mettre à jour l’annonce à' : 'Mettre en vente à'}&nbsp;<span class="mono">{fmt(prix)}</span></button>
      {#if enVente}<button type="button" class="btn sec grand" onclick={() => agir('retrait')}>Retirer l’annonce</button>{/if}
    {/snippet}
  </Ecran>
{/if}

<style>
  .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .grow { flex: 1; } .clair { color: var(--ink); } .jaune { color: var(--accent); } .petit { font-size: 13px; } .centre { text-align: center; }
  .t-sur { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); } .t-section { text-transform: uppercase; letter-spacing: 0.04em; } .col { display: flex; flex-direction: column; gap: 4px; }
  .billet { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; background: #fff; color: #121418; } .route { font: 700 clamp(22px, 6.7vw, 26px)/1 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; white-space: nowrap; }
  .detail { flex: 1; min-width: 0; font-size: 12px; line-height: 16px; color: #555c6b; } .paye { display: flex; flex-direction: column; align-items: flex-end; } .l { font-size: 11px; font-weight: 600; color: #555c6b; } .m { font-weight: 600; font-size: 15px; }
  .en-vente { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: 12px; background: rgba(98, 199, 255, 0.12); color: var(--up); font-size: 13px; font-weight: 600; line-height: 18px; }
  .carte-noire { display: flex; flex-direction: column; gap: 8px; padding: 18px; border-radius: 20px; background: #060708; border: 1px solid var(--line); }
  .gros { margin: 0; font-weight: 600; font-size: clamp(46px, 16vw, 64px); line-height: 1.05; letter-spacing: -0.02em; white-space: nowrap; }
  .champ-prix { position: relative; } .champ-prix input { width: 100%; min-height: 52px; padding: 0 36px 0 14px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line-strong); color: var(--ink); font: 600 20px 'IBM Plex Mono', ui-monospace, monospace; } .champ-prix input[aria-invalid='true'] { border-color: var(--err); box-shadow: 0 0 0 1px var(--err); } .champ-prix .u { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); color: var(--ink3); font: 600 18px 'IBM Plex Mono', monospace; }
  .msg { min-height: 0; font-size: 13px; line-height: 18px; } .msg.erreur-s { display: flex; align-items: flex-start; gap: 6px; color: var(--err); font-weight: 600; }
  .curseur { width: 100%; height: 44px; margin: 4px 0 0; accent-color: var(--accent); cursor: pointer; } .bornes { display: flex; justify-content: space-between; font: 12px 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink3); }
  .regle { font-size: 12px; line-height: 17px; color: var(--ink3); } .prix .regle { margin-top: 4px; padding-top: 10px; border-top: 1px solid #1a1c21; }
  .suggestion { display: flex; flex-direction: column; gap: 10px; padding: 16px 18px; } .ligne { display: flex; align-items: center; gap: 10px; } .ic { width: 36px; height: 36px; flex: none; border-radius: 10px; background: rgba(98, 199, 255, 0.12); color: var(--up); display: grid; place-items: center; }
  .appliquer { height: 44px; padding: 0 16px; border-radius: 12px; background: var(--surface2); border: 1px solid var(--line-strong); color: var(--accent); font: 700 14px 'Barlow', sans-serif; cursor: pointer; } .ok-app { display: inline-flex; align-items: center; gap: 6px; height: 44px; font-size: 14px; font-weight: 700; color: var(--ok); }
  .vals { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; } .s { font-weight: 600; font-size: 26px; }
  .annonces { display: flex; flex-direction: column; gap: 10px; } .entete { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; } .rang { font-size: 13px; font-weight: 600; color: var(--accent); text-align: right; }
  .boite { border-radius: 16px; background: #060708; border: 1px solid var(--line); overflow: hidden; } .bande { padding: 14px 14px 10px; } .axe { position: relative; height: 22px; } .fil { position: absolute; left: 0; right: 0; top: 10px; height: 2px; background: var(--line); }
  .pt { position: absolute; top: 6px; width: 10px; height: 10px; border-radius: 999px; background: var(--ink2); } .est { position: absolute; top: 2px; width: 2px; height: 18px; background: var(--up); } .vous-pt { position: absolute; top: 2px; width: 18px; height: 18px; border-radius: 999px; background: var(--accent); border: 3px solid #060708; }
  .leg { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 4px 8px; margin-top: 6px; font-size: 11px; color: var(--ink3); } .cles { display: flex; gap: 10px; } .cles span { display: inline-flex; align-items: center; gap: 4px; } .cles i { display: inline-block; } .g, .j { width: 8px; height: 8px; border-radius: 999px; } .g { background: var(--ink2); } .j { background: var(--accent); } .b { width: 2px; height: 10px; background: var(--up); }
  ul { list-style: none; margin: 0; padding: 0; } li { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 12px; min-height: 44px; padding: 0 14px; border-top: 1px solid #1a1c21; } li .n { font-size: 14px; font-weight: 500; } li .p { font-weight: 600; font-size: 15px; } li.vous { background: var(--surface2); color: var(--accent); } li.vous .n { font-weight: 700; }
  .seule { padding: 10px 14px; border-top: 1px solid #1a1c21; font-size: 13px; color: var(--ink2); }
  .calcul { display: flex; flex-direction: column; gap: 14px; padding: 18px; } dl { margin: 0; display: flex; flex-direction: column; } dl > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; } dd { margin: 0; font-weight: 600; font-size: 15px; } dt { font-size: 14px; color: var(--ink2); }
  .l1 { min-height: 40px; border-bottom: 1px solid var(--line); } .l2 { min-height: 48px; border-bottom: 1px solid var(--line); } .l2 dt { display: flex; flex-direction: column; } .sous { font-size: 12px; color: var(--ink3); } .l3 { min-height: 56px; } .l3 dt { font-size: 16px; font-weight: 700; color: var(--ink); } .l3 dd { font-size: clamp(22px, 7vw, 28px); }
  .diff { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border-radius: 12px; background: var(--surface2); font-size: 13px; color: var(--ink2); } .d { flex: none; font-weight: 600; font-size: 15px; } .d.hausse { color: var(--up); } .d.baisse { color: var(--down); }
  .taux { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: 14px; background: var(--surface2); border: 1px solid var(--line-strong); } .deux { display: flex; gap: 8px; } .deux > span { flex: 1; min-height: 44px; padding: 6px 10px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line); display: flex; flex-direction: column; justify-content: center; gap: 2px; }
  .deux > span.cur { background: var(--accent-soft); border-color: var(--accent); } .t { font-weight: 600; font-size: 16px; color: var(--ink2); } .cur .t { color: var(--accent); } .e { font-size: 12px; font-weight: 600; color: var(--ink3); } .cur .e { color: var(--ink); }
  .rachat { display: flex; align-items: flex-start; gap: 12px; min-height: 44px; padding: 14px; border-radius: 16px; border: 1px solid var(--line); cursor: pointer; } .rachat input { width: 22px; height: 22px; margin: 0; flex: none; accent-color: var(--accent); cursor: pointer; } .n { font-size: 15px; font-weight: 600; }
  .retrait { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; line-height: 18px; color: var(--ink2); } .retrait :global(svg) { margin-top: 1px; }
  .erreur { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 12px; background: var(--err-soft); color: var(--err); font-size: 14px; font-weight: 600; }
  .resume { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; color: var(--ink2); flex-wrap: wrap; } .grand { width: 100%; height: 52px; border-radius: 14px; } .btn.sec { background: var(--surface2); border-color: var(--line-strong); color: var(--ink); }
  .fait { display: flex; flex-direction: column; gap: 12px; align-items: stretch; text-align: center; } .rond-ok { width: 64px; height: 64px; border-radius: 999px; display: grid; place-items: center; background: var(--ok-soft); color: var(--ok); align-self: center; }
</style>
