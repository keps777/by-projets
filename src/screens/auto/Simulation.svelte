<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Champ from '../../ui/Champ.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { ASSURANCES, DUREES, FINANCEMENT_MINIMUM, apportMinimum, apportNecessaire, autoDisponible, dureeSuffisante, simuler, type Assurance } from '../../core/auto.ts';
  import { echeancierResume, PLAFOND_ENDETTEMENT } from '../../core/credit.ts';
  import { court, fcfa, lireMontant } from '../../core/money.ts';
  import { auto, coffreVoiture, vehiculeDe } from './etat.ts';
  import { demander, entreeSimulation, erreurBrouillon, niveauMembre, reglerBrouillon } from './actions.ts';

  const t = auto();
  const b = $derived(t.brouillon);
  const veh = $derived(vehiculeDe(b?.vehiculeId));
  const niveau = $derived(niveauMembre());
  $effect(() => { if (!autoDisponible(niveau)) aller('/auto', { remplacer: true }); else if (!b || !veh) aller('/auto/catalogue', { remplacer: true }); });

  let saisie = $state(String(t.brouillon?.apport ?? 0));
  const entree = $derived(veh && b ? entreeSimulation(veh.prix, b.apport, b.duree, b.assurance) : null);
  const sim = $derived(entree ? simuler(entree) : null);
  const erreur = $derived(erreurBrouillon());
  const minimum = $derived(veh ? apportMinimum(veh.prix, niveau) : 0);
  const pct = (x: number) => Math.round(x * 100);

  // Apports proposés en puces : ceux de la maquette, plus le minimum exigé, dans les limites du prix et du coffre.
  const puces = $derived.by(() => {
    if (!veh) return [] as number[];
    const maxi = Math.min(coffreVoiture(), veh.prix - FINANCEMENT_MINIMUM);
    return [...new Set([0, 500_000, 1_000_000, 1_200_000, minimum])].filter((x) => x >= minimum && x <= maxi).sort((p, q) => p - q);
  });
  const fixerApport = (x: number) => { saisie = String(x); reglerBrouillon({ apport: x }); };
  const saisieChangee = () => reglerBrouillon({ apport: saisie.trim() === '' ? 0 : lireMontant(saisie) ?? -1 });

  // Pistes pour repasser sous 33 % : plus de durée, plus d'apport, ou les deux (jamais au-delà du coffre voiture ni du prix).
  interface Piste { libelle: string; duree: number; apport: number }
  const pistes = $derived.by((): Piste[] | null => {
    if (!entree || !sim || sim.respecte33 || !veh) return null;
    const { apport: _a, ...sansApport } = entree;
    const maxi = Math.min(coffreVoiture(), veh.prix - FINANCEMENT_MINIMUM);
    const res: Piste[] = [];
    const duree = dureeSuffisante({ ...sansApport, apport: entree.apport });
    if (duree && duree !== entree.duree) res.push({ libelle: `Passer à ${duree} mois`, duree, apport: entree.apport });
    const memeDuree = apportNecessaire(sansApport);
    if (memeDuree != null && memeDuree > entree.apport && memeDuree <= maxi) res.push({ libelle: `Apport de ${court(memeDuree)}`, duree: entree.duree, apport: memeDuree });
    if (!res.length) for (const d of DUREES) {
      if (d <= entree.duree) continue;
      const a = apportNecessaire({ ...sansApport, duree: d });
      if (a != null && a <= maxi) { res.push({ libelle: `${d} mois et apport de ${court(Math.max(a, entree.apport))}`, duree: d, apport: Math.max(a, entree.apport) }); break; }
    }
    return res;
  });
  const appliquer = (p: Piste) => { reglerBrouillon({ duree: p.duree }); fixerApport(p.apport); };

  let amort = $state(false);
  const lignes = $derived(sim && b ? echeancierResume(sim.financement, entree!.tauxMensuel, b.duree) : []);
  const etatLibelle = { confortable: 'CONFORTABLE', limite: 'LIMITE · 33 % MAX', trop_lourd: 'TROP LOURD' } as const;

  function suite() {
    const r = demander();
    if ('erreur' in r) montrer(r.erreur, 'danger'); else aller('/auto/decision');
  }
</script>

