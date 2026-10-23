<script lang="ts">
  import { app } from '../../data/store.svelte.ts';
  import { ajouterMois, jourLong, moisAnnee, nomMois } from '../../core/dates.ts';
  import { calendrierPlan } from '../../core/ecole.ts';
  import { DUREES_PLAN, evaluerPlan } from '../../core/ecole-plan.ts';
  import { fcfa } from '../../core/money.ts';
  import Ecran from '../../ui/Ecran.svelte';
  import Carte from '../../ui/Carte.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Pastille from '../../ui/Pastille.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Puces from './Puces.svelte';
  import CartePlan from './CartePlan.svelte';
  import { accepterPlan, anneeRentree, planDe, premiereMensualite, recap, rentreeCible, simuler } from './actions.ts';

  const cible = rentreeCible();
  const r = $derived(recap());
  const accepte = $derived(planDe(cible));
  let duree = $state(10);
  const sim = $derived(simuler(duree, r.aFinancer));
  const res = $derived(sim?.resultat);
  const offres = $derived(DUREES_PLAN.map((d) => ({ valeur: d, label: `${d} mois`, sous: `${fcfa(evaluerPlan({ ...sim!.entree, duree: d }).mensualite)} / mois` })));
  const debut = $derived(premiereMensualite(cible));
  const fin = $derived(ajouterMois(debut, duree - 1, app.compte?.jourPaie));
  const cal = $derived(calendrierPlan(cible, duree));
  let mois = $state(0);
  const texteMois = $derived.by(() => {
    const c = cal[mois]; if (!c || !res) return '';
    const nom = `${nomMois(c.jour)} ${c.jour.slice(0, 4)}`;
    if (c.etat === 'ecoles') return `${nom} · mensualité 1 / ${duree} : ${fcfa(res.mensualite)} le ${app.compte?.jourPaie}. Les écoles, elles, sont payées le jour de l’accord.`;
    if (c.etat === 'mensualite') return `${nom} · mensualité ${mois + 1} / ${duree} : ${fcfa(res.mensualite)} le ${app.compte?.jourPaie}.`;
    return `${nom} · rien à payer, le crédit est terminé.`;
  });
  const pourcent = (x: number) => (x * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 });

  let signer = $state(false); let accord = $state(false); let erreur = $state('');
  function valider() {
    const a = accepterPlan(duree);
    if (!a.ok) { erreur = a.erreur; return; }
    signer = false; accord = false; erreur = '';
    montrer('Plan accepté · les écoles sont payées');
  }
</script>

