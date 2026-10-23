<script lang="ts">
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { quand } from '../../core/dates.ts';
  import { fcfa } from '../../core/money.ts';
  import { noteFr } from '../../core/bulletin.ts';
  import Ecran from '../../ui/Ecran.svelte';
  import Carte from '../../ui/Carte.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Pastille from '../../ui/Pastille.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { alertes, anneeRentree, anneeScolaire, bulletinDe, classeAffichee, demandesDe, envoyerMessage, messagesPour, nomEcole, payerDemande, planDe, rentreeCible } from './actions.ts';
  import { ecole } from './etat.ts';
  import CartePlan from './CartePlan.svelte';

  const e = $derived(ecole());
  let choisi = $state('');
  const enfant = $derived(e.enfants.find((x) => x.id === choisi) ?? e.enfants[0]);
  const bulletin = $derived(enfant ? bulletinDe(enfant) : null);
  const plans = $derived([...e.plans].sort((a, b) => a.rentree.localeCompare(b.rentree)));
  const cible = $derived(rentreeCible());
  const planCible = $derived(planDe(cible));
  const annee = $derived(plans.find((p) => p.statut === 'actif') ? anneeScolaire(plans.find((p) => p.statut === 'actif')!.rentree) : anneeScolaire(`${anneeRentree(cible) - 1}-09-01`));
  const liste = $derived(alertes());
  const recus = $derived(enfant ? messagesPour(enfant).filter((m) => m.sens === 'ecole').reverse().slice(0, 4) : []);
  const payable = (id?: string) => (id ? e.demandes.find((d) => d.id === id) : undefined);

  let stat = $state(-1);
  const stats = $derived.by(() => {
    if (!enfant || !bulletin) return [];
    const s = bulletin.synthese;
    const meilleure = [...s.matieres].sort((a, b) => b.moyenne - a.moyenne)[0];
    return [
      { v: s.moyenne === null ? '–' : noteFr(s.moyenne), l: 'Moyenne', d: s.moyenne === null ? 'pas de note' : 'sur 20', t: s.moyenne === null ? "L'école n'a pas encore publié de notes." : `Moyenne du trimestre ${noteFr(s.moyenne)} sur 20.${meilleure ? ` Meilleure matière : ${meilleure.matiere}, ${noteFr(meilleure.moyenne)}/20.` : ''}` },
      { v: s.rang === null ? '–' : s.rang === 1 ? '1er' : `${s.rang}e`, l: s.rang === null ? 'Rang' : `Rang / ${s.effectif}`, d: 'dans la classe', t: s.rang === null ? 'Le rang apparaît dès que des notes sont publiées.' : `${enfant.prenom} est ${s.rang}e sur ${s.effectif} élèves de la liste de classe.` },
      { v: String(enfant.absences), l: enfant.absences > 1 ? 'Absences' : 'Absence', d: enfant.aJustifier ? `${enfant.aJustifier} à justifier` : enfant.retards ? `${enfant.retards} retard` : 'à jour', t: enfant.aJustifier ? `${enfant.aJustifier} absence reste à justifier auprès de l'école.` : enfant.absences ? 'Toutes les absences sont justifiées.' : 'Aucune absence ce trimestre.' }
    ];
  });

  function payer(id: string) { const r = payerDemande(id); if (r.ok) montrer('Payé · reçu envoyé'); else montrer(r.erreur, 'danger'); }

  let chat = $state(false); let brouillon = $state(''); let erreurChat = $state('');
  const fil = $derived(enfant ? messagesPour(enfant) : []);
  function envoyer(texte: string) {
    if (!enfant) return;
    const r = envoyerMessage(enfant.id, texte);
    if (r.ok) { brouillon = ''; erreurChat = ''; } else erreurChat = r.erreur;
  }
</script>

