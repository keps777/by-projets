<script lang="ts">
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { prochaine } from '../../data/paie.ts';
  import { aller } from '../../router.svelte.ts';
  import { fcfa } from '../../core/money.ts';
  import { pourcent } from '../../core/calendrier-paie.ts';
  import { heure, jourCourt, jourDe, jourSemaineLong, nomMois } from '../../core/dates.ts';
  import Icone from '../../ui/Icone.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Panneau from './Panneau.svelte';

  const TYPES = ['pass', 'credit', 'coffre'];
  const jour = $derived(app.dernierePaie);
  const duJour = $derived(jour ? app.mouvements.filter((m) => jourDe(new Date(m.ts)) === jour) : []);
  const salaire = $derived(duJour.find((m) => m.categorie === 'salaire'));
  const prelevements = $derived(duJour.filter((m) => TYPES.includes(m.categorie)));
  const preleve = $derived(prelevements.reduce((s, m) => s - m.montant, 0));
  const verse = $derived(salaire ? salaire.montant - preleve : 0);
  const part = $derived(salaire && salaire.montant > 0 ? pourcent(preleve / salaire.montant) : '0');
  const noms = $derived(prelevements.map((m) => m.categorie === 'pass' ? 'Pass' : m.categorie === 'coffre' ? 'coffre' : m.titre.split(' ')[0].toLowerCase()).join(', '));
  let feuille = $state<'employeur' | 'preleve' | 'recu' | null>(null);
  const ouverte = $derived(feuille !== null);
  const suivante = $derived(prochaine());
  const LIEN: Record<string, string> = { coffre: '/coffres', pass: '/sante', credit: '/prelevement' };
</script>

