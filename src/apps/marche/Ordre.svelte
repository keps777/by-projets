<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { fmt, fmtPct } from '../../core/argent.ts';
  import { departDe, taux } from '../../core/regles.ts';
  import { maintenant } from '../../data/store.svelte.ts';
  import { carnetDuVol } from '../../domain/carnet.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { compagnieDe, volDe } from '../../domain/marche.ts';
  import { annulerOrdre, ErreurRevente, expirationOrdre, ordresDe, placerOrdre } from '../../domain/revente.ts';
  import type { Ordre } from '../../domain/types.ts';
  import { reseau } from '../achat/reseau.svelte.ts';
  import Absent from './Absent.svelte';
  import { bornesSeuil, calerSeuil, ecartSeuil, echelle, PAS, probabilite, seuilParDefaut, zoneSeuil, type ValiditeOrdre } from './cours.ts';
  import { heure, jourCourt, jourHeure, jourSemaine } from './format.ts';
  import { naviguer } from './lien.ts';
  import Pic from './Pic.svelte';

  /** Ordre à cours limité : achat automatique si une revente descend au seuil. */
  let { id = '' }: { id?: string } = $props();
  const J = 86_400_000;
  const compte = $derived(compteCourant());
  const vol = $derived(volDe(id));
  const carnet = $derived(carnetDuVol(id));
  const offre = $derived(carnet.meilleureOffre), demande = $derived(carnet.meilleureDemande);
  const bornes = $derived(vol ? bornesSeuil(vol.prixNeuf) : { min: 0, max: 0 });
  let choisi = $state<number | undefined>();
  let validite = $state<ValiditeOrdre>('semaine');
  const seuil = $derived(vol ? (choisi !== undefined ? calerSeuil(choisi, bornes) : seuilParDefaut(offre, vol.prixNeuf)) : 0);
  let erreur = $state(''), resultat = $state<Ordre | undefined>(), annule = $state('');
  const depart = $derived(vol ? departDe(vol.jour, vol.heureDepart) : 0);
  const possible = $derived(depart - 2 * J > maintenant() + 3_600_000);
  const diff = $derived(ecartSeuil(seuil, offre)), zone = $derived(zoneSeuil(seuil, offre, demande));
  const ech = $derived(echelle(seuil, offre, demande)), prob = $derived(vol ? probabilite(seuil, offre, vol.prixNeuf, validite) : { pct: 0, niveau: 'Faible' as const });
  const expire = (v: ValiditeOrdre): number => (vol ? expirationOrdre(v, maintenant(), vol) : 0);
  const choixValidite: { cle: ValiditeOrdre; titre: string }[] = [{ cle: 'jour', titre: '24 h' }, { cle: 'semaine', titre: '7 jours' }, { cle: 'depart', titre: 'Jusqu’à J-2' }];
  const recapValidite = $derived(validite === 'jour' ? `24 h · jusqu’au ${jourHeure(expire('jour'))}` : validite === 'semaine' ? `7 jours · jusqu’au ${jourHeure(expire('semaine'))}` : `Jusqu’à J-2 · ${jourHeure(expire('depart'))}`);
  const mesOrdres = $derived(ordresDe(compte?.id ?? '').filter((o) => o.volId === id && o.statut === 'actif'));
  const tauxLabel = $derived(fmtPct(taux(!!compte?.pass.actif) * 100).replace('+', ''));
  const arc = Math.PI * 62;
  const position = (v: number) => `${Math.min(100, Math.max(0, ech.pos(v))).toFixed(2)}%`;

  function monter(delta: number) { choisi = calerSeuil(seuil + delta, bornes); }
  function bouton(e: Event, f: () => void) { e.preventDefault(); f(); }
  function placer() {
    erreur = ''; if (!compte || !vol) return;
    if (!reseau.enLigne) { erreur = 'Vous êtes hors ligne : l’ordre sera possible dès que la connexion revient.'; return; }
    try { resultat = placerOrdre(compte.id, vol.id, seuil, validite); } catch (e) { erreur = e instanceof ErreurRevente ? e.message : 'Impossible de placer l’ordre pour l’instant.'; }
  }
  function annuler(o: Ordre) { if (!compte) return; try { annulerOrdre(o.id, compte.id); annule = `Ordre à ${fmt(o.limite)} annulé.`; } catch (e) { erreur = e instanceof ErreurRevente ? e.message : 'Annulation impossible.'; } }
  const lienIntention = $derived(vol ? `/intention/nouvelle?de=${vol.de}&vers=${vol.vers}&jour=${vol.jour}` : '/intention/nouvelle');
