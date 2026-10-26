<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Picto from './Picto.svelte';
  import Etiquette from './Etiquette.svelte';
  import Rail from './Rail.svelte';
  import { aller, param } from '../../router.svelte.ts';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { fmt } from '../../core/argent.ts';
  import { peutEchanger } from '../../core/regles.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { compagnieDe, departDuVol, volDe } from '../../domain/marche.ts';
  import { DIMENSION_MAX_CM, KG_BAGAGE, etiquettes, numeroVol, plafondBagage, resumeFranchise } from '../bagages/soute.ts';
  import { heure, instantJourMois, jourMois, pluriel, pourcent } from '../bagages/format.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { reseau } from '../acces/reseau.svelte.ts';
  import { TAUX_AFFICHES, bornesPrix, caler, ecartPlafond, lectureDemande, netVente, prixVenteSuggere, rangOffre } from './calcul.ts';
  import { demandesOuvertes, echeanceNommage, offresDuVol } from './lecture.ts';
  import { ErreurBagage, bagageRevendable, droitPourVente, mettreEnVenteBagage, retirerAnnonceBagage } from './actions.ts';

  /** Revendre mon bagage inutilisé (face nuit, planche m2-17). `?droit=` : la réservation ; sinon la première qui a un bagage à revendre. */
  const compte = $derived(compteCourant());
  const droit = $derived(compte ? droitPourVente(compte.id, param('droit')) : undefined);
  const vol = $derived(droit ? volDe(droit.volId) : undefined);
  const cie = $derived(vol ? compagnieDe(vol) : undefined);
  const ville = $derived(app.monde.aeroports.find((a) => a.code === vol?.vers)?.ville ?? vol?.vers ?? '');
  const plafond = $derived(vol ? plafondBagage(vol) : 150);
  const bornes = $derived(bornesPrix(plafond));
  const etat = $derived(compte && vol ? bagageRevendable(compte.id, vol.id) : { bagage: undefined, enVente: false, vendus: 0 });
  const ouvert = $derived(vol ? peutEchanger(departDuVol(vol), maintenant()) : false);
  const resume = $derived(droit ? resumeFranchise(etiquettes(droit)) : undefined);
  const autres = $derived(vol && compte ? offresDuVol(vol.id).filter((b) => b.detenteurId !== compte.id).map((b) => b.prix) : []);
  const demandes = $derived(vol && compte ? demandesOuvertes(vol.id).filter((d) => d.compteId !== compte.id) : []);
  const prixDemandes = $derived(demandes.map((d) => d.prixMax));
  const meilleureDemande = $derived(prixDemandes.length ? Math.max(...prixDemandes) : undefined);
  const passagers = $derived(new Set(demandes.map((d) => d.compteId)).size);

  let saisi = $state<number | null>(null), erreur = $state(''), occupe = $state(false);
  const initial = $derived(etat.bagage?.statut === 'en_vente' ? caler(etat.bagage.prix, plafond) : prixVenteSuggere(autres, plafond));
  const prix = $derived(saisi ?? initial);
  const sous = $derived(ecartPlafond(prix, plafond));
  const calc = $derived(netVente(prix, !!compte?.pass.actif));
  const rang = $derived(rangOffre(prix, autres));
  const lecture = $derived(lectureDemande(prix, meilleureDemande));
  const restants = $derived(droit ? Math.max(0, droit.bagagesInclus - etat.vendus - 1) : 0);
  const modifie = $derived(etat.enVente && prix !== etat.bagage?.prix);
  const peutAgir = $derived(!!etat.bagage && ouvert && reseau.enLigne && !occupe);
  const fixe = (n: number) => String(n).replace('.', ',');
  const ariaRail = $derived(`Votre prix ${fmt(prix)} parmi ${pluriel(autres.length, 'bagage proposé', 'bagages proposés')}${autres.length ? ` de ${fmt(Math.min(...autres))} à ${fmt(Math.max(...autres))}` : ''} et ${pluriel(demandes.length, 'demande')}${demandes.length ? ` de ${fmt(Math.min(...prixDemandes))} à ${fmt(Math.max(...prixDemandes))}` : ''}, plafond ${fmt(plafond)}. Votre offre serait la ${rang.libelle}.`);

  function valider() {
    if (!compte || !droit || !peutAgir) return; erreur = ''; occupe = true;
    try { const dejaVente = etat.enVente; mettreEnVenteBagage(compte.id, droit.id, prix); saisi = null; montrer(dejaVente ? `Prix modifié : ${fmt(prix)}` : `Bagage mis en vente à ${fmt(prix)}`); }
    catch (e) { erreur = e instanceof ErreurBagage ? e.message : 'La mise en vente a échoué. Réessayez.'; } finally { occupe = false; }
  }
  function retirer() {
    if (!compte || !etat.bagage || occupe) return; erreur = '';
    try { retirerAnnonceBagage(compte.id, etat.bagage.id); saisi = null; montrer('Annonce retirée : le bagage reste dans votre franchise'); } catch (e) { erreur = e instanceof ErreurBagage ? e.message : 'Impossible de retirer l’annonce.'; }
  }
  const nom = $derived(compte ? `${compte.prenom} ${compte.nom[0] ?? ''}.` : '');
  const num = $derived(vol ? numeroVol(vol) : '');
  const jourMaj = $derived(vol ? jourMois(vol.jour).replace('.', '').toUpperCase() : '');
  const codeBarre = $derived(vol ? `NXG ${num} ${vol.jour.slice(8)}${vol.jour.slice(5, 7)} B${droit?.bagagesInclus ?? 2}` : '');
  const retourVers = $derived(droit ? `/bagages?droit=${encodeURIComponent(droit.id)}` : '/bagages');
  const q = $derived(droit ? `?droit=${encodeURIComponent(droit.id)}` : '');
