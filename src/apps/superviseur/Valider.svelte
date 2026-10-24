<script lang="ts">
  import { untrack } from 'svelte';
  import { app } from '../../data/store.svelte.ts';
  import { param } from '../../router.svelte.ts';
  import { attenduDeCaisse, personne, personneCourante } from '../../domain/actions.ts';
  import { COUPURES, totalCompte } from '../../core/caisse.ts';
  import { numeroGuichet } from '../../core/gare.ts';
  import { quand } from '../../core/dates.ts';
  import { fcfa, fcfaSigne } from '../../core/money.ts';
  import { SEUIL_ECART_SUPERVISEUR, fiabilite, quiValide } from '../../core/supervision.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { demanderRecomptage, transmettreAuPatron, validerCloture } from './actions.ts';
  import { dockSuperviseur } from './dock.ts';
  import { gareSuivie, horloge } from './etat.svelte.ts';
  import Feuille from './Feuille.svelte';
  import { hhmm, va } from './nav.ts';
  import PinPad from './PinPad.svelte';

  const moi = $derived(personneCourante());
  const gareId = $derived(gareSuivie(moi, param('gare')));
  const aValider = $derived(app.monde.caisses.filter((c) => c.gareId === gareId && c.statut === 'fermee').sort((a, b) => (a.fermeeA ?? 0) - (b.fermeeA ?? 0)));
  const caisse = $derived(app.monde.caisses.find((c) => c.id === param('caisse')));
  const agent = $derived(caisse ? personne(caisse.agentId) : undefined);
  const permis = $derived(!!caisse && (moi?.role === 'patron' || caisse.gareId === moi?.gareId));
  const attendu = $derived(caisse ? caisse.attendu ?? attenduDeCaisse(caisse) : 0);
  const compte = $derived(caisse?.compte ? totalCompte(caisse.compte) : 0);
  const ecart = $derived(caisse?.ecart ?? compte - attendu);
  const decision = $derived(quiValide(ecart));
  const historique = $derived(caisse ? app.monde.caisses.filter((c) => c.agentId === caisse.agentId && (c.statut === 'fermee' || c.statut === 'validee') && (c.ecart ?? 0) !== 0 && (c.fermeeA ?? 0) >= horloge.t - 90 * 86_400_000).length : 0);
  const fiab = $derived(fiabilite(historique));
  const numero = $derived(caisse ? numeroGuichet(app.monde, caisse.gareId, caisse.agentId) : 0);
  const visageOk = $derived(!!moi?.visage && !!app.monde.params.regles.visage);
  const attendPatron = $derived(decision === 'patron' && moi?.role !== 'patron');

  let pin = $state(''), erreur = $state(''), faux = $state(0), scan = $state(false), recompter = $state(false), motifRecompte = $state('');
  let fait = $state<{ ecart: number } | null>(null);

  $effect(() => { void caisse?.id; untrack(() => { pin = ''; erreur = ''; faux = 0; fait = null; recompter = false; motifRecompte = ''; }); });

  function valider() {
    if (!moi || !caisse) return;
    const r = validerCloture(moi.id, caisse.id, { pin });
    if (r.ok) { fait = { ecart: r.ecart }; erreur = ''; montrer('Clôture validée'); return; }
    erreur = r.erreur; pin = ''; if (r.erreur === 'PIN incorrect') faux++;
  }
  function visage() {
    if (!moi || !caisse || scan) return; scan = true; erreur = '';
    setTimeout(() => {
      scan = false; if (!caisse) return;
      const r = validerCloture(moi.id, caisse.id, { visage: true });
      if (r.ok) { fait = { ecart: r.ecart }; montrer('Clôture validée · visage reconnu'); } else erreur = r.erreur;
    }, 900);
  }
  function recompte() {
    if (!moi || !caisse) return; const r = demanderRecomptage(moi.id, caisse.id, motifRecompte.trim() || 'Recompte ta caisse');
    recompter = false; if (r.ok) montrer(`Recomptage demandé à ${agent?.prenom ?? 'l’agent'}`, 'wa'); else erreur = r.erreur;
  }
  function transmettre() { if (!moi || !caisse) return; const r = transmettreAuPatron(moi.id, caisse.id); if (r.ok) montrer('Écart transmis au patron'); else erreur = r.erreur; }
</script>