<main>
  <a class="fermer" href="/" aria-label="Fermer" onclick={(e) => { e.preventDefault(); aller('/'); }}><Icone nom="fermer" taille={18} trait={2.2} /></a>
  {#if !salaire || !jour}
    <div class="vide">
      <Icone nom="calendrier" taille={36} />
      <h1>Pas encore de paie traitée</h1>
      <p class="muted">{suivante ? `Votre prochaine paie est prévue le ${jourCourt(suivante)}` : 'Renseignez votre jour de paie pour suivre vos versements.'} Le jour venu, AssureMe prélève Pass, crédits et coffres, puis verse le reste sur votre solde.</p>
      <Bouton href="/prelevement">Voir ce qui sera prélevé</Bouton>
    </div>
  {:else}
    <header>
      <span class="mono lib">JOUR DE PAIE</span>
      <h1>{jourSemaineLong(jour).replace(/^./, (c) => c.toUpperCase())} · {heure(salaire.ts)}</h1>
      <ol class="etapes" aria-label="Suivi de la paie"><li><Icone nom="ok" taille={14} trait={2.6} />Employeur</li><li><Icone nom="ok" taille={14} trait={2.6} />Prélèvements</li><li><Icone nom="ok" taille={14} trait={2.6} />Versement</li></ol>
    </header>
    <h2>Tout est réglé. Vous n'avez rien à faire.</h2>
    <p class="muted">Votre employeur a versé, AssureMe a prélevé, le reste est sur votre solde.</p>

    <button type="button" class="flux" onclick={() => (feuille = 'employeur')}>
      <span class="ini">{app.compte?.employeur.slice(0, 2) ?? 'EM'}</span><span class="tx"><b>{app.compte?.employeur ?? 'Employeur'}</b><small>Salaire net de {nomMois(jour)}</small></span><b class="mono">{fcfa(salaire.montant)}</b>
    </button>
    <button type="button" class="flux" onclick={() => (feuille = 'preleve')}>
      <span class="ini pr"><Icone nom="protection" taille={16} /></span><span class="tx"><b>AssureMe prélève</b><small>{prelevements.length ? `${noms.charAt(0).toUpperCase()}${noms.slice(1)} · ${part} % du salaire` : 'Rien à prélever ce mois-ci'}</small></span><b class="mono">− {fcfa(preleve)}</b>
    </button>
    <button type="button" class="flux fin" onclick={() => (feuille = 'recu')}>
      <span class="ini ve"><Icone nom="recharge" taille={16} /></span><span class="tx"><b>Vous recevez</b><small>Sur votre solde AssureMe · {heure(salaire.ts)}</small></span><b class="mono">{fcfa(verse)}</b>
    </button>

    {#if prelevements.length}
      <h3 class="mono">{prelevements.length} PRÉLÈVEMENT{prelevements.length > 1 ? 'S' : ''} · {jour === jourDe(new Date(maintenant())) ? 'AUJOURD’HUI' : jourCourt(jour).toUpperCase()}</h3>
      <ul>
        {#each prelevements as m (m.id)}
          <li><a href={LIEN[m.categorie]} onclick={(e) => { e.preventDefault(); aller(LIEN[m.categorie]); }}><span class="tx"><b>{m.titre}</b><small>{m.sous}</small></span><b class="mono">{fcfa(-m.montant)}</b></a></li>
        {/each}
      </ul>
    {/if}
    <Bouton href="/prelevement">Voir le détail des {fcfa(preleve)} <Icone nom="fleche" taille={18} trait={2.2} /></Bouton>
  {/if}
</main>

<Panneau ouverte={ouverte} titre={feuille === 'employeur' ? (app.compte?.employeur ?? '') : feuille === 'preleve' ? 'AssureMe prélève' : `Vous recevez ${fcfa(verse)}`}>
  {#if feuille === 'employeur'}
    <p class="muted">Votre employeur a versé le salaire net. Il ne voit jamais le détail de vos prélèvements AssureMe.</p>
    <div class="kv"><span>Salaire net</span><b class="mono">{fcfa(salaire?.montant ?? 0)}</b></div>
  {:else if feuille === 'preleve'}
    <p class="muted">Les prélèvements sont faits avant que le salaire n'arrive sur votre solde : vous ne pouvez pas être en retard.</p>
    {#each prelevements as m (m.id)}<div class="kv"><span>{m.titre}</span><b class="mono">{fcfa(-m.montant)}</b></div>{/each}
    <div class="kv"><span>Total</span><b class="mono">{fcfa(preleve)}</b></div>
  {:else if feuille === 'recu'}
    <p class="muted">Le reste de votre salaire est sur votre solde, disponible tout de suite.</p>
    <div class="kv"><span>Solde actuel</span><b class="mono">{fcfa(app.solde)}</b></div>
  {/if}
  <Bouton onclick={() => (feuille = null)}>Fermer</Bouton>
</Panneau>

<style>
  .mono { white-space: nowrap; }
  main { min-height: 100dvh; padding: calc(env(safe-area-inset-top) + 16px) 20px 32px; display: flex; flex-direction: column; gap: 12px; position: relative; }
  .fermer { width: 44px; height: 44px; border-radius: 22px; background: var(--carte); border: 1px solid var(--ligne); display: grid; place-items: center; }
  header { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; } .lib { font-size: 10.5px; letter-spacing: 0.14em; color: var(--muted); } h1 { font-size: 22px; letter-spacing: -0.02em; }
  .etapes { list-style: none; display: flex; gap: 8px; flex-wrap: wrap; } .etapes li { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 99px; background: rgba(61, 213, 152, 0.14); color: var(--bon); font: 500 11px var(--mono); }
  h2 { font-size: 20px; letter-spacing: -0.02em; margin-top: 6px; } .vide { display: flex; flex-direction: column; gap: 12px; align-items: center; text-align: center; padding-top: 60px; color: var(--muted); } .vide h1 { color: var(--texte); }
  .flux { display: flex; align-items: center; gap: 12px; min-height: 68px; padding: 12px 14px; border-radius: 18px; background: var(--carte); border: 1px solid var(--ligne); text-align: left; width: 100%; } .flux.fin { border-color: var(--bon); background: linear-gradient(160deg, rgba(61, 213, 152, 0.12), var(--carte)); }
  .ini { width: 40px; height: 40px; border-radius: 12px; background: var(--carte2); display: grid; place-items: center; font: 600 12px var(--mono); flex: none; } .pr { background: var(--primaire-fond); color: var(--pale); } .ve { background: rgba(61, 213, 152, 0.14); color: var(--bon); }
  .tx { flex: 1; min-width: 0; display: flex; flex-direction: column; } .tx b { font-size: 14.5px; font-weight: 600; } .tx small { color: var(--muted); font-size: 12.5px; } .flux > b { font-size: 16px; font-weight: 500; }
  h3 { font-size: 10.5px; letter-spacing: 0.12em; color: var(--muted); font-weight: 500; margin-top: 8px; }
  ul { list-style: none; background: var(--carte); border: 1px solid var(--ligne); border-radius: 18px; padding: 0 14px; } li + li { border-top: 1px solid var(--ligne); } li a { display: flex; align-items: center; gap: 12px; min-height: 60px; } li a > b { font-size: 14.5px; font-weight: 500; }
  .kv { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--ligne); font-size: 14.5px; } .kv span { color: var(--muted); }
</style>