</script>

{#snippet pied()}
  <div class="barre-pied">
  <p class="net-ligne"><span>Vous recevez <span class="mono clair">{fmt(calc.net)}</span></span><span>Commission {pourcent(TAUX_AFFICHES.pass)} (Pass) · {pourcent(TAUX_AFFICHES.sansPass)} sans Pass</span></p>
  <button type="button" class="btn" aria-disabled={!peutAgir || (etat.enVente && !modifie) ? 'true' : undefined} onclick={() => { if (!(etat.enVente && !modifie)) valider(); }}>
    <Picto nom="etiquette" taille={20} />{etat.enVente ? (modifie ? 'Modifier le prix à' : 'En vente à') : 'Mettre en vente à'} <span class="mono">{fmt(prix)}</span>
  </button>
  </div>
{/snippet}

<Ecran titre="Revendre mon bagage inutilisé" face="nuit" retour={retourVers} pied={compte && droit && vol && etat.bagage && ouvert ? pied : undefined}>
  {#if !compte || !droit || !vol || !cie}
    <section class="vide carte" aria-live="polite">
      <span class="rond" aria-hidden="true"><Picto nom="valise" taille={26} /></span>
      <h2 class="t-section">Aucun voyage à venir</h2>
      <p class="t-sec">Vous pouvez revendre un bagage inutilisé dès que vous détenez un droit de voyage.</p>
      <button type="button" class="btn sec" onclick={() => aller('/portefeuille')}>Voir mon portefeuille</button>
    </section>
  {:else}
    <Etiquette titre="Droit de bagage · soute" reference={droit.ref} iata={vol.vers} {ville} trajet="{vol.de} → {vol.vers}" ligne="{vol.numero} · {jourMaj}" bas={codeBarre}
      aria="Étiquette du droit de bagage : {vol.de} vers {ville} {vol.vers}, vol {vol.numero} du {jourMois(vol.jour)}, {KG_BAGAGE} kg">
      {#snippet pastilles()}<span class="kg mono">{KG_BAGAGE} KG</span><span class="pc">1 pièce · {DIMENSION_MAX_CM} cm</span>{/snippet}
    </Etiquette>

    <section class="franchise" aria-labelledby="fr-h">
      <span class="mini" aria-hidden="true"><span class="u"><Picto nom="valise" taille={16} trait={2.25} /></span><span class="o">$<i></i></span></span>
      <div><h2 id="fr-h" class="fr-t">Votre franchise : {pluriel(droit.bagagesInclus, 'bagage inclus', 'bagages inclus')}</h2>
        <p class="t-sec"><span class="mono clair">{resume?.utilises ?? 0}</span> utilisé{(resume?.utilises ?? 0) > 1 ? 's' : ''} · <span class="mono down">{(resume?.libres ?? 0)}</span> inutilisé{(resume?.libres ?? 0) > 1 ? 's' : ''}, {etat.enVente ? 'en vente' : 'à revendre'} (hypothèse démo)</p></div>
    </section>

    {#if !ouvert}
      <p class="alerte" role="alert"><Picto nom="alerte" taille={20} /><span><strong>L’échéance de nommage est passée.</strong> Plus aucun bagage ne peut être mis en vente sur ce vol.</span></p>
    {:else if !etat.bagage}
      <section class="vide carte" aria-live="polite">
        <span class="rond" aria-hidden="true"><Picto nom="valise" taille={26} /></span>
        <h2 class="t-section">Aucun bagage inutilisé à revendre</h2>
        <p class="t-sec">{etat.vendus ? 'Votre bagage inutilisé est déjà vendu à un autre passager du vol.' : 'Vos bagages inclus sont tous utilisés : seul un droit de bagage libre peut se revendre.'}</p>
        <button type="button" class="btn sec" onclick={() => aller(`/soute/${vol.id}`)}>Voir la soute du vol {num}</button>
      </section>
    {:else}
      {#if etat.enVente}<p class="en-vente" role="status"><Picto nom="ok" taille={18} trait={2.25} /><span>Votre bagage est en vente à <span class="mono">{fmt(etat.bagage.prix)}</span>. <a href="/soute/{vol.id}" onclick={(e) => { e.preventDefault(); aller(`/soute/${vol.id}`); }}>Voir la soute du vol</a></span></p>{/if}

      <div class="prix-bloc">
        <label id="prix-l" for="prix" class="sur">Votre prix de vente</label>
        <p class="gros mono" aria-hidden="true">{fmt(prix)}</p>
        {#if sous.auPlafond}<p class="plaf"><Picto nom="cadenas" taille={14} />Au plafond : égal au prix compagnie</p>
        {:else}<p class="t-sec"><span class="mono clair">−{fmt(sous.sous)}</span> sous le prix compagnie d’un bagage supplémentaire ({fmt(plafond)})</p>{/if}
        <input id="prix" type="range" min={bornes.min} max={bornes.max} step={bornes.pas} value={prix} aria-valuetext={fmt(prix)} aria-describedby="prix-regle" oninput={(e) => { saisi = caler(Number(e.currentTarget.value), plafond); erreur = ''; }} />
        <div class="bornes mono" aria-hidden="true"><span>{bornes.min}&nbsp;$</span><span>Plafond {fmt(plafond)}</span></div>
        <p id="prix-regle" class="regle">Plafond = prix de la compagnie pour un bagage supplémentaire sur ce vol ({fmt(plafond)}, exemple). Règle provisoire, à valider.</p>
      </div>

      <section class="direct" aria-labelledby="dem-h">
        <div class="direct-t"><span class="pouls" aria-hidden="true"></span><h2 id="dem-h" class="sur">En direct · demande sur ce vol</h2></div>
        {#if demandes.length}
          <p class="phrase"><span class="mono up">{passagers}</span> {passagers > 1 ? 'passagers cherchent' : 'passager cherche'} un bagage · meilleure demande <span class="mono up nowrap">{fmt(meilleureDemande!)}</span></p>
        {:else}<p class="phrase">Aucun passager ne cherche de bagage sur ce vol pour l’instant.</p>{/if}
        <Rail {plafond} offres={autres} demandes={prixDemandes} moi={prix} aria={ariaRail} />
        <p class="rang"><span class="t-sec">Position dans le carnet</span><span class="jaune">{rang.libelle}</span></p>
        {#if lecture.genre === 'correspond'}
          <p class="note ok"><Picto nom="ok" taille={16} trait={2.25} /><span>Une demande à {fmt(meilleureDemande!)} correspond à votre prix : appariement possible dès la mise en vente, à confirmer par la compagnie.</span></p>
        {:else if lecture.genre === 'attend'}
          <p class="note"><Picto nom="info" taille={16} /><span><span class="mono clair">+{fmt(lecture.ecart)}</span> au-dessus de la meilleure demande : votre bagage attend un acheteur. Aucune vente n’est garantie.</span></p>
        {:else}
          <p class="note"><Picto nom="info" taille={16} /><span>Aucune demande pour l’instant : votre bagage attend un acheteur. Aucune vente n’est garantie.</span></p>
        {/if}
      </section>

      <section class="calc" aria-labelledby="calc-h">
        <h2 id="calc-h" class="t-h">Ce que vous recevez</h2>
        <dl>
          <div class="l1"><dt>Prix de vente</dt><dd class="mono">{fmt(prix)}</dd></div>
          <div class="l2"><dt>Commission NexG-TT (hypothèse)<span class="mono sd">{pourcent(TAUX_AFFICHES.pass)} (Pass) · {pourcent(TAUX_AFFICHES.sansPass)} sans Pass</span></dt><dd class="mono">{calc.commission === 0 ? fmt(0) : `−${fmt(calc.commission)}`}</dd></div>
          <div class="l3"><dt>Vous recevez</dt><dd class="mono">{fmt(calc.net)}</dd></div>
        </dl>
        <p class="autre"><span>{calc.pass ? `Sans Pass (commission ${pourcent(calc.autreTaux)}), vous recevriez` : `Avec Pass (commission ${pourcent(calc.autreTaux)}), vous recevriez`}</span><span class="mono clair">{fmt(calc.autreNet)}</span></p>
        <p class="aide">Taux hypothétiques, prélevés seulement si la vente a lieu. {nom} {calc.pass ? 'est membre Pass : le taux membre s’applique.' : `n’est pas membre Pass : le taux de ${pourcent(calc.taux)} s’applique.`}</p>
      </section>

      <p class="echeance"><Picto nom="horloge" taille={18} /><span>Transfert possible jusqu’au <span class="mono">{instantJourMois(echeanceNommage(vol))} {heure(echeanceNommage(vol))}</span> (à valider). Même vol uniquement : {vol.numero} du {jourMois(vol.jour)}</span></p>
      <div class="reserve" role="note">
        <Picto nom="alerte" taille={20} />
        <div><p class="r1">Une fois vendu, ce bagage est retiré de votre réservation.</p><p class="r2">Il vous restera {pluriel(restants, 'bagage inclus', 'bagages inclus')} ({KG_BAGAGE}&nbsp;kg) sur ce vol. L’acheteur l’ajoute à sa réservation après confirmation de la compagnie.</p></div>
      </div>
      <p class="reserve-compagnie">Transfert sous réserve d’accord de la compagnie (hypothèse).</p>

      {#if !reseau.enLigne}<p class="alerte" role="alert"><Picto nom="alerte" taille={20} /><span>Vous êtes hors ligne : la mise en vente attend le retour du réseau.</span></p>{/if}
      <div aria-live="polite">{#if erreur}<p class="alerte" role="alert"><Picto nom="alerte" taille={20} /><span>{erreur}</span></p>{/if}</div>
      {#if etat.enVente}<button type="button" class="btn sec retrait" onclick={retirer}><Picto nom="croix" taille={18} />Retirer l’annonce</button>{/if}
    {/if}
    <p class="aide centre">Prix indicatifs. Un droit de bagage n’est pas un placement financier. Sous réserve d’accord avec la compagnie. Données de démonstration.</p>
  {/if}
</Ecran>

<style>
  .barre-pied { display: flex; flex-direction: column; gap: 8px; margin: -12px -20px calc(-12px - env(safe-area-inset-bottom)); padding: 12px 20px calc(12px + env(safe-area-inset-bottom)); background: var(--bg); border-top: 1px solid var(--line); }
  .clair { color: var(--ink); } .down { color: var(--down); } .up { color: var(--up); } .jaune { color: var(--signal); font-weight: 700; text-align: right; } .nowrap { white-space: nowrap; }
  .mono { font-weight: 600; font-variant-numeric: tabular-nums; } .centre { text-align: center; } .aide { font: 400 12px/17px 'Barlow', sans-serif; color: var(--ink3); }
  .sur { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: .12em; text-transform: uppercase; color: var(--ink2); } .t-h { font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: .04em; text-transform: uppercase; }
  .vide { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px; padding: 28px 20px; } .rond { width: 56px; height: 56px; border-radius: 999px; display: grid; place-items: center; background: var(--surface2); color: var(--ink2); }
  .kg { display: inline-flex; align-items: center; height: 30px; padding: 0 10px; border-radius: 6px; border: 2px solid #121418; font-size: 16px; } .pc { font: 600 12px/16px 'Barlow', sans-serif; letter-spacing: .06em; text-transform: uppercase; color: #555C6B; }
  .franchise { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); }
  .mini { display: flex; gap: 4px; flex: none; } .mini > span { width: 30px; height: 30px; border-radius: 6px; display: flex; align-items: center; justify-content: center; position: relative; }
  .mini .u { background: var(--line-strong); color: var(--ink2); } .mini .o { background: rgba(255, 158, 94, .12); border: 2px solid var(--down); color: var(--down); font: 600 11px/1 'IBM Plex Mono', monospace; } .mini .o i { position: absolute; left: 3px; top: 3px; width: 5px; height: 5px; border-radius: 999px; border: 1px solid currentColor; }
  .fr-t { font: 700 14px/20px 'Barlow', sans-serif; }
  .prix-bloc { display: flex; flex-direction: column; gap: 8px; padding: 18px; border-radius: 20px; background: #060708; border: 1px solid var(--line); }
  .gros { font-weight: 600; font-size: clamp(48px, min(18.5vw, 8.5dvh), 72px); line-height: 1.06; letter-spacing: -.03em; white-space: nowrap; } .plaf { display: flex; align-items: center; gap: 6px; font: 600 13px/18px 'Barlow', sans-serif; color: var(--signal); }
  input[type='range'] { width: 100%; height: 44px; margin: 4px 0 0; accent-color: var(--signal); cursor: pointer; } .bornes { display: flex; justify-content: space-between; font-size: 12px; font-weight: 400; color: var(--ink3); }
  .regle { margin-top: 4px; padding-top: 10px; border-top: 1px solid #1A1C21; font: 400 12px/17px 'Barlow', sans-serif; color: var(--ink3); }
  .direct, .calc { display: flex; flex-direction: column; gap: 12px; padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); } .calc { gap: 14px; }
  .direct-t { display: flex; align-items: center; gap: 8px; } .pouls { width: 8px; height: 8px; flex: none; border-radius: 999px; background: var(--up); animation: nx-pulse 1.6s ease-in-out infinite; }
  .phrase { font: 600 16px/22px 'Barlow', sans-serif; } .rang { display: flex; align-items: center; justify-content: space-between; gap: 12px; font: 400 14px/20px 'Barlow', sans-serif; }
  .note { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border-radius: 12px; background: var(--surface2); color: var(--ink2); font: 400 13px/18px 'Barlow', sans-serif; } .note > :global(svg) { margin-top: 1px; } .note.ok { background: var(--ok-soft); color: var(--ok); font-weight: 600; }
  dl { margin: 0; display: flex; flex-direction: column; } dl > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; } dt { display: flex; flex-direction: column; font: 400 14px/20px 'Barlow', sans-serif; color: var(--ink2); } dd { margin: 0; font-size: 15px; }
  .l1 { min-height: 40px; border-bottom: 1px solid var(--line); } .l2 { min-height: 48px; border-bottom: 1px solid var(--line); } .sd { font-size: 12px; font-weight: 400; color: var(--ink3); }
  .l3 { min-height: 56px; } .l3 dt { font: 700 16px/22px 'Barlow', sans-serif; color: var(--ink); } .l3 dd { font-size: 28px; }
  .autre { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border-radius: 12px; background: var(--surface2); font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); } .autre .mono { flex: none; font-size: 15px; }
  .echeance { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: 12px; background: rgba(255, 210, 63, .12); color: var(--signal); font: 600 13px/18px 'Barlow', sans-serif; } .echeance > :global(svg), .reserve > :global(svg), .alerte > :global(svg) { flex: none; margin-top: 1px; }
  .reserve { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 14px; background: rgba(255, 158, 94, .12); border: 1px solid rgba(255, 158, 94, .45); color: var(--down); } .r1 { font: 700 15px/20px 'Barlow', sans-serif; } .r2 { margin-top: 4px; font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink); }
  .reserve-compagnie { font: 600 13px/18px 'Barlow', sans-serif; color: var(--ink2); text-align: center; }
  .alerte { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: 12px; background: var(--err-soft); color: var(--err); font: 600 13px/18px 'Barlow', sans-serif; }
  .en-vente { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: 12px; background: var(--ok-soft); color: var(--ok); font: 600 13px/18px 'Barlow', sans-serif; } .en-vente a { color: var(--accent); text-decoration: underline; } .en-vente > :global(svg) { flex: none; margin-top: 1px; }
  .retrait { width: 100%; }
  .net-ligne { display: flex; align-items: center; justify-content: space-between; gap: 8px; font: 400 12px/16px 'Barlow', sans-serif; color: var(--ink2); } .net-ligne > span:last-child { text-align: right; }
</style>