<Ecran titre="Plan de paiement" sur={accepte ? `RENTRÉE ${anneeRentree(cible)}` : `ÉTAPE 2 / 2 · ${fcfa(r.aFinancer)} À FINANCER`} retourVers={accepte ? '/ecole' : '/ecole/frais'}>
  {#if accepte}
    <Carte accent="var(--bon)"><div class="succes"><Icone nom="ok" taille={26} trait={2.4} /><div><b>Plan accepté le {jourLong(accepte.accord)}</b><p class="muted">Signé par {accepte.signataire}. Les écoles ont reçu les frais.</p></div></div></Carte>
    <CartePlan plan={accepte} />
    <Carte>
      <h3>Écoles payées</h3>
      {#each accepte.lignes as l (l.enfantId)}<div class="ligne"><span>{l.ecole}<small>{l.prenom} · {l.niveau}</small></span><b class="mono">{fcfa(l.montant)}</b></div>{/each}
      <div class="ligne fort"><span>Total{accepte.coffre ? ` (dont ${fcfa(accepte.coffre)} du coffre)` : ''}</span><b class="mono">{fcfa(accepte.total)}</b></div>
    </Carte>
    <Bouton href="/ecole">Retour à l’éducation</Bouton>
  {:else if !res || r.aFinancer <= 0}
    <Carte><p class="muted">Rien à financer pour l’instant. Choisissez d’abord les enfants de la rentrée {anneeRentree(cible)}.</p></Carte>
    <Bouton href="/ecole/frais">Choisir les enfants</Bouton>
  {:else}
    <Carte accent={res.approuve ? 'var(--primaire)' : 'var(--danger)'}>
      <small class="mono">SUR SALAIRE, LE {app.compte?.jourPaie} DE CHAQUE MOIS</small>
      <p class="gros"><span class="mono">{fcfa(res.mensualite)}</span> <em>FCFA</em></p>
      <p class="muted">{duree} mensualités · de {moisAnnee(debut)} à {moisAnnee(fin)}</p>
    </Carte>

    <section aria-label="Durée du plan">
      <h3>Étaler sur</h3>
      <Puces etiquette="Durée du plan" bind:valeur={duree} options={offres} />
    </section>

    <section aria-label="Jour de prélèvement">
      <h3>Jour de prélèvement</h3>
      <p class="muted">Le {app.compte?.jourPaie} de chaque mois, le jour de votre paie : le prélèvement suit votre salaire et ne peut pas tomber avant.</p>
    </section>

    <section aria-label="Calendrier du plan">
      <h3>Calendrier · touchez un mois</h3>
      <div class="cal">
        {#each cal as c, i (c.jour)}
          <button class={c.etat} class:sel={i === mois} aria-pressed={i === mois} aria-label={`${nomMois(c.jour)} ${c.jour.slice(0, 4)}`} onclick={() => (mois = i)}>{c.lettre}</button>
        {/each}
      </div>
      <p class="muted" role="status">{texteMois}</p>
    </section>

    <Carte>
      <div class="ligne"><span>Frais · {res.taux === 0 ? '0 %' : `${pourcent(res.taux)} %`} par mois</span><b class="mono">{fcfa(res.cout)}</b></div>
      <div class="ligne"><span>Total remboursé</span><b class="mono">{fcfa(res.totalRembourse)}</b></div>
      <div class="ligne"><span>Part du salaire, tous crédits<small>{fcfa(sim!.entree.mensualitesExistantes)} déjà prélevés + {fcfa(res.mensualite)}</small></span><b class="mono" class:mauvais={res.part > 0.33 + 1e-9} class:bon={res.part <= 0.33 + 1e-9}>{pourcent(res.part)} %</b></div>
    </Carte>

    <section aria-label="Décision" class="controles">
      <h3>Décision automatique</h3>
      {#each res.controles as c (c.id)}
        <div class="ctrl" class:ko={!c.ok}><Icone nom={c.ok ? 'ok' : 'fermer'} taille={18} trait={2.4} /><span><b>{c.titre}</b><small>{c.detail}</small></span><Pastille ton={c.ok ? 'bon' : 'danger'}>{c.tag}</Pastille></div>
      {/each}
    </section>

    {#if !res.approuve}
      <div class="refus" role="alert">
        <b>Au-dessus de 33 % : étalez plus longtemps</b>
        {#if sim?.alternative}
          <p>Sur {sim.alternative} mois, la mensualité serait de {fcfa(evaluerPlan({ ...sim.entree, duree: sim.alternative }).mensualite)} FCFA et resterait sous les 33 % de votre salaire.</p>
          <Bouton variante="secondaire" onclick={() => (duree = sim.alternative!)}>Passer à {sim.alternative} mois</Bouton>
        {:else}
          <p>Même sur 12 mois, ce montant dépasse ce que votre salaire permet. Décochez un enfant ou augmentez votre coffre : vous pouvez financer au plus {fcfa(sim?.maxFinancable ?? 0)} FCFA.</p>
          <Bouton variante="secondaire" href="/ecole/frais">Modifier les enfants</Bouton>
        {/if}
      </div>
    {/if}

  {/if}

  {#snippet pied()}
    {#if !accepte && res && r.aFinancer > 0}<Bouton desactive={!res.approuve} onclick={() => { signer = true; erreur = ''; }}>Payer les écoles dès l’accord<Icone nom="suivant" taille={18} /></Bouton>{/if}
  {/snippet}
</Ecran>

<Feuille bind:ouverte={signer} titre="Accord du plan" sous="Signature">
  {#if res}
    <div class="recap">
      <div class="ligne"><span>À financer</span><b class="mono">{fcfa(r.aFinancer)}</b></div>
      <div class="ligne"><span>Mensualité</span><b class="mono">{fcfa(res.mensualite)} × {duree}</b></div>
      <div class="ligne"><span>Première mensualité</span><b>{jourLong(debut)}</b></div>
      <div class="ligne"><span>Coût du crédit</span><b class="mono">{fcfa(res.cout)}</b></div>
      <div class="ligne"><span>Versé aux écoles aujourd’hui</span><b class="mono">{fcfa(r.total)}</b></div>
    </div>
    <label class="accord"><input type="checkbox" bind:checked={accord} /><span>J’accepte ce plan : AssureMe paie les écoles maintenant et je rembourse {fcfa(res.mensualite)} FCFA par mois sur mon salaire, le {app.compte?.jourPaie}.</span></label>
    {#if erreur}<p class="err" role="alert">{erreur}</p>{/if}
    <Bouton desactive={!accord} onclick={valider}>Signer et accepter</Bouton>
    <Bouton variante="discret" onclick={() => (signer = false)}>Annuler</Bouton>
  {/if}
</Feuille>

<style>
  small { font: 500 10.5px var(--mono); letter-spacing: 0.1em; color: var(--muted); text-transform: uppercase; } h3 { font-size: 15px; margin-bottom: 8px; }
  .gros { font-size: 44px; font-weight: 600; margin: 6px 0; line-height: 1.1; } .gros em { font-style: normal; font-size: 18px; color: var(--muted); }
  .succes { display: flex; gap: 12px; align-items: center; color: var(--bon); } .succes b { color: var(--texte); }
  .ligne { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--ligne); } .ligne:last-child { border: 0; } .ligne span { display: flex; flex-direction: column; }
  .ligne small { font: 400 12px var(--sans); letter-spacing: 0; text-transform: none; } .ligne.fort { font-weight: 600; } .bon { color: var(--bon); } .mauvais { color: var(--danger); }
  .cal { display: grid; grid-template-columns: repeat(12, 1fr); gap: 4px; margin-bottom: 10px; }
  .cal button { min-height: 44px; border-radius: 10px; background: var(--carte); border: 1px solid var(--ligne); color: var(--muted); font: 500 12px var(--mono); } .cal button.mensualite { background: var(--primaire); color: #fff; border-color: transparent; } .cal button.ecoles { background: var(--bon); color: #07090f; border-color: transparent; }
  .cal button.sel { outline: 2px solid var(--texte); outline-offset: 1px; }
  .controles { display: flex; flex-direction: column; gap: 8px; } .ctrl { display: grid; grid-template-columns: 22px 1fr auto; gap: 10px; align-items: start; padding: 12px; border-radius: 14px; background: var(--carte); border: 1px solid var(--ligne); color: var(--bon); }
  .ctrl.ko { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 50%, transparent); } .ctrl span { display: flex; flex-direction: column; gap: 2px; color: var(--texte); } .ctrl small { font: 400 12.5px var(--sans); letter-spacing: 0; text-transform: none; color: var(--muted); }
  .refus { padding: 14px; border-radius: 16px; border: 1px solid var(--danger); background: rgba(255, 114, 114, 0.08); display: flex; flex-direction: column; gap: 10px; } .refus b { color: var(--danger); } .refus p { font-size: 14px; color: var(--doux); }
  .recap { display: flex; flex-direction: column; } .accord { display: flex; gap: 12px; align-items: flex-start; font-size: 14px; color: var(--doux); min-height: 44px; } .accord input { width: 24px; height: 24px; margin-top: 2px; flex: none; accent-color: var(--primaire); }
  .err { color: var(--danger); font-size: 13px; }
</style>
