<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Carte from '../../ui/Carte.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Champ from '../../ui/Champ.svelte';
  import Jauge from '../../ui/Jauge.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { aller } from '../../router.svelte.ts';
  import { fcfa, lireMontant } from '../../core/money.ts';
  import { DUREES_REMBOURSEMENT, LOYERS_PROPOSES, MOIS_PROPOSES, NOM_NIVEAU, limitesAvance, niveauRequis, simuler, suggerer } from '../../core/avance-loyer.ts';
  import { PLAFOND_ENDETTEMENT } from '../../core/credit.ts';
  import { blocage, majSimulation } from './actions.ts';
  import { entreeSimulation, logement, niveauActuel } from './etat.ts';
  import Puces from './Puces.svelte';
  import Verrou from './Verrou.svelte';

  const l = logement();
  const lim = $derived(limitesAvance(niveauActuel()));
  const bloque = $derived(blocage());
  const enAttente = $derived(l.dossier?.statut === 'accord_attendu');

  // Départ : la dernière simulation, ramenée aux limites du niveau.
  let loyerTexte = $state(String(Math.min(l.sim.loyer, limitesAvance(niveauActuel()).loyerMax || l.sim.loyer)));
  let mois = $state(Math.min(l.sim.mois, limitesAvance(niveauActuel()).moisMax || l.sim.mois));
  let duree = $state(l.sim.duree);
  const loyer = $derived(lireMontant(loyerTexte) ?? 0);
  const entree = $derived(entreeSimulation({ loyer, mois, duree }));
  const sim = $derived(simuler(entree));
  const sugg = $derived(suggerer(entree));
  const erreurLoyer = $derived(loyerTexte && loyer > lim.loyerMax && lim.disponible ? sim.erreurs.find((e) => e.startsWith('Le loyer')) ?? '' : loyerTexte && loyer === 0 ? 'Indiquez un montant lisible.' : '');
  const requis = $derived(mois > lim.moisMax || loyer > lim.loyerMax ? niveauRequis(loyer, mois) : null);

  $effect(() => { if (!bloque && !enAttente && loyer > 0) majSimulation({ loyer, mois, duree }); });
  const loyers = $derived([...new Set([...LOYERS_PROPOSES.filter((x) => x <= lim.loyerMax), ...(lim.loyerMax && !LOYERS_PROPOSES.includes(lim.loyerMax as never) ? [lim.loyerMax] : [])])].sort((a, b) => a - b));
  const kilo = (n: number) => `${(n / 1000).toLocaleString('fr-FR')} k`;
  function appliquer() {
    if (!sugg) return;
    if (sugg.type === 'duree') duree = sugg.valeur; else { mois = sugg.valeur; if (!simuler({ ...entree, mois }).ok) duree = Math.max(...DUREES_REMBOURSEMENT); }
  }
  const continuer = () => { majSimulation({ loyer, mois, duree }); aller('/logement/justificatifs'); };
  const couleur = $derived(sim.etat === 'trop_lourd' ? 'var(--danger)' : sim.etat === 'limite' ? 'var(--alerte)' : 'var(--bon)');
</script>