</script>

{#if !id}
  <!-- ancien écran réinstancié brièvement -->
{:else if !vol}
  <Absent titre="Vol introuvable" message="Ce vol n’existe pas ou n’est plus coté." lien="/portefeuille" retour="/portefeuille" />
{:else if !possible}
  <Absent titre="Ordre impossible" message="Il reste moins de deux jours avant ce départ : un ordre à cours limité ne peut plus être placé." details={['Les échanges s’arrêtent à J-1. Vous pouvez encore acheter une annonce existante depuis le cours du vol.']} lien="/cours/{id}" libelleLien="Voir le cours du vol" retour="/cours/{id}" />
{:else}
  {@const cie = compagnieDe(vol)}
  <Ecran titre="Ordre à cours limité" face="nuit" retour="/cours/{id}">
    <section class="intro" aria-label="Vol"><div class="ligne"><span class="trajet">{vol.de} → {vol.vers}</span><span class="t-sec">{cie.nom} {vol.numero.split(' ')[1]} · {jourSemaine(depart)}</span></div>
      <h2 class="titre">Achetez automatiquement si le prix descend à votre seuil</h2></section>

    {#if resultat}
      <section class="carte confirmation" role="status" aria-live="polite" data-testid="confirmation-ordre">
        <span class="rond-ok"><Icone nom="ok" taille={28} trait={2.25} /></span>
        {#if resultat.statut === 'execute'}
          <h2 class="t-section">Ordre exécuté</h2><p>Une revente était déjà à votre seuil : vous détenez ce droit de voyage. Le voyageur se nomme au plus tard à J-1.</p>
          <a class="btn" href="/confirmation/{resultat.droitId}" onclick={(e) => naviguer(e, `/confirmation/${resultat?.droitId}`)}>Voir mon droit</a>
        {:else}
          <h2 class="t-section">Ordre placé à {fmt(resultat.limite)}</h2><p>Si une offre ≤ {fmt(resultat.limite)} apparaît, nous achetons pour vous. Valable {recapValidite.split(' · ')[0].toLowerCase()}. Annulable à tout moment avant exécution.</p>
          <a class="btn" href="/cours/{id}" onclick={(e) => naviguer(e, `/cours/${id}`)}>Retour au cours du vol</a>
        {/if}
        <button type="button" class="btn sec" onclick={() => (resultat = undefined)}>Placer un autre ordre</button>
      </section>
    {:else}
      <section class="seuil" aria-labelledby="seuil-t">
        <p id="seuil-t" class="t-sur">Votre seuil d’achat</p>
        <div class="stepper">
          <button type="button" aria-label="Baisser le seuil de {PAS} $" aria-disabled={seuil <= bornes.min} onclick={(e) => bouton(e, () => monter(-PAS))}><Icone nom="moins" taille={24} trait={2} /></button>
          <output aria-live="polite" class="valeur" data-testid="seuil">{fmt(seuil)}</output>
          <button type="button" aria-label="Monter le seuil de {PAS} $" aria-disabled={seuil >= bornes.max} onclick={(e) => bouton(e, () => monter(PAS))}><Icone nom="plus" taille={24} trait={2} /></button>
        </div>
        <p class="diff" class:baisse={diff.sens === 'baisse'} class:hausse={diff.sens === 'hausse'}>{diff.texte}</p>
        <div class="curseur"><label for="seuil-range">Ajuster le seuil (pas de {PAS} $)</label>
          <input id="seuil-range" type="range" min={bornes.min} max={bornes.max} step={PAS} value={seuil} oninput={(e) => (choisi = Number((e.currentTarget as HTMLInputElement).value))} aria-valuetext={fmt(seuil)} />
          <div class="bornes" aria-hidden="true"><span>{fmt(bornes.min)}</span><span>{fmt(bornes.max)} · plafond</span></div></div>
      </section>

      <section class="repere" aria-labelledby="rep-t"><h3 id="rep-t" class="t-sur">Où se place votre seuil</h3>
        <div class="echelle" aria-hidden="true"><span class="rail"></span>
          {#if offre !== undefined && demande !== undefined}<span class="ecart-b" style="left: {position(demande)}; width: calc({position(offre)} - {position(demande)})"></span>{/if}
          {#if demande !== undefined}<span class="losange" style="left: calc({position(demande)} - 5px)"></span>{/if}
          {#if offre !== undefined}<span class="rond-o" style="left: calc({position(offre)} - 5px)"></span>{/if}
          <span class="ligne-s" style="left: calc({position(seuil)} - 1px)"></span><span class="pin" style="left: calc({position(seuil)} - 7px)"></span></div>
        <div class="bornes dessous" aria-hidden="true"><span>{fmt(ech.lo)}</span><span>{fmt(ech.hi)}</span></div>
        <ul class="legende">
          <li><span class="m-pin" aria-hidden="true"></span><span class="grow">Votre seuil</span><span class="v seuil-v">{fmt(seuil)}</span></li>
          <li><span class="m-rond" aria-hidden="true"></span><span class="grow">Meilleure offre de vente actuelle</span><span class="v">{offre !== undefined ? fmt(offre) : '—'}</span></li>
          <li><span class="m-los" aria-hidden="true"></span><span class="grow">Meilleure demande d’achat</span><span class="v">{demande !== undefined ? fmt(demande) : '—'}</span></li>
        </ul>
        <p class="zone" class:z-imm={zone.zone === 'immediat'} class:z-dem={zone.zone === 'meilleure_demande'} role="status"><Icone nom="info" taille={18} trait={2} /><span>{zone.texte}</span></p>
      </section>

      <section aria-labelledby="val-t" class="validite"><h3 id="val-t" class="t-sur">Validité de l’ordre</h3>
        <div role="group" aria-labelledby="val-t" class="choix">{#each choixValidite as c}
          <button type="button" aria-pressed={validite === c.cle} onclick={() => (validite = c.cle)}><span class="t">{c.titre}</span><span class="s">{jourCourt(expire(c.cle))}</span></button>{/each}</div>
      </section>

      <section class="proba carte" aria-labelledby="prob-t">
        <div class="jauge"><svg role="img" aria-label="Probabilité d’exécution estimée : {prob.pct} %, {prob.niveau.toLowerCase()}" width="150" height="88" viewBox="0 0 150 88"><path d="M 13 80 A 62 62 0 0 1 137 80" fill="none" stroke="#262a33" stroke-width="12" stroke-linecap="round" /><path d="M 13 80 A 62 62 0 0 1 137 80" fill="none" stroke="#62c7ff" stroke-width="12" stroke-linecap="round" stroke-dasharray="{(prob.pct / 100 * arc).toFixed(1)} 400" /></svg><span class="pct" aria-hidden="true">{prob.pct} %</span></div>
        <div class="col g4"><h3 id="prob-t" class="t-sur petit">Probabilité d’exécution (estimation)</h3><span class="niveau">{prob.niveau}</span><span class="t-aide">Calcul simplifié selon l’écart avec la meilleure offre et la durée de validité. Aucune garantie.</span></div>
      </section>

      <section aria-labelledby="pay-t" class="paiement"><h3 id="pay-t" class="t-sur">Quantité et paiement</h3>
        <div class="boite"><div class="ligne-q"><span>Quantité</span><span class="mono">1 billet</span></div>
          <div class="carte-p"><span class="ic"><Icone nom="carteok" taille={20} /></span><span class="grow"><span class="n">Carte de test <span class="mono">•••• 4242</span></span><span class="t-aide">Fictive · pré-autorisée, débitée seulement si l’ordre est exécuté</span></span><span class="test">Test</span></div></div>
        <p class="demo">MODE DÉMO — aucun paiement réel</p>
      </section>

      <section class="recu" aria-labelledby="rec-t"><div class="haut"><div class="entete-r"><h3 id="rec-t">Récapitulatif de l’ordre</h3><span>Achat · cours limité</span></div>
          <div class="route"><span class="code">{vol.de}</span><span class="pointille"></span><Icone nom="avion" taille={20} /><span class="pointille"></span><span class="code">{vol.vers}</span></div>
          <dl><dt>Vol</dt><dd>{cie.nom} {vol.numero.split(' ')[1]} · {jourSemaine(depart)}</dd><dt>Seuil maximal</dt><dd class="mono">{fmt(seuil)}</dd><dt>Quantité</dt><dd class="mono">1</dd><dt>Validité</dt><dd>{recapValidite}</dd><dt>Paiement</dt><dd>Carte de test •••• 4242</dd><dt>Commission</dt><dd>{tauxLabel} sur les reventes (hypothèse, plage 10–20 %)</dd></dl></div>
        <div class="coupe" aria-hidden="true"></div>
        <div class="bas"><p class="fort">Si une offre ≤ seuil apparaît, nous achetons pour vous et vous devenez détenteur. Annulable à tout moment avant exécution.</p><p class="fin">Vous payez le prix de l’offre trouvée, jamais plus que votre seuil. Le droit de voyage est inscrit à votre nom dans le registre NexG-TT ; le voyageur se nomme au plus tard à J-1.</p></div></section>
    {/if}

    {#if erreur}<p class="erreur" role="alert"><Icone nom="alerte" taille={18} trait={2} /><span>{erreur}</span></p>{/if}
    <p class="sr" role="status" aria-live="polite">{annule}</p>
    {#if mesOrdres.length}
      <section aria-labelledby="mes-t" class="mes"><h3 id="mes-t" class="t-sur">Mes ordres actifs sur ce vol</h3>
        <ul>{#each mesOrdres as o (o.id)}<li><span class="grow"><span class="mono lim">{fmt(o.limite)}</span><span class="t-aide">jusqu’au {jourHeure(expirationOrdre(o.validite, o.creeLe, vol))}{o.validite === 'depart' ? ' (J-2)' : ''} · créé à {heure(o.creeLe)}</span></span>
          <button type="button" class="btn sec sm" onclick={() => annuler(o)} aria-label="Annuler l’ordre à {fmt(o.limite)}"><Pic nom="annuler" taille={16} />Annuler</button></li>{/each}</ul></section>
    {/if}
    <p class="t-aide mentions">Prix indicatifs. Un droit de voyage n’est pas un placement financier. Données de démonstration.</p>

    {#snippet pied()}
      {#if !resultat}
        <button type="button" class="btn principal" onclick={placer} disabled={!reseau.enLigne} aria-describedby="pied-aide">Placer l’ordre à <span class="mono">{fmt(seuil)}</span></button>
        <a class="lien" href={lienIntention} onclick={(e) => naviguer(e, lienIntention)}>Ou publiez une intention visible des vendeurs, avec fonds réservés<Icone nom="suivant" taille={16} trait={2} /></a>
        <span id="pied-aide" class="sr">{reseau.enLigne ? '' : 'Hors ligne : connexion requise.'}</span>
      {/if}
    {/snippet}
  </Ecran>
{/if}

<style>
  .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .grow { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .intro { display: flex; flex-direction: column; gap: 10px; } .ligne { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .trajet { font: 600 14px/1 'IBM Plex Mono', ui-monospace, monospace; color: var(--accent); letter-spacing: 0.04em; }
  .titre { font: 600 clamp(26px, 8.2vw, 32px)/1 'Barlow Condensed', 'Arial Narrow', sans-serif; text-transform: uppercase; letter-spacing: 0.01em; text-wrap: balance; }
  .t-sur { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); } .t-sur.petit { letter-spacing: 0.1em; }
  .t-section { text-transform: uppercase; letter-spacing: 0.02em; }
  .seuil { display: flex; flex-direction: column; gap: 14px; padding: 18px; border-radius: 20px; background: #060708; border: 1px solid var(--line); }
  .stepper { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .stepper button { width: clamp(48px, 14vw, 56px); height: clamp(48px, 14vw, 56px); flex: none; border-radius: 14px; background: var(--surface2); border: 1px solid var(--line-strong); color: var(--ink); display: grid; place-items: center; cursor: pointer; } .stepper button[aria-disabled='true'] { opacity: 0.4; cursor: not-allowed; }
  .valeur { flex: 1; text-align: center; font: 600 clamp(26px, 8.6vw, 40px)/56px 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--accent); }
  .diff { text-align: center; font: 600 14px/20px 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink2); } .diff.baisse { color: var(--down); } .diff.hausse { color: var(--up); }
  .curseur { display: flex; flex-direction: column; gap: 2px; } .curseur label { font-size: 13px; font-weight: 500; color: var(--ink2); }
  input[type='range'] { width: 100%; height: 44px; margin: 0; accent-color: var(--accent); cursor: pointer; }
  .bornes { display: flex; justify-content: space-between; font: 11px 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink3); } .bornes.dessous { margin-top: -6px; }
  .repere { display: flex; flex-direction: column; gap: 12px; } .echelle { position: relative; height: 40px; }
  .rail { position: absolute; left: 0; right: 0; top: 17px; height: 6px; border-radius: 3px; background: var(--surface3); } .ecart-b { position: absolute; top: 17px; height: 6px; background: #4a505e; }
  .losange { position: absolute; top: 15px; width: 10px; height: 10px; background: var(--up); transform: rotate(45deg); } .rond-o { position: absolute; top: 15px; width: 10px; height: 10px; border-radius: 999px; background: var(--down); }
  .ligne-s { position: absolute; top: 2px; width: 2px; height: 36px; background: var(--accent); } .pin { position: absolute; top: 0; border-left: 7px solid transparent; border-right: 7px solid transparent; border-top: 9px solid var(--accent); }
  .legende { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; font-size: 14px; } .legende li { display: flex; align-items: center; gap: 10px; } .legende .grow { flex-direction: row; color: var(--ink2); }
  .v { font: 600 14px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .seuil-v { color: var(--accent); }
  .m-pin { border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 9px solid var(--accent); margin: 0 1px; } .m-rond { width: 10px; height: 10px; margin: 0 2px; border-radius: 999px; background: var(--down); } .m-los { width: 9px; height: 9px; margin: 0 2px; background: var(--up); transform: rotate(45deg); }
  .zone { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: 12px; font-size: 13px; font-weight: 600; line-height: 18px; background: var(--surface2); color: var(--ink2); } .zone.z-imm { background: var(--accent-soft); color: var(--accent); } .zone.z-dem { background: rgba(98, 199, 255, 0.12); color: var(--up); } .zone :global(svg) { margin-top: 0; }
  .validite { display: flex; flex-direction: column; gap: 10px; } .choix { display: grid; grid-template-columns: 1fr 1fr 1.35fr; gap: 8px; }
  .choix button { min-height: 58px; padding: 6px 8px; border-radius: 12px; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; background: var(--surface2); color: var(--ink); border: 1px solid var(--line-strong); }
  .choix button[aria-pressed='true'] { background: var(--ink); color: var(--bg); border-color: var(--ink); } .choix .t { font-size: 15px; font-weight: 700; } .choix .s { font-size: 12px; font-weight: 500; color: var(--ink3); } .choix [aria-pressed='true'] .s { color: #555c6b; }
  .proba { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; padding: 16px; } .jauge { position: relative; width: 150px; height: 88px; flex: none; } .jauge svg { display: block; max-width: 100%; }
  .pct { position: absolute; left: 0; right: 0; bottom: 4px; text-align: center; font: 600 26px 'IBM Plex Mono', ui-monospace, monospace; white-space: nowrap; } .niveau { font: 600 24px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; color: var(--up); }
  .col { display: flex; flex-direction: column; min-width: 0; } .g4 { gap: 4px; }
  .paiement { display: flex; flex-direction: column; gap: 10px; } .boite { display: flex; flex-direction: column; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); }
  .ligne-q { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 52px; padding: 0 16px; border-bottom: 1px solid var(--line); color: var(--ink2); } .ligne-q .mono { color: var(--ink); font-weight: 600; }
  .carte-p { display: flex; align-items: center; gap: 12px; min-height: 64px; padding: 10px 16px; } .ic { width: 40px; height: 40px; flex: none; border-radius: 10px; background: var(--surface2); border: 1px solid var(--line-strong); display: grid; place-items: center; color: var(--ink2); } .n { font-size: 15px; font-weight: 600; }
  .test { height: 24px; padding: 0 8px; border-radius: 999px; background: var(--surface3); color: var(--ink2); font: 700 11px/24px 'Barlow', sans-serif; letter-spacing: 0.08em; text-transform: uppercase; }
  .demo { background: rgba(98, 199, 255, 0.12); border: 1px solid rgba(98, 199, 255, 0.4); color: var(--up); border-radius: 12px; padding: 10px 12px; font-size: 13px; font-weight: 600; }
  .recu { position: relative; border-radius: 18px; background: #fff; color: #121418; } .haut { padding: 18px 18px 16px; display: flex; flex-direction: column; gap: 12px; } .entete-r { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .entete-r h3 { font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #555c6b; } .entete-r span { font-size: 12px; font-weight: 600; color: #555c6b; }
  .route { display: flex; align-items: center; gap: 10px; } .code { font: 700 clamp(32px, 10vw, 40px)/1 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; } .pointille { flex: 1; border-top: 2px dotted #c9cdd5; }
  dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 8px 12px; font-size: 14px; } dt { color: #555c6b; } dd { margin: 0; text-align: right; font-weight: 600; } dd.mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
  .coupe { position: relative; border-top: 2px dashed #e2e4e9; } .coupe::before, .coupe::after { content: ''; position: absolute; top: -12px; width: 22px; height: 22px; border-radius: 999px; background: var(--bg); } .coupe::before { left: -11px; } .coupe::after { right: -11px; }
  .bas { padding: 14px 18px 18px; display: flex; flex-direction: column; gap: 10px; } .fort { font-size: 14px; line-height: 20px; font-weight: 500; } .fin { font-size: 12px; line-height: 17px; color: #555c6b; }
  .mes { display: flex; flex-direction: column; gap: 10px; } .mes ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
  .mes li { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); } .lim { font-weight: 600; font-size: 18px; }
  .erreur { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 12px; background: var(--err-soft); color: var(--err); font-size: 14px; font-weight: 600; } .mentions { font-size: 12px; line-height: 17px; }
  .confirmation { display: flex; flex-direction: column; gap: 12px; align-items: stretch; } .rond-ok { width: 56px; height: 56px; border-radius: 999px; display: grid; place-items: center; background: var(--ok-soft); color: var(--ok); }
  .principal { width: 100%; height: 52px; border-radius: 14px; white-space: nowrap; } .lien { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; padding: 0 8px; border-radius: 12px; color: var(--accent); font-size: 14px; font-weight: 600; text-align: center; }
</style>
