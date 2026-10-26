<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Picto from './Picto.svelte';
  import MemeVol from './MemeVol.svelte';
  import { aller } from '../../router.svelte.ts';
  import { maintenant } from '../../data/store.svelte.ts';
  import { fmt } from '../../core/argent.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { DIMENSION_MAX_CM, KG_BAGAGE } from '../bagages/soute.ts';
  import { heure, instantJourMois, jourMois, pluriel } from '../bagages/format.ts';
  import { reseau } from '../acces/reseau.svelte.ts';
  import { appariement, ecartComptoir, libelleVariation, positionCase, type GenreCase } from './calcul.ts';
  import { droitSurVol, echeanceNommage, marcheSoute, type OffreCarte } from './lecture.ts';
  import { mesDemandes } from './actions.ts';

  /** Soute du vol (face nuit, planche m2-16) : le marché des droits de bagage d'un vol, du point de vue de `compte`. Aucune écriture ici. */
  let { volId = '' }: { volId?: string } = $props();
  const compte = $derived(compteCourant());
  const m = $derived(marcheSoute(volId, compte?.id));
  const droit = $derived(compte ? droitSurVol(compte.id, volId) : undefined);
  const mienne = $derived(m?.offres.find((o) => o.mienne));
  const q = $derived(droit ? `?droit=${encodeURIComponent(droit.id)}` : '');
  const quand = $derived(m ? `${m.vol.numero} · ${jourMois(m.vol.jour)} ${m.vol.heureDepart}` : '');
  const echeance = $derived(m ? `${instantJourMois(echeanceNommage(m.vol))} ${heure(echeanceNommage(m.vol))}` : '');
  const mesDem = $derived(compte && m ? mesDemandes(compte.id, volId) : []);

  // Sélection : par défaut la meilleure offre (la moins chère) ; `null` = rien de sélectionné (le visiteur a désélectionné).
  let choix = $state<string | null | undefined>(undefined);
  const meilleure = $derived(m?.carnet.find((l) => l.meilleure)?.offre);
  const sel = $derived<OffreCarte | undefined>(choix === null ? undefined : (m?.offres.find((o) => o.id === (choix ?? meilleure?.id))));
  const basculer = (o: OffreCarte) => { choix = sel?.id === o.id ? null : o.id; };
  const ecart = $derived(sel && m ? ecartComptoir(sel.prix, m.plafond) : undefined);
  const appar = $derived(m ? appariement(m.offreMin, m.demandeMax) : undefined);

  // Schéma de la soute : 350 × 606 px de dessin, mis à l'échelle sur les petits écrans.
  let largeur = $state(350);
  const echelle = $derived(Math.min(1, (largeur || 350) / 350));
  const cases = $derived(m ? m.disposition.flatMap((g, i) => (g === 'O' ? [] : [{ g, i }])) : []);
  const NOMS: Record<Exclude<GenreCase, 'O'>, string> = { U: 'bagage inclus, utilisé', B: 'bagage acheté en revente', L: 'libre, vendu par la compagnie' };
  const code = (i: number) => (i < 12 ? 'AV-' : 'AR-') + ((i % 12) + 1);
  const retourVers = $derived(droit ? `/droit/${droit.id}` : '/portefeuille');
</script>

