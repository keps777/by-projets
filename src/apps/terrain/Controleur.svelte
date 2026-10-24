<script lang="ts">
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { amende, codeAffiche, supportBillet } from '../../core/terrain.ts';
  import { heureLocale, ligneDe, personneCourante } from '../../domain/actions.ts';
  import { anomalies, chiffresControle, choisirDepartControle, compter, controleBascule, controlerBillet, departAControler, envoyerRapport, etapeDe, ouvrirLitigeChauffeur, remettreAZero, scansControleSimulables, signalerSansBillet, totalAmendes, verbaliser } from './actions.ts';
  import { aujourdhui, arretsDe, billetsPayes, fcfaF, libelleDepart, nomPassager } from './commun.ts';
  import { lireControle, lireSuivi } from './etat.ts';
  import { dockAgent } from './dock.ts';
  import Scanner from './Scanner.svelte';

  const agent = $derived(personneCourante());
  const depart = $derived(agent ? departAControler(agent.compagnieId, aujourdhui()) : undefined);
  const choix = $derived(app.monde.departs.filter((d) => d.jour === aujourdhui() && d.statut !== 'annule' && (!agent?.compagnieId || ligneDe(d).compagnieId === agent.compagnieId) && (d.statut === 'parti' || d.statut === 'embarquement' || d.chauffeurId)));
  const c = $derived(depart ? chiffresControle(depart.id) : null);
  const ctl = $derived(depart ? lireControle(depart.id) : null);
  const liste = $derived(depart ? anomalies(depart.id) : []);
  const billets = $derived(depart ? billetsPayes(depart.id) : []);
  const sim = $derived(depart ? scansControleSimulables(depart.id) : { valides: [], essais: [] });
  const ou = $derived.by(() => {
    if (!depart) return ''; const s = lireSuivi(depart.id), e = etapeDe(depart, s), a = arretsDe(depart);
    return e === 'arret' ? `à ${a[Math.min(s.k, a.length - 1)].nom}` : e === 'route' ? 'en route' : e === 'termine' ? 'arrivé' : 'au quai';
  });
  let scan = $state(false), sans = $state(false), litige = $state(false), liste_ouverte = $state(false);
  let nom = $state(''), tel = $state(''), moyen = $state<'especes' | 'momo'>('especes'), geste = $state(false), texteLitige = $state('');
  const total = $derived(depart ? depart.prix + (geste ? 0 : amende(depart.prix)) : 0);
  const MSG = { ok: 'Billet contrôlé', deja: 'Déjà contrôlé', autre_depart: 'Billet d’un autre bus', annule: 'Billet annulé', inconnu: 'Billet inconnu', faux: 'Billet falsifié : sceau invalide', non_paye: 'Paiement non confirmé' } as const;
  function surScan(contenu: string) {
    if (!depart || !agent) return; const r = controlerBillet(depart.id, contenu, agent.id);
    montrer(MSG[r.resultat], r.resultat === 'ok' ? 'ok' : r.resultat === 'deja' ? 'wa' : 'er');
  }
  function regulariser() {
    if (!depart || !agent) return;
    try { const s = verbaliser({ departId: depart.id, agentId: agent.id, nom, tel, geste, moyen }); montrer(`${s.nom} régularisé · ${fcfaF(s.prix + s.amende)} encaissés`); sans = false; nom = ''; tel = ''; geste = false; } catch { montrer('Vente impossible : bus complet ou terminé', 'er'); }
  }
  function nonRegularise() { if (!depart || !agent) return; signalerSansBillet(depart.id, agent.id, nom, tel); montrer('Voyageur noté dans le rapport', 'wa'); sans = false; nom = ''; tel = ''; }
  function rapport() { if (!depart || !agent) return; const r = envoyerRapport(depart.id, agent.id); montrer(r.superviseurs ? 'Rapport envoyé à la gare' : 'Rapport enregistré (aucun superviseur dans la gare)', r.superviseurs ? 'ok' : 'wa'); }
  function ouvrirLitige() { if (!depart || !agent) return; ouvrirLitigeChauffeur(depart.id, agent.id, texteLitige); litige = false; texteLitige = ''; montrer('Litige chauffeur ouvert'); }
  const siege = (s: string | null) => s ?? 'sans place';
</script>

