<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Carte from '../../ui/Carte.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Jauge from '../../ui/Jauge.svelte';
  import Pastille from '../../ui/Pastille.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Etiquette from '../_services/Etiquette.svelte';
  import Choix from '../_services/Choix.svelte';
  import Vide from '../_services/Vide.svelte';
  import Verrou from '../_services/Verrou.svelte';
  import { fraisStock, semainesPourRembourser } from '../../core/commerce.ts';
  import { niveauPourStock, variationPct } from '../../core/services.ts';
  import { jourCourt, jourDe, quand } from '../../core/dates.ts';
  import { court, fcfa } from '../../core/money.ts';
  import { maintenant } from '../../data/store.svelte.ts';
  import { GROSSISTE, commanderAvance, disponibleMaintenant, plafondStock, synchroniser } from './actions.ts';
  import { aRembourser, encours, journalierPour, montantsProposes, partAssureMe, restant, suiviHebdo, totalSemaine } from './calcul.ts';
  import { etat, type Avance } from './etat.ts';

  const e = etat();
  synchroniser();
  const jours = ['L', 'M', 'M', 'J', 'V', 'S', 'D']; const noms = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  let jour = $state(((new Date(maintenant()).getDay() + 6) % 7));
  const total = $derived(totalSemaine(e.semaine));
  const variation = $derived(variationPct(total, e.semaine.precedente));
  const pic = $derived(Math.max(1, ...e.semaine.total));
  const part = $derived(Math.round(partAssureMe(e.semaine) * 100));

  const plafond = $derived(plafondStock());
  const dispo = $derived(disponibleMaintenant());
  const propositions = $derived(montantsProposes(dispo));
  let montant = $state(0); let taux = $state(12);
  // Montant par défaut : 500 k si possible, sinon le plus grand proposé ; corrigé si l'offre change.
  $effect(() => { if (!propositions.includes(montant)) montant = propositions.includes(500_000) ? 500_000 : propositions[propositions.length - 1] ?? 0; });
  const journalier = $derived(journalierPour(e.semaine, taux));
  const semaines = $derived(montant ? semainesPourRembourser(montant, journalier) : 0);

  let ouverte = $state(false); let fait = $state<Avance | null>(null); let refus = $state('');
  const ouvrir = () => { fait = null; refus = ''; ouverte = true; };
  function confirmer() {
    const r = commanderAvance(montant, taux);
    if (!r.ok) { refus = r.erreur; montrer(r.erreur, 'danger'); return; }
    fait = r.avance; montrer(`Grossiste payé · ${fcfa(montant)} FCFA`);
  }
  const avances = $derived(e.avances);
  const h = maintenant();
</script>