<Mobile titre={caisse && agent ? `Clôture · ${agent.prenom}` : 'Clôtures à valider'} sous={caisse && agent ? `guichet ${numero}${caisse.fermeeA ? ` · ${quand(caisse.fermeeA, horloge.t).replace('Aujourd’hui · ', '').replace("Aujourd'hui · ", '')}` : ''}` : `${aValider.length} en attente`} retourVers="/superviseur" dock={dockSuperviseur('gare')}>
  {#snippet droite()}{#if caisse && agent}<span class="pl {ecart === 0 ? 'ok' : Math.abs(ecart) <= SEUIL_ECART_SUPERVISEUR ? 'wa' : 'er'}">{ecart === 0 ? 'juste' : `${fcfaSigne(ecart)} F`}</span>{/if}{/snippet}

  {#if !caisse}
    {#if param('caisse')}<div class="gl erc t14" role="alert">Cette clôture n’existe pas.</div>{/if}
    <div class="gl col" style="gap: 0">
      {#each aValider as c (c.id)}
        {@const a = personne(c.agentId)}
        <a class="li" href="/superviseur/valider?caisse={c.id}" onclick={va(`/superviseur/valider?caisse=${c.id}`)}>
          <span class="av sm" aria-hidden="true">{a?.prenom[0]}{a?.nom[0]}</span>
          <span class="col grow"><span class="t14 b7">{a?.prenom} · guichet {numeroGuichet(app.monde, c.gareId, c.agentId)}</span><span class="t12 mut">{c.fermeeA ? `fermée ${quand(c.fermeeA, horloge.t).replace('Aujourd’hui · ', 'à ').replace("Aujourd'hui · ", 'à ').replace('Hier · ', 'hier ')}` : ''} · {fcfa(c.attendu ?? 0)} F attendus</span></span>
          <span class="pl {(c.ecart ?? 0) === 0 ? 'ok' : Math.abs(c.ecart ?? 0) <= SEUIL_ECART_SUPERVISEUR ? 'wa' : 'er'}">{(c.ecart ?? 0) === 0 ? 'juste' : `${fcfaSigne(c.ecart ?? 0)} F`}</span>
        </a>
      {:else}
        <div class="center" style="padding: 24px 0"><span class="ill ok"><Icone nom="ok" taille={60} trait={1.8} /></span><span class="t16 b7">Aucune clôture à valider</span><span class="t13 mut">Les caisses fermées par les guichets apparaissent ici.</span></div>
      {/each}
    </div>
    <a class="b p" style="margin-top: auto" href="/superviseur" onclick={va('/superviseur')}>Retour à la gare</a>

  {:else if !permis}
    <div class="gl erc t14" role="alert">Cette caisse n’est pas dans ta gare.</div>
  {:else if fait || caisse.statut === 'validee'}
    <div class="center" style="flex: none"><span class="ill ok"><Icone nom="ok" taille={60} trait={1.8} /></span>
      <span class="t16 b7">Clôture validée{ecart !== 0 ? ` · écart ${fcfaSigne(ecart)} F imputé à ${agent?.prenom}` : ' · caisse juste'}</span>
      <span class="t13 mut">{agent?.prenom} est prévenu(e) · journalisé{caisse.validePar && caisse.validePar !== moi?.id ? ` · validé par ${personne(caisse.validePar)?.prenom}` : ''}</span></div>
    <div class="col g8" style="margin-top: auto"><a class="b p" href="/rapport-soir" onclick={va('/rapport-soir')}>Voir le rapport du soir</a><a class="b g" href="/superviseur" onclick={va('/superviseur')}>Retour à la gare</a></div>
  {:else if caisse.statut !== 'fermee'}
    <div class="gl t14" role="status">Cette caisse est {caisse.statut === 'ouverte' ? 'ouverte (recomptage en cours ou journée en cours)' : 'bloquée'} : rien à valider pour l’instant.</div>
    <a class="b p" style="margin-top: auto" href="/superviseur" onclick={va('/superviseur')}>Retour à la gare</a>
  {:else}
    <div class="gl col" style="gap: 0">
      <div class="li kv"><span class="t14">Attendu espèces</span><span class="mono b7">{fcfa(attendu)} F</span></div>
      <div class="li kv"><span class="t14">Compté par {agent?.prenom}</span><span class="mono b7">{fcfa(compte)} F</span></div>
      <div class="li kv"><span class="t14 b7">Écart</span><span class="mono b7" class:erc={ecart !== 0} class:okc={ecart === 0}>{ecart === 0 ? '0 F · juste' : `${fcfaSigne(ecart)} F`}</span></div>
      <div class="li kv"><span class="t14">Justification</span><span class="t13 mut">{caisse.justification ? `« ${caisse.justification} »` : 'aucune'}</span></div>
    </div>
    {#if caisse.compte}
      <details class="gl cp"><summary class="t13 b6">Détail du comptage</summary>
        <div class="col" style="gap: 4px; margin-top: 8px">{#each COUPURES as v (v)}{@const n = caisse.compte[v] ?? 0}{#if n}<div class="row sp t13"><span>{n} × {fcfa(v)} F</span><span class="mono">{fcfa(n * v)} F</span></div>{/if}{/each}
          {#each Object.entries(caisse.compte).filter(([v]) => !(COUPURES as readonly number[]).includes(Number(v))) as [v, n] (v)}<div class="row sp t13"><span>{n} × {fcfa(Number(v))} F</span><span class="mono">{fcfa(Number(v) * n)} F</span></div>{/each}</div></details>
    {/if}
    <div class="row g8">
      <div class="gl grow col g4"><span class="lab">Historique {agent?.prenom}</span><span class="t14 b7">{historique} écart{historique > 1 ? 's' : ''} / 90 jours</span><span class="t12" class:okc={fiab.ton === 'ok'} class:wac={fiab.ton === 'wa'} class:erc={fiab.ton === 'er'}>{fiab.texte}</span></div>
      <div class="gl grow col g4"><span class="lab">Règle</span><span class="t14 b7">≤ {fcfa(SEUIL_ECART_SUPERVISEUR)} F</span><span class="t12" class:mut={!attendPatron} class:wac={attendPatron}>{attendPatron ? 'au-delà : le patron valide' : decision === 'patron' ? 'validable par le patron' : 'validable par toi'}</span></div>
    </div>

    {#if attendPatron}
      <div class="toast"><span class="bub aq"><Icone nom="info" taille={18} /></span><span class="t13 grow">Écart de {fcfaSigne(ecart)} F : au-delà de {fcfa(SEUIL_ECART_SUPERVISEUR)} F, seul le patron valide. Demande un recomptage ou transmets-lui la clôture.</span></div>
      {#if erreur}<div class="gl erc t13" role="alert">{erreur}</div>{/if}
      <div class="col g8" style="margin-top: auto">
        <button type="button" class="b p" onclick={transmettre}>Transmettre au patron</button>
        <button type="button" class="b g" onclick={() => (recompter = true)}>Contester · demander un recomptage</button>
      </div>
    {:else}
      <PinPad bind:valeur={pin} {erreur} desactive={scan} />
      {#if faux >= 3}<span class="t12 wac c">Plusieurs PIN faux : utilise ton visage ou demande au patron.</span>{/if}
      <div class="col g8" style="margin-top: auto">
        <button type="button" class="b p" disabled={pin.length !== 4 || scan} onclick={valider}>Valider la clôture{ecart !== 0 ? ` · écart imputé à ${agent?.prenom}` : ''}</button>
        {#if visageOk}<button type="button" class="b s" disabled={scan} onclick={visage}><Icone nom="visage" taille={20} />{scan ? 'Reconnaissance…' : 'Valider avec mon visage'}</button>{/if}
        <button type="button" class="b g" onclick={() => (recompter = true)}>Contester · demander un recomptage</button>
      </div>
    {/if}
    <Feuille bind:ouvert={recompter} titre="Demander un recomptage ?" texte="La caisse de {agent?.prenom} repasse « ouverte » : il recompte puis la ferme de nouveau." confirmer="Demander le recomptage" onconfirmer={recompte}>
      <input class="inp" bind:value={motifRecompte} placeholder="Précise (ex. recompte les billets de 1 000)" aria-label="Précision pour le recomptage" autocomplete="off" />
    </Feuille>
  {/if}
</Mobile>

<style>
  .kv { align-items: baseline; } .kv > :first-child { flex: none; } .kv > :last-child { flex: 1; text-align: right; overflow-wrap: anywhere; }
  .cp summary { cursor: pointer; min-height: 28px; display: flex; align-items: center; }
  .b:disabled { opacity: 0.45; cursor: not-allowed; }
  .inp { outline: none; } .inp:focus { border-color: #3de0ff; }
</style>