{#snippet piedActions()}
  <div class="actions-bas barre-pied">
    <a class="btn sec" href="/bagages/vendre{q}" onclick={(e) => { e.preventDefault(); aller(`/bagages/vendre${q}`); }}><Picto nom="etiquette" taille={20} />Vendre le mien</a>
    <a class="btn" href="/bagages/ajouter{q}" onclick={(e) => { e.preventDefault(); aller(`/bagages/ajouter${q}`); }}><Picto nom="valise" taille={20} />Acheter un bagage</a>
  </div>
{/snippet}

<Ecran titre={m ? `Soute du vol ${m.vol.numero}` : 'Soute du vol'} face="nuit" retour={retourVers} pied={compte && m && droit ? piedActions : undefined}>
  {#if !compte || !m}
    <section class="vide carte" aria-live="polite">
      <span class="rond" aria-hidden="true"><Picto nom="valise" taille={26} /></span>
      <h2 class="t-section">Vol introuvable</h2>
      <p class="t-sec">Cette soute n’existe pas ou le vol n’est plus au programme.</p>
      <button type="button" class="btn sec" onclick={() => aller('/portefeuille')}>Retour au portefeuille</button>
    </section>
  {:else}
    <MemeVol vol={quand} />
    {#if !reseau.enLigne}<p class="hors" role="alert"><Picto nom="alerte" taille={18} />Vous êtes hors ligne : cette soute date de votre dernière visite.</p>{/if}

    <section class="reperes" aria-label="Repères de prix des bagages">
      <div><span class="lib"><i class="carre"></i>Offre min.</span><span class="mono val down">{m.offreMin !== undefined ? fmt(m.offreMin) : '—'}</span><span class="sous">{m.offres.length ? pluriel(m.offres.length, 'proposé') : 'aucune offre'}</span></div>
      <div><span class="lib"><i class="rond-b"></i>Demande max.</span><span class="mono val up">{m.demandeMax !== undefined ? fmt(m.demandeMax) : '—'}</span><span class="sous">{m.nbDemandes ? pluriel(m.nbDemandes, 'demande') : 'aucune demande'}</span></div>
      <div><span class="lib"><Picto nom="cadenas" taille={12} trait={2.25} />Plafond</span><span class="mono val">{fmt(m.plafond)}</span><span class="sous">Prix compagnie</span></div>
    </section>

    <section class="bloc" aria-labelledby="map-h">
      <div class="titre-ligne"><h2 id="map-h" class="t-h">Carte de la soute</h2><span class="aide">Schéma illustratif</span></div>
      <p class="expl">Chaque case est un droit de bagage de {KG_BAGAGE}&nbsp;kg sur ce vol. Touchez un bagage <strong class="down">proposé</strong> pour voir l’offre.</p>
      <div class="panneau" bind:clientWidth={largeur}>
        <div class="echelle" style:height="{606 * echelle}px">
          <div class="soute" role="group" aria-label="Schéma de la soute, nez de l’avion en haut : 24 emplacements, 12 à l’avant et 12 à l’arrière" style:transform="scale({echelle})" style:left="{Math.max(0, ((largeur || 350) - 350 * echelle) / 2)}px">
            <span class="aile" aria-hidden="true"></span><span class="moteur g" aria-hidden="true"></span><span class="moteur d" aria-hidden="true"></span><span class="empennage" aria-hidden="true"></span>
            <span class="fuselage" aria-hidden="true"></span><span class="cockpit" aria-hidden="true"></span><span class="numero mono" aria-hidden="true">{m.vol.numero}</span><span class="queue" aria-hidden="true"></span>
            <span class="zone z1" aria-hidden="true">Soute avant</span><span class="cadre c1" aria-hidden="true"></span><span class="caisson" aria-hidden="true">Caisson d’aile</span><span class="zone z2" aria-hidden="true">Soute arrière</span><span class="cadre c2" aria-hidden="true"></span>
            {#each cases as c (c.i)}
              <span class="case {c.g}" role="img" aria-label="Emplacement {code(c.i)} : {NOMS[c.g as Exclude<GenreCase, 'O'>]}" style:left="{positionCase(c.i).gauche}px" style:top="{positionCase(c.i).haut}px">
                <Picto nom={c.g === 'U' ? 'valise' : c.g === 'B' ? 'ok' : 'plus'} taille={20} trait={2} />
              </span>
            {/each}
            {#each m.offres.filter((o) => o.case !== undefined) as o (o.id)}
              <button type="button" class="case O" class:choisi={sel?.id === o.id} aria-pressed={sel?.id === o.id} aria-label="Emplacement {o.code} : bagage proposé à {fmt(o.prix)}{o.mienne ? ' (le vôtre)' : ''}" style:left="{positionCase(o.case!).gauche}px" style:top="{positionCase(o.case!).haut}px" onclick={() => basculer(o)}>
                <span class="point" aria-hidden="true"></span>{o.prix}
              </button>
            {/each}
          </div>
        </div>
      </div>
      <ul class="legende" aria-label="Légende de la carte">
        <li><span class="p U" aria-hidden="true"><Picto nom="valise" taille={14} trait={2.25} /></span><span>Inclus, utilisé <b class="mono">{m.compte.U}</b></span></li>
        <li><span class="p O" aria-hidden="true">$<i></i></span><span>Proposé, à toucher <b class="mono">{m.compte.O}</b></span></li>
        <li><span class="p B" aria-hidden="true"><Picto nom="ok" taille={14} trait={2.5} /></span><span>Acheté (revente) <b class="mono">{m.compte.B}</b></span></li>
        <li><span class="p L" aria-hidden="true"><Picto nom="plus" taille={14} trait={2.25} /></span><span>Libre, compagnie <b class="mono">{m.compte.L}</b></span></li>
        <li class="large"><span class="p S" aria-hidden="true"><Picto nom="ok" taille={14} trait={2.5} /></span><span>Bagage sélectionné (fond jaune)</span></li>
      </ul>
    </section>

    <section class="fiche carte2" aria-label="Bagage sélectionné" aria-live="polite">
      {#if sel && ecart}
        <div class="fiche-tete">
          <div><p class="sur">Bagage proposé · <span class="mono clair">{sel.code}</span></p><span class="mono gros">{fmt(sel.prix)}</span></div>
          <button type="button" class="x" aria-label="Retirer la sélection" onclick={() => (choix = null)}><Picto nom="croix" taille={18} /></button>
        </div>
        <p class="t-sec"><span class="mono clair" title="Écart signé au prix compagnie">{ecart.libelle}</span> {ecart.sens === 'moins' ? 'sous' : ecart.sens === 'plus' ? 'au-dessus de' : 'égal à'} le prix compagnie d’un bagage supplémentaire ({fmt(m.plafond)}, exemple)</p>
        <div class="badges">
          {#if sel.mienne}<span class="badge vous"><Picto nom="etiquette" taille={14} />Votre annonce</span>{:else}<span class="badge ok"><Picto nom="bouclier" taille={14} />Vendeur vérifié</span><span class="badge">Anonymisé</span>{/if}
        </div>
        <dl>
          <dt>Franchise</dt><dd><span class="mono">{KG_BAGAGE} kg · {DIMENSION_MAX_CM} cm</span><br /><span class="aide">dimensions selon la compagnie</span></dd>
          <dt>Vendeur</dt><dd>{#if sel.mienne}Vous{:else}Passager <span class="mono">{sel.vendeur}</span>{/if}</dd>
          <dt>Proposé</dt><dd>{sel.depuis}</dd>
          <dt>Transfert</dt><dd>Confirmé par la compagnie<br /><span class="aide">règle à valider</span></dd>
        </dl>
        {#if sel.mienne}<a class="lien" href="/bagages/vendre{q}" onclick={(e) => { e.preventDefault(); aller(`/bagages/vendre${q}`); }}>Modifier ou retirer mon annonce</a>{/if}
      {:else}
        <div class="aucune">
          <span class="ico" aria-hidden="true"><Picto nom="etiquette" taille={20} trait={1.75} /></span>
          <div><p class="gras">Aucun bagage sélectionné</p><p class="t-sec">{m.offres.length ? 'Touchez une case orange sur la carte ou une ligne du carnet ci-dessous.' : 'Aucun bagage n’est proposé sur ce vol pour l’instant.'}</p></div>
        </div>
      {/if}
    </section>

    <section class="fiche carte2 carnet" aria-labelledby="ob-h">
      <div class="titre-ligne"><h2 id="ob-h" class="t-h">Carnet de la soute</h2><span class="aide">Prix · empl. · cumul</span></div>
      <p class="plafond-ligne"><Picto nom="cadenas" taille={14} /><span>Prix compagnie <span class="mono clair">{fmt(m.plafond)}</span> = plafond</span><span class="pointille" aria-hidden="true"></span><span class="petit">règle provisoire</span></p>
      <div>
        <p id="asks-h" class="groupe down"><i class="carre"></i>Bagages proposés</p>
        {#if m.carnet.length}
          <ul aria-labelledby="asks-h" class="lignes">
            {#each m.carnet as l (l.offre.id)}
              {@const o = l.offre}
              <li><button type="button" class="ligne offre" class:choisi={sel?.id === o.id} aria-pressed={sel?.id === o.id} aria-label="Bagage proposé à {fmt(o.prix)}, emplacement {o.code}, cumul {l.cumul}{o.mienne ? ', le vôtre' : ''}" onclick={() => basculer(o)}>
                <span class="barre down-fond" style:width="{l.profondeur}%" aria-hidden="true"></span>
                <span class="prix down mono">{fmt(o.prix)}{#if l.meilleure}<span class="mot clair">Meilleure</span>{/if}{#if o.mienne}<span class="mot">Vôtre</span>{/if}{#if sel?.id === o.id}<span class="mot jaune">Choisi</span>{/if}</span>
                <span class="empl mono">{o.code}</span><span class="cum mono">{l.cumul}</span>
              </button></li>
            {/each}
          </ul>
        {:else}<p class="vide-ligne">Aucun bagage proposé sur ce vol pour l’instant.</p>{/if}
      </div>
      {#if appar}
        <p class="separe"><span aria-hidden="true"></span><span class="txt">Demande <span class="mono clair">{fmt(appar.demande)}</span> {appar.possible ? '≥' : '<'} offre <span class="mono clair">{fmt(appar.offre)}</span> :<br />{appar.libelle}</span><span aria-hidden="true"></span></p>
      {/if}
      <div>
        <p id="bids-h" class="groupe up"><i class="rond-b"></i>Demandes<span class="droite">{m.nbDemandes ? `${pluriel(m.nbDemandes, 'demande')} active${m.nbDemandes > 1 ? 's' : ''}` : 'aucune demande active'}</span></p>
        {#if m.demandes.length}
          <ul aria-labelledby="bids-h" class="lignes">
            {#each m.demandes as d (d.prix)}
              <li class="ligne demande" class:best={d.meilleure}>
                <span class="barre up-fond" style:width="{d.profondeur}%" aria-hidden="true"></span>
                <span class="prix up mono">{fmt(d.prix)}{#if d.meilleure}<span class="mot clair">Meilleure</span>{/if}</span><span class="empl mono">×{d.nombre}</span><span class="cum mono">{d.cumul}</span>
              </li>
            {/each}
          </ul>
        {:else}<p class="vide-ligne">Aucune demande pour l’instant : publiez la vôtre.</p>{/if}
      </div>
      <a class="bouton-sec" href="/bagages/demande{q}" onclick={(e) => { e.preventDefault(); aller(`/bagages/demande${q}`); }}><Picto nom="loupe" taille={18} />Chercher un bagage · publier une demande</a>
      <p class="aide">Barres : cumul sur {pluriel(m.offres.length, 'bagage')}. Aucune offre ne peut dépasser le prix compagnie.</p>
    </section>

    {#if droit && (mienne || mesDem.length)}
      <section class="fiche carte2" aria-labelledby="mien-h">
        <h2 id="mien-h" class="t-h">Mes bagages sur ce vol</h2>
        <ul class="miens">
          {#if mienne}<li><span><span class="mono clair">{fmt(mienne.prix)}</span> · en vente · {mienne.code}</span><a href="/bagages/vendre{q}" onclick={(e) => { e.preventDefault(); aller(`/bagages/vendre${q}`); }}>Modifier</a></li>{/if}
          {#each mesDem as d (d.id)}<li><span>Demande · {pluriel(d.nombre, 'bagage')} jusqu’à <span class="mono clair">{fmt(d.prixMax)}</span></span><a href="/bagages/demande{q}" onclick={(e) => { e.preventDefault(); aller(`/bagages/demande${q}`); }}>Gérer</a></li>{/each}
        </ul>
      </section>
    {/if}

    <section class="bloc" aria-labelledby="tx-h">
      <h2 id="tx-h" class="t-h">Dernières transactions</h2>
      {#if m.transactions.length}
        <table class="tx mono">
          <thead><tr><th scope="col" class="g">Heure</th><th scope="col">Prix</th><th scope="col">Empl.</th><th scope="col" class="d">Var.</th></tr></thead>
          <tbody>
            {#each m.transactions as t (t.quand + t.code)}
              <tr>
                <td class="g clair2">{maintenant() - t.quand < 86_400_000 ? heure(t.quand) : maintenant() - t.quand < 172_800_000 ? 'Hier' : instantJourMois(t.quand)}</td><td class="prix">{fmt(t.prix)}</td><td class="up">{t.code}</td>
                <td class="d var" class:plus={t.variation !== null && t.variation > 0} class:moins={t.variation !== null && t.variation < 0}>{#if t.variation === null}<span aria-hidden="true">—</span><span class="sr">Première transaction</span>{:else}{libelleVariation(t.variation)}{/if}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}<p class="vide-ligne cadre-vide">Aucune transaction sur cette soute pour l’instant.</p>{/if}
    </section>

    <p class="echeance"><Picto nom="horloge" taille={18} /><span>Transferts possibles jusqu’au <span class="mono">{echeance}</span>, à l’échéance de nommage (à valider).</span></p>
    <p class="aide centre">Sous réserve d’accord avec la compagnie. Données de démonstration.</p>
  {/if}

</Ecran>

<style>
  .barre-pied { display: flex; flex-direction: column; gap: 8px; margin: -12px -20px calc(-12px - env(safe-area-inset-bottom)); padding: 12px 20px calc(12px + env(safe-area-inset-bottom)); background: var(--bg); border-top: 1px solid var(--line); }
  .clair { color: var(--ink); } .clair2 { color: var(--ink2); } .down { color: var(--down); } .up { color: var(--up); } .jaune { color: var(--signal); } .nowrap { white-space: nowrap; }
  .aide { font: 400 12px/17px 'Barlow', sans-serif; color: var(--ink3); } .centre { text-align: center; } .petit { font-size: 11px; color: var(--ink3); } .gras { font: 700 15px/20px 'Barlow', sans-serif; }
  .t-h { font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: .04em; text-transform: uppercase; }
  .titre-ligne { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .bloc { display: flex; flex-direction: column; gap: 12px; }
  .vide { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px; padding: 28px 20px; } .rond { width: 56px; height: 56px; border-radius: 999px; display: grid; place-items: center; background: var(--surface2); color: var(--ink2); }
  .hors { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border-radius: 12px; background: var(--err-soft); color: var(--err); font: 600 13px/18px 'Barlow', sans-serif; }
  .reperes { display: grid; grid-template-columns: 1fr 1fr 1fr; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); }
  .reperes > div { display: flex; flex-direction: column; gap: 4px; padding: 12px 10px; min-width: 0; } .reperes > div + div { border-left: 1px solid var(--line); } .reperes > div:first-child { padding-left: 14px; } .reperes > div:last-child { padding-right: 14px; }
  .lib { display: flex; align-items: center; gap: 6px; font: 600 12px/16px 'Barlow', sans-serif; color: var(--ink2); } .val { font-weight: 600; font-size: 20px; line-height: 26px; font-variant-numeric: tabular-nums; white-space: nowrap; } .sous { font: 400 12px/16px 'Barlow', sans-serif; color: var(--ink3); }
  .carre { display: inline-block; width: 8px; height: 8px; border-radius: 2px; background: var(--down); flex: none; } .rond-b { display: inline-block; width: 8px; height: 8px; border-radius: 999px; background: var(--up); flex: none; }
  .expl { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); } .expl strong { font-weight: 700; }
  .panneau { border-radius: 20px; background: #060708; padding: 16px 0 12px; overflow: hidden; } .echelle { position: relative; width: 100%; overflow: hidden; }
  .soute { position: absolute; top: 0; width: 350px; height: 606px; transform-origin: top left; } .soute > span, .soute > button { position: absolute; display: flex; }
  .aile { left: 0; top: 240px; width: 350px; height: 140px; background: var(--surface3); clip-path: polygon(175px 0, 350px 112px, 350px 136px, 175px 110px, 0 136px, 0 112px); }
  .moteur { top: 312px; width: 18px; height: 44px; border-radius: 9px; background: var(--line-strong); } .moteur.g { left: 32px; } .moteur.d { left: 300px; }
  .empennage { left: 55px; top: 520px; width: 240px; height: 60px; background: var(--surface3); clip-path: polygon(120px 0, 240px 44px, 240px 60px, 120px 42px, 0 60px, 0 44px); }
  .fuselage { left: 71px; top: 0; width: 208px; height: 590px; background: var(--surface2); border: 1px solid var(--line-strong); border-radius: 104px 104px 104px 104px / 130px 130px 100px 100px; }
  .cockpit { left: 133px; top: 34px; width: 84px; height: 20px; border-radius: 42px 42px 8px 8px; background: #060708; border: 1px solid var(--line-strong); }
  .numero { left: 71px; top: 68px; width: 208px; justify-content: center; font-weight: 600; font-size: 12px; letter-spacing: .12em; color: var(--ink2); } .queue { left: 171px; top: 540px; width: 8px; height: 66px; border-radius: 4px; background: var(--line-strong); }
  .zone { left: 71px; width: 208px; justify-content: center; font: 700 10px/14px 'Barlow', sans-serif; letter-spacing: .14em; text-transform: uppercase; color: var(--ink3); } .z1 { top: 126px; } .z2 { top: 338px; }
  .cadre { left: 77px; width: 196px; height: 148px; border-radius: 10px; background: var(--bg); border: 1px solid var(--line); } .c1 { top: 148px; } .c2 { top: 358px; }
  .caisson { left: 77px; top: 302px; width: 196px; height: 30px; border-radius: 6px; border: 1px dashed var(--line-strong); align-items: center; justify-content: center; font: 700 10px/14px 'Barlow', sans-serif; letter-spacing: .14em; text-transform: uppercase; color: var(--ink3); }
  .case { width: 44px; height: 44px; border-radius: 8px; align-items: center; justify-content: center; position: absolute; } .case.U { background: var(--line-strong); border: 2px solid var(--line-strong); color: var(--ink2); }
  .case.B { border-radius: 999px; background: rgba(98, 199, 255, .12); border: 2px solid var(--up); color: var(--up); } .case.L { border: 2px dashed var(--ink3); color: var(--ink3); }
  .case.O { margin: 0; padding: 0; cursor: pointer; background: rgba(255, 158, 94, .12); border: 2px solid var(--down); color: var(--down); font: 600 14px/1 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; display: flex; }
  .case.O .point { position: absolute; left: 4px; top: 4px; width: 6px; height: 6px; border-radius: 999px; border: 1.5px solid currentColor; }
  .case.O.choisi { background: var(--signal); border-color: var(--signal); color: #0D0E11; box-shadow: 0 0 0 4px rgba(255, 210, 63, .3); }
  .legende { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); } .legende li { display: flex; align-items: center; gap: 8px; min-width: 0; } .legende .large { grid-column: 1 / -1; } .legende b { font-weight: 600; color: var(--ink); }
  .p { position: relative; width: 26px; height: 26px; flex: none; border-radius: 6px; display: flex; align-items: center; justify-content: center; font: 600 10px/1 'IBM Plex Mono', monospace; }
  .p.U { background: var(--line-strong); color: var(--ink2); } .p.O { background: rgba(255, 158, 94, .12); border: 2px solid var(--down); color: var(--down); } .p.O i { position: absolute; left: 2px; top: 2px; width: 4px; height: 4px; border-radius: 999px; border: 1px solid currentColor; }
  .p.B { border-radius: 999px; background: rgba(98, 199, 255, .12); border: 2px solid var(--up); color: var(--up); } .p.L { border: 2px dashed var(--ink3); color: var(--ink3); } .p.S { background: var(--signal); color: #0D0E11; }
  .fiche { display: flex; flex-direction: column; gap: 12px; padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
  .fiche-tete { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; } .sur { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: .12em; text-transform: uppercase; color: var(--ink2); }
  .gros { display: block; font-weight: 600; font-size: 44px; line-height: 48px; letter-spacing: -.02em; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .x { width: 44px; height: 44px; flex: none; border-radius: 999px; background: var(--surface2); border: 1px solid var(--line-strong); display: grid; place-items: center; cursor: pointer; padding: 0; }
  .badges { display: flex; flex-wrap: wrap; gap: 8px; } .badge { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 999px; background: var(--surface3); color: var(--ink2); font: 700 12px/1 'Barlow', sans-serif; letter-spacing: .06em; text-transform: uppercase; }
  .badge.ok { background: var(--ok-soft); color: var(--ok); } .badge.vous { background: var(--signal-soft); color: var(--signal-ink); }
  dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 0 12px; font: 400 14px/20px 'Barlow', sans-serif; } dt, dd { padding: 8px 0; border-top: 1px solid var(--line); margin: 0; } dt { color: var(--ink2); } dd { text-align: right; } .mono { font-weight: 600; }
  .lien { align-self: flex-start; min-height: 44px; display: inline-flex; align-items: center; font: 700 14px/1 'Barlow', sans-serif; color: var(--accent); }
  .aucune { display: flex; align-items: flex-start; gap: 12px; } .ico { width: 36px; height: 36px; flex: none; border-radius: 10px; background: rgba(255, 158, 94, .12); color: var(--down); display: grid; place-items: center; }
  .plafond-ligne { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; color: var(--ink2); font: 600 12px/16px 'Barlow', sans-serif; } .pointille { flex: 1; border-top: 2px dashed var(--ink3); min-width: 24px; }
  .groupe { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: .12em; text-transform: uppercase; } .groupe .droite { margin-left: auto; font-weight: 600; letter-spacing: 0; text-transform: none; color: var(--ink3); }
  .lignes { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px; }
  .ligne { position: relative; width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) 60px 36px; align-items: center; min-height: 44px; margin: 0; padding: 0 10px; border: 0; border-radius: 8px; overflow: hidden; background: transparent; color: var(--ink); text-align: left; font: 400 15px/1 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  button.ligne { cursor: pointer; } .ligne.choisi { background: rgba(255, 210, 63, .12); box-shadow: inset 0 0 0 2px var(--signal); } .ligne.demande { min-height: 34px; } .ligne.best { box-shadow: inset 0 0 0 1px rgba(98, 199, 255, .45); }
  .barre { position: absolute; right: 0; top: 0; bottom: 0; opacity: .18; } .down-fond { background: var(--down); } .up-fond { background: var(--up); }
  .prix, .empl, .cum { position: relative; } .prix { display: flex; align-items: center; flex-wrap: wrap; gap: 0 8px; font-weight: 600; min-width: 0; } .empl { text-align: right; font-size: 13px; color: var(--ink2); } .cum { text-align: right; color: var(--ink2); }
  .mot { font: 700 10px/1 'Barlow', sans-serif; letter-spacing: .1em; text-transform: uppercase; color: var(--ink2); } .mot.clair { color: var(--ink); } .mot.jaune { color: var(--signal); }
  .vide-ligne { padding: 10px 12px; border-radius: 10px; background: var(--surface2); font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .separe { display: flex; align-items: center; gap: 10px; padding: 2px 0; } .separe > span[aria-hidden] { flex: 1; border-top: 1px dashed var(--line-strong); } .separe .txt { font: 600 12px/16px 'Barlow', sans-serif; color: var(--ink2); text-align: center; }
  .bouton-sec { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; padding: 4px 12px; border-radius: 12px; background: var(--surface2); color: var(--ink); border: 1px solid var(--line-strong); font: 700 14px/18px 'Barlow', sans-serif; text-align: center; }
  .miens { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; } .miens li { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px; border-top: 1px solid var(--line); font: 400 14px/20px 'Barlow', sans-serif; color: var(--ink2); } .miens li:first-child { border-top: 0; } .miens a { min-height: 44px; display: inline-flex; align-items: center; font-weight: 700; }
  .tx { width: 100%; border-collapse: collapse; border-radius: 16px; overflow: hidden; background: #060708; font-size: 14px; font-variant-numeric: tabular-nums; }
  .tx th { padding: 10px 8px 6px; text-align: right; font: 700 11px/16px 'Barlow', sans-serif; letter-spacing: .14em; text-transform: uppercase; color: var(--ink3); } .tx th.g, .tx td.g { text-align: left; padding-left: 14px; } .tx th.d, .tx td.d { padding-right: 14px; }
  .tx td { padding: 12px 8px; text-align: right; border-top: 1px solid #1A1C21; white-space: nowrap; } .tx td.prix { font-weight: 600; } .tx .var { font-weight: 600; color: var(--ink3); } .tx .var.plus { color: var(--up); } .tx .var.moins { color: var(--down); }
  .cadre-vide { border-radius: 16px; }
  .echeance { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: 12px; background: rgba(255, 210, 63, .12); color: var(--signal); font: 600 13px/18px 'Barlow', sans-serif; } .echeance > :global(svg) { flex: none; }
  .actions-bas { flex-direction: row; gap: 10px; } .actions-bas :global(.btn) { flex: 1 1 0; padding: 4px 10px; gap: 6px; min-width: 0; font-size: 15px; line-height: 18px; text-align: center; } .actions-bas :global(.btn:last-child) { flex: 1.25; }
</style>