<Ecran titre="Stock et trésorerie" sur={`${e.nom ?? 'Votre commerce'} · 7 jours`} retourVers="/commerce">
  {#if !e.nom}
    <Vide icone="commerce" titre="Ouvrez d'abord votre caisse" texte="Les avances de stock se calculent sur vos encaissements AssureMe. Commencez par encaisser vos clients.">
      <Bouton href="/commerce">Ouvrir la caisse</Bouton>
    </Vide>
  {:else}
    <Carte>
      <div class="sem">
        <Etiquette>Encaissé cette semaine</Etiquette>
        <div class="tot"><b class="mono grand">{fcfa(total)}</b>{#if variation !== null}<span class="mono" class:bon={variation >= 0} class:neg={variation < 0}>{variation >= 0 ? '+' : '−'}{Math.abs(variation)} % vs sem. −1</span>{/if}</div>
        <div class="barres" role="group" aria-label="Ventes par jour">
          {#each e.semaine.total as v, i (i)}
            <button type="button" aria-label={`${noms[i]} : ${fcfa(v)} FCFA`} aria-pressed={i === jour} onclick={() => (jour = i)}>
              <small class="mono">{v ? Math.round(v / 1000) + ' k' : '0'}</small>
              <i class:on={i === jour} style:height="{Math.round((v / pic) * 52) + 6}px"></i>
              <small class="mono j">{jours[i]}</small>
            </button>
          {/each}
        </div>
        <p class="muted petit"><b class="mono">Via AssureMe · {part} %</b><br />{noms[jour]} · {fcfa(e.semaine.total[jour])}</p>
      </div>
    </Carte>

    <Etiquette>Avance de stock</Etiquette>
    {#if plafond === 0}
      <Verrou requis={niveauPourStock()} quoi="Avance de stock" />
    {:else if !propositions.length}
      <Vide icone="commerce" titre={encours(avances) ? 'Pas d\'avance supplémentaire pour le moment' : 'Encaissez avec AssureMe pour débloquer une avance'} texte={encours(avances) ? `Il vous reste ${fcfa(encours(avances))} FCFA à rembourser sur vos avances en cours.` : 'Votre avance se calcule sur vos encaissements de la semaine passés par AssureMe.'}>
        <Bouton href="/commerce">Encaisser un client</Bouton>
      </Vide>
    {:else}
      <div class="avance">
        <div class="ligne"><b>jusqu'à {fcfa(dispo)} à votre niveau</b>{#if encours(avances)} <span class="muted">(avances en cours déduites)</span>{/if}</div>
        <Choix nom="Montant de l'avance" bind:valeur={montant} options={propositions.map((m) => ({ valeur: m, label: court(m).replace(/\s/g, ' ') + (m === dispo && !([300_000, 500_000].includes(m)) ? ' (max)' : '') }))} />
        <p class="gros"><small class="mono">COMMANDE GROSSISTE LABOREX · LIVRÉE EN 48 H</small><b class="mono">{fcfa(montant)}</b><span class="muted">payé au grossiste</span></p>
        <Etiquette>Part de chaque encaissement</Etiquette>
        <Choix nom="Part des encaissements remboursée" bind:valeur={taux} options={[8, 12, 20].map((t) => ({ valeur: t, label: `${t} %` }))} />
        <dl>
          <div><dt>Remboursé à raison de</dt><dd class="mono">≈ {fcfa(journalier)} / jour</dd></div>
          <div><dt>Durée estimée · frais 2 % fixes</dt><dd class="mono">{Number.isFinite(semaines) ? semaines : '—'} sem. · {fcfa(fraisStock(montant))}</dd></div>
        </dl>
        <p class="info"><Icone nom="info" taille={16} />Pas de mensualité fixe : une semaine creuse, vous remboursez moins. Plafond de votre niveau : {fcfa(plafond)}.</p>
        <Bouton onclick={ouvrir}>Commander {fcfa(montant)} chez Laborex</Bouton>
      </div>
    {/if}

    {#if avances.length}
      <Etiquette>Mes avances · suivi hebdomadaire</Etiquette>
      {#each avances as a (a.id)}
        <Carte>
          <div class="av">
            <div class="entete"><b>{fcfa(a.montant)} · {a.grossiste}</b><Pastille ton={a.statut === 'soldee' ? 'bon' : 'primaire'}>{a.statut === 'soldee' ? 'Soldée' : 'En cours'}</Pastille></div>
            <small class="muted">{a.livre ? `Livrée · commandée ${quand(a.ts, h)}` : `Livraison sous 48 h · commandée ${quand(a.ts, h)}`} · {a.taux} % des encaissements</small>
            <Jauge pct={(a.rembourse / aRembourser(a)) * 100} couleur="var(--bon)" />
            <div class="entete"><span class="mono">{fcfa(a.rembourse)} remboursés</span><span class="mono muted">reste {fcfa(restant(a))}</span></div>
            <ul aria-label="Remboursement par semaine">
              {#each suiviHebdo(a, h) as s (s.n)}
                <li><span>Sem. {s.n} · dès le {jourCourt(jourDe(new Date(s.debut)))}</span><span class="mono">{fcfa(s.rembourse)} / {fcfa(s.objectif)}</span></li>
              {/each}
            </ul>
          </div>
        </Carte>
      {/each}
    {/if}
  {/if}
</Ecran>

<Feuille bind:ouverte titre={fait ? 'Commande envoyée' : 'Confirmer la commande'}>
  {#if fait}
    <div class="fin" role="status">
      <span class="coche"><Icone nom="ok" taille={28} trait={3} /></span>
      <p class="muted">Commande envoyée à Laborex : {fcfa(fait.montant)} FCFA payés. Livraison sous 48 h à {e.nom}.</p>
      <Bouton onclick={() => (ouverte = false)}>Fermer</Bouton>
      <Bouton variante="discret" href="/">Accueil</Bouton>
    </div>
  {:else}
    <p class="muted">Le grossiste est payé tout de suite, vous remboursez au fil des encaissements.</p>
    <dl class="recap">
      <div><dt>Grossiste</dt><dd>{GROSSISTE}</dd></div><div><dt>Montant</dt><dd class="mono">{fcfa(montant)}</dd></div>
      <div><dt>Frais fixes 2 %</dt><dd class="mono">{fcfa(fraisStock(montant))}</dd></div><div><dt>Remboursement</dt><dd>{taux} % des encaissements</dd></div>
      <div><dt>Livraison</dt><dd>sous 48 h</dd></div>
    </dl>
    {#if refus}<p class="err" role="alert">{refus}</p>{/if}
    <Bouton onclick={confirmer}>Confirmer et payer le grossiste</Bouton>
  {/if}
</Feuille>

<style>
  .sem { display: flex; flex-direction: column; gap: 8px; } .tot { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .grand { font-size: 32px; font-weight: 500; letter-spacing: -0.02em; } .bon { color: var(--bon); font-size: 12.5px; } .neg { color: var(--danger); font-size: 12.5px; }
  .barres { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; align-items: end; }
  .barres button { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 4px; min-height: 88px; padding: 4px 0; border-radius: 10px; }
  .barres small { font-size: 10px; color: var(--faint); } .barres .j { color: var(--muted); }
  .barres i { width: 100%; max-width: 28px; border-radius: 7px; background: rgba(48, 80, 255, 0.55); } .barres i.on { background: var(--alerte); }
  .petit { font-size: 12.5px; line-height: 1.5; }
  .avance { display: flex; flex-direction: column; gap: 12px; } .ligne { color: var(--doux); font-size: 13.5px; }
  .gros { display: flex; flex-direction: column; gap: 2px; padding: 14px; border-radius: 18px; background: var(--carte); border: 1px solid var(--ligne); } .gros small { font-size: 10px; letter-spacing: 0.08em; color: var(--muted); } .gros b { font-size: 30px; font-weight: 500; }
  dl { display: flex; flex-direction: column; gap: 6px; } dl div { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; } dt { color: var(--muted); } dd { text-align: right; }
  .info { display: flex; gap: 10px; align-items: flex-start; font-size: 12.5px; color: var(--muted); line-height: 1.4; } .info :global(svg) { flex: none; color: var(--primaire-clair); margin-top: 1px; }
  .av { display: flex; flex-direction: column; gap: 8px; } .entete { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 14px; }
  ul { list-style: none; display: flex; flex-direction: column; gap: 4px; border-top: 1px solid var(--ligne); padding-top: 8px; } li { display: flex; justify-content: space-between; gap: 8px; font-size: 12.5px; color: var(--muted); }
  .recap { padding: 12px 0; } .err { color: var(--danger); font-size: 13px; }
  .fin { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; } .coche { width: 64px; height: 64px; border-radius: 32px; background: var(--bon); color: #07090f; display: grid; place-items: center; }
</style>
