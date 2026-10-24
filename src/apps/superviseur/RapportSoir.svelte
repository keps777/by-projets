<script lang="ts">
  import { app } from '../../data/store.svelte.ts';
  import { param } from '../../router.svelte.ts';
  import { personne, personneCourante } from '../../domain/actions.ts';
  import { construireRapport } from '../../core/gare.ts';
  import { jourDe, jourSemaineCourt } from '../../core/dates.ts';
  import { fcfa, fcfaSigne } from '../../core/money.ts';
  import { evaluerCloture, fmtEvolution, lienWhatsApp, segmentsGras, texteRapport } from '../../core/rapport.ts';
  import { chiffresTel } from '../../core/supervision.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { cloturerGare, envoyerRapport } from './actions.ts';
  import { dockSuperviseur } from './dock.ts';
  import { cleJour, gareSuivie, horloge, lireTranche } from './etat.svelte.ts';
  import Feuille from './Feuille.svelte';
  import { hhmm, va } from './nav.ts';

  const moi = $derived(personneCourante());
  const gareId = $derived(gareSuivie(moi, param('gare')));
  const now = $derived(horloge.t);
  const jour = $derived(jourDe(new Date(now)));
  const rapport = $derived(construireRapport(app.monde, { gareId, jour, now, superviseur: moi?.prenom ?? '' }));
  const texte = $derived(texteRapport(rapport));
  const patron = $derived(app.monde.personnes.find((p) => p.role === 'patron'));
  const lien = $derived(lienWhatsApp(texte, patron ? `237${chiffresTel(patron.tel)}` : undefined));
  const envoye = $derived(lireTranche().rapports[cleJour(gareId, jour)]);
  const cloture = $derived(lireTranche().clotures[cleJour(gareId, jour)]);
  const minutesJour = $derived(new Date(now).getHours() * 60 + new Date(now).getMinutes());
  const regle = $derived(evaluerCloture(minutesJour, !!app.monde.params.regles.cloture));
  const peutPartager = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const maxH = $derived(Math.max(1, ...rapport.parHeure.map((x) => x.ventes)));
  const lignes = $derived([...rapport.guichets, ...(rapport.convoyeurs.billets ? [rapport.convoyeurs] : []), ...(rapport.enLigne.billets ? [rapport.enLigne] : [])]);
  let confirmer = $state(false), erreur = $state('');

  function noter(via: 'whatsapp' | 'partage') {
    if (!moi) return; const r = envoyerRapport(moi.id, rapport, via);
    if (r.ok) { erreur = ''; montrer(via === 'whatsapp' ? 'Rapport ouvert dans WhatsApp' : 'Rapport partagé'); } else erreur = r.erreur;
  }
  async function partager() {
    try { await navigator.share({ title: `Rapport du soir · ${rapport.gareNom}`, text: texte }); noter('partage'); }
    catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) { erreur = 'Le partage a échoué : utilise le bouton WhatsApp.'; } }
  }
  async function copier() {
    try { await navigator.clipboard.writeText(texte); montrer('Texte copié'); } catch { montrer('Copie impossible sur cet appareil', 'er'); }
  }
  function clore() {
    if (!moi) return; const r = cloturerGare(moi.id, gareId); confirmer = false;
    if (r.ok) { erreur = ''; montrer(r.tardive ? `Gare clôturée · le patron est alerté (+${r.retardMin} min)` : 'Gare clôturée', r.tardive ? 'wa' : 'ok'); } else erreur = r.erreur;
  }
  const pasDeVente = $derived(rapport.billets === 0 && rapport.recette === 0);
</script>

