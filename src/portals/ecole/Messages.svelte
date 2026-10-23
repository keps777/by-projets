<script lang="ts">
  import { jourCourt, jourDe } from '../../core/dates.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { ecole, type Cible, type Ecole } from '../../screens/ecole/etat.ts';
  import { envoyerAuxParents, messagesEnvoyes, messagesRecus } from './actions.ts';

  type Cibl = Cible & { libelle: string };
  let { ec, cibleInitiale }: { ec: Ecole; cibleInitiale?: Cibl } = $props();
  const e = $derived(ecole());
  const classes = $derived(Object.keys(e.classes[ec.id] ?? {}));
  const options = $derived.by<Cibl[]>(() => {
    const base: Cibl[] = [...classes.map((c) => ({ classe: c, libelle: `Parents de ${c} (${e.classes[ec.id][c].length})` })), { tous: true, libelle: `Tous les parents (${ec.familles})` }];
    return cibleInitiale && !base.some((b) => b.libelle === cibleInitiale.libelle) ? [...base, cibleInitiale] : base;
  });
  // svelte-ignore state_referenced_locally
  let choix = $state(cibleInitiale?.libelle ?? '');
  const cible = $derived(options.find((o) => o.libelle === choix) ?? options[0]);
  let texte = $state(''); let erreur = $state('');
  const envoyes = $derived(messagesEnvoyes(ec.id));
  const recus = $derived(messagesRecus(ec.id));
  const jour = (ts: number) => jourCourt(jourDe(new Date(ts)));
  function envoyer() {
    if (!cible) return;
    const { libelle, ...c } = cible;
    const r = envoyerAuxParents(ec.id, c, texte, libelle);
    if (r.ok) { texte = ''; erreur = ''; montrer(`Message envoyé : ${libelle}`); } else erreur = r.erreur;
  }
</script>

<section class="carte" aria-label="Nouveau message">
  <h2>Nouveau message</h2>
  <div><span class="lab">Destinataires</span>
    <div class="puces" role="radiogroup" aria-label="Destinataires">{#each options as o (o.libelle)}<button type="button" role="radio" aria-checked={cible?.libelle === o.libelle} class="puce" class:on={cible?.libelle === o.libelle} onclick={() => (choix = o.libelle)}>{o.libelle}</button>{/each}</div></div>
  <label class="et">Message<textarea bind:value={texte} class:invalide={!!erreur} aria-invalid={!!erreur} oninput={() => (erreur = '')}></textarea></label>
  {#if erreur}<p class="err" role="alert">{erreur}</p>{/if}
  <p class="muted">{texte.length} / 160 pour un seul SMS</p>
  <button class="btn" onclick={envoyer}>Envoyer dans l’app et par SMS</button>
</section>

<section class="carte" aria-label="Messages envoyés">
  <h2>Messages envoyés</h2>
  {#each envoyes as m (m.id)}
    <button class="hist" onclick={() => { texte = m.texte; choix = options.find((o) => o.libelle === m.de)?.libelle ?? choix; }}><b>{m.de} · {jour(m.ts)}</b><span>{m.texte}</span><small>Réutiliser ce message</small></button>
  {:else}<p class="muted">Aucun message envoyé pour l’instant.</p>{/each}
</section>

<section class="carte" aria-label="Messages des familles">
  <h2>Messages des familles</h2>
  {#each recus as m (m.id)}<div class="hist lu"><b>{m.de} · {jour(m.ts)}</b><span>{m.texte}</span></div>{:else}<p class="muted">Aucun message de famille.</p>{/each}
</section>

<style>
  .lab { display: block; font-size: 13px; font-weight: 600; color: var(--doux); margin-bottom: 8px; }
  .hist { text-align: left; display: flex; flex-direction: column; gap: 2px; padding: 12px; border-radius: 12px; border: 1px solid var(--ligne); min-height: 44px; } button.hist:hover { background: var(--carte2); } .hist small { color: #3050ff; }
</style>