<Ecran titre="Avance de loyer" retourVers="/logement">
  {#if bloque}
    <Verrou />
  {:else if enAttente}
    <Carte accent="var(--primaire)">
      <b>Votre dossier est chez le bailleur</b>
      <p class="muted" style="margin: 6px 0 12px">La simulation est figée tant que le bailleur n'a pas répondu.</p>
      <Bouton href="/logement/bailleur">Voir le dossier</Bouton>
    </Carte>
  {:else}
    <div class="intro">
      <span class="etape mono">ÉTAPE 1 / 3 · NOUVEAU LOGEMENT</span>
      <h2>Le bailleur est payé le jour de la signature.</h2>
      <p class="muted">Vous remboursez en {duree} mois, avec le loyer courant.</p>
    </div>

    <section aria-labelledby="t-loyer">
      <div class="ent"><h3 id="t-loyer" class="et">LOYER MENSUEL</h3><span class="muted">max {fcfa(lim.loyerMax)} à votre niveau</span></div>
      <Puces etiquette="Loyer mensuel" valeur={loyer} options={loyers.map((v) => ({ valeur: v, libelle: kilo(v) }))} onchoisir={(v) => (loyerTexte = String(v))} />
      <div class="champ"><Champ etiquette="Autre montant" bind:valeur={loyerTexte} inputmode="numeric" suffixe="FCFA" erreur={erreurLoyer} /></div>
    </section>

    <section aria-labelledby="t-mois">
      <div class="ent"><h3 id="t-mois" class="et">MOIS D'AVANCE EXIGÉS PAR LE BAILLEUR</h3></div>
      <Puces etiquette="Mois d'avance" valeur={mois} options={MOIS_PROPOSES.map((v) => ({ valeur: v as number, libelle: String(v), desactive: v > lim.moisMax }))} onchoisir={(v) => (mois = v)} />
      {#if MOIS_PROPOSES.some((v) => v > lim.moisMax)}
        <p class="note muted">Niveau {NOM_NIVEAU[niveauActuel()]} : {lim.moisMax} mois d'avance au plus. Les mois barrés s'ouvrent à un niveau supérieur.</p>
      {/if}
    </section>

    <section aria-labelledby="t-duree">
      <div class="ent"><h3 id="t-duree" class="et">REMBOURSER SUR</h3><b class="mono">{duree} mois</b></div>
      <Puces etiquette="Durée de remboursement" valeur={duree} options={DUREES_REMBOURSEMENT.map((v) => ({ valeur: v as number, libelle: `${v} mois` }))} onchoisir={(v) => (duree = v)} />
    </section>

    {#if sim.erreurs.length}
      <div class="alerte" role="alert"><Icone nom="attention" taille={18} /><span>{sim.erreurs[0]}{requis ? ` Il faut le niveau ${NOM_NIVEAU[requis]}.` : ''}</span></div>
    {:else}
      <Carte accent={couleur}>
        <div class="ligne"><span>Versé au bailleur à la signature</span><b class="mono g">{fcfa(sim.avance)}</b></div>
        <div class="sep"></div>
        <div class="sous">Votre prélèvement logement</div>
        <div class="ligne"><span class="muted">loyer {fcfa(loyer)} + remboursement {fcfa(sim.remboursement)}</span><b class="mono g" aria-label="Prélèvement mensuel total">{fcfa(sim.prelevement)}</b></div>
        <p class="mono mini">PENDANT {duree} MOIS, PUIS {fcfa(loyer)} SEULEMENT · <span style:color={couleur}>{sim.pct} % DU SALAIRE</span></p>
        <Jauge pct={Math.min(100, sim.part * 100)} couleur={couleur} trait={PLAFOND_ENDETTEMENT * 100} />
        <p class="mini muted">Loyer, remboursement et crédits en cours ({fcfa(entree.mensualitesExistantes)}) sur {fcfa(entree.salaire)} de salaire net · plafond {Math.round(PLAFOND_ENDETTEMENT * 100)} %. Intérêts de l'avance : {fcfa(sim.cout)} au total.</p>
      </Carte>
      <div class="info"><Icone nom="info" taille={18} /><span>Le bailleur reçoit ensuite chaque loyer le 1er, garanti par AssureMe. Beaucoup baissent l'avance exigée pour ça.</span></div>
      {#if sim.depasse}
        <div class="alerte" role="alert"><Icone nom="attention" taille={18} /><span><b>Au-dessus de 33 %</b> : réduisez l'avance ou allongez le remboursement.</span></div>
        {#if sugg}<Bouton variante="secondaire" onclick={appliquer}>{sugg.texte}</Bouton>{/if}
      {/if}
    {/if}
  {/if}
  {#snippet pied()}
    {#if !bloque && !enAttente}
      <Bouton desactive={!sim.ok} onclick={continuer}>Ajouter le bail et le bailleur <Icone nom="fleche" taille={18} trait={2.2} /></Bouton>
    {/if}
  {/snippet}
</Ecran>

<style>
  .intro { display: flex; flex-direction: column; gap: 6px; } .etape { font-size: 10.5px; letter-spacing: 0.12em; color: var(--primaire-clair); } h2 { font-size: 21px; font-weight: 650; letter-spacing: -0.02em; line-height: 1.2; }
  section { display: flex; flex-direction: column; gap: 10px; } .ent { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; font-size: 12.5px; }
  .et { font: 500 10.5px var(--mono); letter-spacing: 0.1em; color: var(--muted); } .note { font-size: 12.5px; }
  .ligne { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; font-size: 14px; } .g { font-size: 22px; font-weight: 500; letter-spacing: -0.02em; white-space: nowrap; } .ligne > span { min-width: 0; } .sous { font-size: 13px; color: var(--doux); margin: 4px 0 6px; }
  .sep { height: 1px; background: var(--ligne); margin: 12px 0; } .mini { font-size: 11px; letter-spacing: 0.04em; margin: 10px 0 12px; } p.mini.muted { font-family: var(--sans); letter-spacing: 0; margin: 10px 0 0; font-size: 12.5px; }
  .info, .alerte { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border-radius: 14px; font-size: 13.5px; line-height: 1.4; }
  .info { background: var(--carte); border: 1px solid var(--ligne); color: var(--doux); } .alerte { background: rgba(255, 114, 114, 0.1); border: 1px solid rgba(255, 114, 114, 0.35); color: var(--danger); }
  .info :global(svg), .alerte :global(svg) { flex: none; margin-top: 1px; }
</style>