{#if veh && b && sim && entree}
<Ecran titre={veh.titre} sur="Étape 2 / 5 · {fcfa(veh.prix)} FCFA" retourVers="/auto/catalogue">
  <section class="mens" aria-live="polite">
    <small>Votre mensualité</small>
    <div class="gros"><b class="mono">{fcfa(sim.mensualite)}</b><span>FCFA</span></div>
    <p class="part"><b class="mono">{pct(sim.partTotale)} %</b> du salaire net, toutes mensualités comprises
      {#if entree.mensualitesExistantes > 0}<br /><span class="muted">dont ce crédit {pct(sim.partNouvelle)} % + {fcfa(entree.mensualitesExistantes)} déjà prélevés</span>{/if}</p>
    <span class="etat {sim.etat}">{etatLibelle[sim.etat]}</span>
  </section>

  {#if pistes}
    <section class="bloc alerte" role="alert">
      <b>Au-dessus de {pct(PLAFOND_ENDETTEMENT)} % ({pct(sim.partTotale)} % avec vos autres mensualités) : allongez ou ajoutez de l'apport.</b>
      {#if pistes.length}<div class="pistes">{#each pistes as p (p.libelle)}<button onclick={() => appliquer(p)}>{p.libelle}</button>{/each}</div>
      {:else}<span class="muted">{coffreVoiture() < (veh.prix - FINANCEMENT_MINIMUM) ? "Il faudrait plus d'apport que votre coffre voiture n'en contient, ou aucune durée ne suffit avec vos autres mensualités." : 'Aucune combinaison ne passe sous 33 % avec vos autres mensualités.'}</span>{/if}
    </section>
  {/if}

  <section class="bloc">
    <div class="ligne"><small>Durée</small><b class="mono">{b.duree} mois</b></div>
    <div class="puces" role="radiogroup" aria-label="Durée en mois">
      {#each DUREES as d (d)}<button role="radio" aria-checked={b.duree === d} class:on={b.duree === d} onclick={() => reglerBrouillon({ duree: d })}>{d}</button>{/each}
    </div>
  </section>

  <section class="bloc">
    <div class="ligne"><small>Apport</small><span class="muted">Coffre voiture : <b class="mono">{fcfa(coffreVoiture())}</b> disponibles</span></div>
    {#if puces.length}
      <div class="puces" role="radiogroup" aria-label="Apport">
        {#each puces as p (p)}<button role="radio" aria-checked={b.apport === p} class:on={b.apport === p} onclick={() => fixerApport(p)}>{p === 0 ? '0' : court(p)}</button>{/each}
      </div>
    {/if}
    <Champ bind:valeur={saisie} etiquette="Autre montant d'apport" inputmode="numeric" suffixe="FCFA" oninput={saisieChangee} erreur={erreur && !erreur.startsWith('Choisissez') ? erreur : ''} />
    {#if minimum > 0}<small class="muted">Apport minimum pour ce véhicule : {fcfa(minimum)} FCFA (plafond du niveau).</small>{/if}
  </section>

  <section class="bloc recap">
    <div class="ligne"><span>Montant financé</span><b class="mono">{fcfa(sim.financement)}</b></div>
    <div class="ligne"><span>Frais · {(entree.tauxMensuel * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} % par mois sur le restant dû</span><b class="mono">{fcfa(sim.cout)}</b></div>
    <div class="ligne"><span>Assurance</span>
      <span class="puces petit" role="radiogroup" aria-label="Formule d'assurance">
        {#each Object.entries(ASSURANCES) as [k, a] (k)}<button role="radio" aria-checked={b.assurance === k} class:on={b.assurance === k} onclick={() => reglerBrouillon({ assurance: k as Assurance })}>{a.libelle}</button>{/each}
      </span></div>
    <div class="ligne"><span class="muted">{t.assuranceProposee ? 'Offre du concessionnaire · ' : ''}Assurance {ASSURANCES[b.assurance].libelle.toLowerCase()}</span><b class="mono">{fcfa(sim.assurance)} / mois</b></div>
    <div class="ligne total"><span>Total remboursé</span><b class="mono">{fcfa(sim.total)}</b></div>
  </section>

  <p class="legal">Crédit porté par [ÉTABLISSEMENT AGRÉÉ COBAC]. Taux et frais d'illustration. Le véhicule reste gagé jusqu'à la dernière mensualité.</p>
  <button class="lien" onclick={() => (amort = true)}>Tableau d'amortissement<Icone nom="suivant" taille={16} trait={2.2} /></button>

  {#snippet pied()}
    {#if erreur}<Bouton desactive>Demander la décision</Bouton>
    {:else if sim.respecte33}<Bouton onclick={suite}>Demander la décision<Icone nom="fleche" taille={18} trait={2.2} /></Bouton>
    {:else}<Bouton variante="secondaire" onclick={suite}>Demander quand même la décision</Bouton>{/if}
  {/snippet}
</Ecran>

<Feuille bind:ouverte={amort} titre="Tableau d'amortissement" sous="{b.duree} mois">
  <p class="muted">Premières mensualités et dernière, pour {b.duree} mois à {(entree.tauxMensuel * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} % par mois (hors assurance).</p>
  <table>
    <thead><tr><th scope="col">Mois</th><th scope="col">Capital</th><th scope="col">Frais</th><th scope="col">Reste dû</th></tr></thead>
    <tbody>{#each lignes as l (l.n + String(l.ellipse))}
      {#if l.ellipse}<tr><td colspan="4" class="ell">···</td></tr>{:else}<tr><td>M{l.n}</td><td class="mono">{fcfa(l.capital)}</td><td class="mono">{fcfa(l.frais)}</td><td class="mono">{fcfa(l.restant)}</td></tr>{/if}
    {/each}</tbody>
  </table>
  <Bouton onclick={() => (amort = false)}>Compris</Bouton>
</Feuille>
{/if}

<style>
  .mens { padding: 18px; border-radius: 24px; background: linear-gradient(160deg, var(--primaire-fond), var(--carte) 70%); border: 1px solid color-mix(in srgb, var(--primaire) 40%, transparent); display: flex; flex-direction: column; gap: 6px; }
  small { color: var(--muted); font: 500 10.5px var(--mono); letter-spacing: 0.1em; text-transform: uppercase; }
  .gros { display: flex; align-items: baseline; gap: 8px; } .gros b { font-size: 40px; letter-spacing: -0.02em; } .gros span { color: var(--muted); }
  .part { font-size: 14px; } .etat { align-self: flex-start; padding: 4px 10px; border-radius: 99px; font: 600 10.5px var(--mono); letter-spacing: 0.08em; }
  .confortable { background: rgba(61, 213, 152, 0.18); color: var(--bon); } .limite { background: rgba(255, 122, 47, 0.18); color: var(--alerte); } .trop_lourd { background: rgba(255, 114, 114, 0.18); color: var(--danger); }
  .bloc { padding: 14px; border-radius: 20px; background: var(--carte); border: 1px solid var(--ligne); display: flex; flex-direction: column; gap: 10px; }
  .ligne { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 14px; } .recap .ligne { padding: 4px 0; } .total { border-top: 1px solid var(--ligne); padding-top: 12px !important; font-weight: 650; font-size: 15.5px; }
  .puces { display: flex; gap: 8px; flex-wrap: wrap; } .puces button { min-height: 44px; min-width: 56px; padding: 0 14px; border-radius: 14px; background: var(--carte2); border: 1px solid var(--ligne); color: var(--muted); font-weight: 600; }
  .puces button.on { background: var(--primaire-fond); border-color: var(--primaire); color: var(--texte); } .petit { justify-content: flex-end; }
  .legal { color: var(--faint); font-size: 12px; line-height: 1.45; } .lien { display: inline-flex; align-items: center; gap: 4px; align-self: flex-start; min-height: 44px; color: var(--primaire-clair); font-weight: 600; }
  .bloc.alerte { border-color: color-mix(in srgb, var(--alerte) 50%, transparent); background: color-mix(in srgb, var(--alerte) 8%, var(--carte)); font-size: 13.5px; line-height: 1.4; }
  .pistes { display: flex; gap: 8px; flex-wrap: wrap; } .pistes button { min-height: 44px; padding: 0 14px; border-radius: 14px; background: var(--primaire-fond); border: 1px solid var(--primaire); font-weight: 600; font-size: 13.5px; }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; } th { text-align: right; color: var(--muted); font: 500 10.5px var(--mono); letter-spacing: 0.08em; text-transform: uppercase; padding: 6px 4px; } th:first-child, td:first-child { text-align: left; }
  td { text-align: right; padding: 9px 4px; border-top: 1px solid var(--ligne); } .ell { text-align: center; color: var(--muted); }
</style>
