<script lang="ts">
  import { app } from '../../data/store.svelte.ts';
  import { NOM_ROLE, peut } from '../../domain/acces.ts';
  import { connecter, personne } from '../../domain/actions.ts';
  import { aller, resoudre, ROUTES } from '../../router.svelte.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { GROUPES, PARCOURS, type Parcours } from './parcours.ts';
  import Siege from './Siege.svelte';

  let groupe = $state(0);
  const affiches = $derived(PARCOURS.filter((f) => groupe === 0 || f.groupe === groupe));
  const nomDe = (id: string) => personne(id)?.prenom ?? id;

  /** Connecte la personne choisie (démonstration : pas de PIN) puis ouvre l'écran. */
  function jouer(f: Parcours, joueurId: string, depuis = 0) {
    const p = personne(joueurId); if (!p) { montrer('Cette personne n’existe plus dans le monde simulé', 'er'); return; }
    if (!p.actif) { montrer(`${p.prenom} est suspendu(e) : réactive son compte dans Configuration`, 'er'); return; }
    connecter(p.id); montrer(`Connecté(e) en tant que ${p.prenom} ${p.nom} (démo)`); aller(f.etapes[depuis].chemin);
  }
  /** Une étape : si la route demande un rôle que la session n'a pas, on joue la personne du parcours qui l'a. */
  function ouvrir(e: MouseEvent, f: Parcours, chemin: string) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const route = resoudre(ROUTES, chemin)?.route;
    if (route?.roles && !peut(app.session.role, route.roles)) {
      // la personne du parcours qui a le droit d'ouvrir l'écran ; à défaut, n'importe quel compte actif du monde qui l'a (jamais renvoyé vers l'entrée)
      const qui = f.joueurs.map((j) => personne(j.id)).find((x) => x && x.actif && peut(x.role, route.roles!)) ?? app.monde.personnes.find((x) => x.actif && x.role !== 'patron' && peut(x.role, route.roles!));
      if (qui) { connecter(qui.id); montrer(`Connecté(e) en tant que ${qui.prenom} ${qui.nom} (démo)`); }
    }
    aller(chemin);
  }
</script>

<Siege actif="parcours" section="public">
  <div class="top">
    <div class="col"><h1 class="ttl">Tous les parcours</h1><span class="t13 mut">Chaque étape est un vrai écran d’AfriMove. Pars de la première et joue jusqu’au bout, ou entre directement par le rôle : « Jouer en tant que… » te connecte (démo) puis ouvre l’écran.</span></div>
    <div class="row g6 wrapf" role="group" aria-label="Filtrer par rôle">{#each GROUPES as n, i (n)}<button type="button" class="ch {groupe === i ? 'on' : ''}" aria-pressed={groupe === i} onclick={() => (groupe = i)}>{n}</button>{/each}</div>
  </div>
  <p class="t12 mut3" role="status">{affiches.length} parcours · {affiches.reduce((s, f) => s + f.etapes.length, 0)} étapes</p>
  <div class="gridp">
    {#each affiches as f (f.titre)}
      <section class="flow" aria-label={f.titre}>
        <div class="row sp"><span class="col"><h2 class="t15 b7">{f.titre}</h2><span class="t12 mut">{f.qui} · {f.etapes.length} étapes</span></span><span class="pl {f.ton}">{f.tag}</span></div>
        <div class="steps">
          {#each f.joueurs as j (j.id)}<button type="button" class="etape go" onclick={() => jouer(f, j.id, j.depuis ?? 0)}>Jouer en tant que {nomDe(j.id)}{personne(j.id) ? ` · ${NOM_ROLE[personne(j.id)!.role]}` : ''}</button>{/each}
        </div>
        <ol class="steps" style="list-style: none; padding: 0">
          {#each f.etapes as e, i (e.chemin + i)}<li class="row g6" style="display: contents"><a href={e.chemin} onclick={(ev) => ouvrir(ev, f, e.chemin)}>{e.nom}</a>{#if i < f.etapes.length - 1}<i aria-hidden="true">→</i>{/if}</li>{/each}
        </ol>
      </section>
    {:else}<p class="vide-etat">Aucun parcours pour ce filtre.</p>{/each}
  </div>
</Siege>