<Mobile titre="Rapport du soir" sous="{rapport.gareNom} · {jourSemaineCourt(jour)} · {hhmm(now)}" retourVers="/superviseur" dock={dockSuperviseur('rapport')}>
  {#snippet droite()}<span class="pl {envoye ? 'ok' : 'wa'}">{envoye ? `envoyé ${hhmm(envoye.envoyeLe)}` : 'brouillon'}</span>{/snippet}

  <div class="gl ac row sp">
    <span class="col"><span class="lab">Recette du jour</span><span class="big">{fcfa(rapport.recette)} F</span><span class="t12" class:okc={rapport.evolutionPct !== null && rapport.evolutionPct >= 0} class:wac={rapport.evolutionPct !== null && rapport.evolutionPct < 0} class:mut3={rapport.evolutionPct === null}>{rapport.evolutionPct === null ? 'pas de référence' : `${fmtEvolution(rapport.evolutionPct)} ${rapport.reference}`}</span></span>
    <span class="col" style="align-items: flex-end"><span class="lab">Bus partis</span><span class="ttl t24">{rapport.departs.partis} / {rapport.departs.total}</span><span class="t12 mut">remplissage {rapport.remplissagePct} %</span></span>
  </div>

  <div class="gl">
    <div class="row sp" style="margin-bottom: 8px"><span class="lab">Ventes par heure</span><span class="t12 mut">{rapport.pic ?? 'pas encore de vente'}</span></div>
    <div class="spark" role="img" aria-label="Ventes par heure : {rapport.parHeure.map((x) => `${x.heure} h ${x.ventes}`).join(', ')}">
      {#each rapport.parHeure as x (x.heure)}<i class:hi={x.ventes === maxH && x.ventes > 0} style="height: {Math.max(6, Math.round((x.ventes / maxH) * 100))}%"></i>{/each}
    </div>
    {#if rapport.parHeure.length}<div class="row sp t12 mut3 mono" style="margin-top: 4px"><span>{String(rapport.parHeure[0].heure).padStart(2, '0')} h</span><span>{String(rapport.parHeure[rapport.parHeure.length - 1].heure).padStart(2, '0')} h</span></div>{/if}
  </div>

  {#if lignes.length}
    <div class="gl"><table class="tbl"><thead><tr><th scope="col">Guichet</th><th scope="col" class="r">Billets</th><th scope="col" class="r">Espèces</th><th scope="col" class="r">Écart</th></tr></thead>
      <tbody>{#each lignes as g (g.cle)}<tr><td>{g.libelle}</td><td class="r mono">{g.billets}</td><td class="r mono">{fcfa(g.especes)}</td>
        <td class="r mono" class:erc={g.ecart !== null && g.ecart < 0} class:wac={g.ecart !== null && g.ecart > 0} class:okc={g.ecart === 0} class:mut3={g.ecart === null}>{g.ecart === null ? '—' : g.ecart === 0 ? '0' : fcfaSigne(g.ecart)}</td></tr>{/each}</tbody></table></div>
  {:else}
    <div class="gl t13 mut c">Aucune vente enregistrée aujourd’hui dans cette gare.</div>
  {/if}

  <div class="row g8 wrapf">
    <span class="pl {rapport.caisses.validees ? 'ok' : ''}">{rapport.caisses.validees} validée{rapport.caisses.validees > 1 ? 's' : ''}</span>
    <span class="pl {rapport.caisses.aValider ? 'wa' : ''}">{rapport.caisses.aValider} à valider</span>
    <span class="pl {rapport.caisses.bloquees ? 'er' : ''}">{rapport.caisses.bloquees} bloquée{rapport.caisses.bloquees > 1 ? 's' : ''}</span>
    <span class="pl">{rapport.caisses.ouvertes} ouverte{rapport.caisses.ouvertes > 1 ? 's' : ''}</span>
    <span class="pl">{rapport.colis.envoyes} colis</span>
  </div>

  <span class="lab">Message au patron</span>
  <div class="msg" aria-label="Aperçu du message WhatsApp">{#each texte.split('\n') as ligne, i (i)}<span class="lg">{#each segmentsGras(ligne) as s, j (j)}{#if s.gras}<strong>{s.t}</strong>{:else}{s.t}{/if}{/each}</span>{/each}</div>
  {#if erreur}<div class="gl erc t13" role="alert">{erreur}</div>{/if}
  <div class="col g8">
    <a class="b p" href={lien} target="_blank" rel="noopener noreferrer" onclick={() => noter('whatsapp')}><svg class="ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12l16-8-6 16-3-7z" /></svg>{envoye ? 'Renvoyer sur WhatsApp au patron' : 'Envoyer sur WhatsApp au patron'}</a>
    <div class="row g8">
      {#if peutPartager}<button type="button" class="b s" onclick={partager}>Partager…</button>{/if}
      <button type="button" class="b s" onclick={copier}>Copier le texte</button>
    </div>
    {#if envoye}<span class="t12 okc c" role="status">Envoyé à {hhmm(envoye.envoyeLe)} par {personne(envoye.par)?.prenom} · le patron est prévenu dans l’application.</span>{/if}
  </div>

  <span class="lab">Clôture de la gare</span>
  <div class="gl col" style="gap: 8px">
    {#if cloture}
      <div class="row g12"><span class="bub" style="color: #4ade80"><Icone nom="ok" /></span><span class="col"><span class="t14 b7">Gare clôturée à {hhmm(cloture.ts)}</span><span class="t12 mut">par {personne(cloture.par)?.prenom}{cloture.tardive ? ` · ${cloture.retardMin} min après l’heure limite, patron alerté` : ' · dans les temps'}</span></span></div>
    {:else}
      <div class="row g12"><span class="bub" class:aq={!regle.tardive} style:color={regle.tardive ? '#ffc24b' : undefined}><Icone nom="horloge" /></span>
        <span class="col"><span class="t14 b7">{app.monde.params.regles.cloture ? `Clôture avant ${regle.limite}` : 'Règle de clôture désactivée'}</span>
          <span class="t12" class:wac={regle.tardive} class:mut={!regle.tardive}>{#if !app.monde.params.regles.cloture}Le patron n’exige pas d’heure limite.{:else if regle.tardive}Il est {hhmm(now)} : {regle.retardMin} min de retard, le patron sera alerté.{:else}Il est {hhmm(now)} : le patron est alerté si tu clôtures après {regle.limite}.{/if}</span></span></div>
      {#if rapport.reserves.length}<ul class="res">{#each rapport.reserves as r (r)}<li class="t13 wac">{r}</li>{/each}</ul>{/if}
      <button type="button" class="b {regle.tardive ? 's' : 'p'}" onclick={() => (confirmer = true)}>Clôturer la gare</button>
    {/if}
  </div>
  {#if moi?.role === 'patron'}<a class="b g" href="/patron/gare?gare={gareId}" onclick={va(`/patron/gare?gare=${gareId}`)}>Voir côté patron</a>{/if}
  {#if pasDeVente}<span class="t12 mut3 c">Journée sans vente : le rapport est vide mais peut être envoyé.</span>{/if}

  <Feuille bind:ouvert={confirmer} titre="Clôturer la gare de {rapport.gareNom} ?" texte={`${rapport.reserves.length ? `Réserves : ${rapport.reserves.join(', ')}. ` : ''}${regle.tardive ? `Il est ${hhmm(now)} : le patron sera alerté de cette clôture tardive. ` : ''}Une seule clôture par jour.`} confirmer="Clôturer la gare" onconfirmer={clore} />
</Mobile>

<style>
  .msg { padding: 12px 14px; border-radius: 4px 18px 18px 18px; background: rgba(37, 211, 102, 0.14); border: 1px solid rgba(37, 211, 102, 0.35); font: 500 13px/1.5 'Sora Variable', 'Sora', sans-serif; display: flex; flex-direction: column; }
  .lg { display: block; min-height: 1.5em; overflow-wrap: anywhere; }
  .res { margin: 0; padding-left: 18px; }
  .spark { height: 64px; }
  .b { text-decoration: none; }
</style>