<Ecran titre="Éducation" sur={annee} retourVers="/">
  {#if !enfant}
    <Carte>
      <div class="vide">
        <Icone nom="ecole" taille={34} />
        <h2>Aucun enfant pour l’instant</h2>
        <p class="muted">Ajoutez vos enfants : les écoles partenaires publient déjà leurs frais, il suffit de choisir comment les payer, en une seule mensualité sur salaire.</p>
        <Bouton href="/ecole/frais">Préparer la rentrée {anneeRentree(cible)}</Bouton>
      </div>
    </Carte>
  {:else}
    <div class="onglets" role="tablist" aria-label="Enfants">
      {#each e.enfants as x (x.id)}
        <button role="tab" aria-selected={x.id === enfant.id} class:on={x.id === enfant.id} onclick={() => { choisi = x.id; stat = -1; }}>{x.prenom} · {classeAffichee(x)}</button>
      {/each}
    </div>

    {#each plans as p (p.id)}<CartePlan plan={p} />{/each}
    {#if !plans.length}
      <Carte><p class="muted">Pas de plan de paiement en cours. Les frais de {enfant.prenom} sont publiés par {nomEcole(enfant.ecoleId)}.</p></Carte>
    {/if}

    <div class="bandeau"><span class="mono">SCOLARITÉ · {nomEcole(enfant.ecoleId).toUpperCase()}</span><a href={`/ecole/bulletin/${enfant.id}`} class="lien">Bulletin</a></div>
    <div class="stats">
      {#each stats as t, i (t.l)}
        <button class:on={stat === i} aria-pressed={stat === i} onclick={() => (stat = stat === i ? -1 : i)}><b class="mono">{t.v}</b><span>{t.l}</span><small>{t.d}</small></button>
      {/each}
    </div>
    {#if stat >= 0}<p class="note" role="status">{stats[stat].t}</p>{/if}

    {#if liste.length}
      <section aria-label="Alertes" class="bloc">
        <h3>Alertes</h3>
        {#each liste as a (a.id)}
          {#if a.lien}
            <a class="alerte {a.ton}" href={a.lien}><Icone nom="attention" taille={18} /><span><b>{a.titre}</b><small>{a.sous}</small></span></a>
          {:else}
            <div class="alerte {a.ton}"><Icone nom="attention" taille={18} /><span><b>{a.titre}</b><small>{a.sous}</small></span></div>
          {/if}
        {/each}
      </section>
    {/if}

    <section aria-label="Messages de l'école" class="bloc">
      <h3>Messages de l’école</h3>
      {#each recus as m (m.id)}
        {@const d = payable(m.demandeId)}
        <div class="msg">
          <span class="ini">{m.ini}</span>
          <div class="txt"><b>{m.de} <small>· {quand(m.ts, maintenant())}</small></b><p>{m.texte}</p>
            {#if d}
              {#if d.payee}<Pastille ton="bon">Payé · reçu envoyé</Pastille>
              {:else}<button class="payer" onclick={() => payer(d.id)}>Payer {fcfa(d.montant)}</button>{/if}
            {/if}
          </div>
        </div>
      {:else}
        <p class="muted">Aucun message pour {enfant.prenom}.</p>
      {/each}
      <Bouton variante="secondaire" onclick={() => (chat = true)}><Icone nom="info" taille={18} />Écrire à l’école</Bouton>
    </section>

    {#if planCible}
      <Carte href="/ecole/plan"><b>Rentrée {anneeRentree(cible)} : plan accepté</b><p class="muted">{fcfa(planCible.mensualite)} FCFA par mois sur {planCible.duree} mois. Voir le détail</p></Carte>
    {:else}
      <Bouton href="/ecole/frais">Préparer la rentrée {anneeRentree(cible)}</Bouton>
    {/if}
  {/if}
</Ecran>

<Feuille bind:ouverte={chat} titre={enfant ? nomEcole(enfant.ecoleId) : 'École'} sous="En ligne">
  <div class="fil" aria-live="polite">
    {#each fil as m (m.id)}<div class="bulle" class:moi={m.sens === 'famille'}>{m.texte}</div>{:else}<p class="muted">Écrivez votre premier message.</p>{/each}
  </div>
  <div class="rapides">
    {#each ['Merci, bien reçu', 'Je passe demain', "Pouvez-vous m'appeler ?"] as q (q)}<button onclick={() => envoyer(q)}>{q}</button>{/each}
  </div>
  <form class="saisie" onsubmit={(ev) => { ev.preventDefault(); envoyer(brouillon); }}>
    <input aria-label="Votre message" placeholder="Votre message…" bind:value={brouillon} maxlength="500" />
    <button type="submit" aria-label="Envoyer"><Icone nom="fleche" taille={18} /></button>
  </form>
  {#if erreurChat}<p class="err" role="alert">{erreurChat}</p>{/if}
</Feuille>

<style>
  .onglets { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; } .onglets button { min-height: 44px; padding: 0 16px; border-radius: 22px; background: var(--carte); border: 1px solid var(--ligne); color: var(--muted); white-space: nowrap; font-weight: 500; }
  .onglets button.on { background: var(--primaire-fond); border-color: var(--primaire); color: var(--texte); font-weight: 600; }
  .vide { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; } .vide h2 { font-size: 18px; }
  .bandeau { display: flex; justify-content: space-between; align-items: center; font-size: 10.5px; letter-spacing: 0.1em; color: var(--muted); } .lien { color: var(--primaire-clair); font-size: 14px; font-weight: 600; min-height: 44px; display: inline-flex; align-items: center; }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; } .stats button { background: var(--carte); border: 1px solid var(--ligne); border-radius: 18px; padding: 12px 8px; display: flex; flex-direction: column; align-items: center; gap: 2px; min-height: 88px; }
  .stats button.on { border-color: var(--primaire); } .stats b { font-size: 22px; font-weight: 600; } .stats span { font-size: 12.5px; color: var(--doux); } .stats small { color: var(--muted); font-size: 11.5px; }
  .note { background: var(--carte); border: 1px solid var(--ligne); border-radius: 14px; padding: 12px 14px; font-size: 13.5px; color: var(--doux); }
  .bloc { display: flex; flex-direction: column; gap: 10px; } h3 { font-size: 15px; }
  .alerte { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border-radius: 16px; background: var(--carte); border: 1px solid var(--ligne); min-height: 44px; }
  .alerte span { display: flex; flex-direction: column; } .alerte small { color: var(--muted); font-size: 12.5px; } .alerte b { font-size: 14px; }
  .alerte.danger { border-color: color-mix(in srgb, var(--danger) 55%, transparent); color: var(--danger); } .alerte.alerte { border-color: color-mix(in srgb, var(--alerte) 50%, transparent); color: var(--alerte); } .alerte.primaire { color: var(--pale); }
  .alerte b { color: var(--texte); }
  .msg { display: flex; gap: 12px; padding: 12px 14px; border-radius: 18px; background: var(--carte); border: 1px solid var(--ligne); } .ini { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; font: 600 11px var(--mono); background: var(--primaire-fond); color: var(--pale); flex: none; }
  .txt { display: flex; flex-direction: column; gap: 6px; min-width: 0; align-items: flex-start; } .txt b { font-size: 13.5px; } .txt small { color: var(--muted); font-weight: 400; } .txt p { color: var(--doux); font-size: 14px; }
  .payer { min-height: 44px; padding: 0 16px; border-radius: 22px; background: var(--alerte); color: #07090f; font-weight: 650; }
  .fil { display: flex; flex-direction: column; gap: 8px; min-height: 120px; max-height: 40dvh; overflow-y: auto; } .bulle { max-width: 82%; padding: 10px 14px; border-radius: 16px; background: var(--carte2); color: var(--doux); align-self: flex-start; font-size: 14.5px; }
  .bulle.moi { background: var(--primaire); color: #fff; align-self: flex-end; }
  .rapides { display: flex; flex-wrap: wrap; gap: 8px; } .rapides button { min-height: 44px; padding: 0 14px; border-radius: 22px; background: var(--carte2); border: 1px solid var(--ligne); font-size: 13.5px; }
  .saisie { display: flex; gap: 8px; } .saisie input { flex: 1; min-height: 48px; padding: 0 16px; border-radius: 24px; background: var(--carte2); border: 1px solid var(--ligne-forte); font-size: 16px; outline: none; } .saisie input:focus { border-color: var(--primaire); }
  .saisie button { width: 48px; height: 48px; border-radius: 24px; background: var(--primaire); color: #fff; display: grid; place-items: center; } .err { color: var(--danger); font-size: 13px; }
</style>