<svelte:window onkeydown={(e) => (e.key === 'Escape') && (sans = litige = false)} />
<Mobile titre={depart ? `Contrôle · bus ${libelleDepart(depart)}` : 'Contrôle'} sous={agent ? `${agent.prenom} · inspectrice · ${ou} ${heureLocale(maintenant())}` : ''} sansRetour dock={dockAgent('controleur', 'controle')}>
  {#snippet droite()}{#if c}<span class="pl {c.verdict.niveau === 'fraude' ? 'er' : 'ok'}"><span class="dot"></span>{c.verdict.ecart > 0 ? '+' : ''}{c.verdict.ecart} écart</span>{/if}{/snippet}
  {#if !depart || !c || !ctl}
    <div class="center"><div class="ill" aria-hidden="true"><Icone nom="scan" taille={56} /></div><span class="ttl t20">Aucun bus à contrôler</span><span class="t14 mut">Aucun départ de la compagnie n’est en cours aujourd’hui.</span></div>
  {:else}
    {#if choix.length > 1}
      <label class="fld"><span class="lab">Bus à contrôler</span>
        <select class="inp" style="min-height: 46px" value={depart.id} onchange={(e) => choisirDepartControle(e.currentTarget.value)}>{#each choix as d (d.id)}<option value={d.id}>{libelleDepart(d)} · {d.statut === 'parti' ? 'en route' : d.statut === 'embarquement' ? 'à quai' : d.statut}</option>{/each}</select></label>
    {/if}
    <div class="row g8" style="align-items: stretch">
      <div class="gl grow kc"><span class="lab">Comptés à bord</span><span class="ttl t24" aria-live="polite">{c.comptes}</span>
        <div class="row g6" style="margin-top: 6px"><button class="b s sm" type="button" onclick={() => compter(depart.id, 1)}>+1 compté</button><button class="b s sm" type="button" aria-label="Retirer un compté" disabled={c.comptes === 0} onclick={() => compter(depart.id, -1)}>−1</button></div></div>
      <div class="gl grow kc"><span class="lab">Billets valides</span><span class="ttl t24">{c.valides}</span><span class="t12 mut">app {c.app} · papier {c.papier} · SMS {c.sms}</span></div>
    </div>
    <div class="gl" class:ac={c.verdict.niveau === 'conforme'}>
      <div class="row sp"><span class="t15 b7" role="status">{c.verdict.texte}</span><span class="pl {c.verdict.niveau === 'fraude' ? 'er' : 'ok'}">{c.verdict.niveau === 'fraude' ? 'fraude probable' : 'conforme'}</span></div>
      <div class="bar fixe" style="margin-top: 8px" role="img" aria-label="{c.valides} billets pour {c.comptes} voyageurs comptés"><i class={c.verdict.niveau === 'fraude' ? 'er' : ''} style="width: {c.verdict.pct}%"></i></div>
      <span class="t12 mut">{c.controles} billet{c.controles > 1 ? 's' : ''} contrôlé{c.controles > 1 ? 's' : ''} un à un</span>
    </div>
    <div class="row g8"><button class="b p grow" type="button" onclick={() => (scan = true)}>Scanner un billet</button><button class="b s grow" type="button" onclick={() => (sans = true)}>Voyageur sans billet</button></div>
    <span class="lab">Anomalies</span>
    <div class="gl col" style="gap: 0">
      {#each liste as a (a.titre)}
        {#if a.lien}<a class="an" href={a.lien} onclick={(e) => { e.preventDefault(); aller(a.lien!); }}><span class="pl {a.niveau}">{a.niveau === 'ok' ? 'ok' : a.niveau === 'er' ? '!' : '?'}</span><span class="col grow"><span class="t14 b7">{a.titre}</span><span class="t12 mut">{a.sous}</span></span><span class="t13 aq">voir</span></a>
        {:else}<div class="an"><span class="pl {a.niveau}">{a.niveau === 'ok' ? 'ok' : a.niveau === 'er' ? '!' : '?'}</span><span class="col grow"><span class="t14 b7">{a.titre}</span><span class="t12 mut">{a.sous}</span></span></div>{/if}
      {:else}<div class="an"><span class="pl ok">ok</span><span class="col grow"><span class="t14 b7">Rien à signaler</span><span class="t12 mut">Aucune anomalie relevée pour ce bus.</span></span></div>{/each}
    </div>
    {#if ctl.sansBillet.length}
      <span class="lab">Sans billet · {ctl.sansBillet.length}</span>
      <div class="gl col" style="gap: 0">{#each ctl.sansBillet as s (s.id)}<div class="an"><span class="pl {s.billetId ? 'ok' : 'er'}">{s.billetId ? 'régularisé' : 'à suivre'}</span><span class="col grow"><span class="t14 b7">{s.nom}</span><span class="t12 mut">{s.billetId ? `billet ${fcfaF(s.prix)}${s.amende ? ` + amende ${fcfaF(s.amende)}` : ' · geste, sans amende'}` : 'pas de billet, pas de paiement'}</span></span></div>{/each}</div>
      <span class="t12 mut">Amendes encaissées : {fcfaF(totalAmendes(depart.id))}</span>
    {/if}
    <button type="button" class="b s" aria-expanded={liste_ouverte} onclick={() => (liste_ouverte = !liste_ouverte)}>Billets du départ · {billets.length}</button>
    {#if liste_ouverte}
      <div class="gl col" style="gap: 0">
        {#each billets as b (b.id)}
          <button type="button" class="an" style="background: none; border: 0; border-bottom: 1px solid rgba(255,255,255,.08); text-align: left; width: 100%; color: inherit; font: inherit; cursor: pointer" aria-pressed={!!ctl.controles[b.id]} onclick={() => controleBascule(depart.id, b.id)}>
            <span class="pl {ctl.controles[b.id] ? 'ok' : ''}">{ctl.controles[b.id] ? 'contrôlé' : 'à voir'}</span><span class="col grow"><span class="t14 b7 ell">{nomPassager(b)} · {siege(b.siege)}</span><span class="t12 mut">{({ app: 'app', papier: 'papier', sms: 'SMS' } as const)[supportBillet(b.canal)]} · {codeAffiche(b.code)}</span></span></button>
        {:else}<span class="t13 mut" style="padding: 10px 0">Aucun billet vendu sur ce départ.</span>{/each}
      </div>
    {/if}
    <div class="col g8" style="margin-top: auto">
      <button type="button" class="b p" onclick={rapport}>Envoyer le rapport à la gare</button>
      {#if ctl.rapportA}<span class="t12 okc c">Rapport envoyé à {heureLocale(ctl.rapportA)}</span>{/if}
      <button type="button" class="b g" onclick={() => (litige = true)} disabled={!!ctl.litigeA}>{ctl.litigeA ? `Litige ouvert à ${heureLocale(ctl.litigeA)}` : 'Ouvrir un litige chauffeur'}</button>
    </div>
  {/if}
</Mobile>

{#if scan && depart}<Scanner titre="Contrôler un billet" onscan={surScan} onfermer={() => (scan = false)} valides={sim.valides} essais={sim.essais} />{/if}
{#if sans && depart}
  <div class="voile" role="presentation" onclick={() => (sans = false)}></div>
  <div class="sheet pop" role="dialog" aria-modal="true" aria-label="Voyageur sans billet">
    <span class="grab"></span><span class="ttl t18">Voyageur sans billet</span>
    <div class="row g8"><label class="fld grow" style="gap: 4px"><span class="lab">Nom</span><input class="inp" style="min-height: 46px" bind:value={nom} autocomplete="off" /></label><label class="fld grow" style="gap: 4px"><span class="lab">Téléphone</span><input class="inp" style="min-height: 46px" type="tel" bind:value={tel} autocomplete="off" /></label></div>
    <div class="seg2" role="group" aria-label="Moyen de paiement"><button type="button" class:on={moyen === 'especes'} aria-pressed={moyen === 'especes'} onclick={() => (moyen = 'especes')}>Espèces</button><button type="button" class:on={moyen === 'momo'} aria-pressed={moyen === 'momo'} onclick={() => (moyen = 'momo')}>MoMo</button></div>
    <label class="row g8" style="min-height: 44px"><input type="checkbox" bind:checked={geste} style="width: 22px; height: 22px; accent-color: #3de0ff" /><span class="t14">Geste commercial : pas d’amende</span></label>
    <div class="gl row sp"><span class="t13 mut">Billet {fcfaF(depart.prix)}{geste ? '' : ` + amende ${fcfaF(amende(depart.prix))}`}</span><span class="ttl t18">{fcfaF(total)}</span></div>
    <button type="button" class="b p" onclick={regulariser}>Vendre le billet{geste ? '' : ' + amende'} · {fcfaF(total)}</button>
    <button type="button" class="b s" onclick={nonRegularise}>Il ne peut pas payer · le noter au rapport</button>
  </div>
{/if}
{#if litige && depart}
  <div class="voile" role="presentation" onclick={() => (litige = false)}></div>
  <div class="sheet pop" role="dialog" aria-modal="true" aria-label="Litige chauffeur">
    <span class="grab"></span><span class="ttl t18">Litige chauffeur</span>
    <label class="fld"><span class="lab">Ce qui s’est passé</span><textarea class="inp" style="padding: 12px 14px" rows="3" bind:value={texteLitige} placeholder="Laisse vide pour reprendre le résumé du contrôle"></textarea></label>
    <div class="row g8"><button type="button" class="b s" onclick={() => (litige = false)}>Annuler</button><button type="button" class="b p" onclick={ouvrirLitige}>Ouvrir le litige</button></div>
  </div>
{/if}

<style>
  .an { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); min-height: 52px; text-decoration: none; color: inherit; }
  .an:last-child { border-bottom: 0; }
  .t15 { font-size: 15px; }
  .voile { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); z-index: 40; }
  .pop { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(100%, 460px); max-height: 92dvh; overflow-y: auto; z-index: 41; margin: 0; }
  select.inp { appearance: auto; }
</style>
