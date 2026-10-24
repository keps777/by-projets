<script lang="ts">
  import { app, reinitialiser } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { connecter, personne, verifierPin } from '../../domain/actions.ts';
  import { ACCUEIL, NOM_ROLE, ROLES_EQUIPE, ROLES_PARTENAIRES, ROLES_SIEGE } from '../../domain/acces.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import type { Role } from '../../domain/types.ts';

  /** Entrée de démonstration : choisir une personne du monde simulé (PIN affiché en démo). Les voyageurs passent par /splash comme en vrai. */
  let choisie = $state<string | null>(null), saisie = $state(''), erreur = $state('');
  const groupes: { titre: string; roles: Role[] }[] = [{ titre: 'Équipe de gare', roles: ROLES_EQUIPE }, { titre: 'Patron et siège', roles: ROLES_SIEGE }, { titre: 'Partenaires', roles: ROLES_PARTENAIRES }];
  const gens = $derived(app.monde.personnes);
  const unique = (role: Role) => gens.filter((p) => p.role === role && p.pin && p.actif);
  const inactifs = $derived(gens.filter((p) => p.pin && !p.actif).length);
  const p = $derived(personne(choisie));
  function entrer(id: string) { connecter(id); aller(ACCUEIL[personne(id)!.role]); }
  function touche(c: string) { if (!p) return; saisie = (saisie + c).slice(0, 4); erreur = ''; if (saisie.length === 4) { if (verifierPin(p.id, saisie)) entrer(p.id); else { erreur = 'PIN incorrect'; saisie = ''; } } }
</script>

<Mobile titre="Entrer dans AfriMove" sous="Démonstration · choisis qui tu es" sansRetour>
  <a class="b p" href="/splash" onclick={(e) => { e.preventDefault(); aller('/splash'); }}>Je suis voyageuse · Aïcha</a>
  <button type="button" class="b s" onclick={() => entrer('p-aicha')}>Entrer directement comme Aïcha</button>
  {#each groupes as g (g.titre)}
    <span class="lab">{g.titre}</span>
    <div class="gl col" style="gap: 0">
      {#each g.roles.flatMap(unique) as x (x.id)}
        <button type="button" class="li" style="text-align: left" onclick={() => { choisie = x.id; saisie = ''; erreur = ''; }}>
          <span class="av sm">{x.prenom[0]}{x.nom[0]}</span>
          <span class="col grow"><span class="t14 b7">{x.prenom} {x.nom}</span><span class="t12 mut">{NOM_ROLE[x.role]}{x.gareId ? ` · ${x.gareId}` : ''}</span></span>
          <span class="mono t12 mut3">PIN {x.pin}</span>
        </button>
      {/each}
    </div>
  {/each}
  {#if inactifs}<p class="t12 mut3" role="status">{inactifs} compte{inactifs > 1 ? 's' : ''} suspendu{inactifs > 1 ? 's' : ''} (masqué{inactifs > 1 ? 's' : ''}) : réactive-le depuis le siège → Configuration.</p>{/if}
  <a class="b g" href="/parcours" onclick={(e) => { e.preventDefault(); aller('/parcours'); }}>Tous les parcours</a>
  <button type="button" class="b g" onclick={() => { reinitialiser(); }}>Remettre le monde à zéro</button>
</Mobile>

{#if p}
  <div class="voile" role="presentation" onclick={() => (choisie = null)}></div>
  <div class="sheet pin" role="dialog" aria-label="Code PIN de {p.prenom}">
    <span class="grab"></span>
    <span class="ttl t18 c">{p.prenom} {p.nom}</span>
    <span class="t13 mut c">{NOM_ROLE[p.role]} · PIN de démonstration {p.pin}</span>
    <div class="otp" aria-label="PIN">{#each [0, 1, 2, 3] as i (i)}<span class:on={saisie.length === i}>{saisie[i] ? '•' : ''}</span>{/each}</div>
    {#if erreur}<span class="t13 erc c" role="alert">{erreur}</span>{/if}
    <div class="pad">{#each ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as c (c)}<button type="button" onclick={() => touche(c)}>{c}</button>{/each}<span></span><button type="button" onclick={() => touche('0')}>0</button><button type="button" aria-label="Effacer" onclick={() => (saisie = saisie.slice(0, -1))}>⌫</button></div>
  </div>
{/if}

<style>
  .voile { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.55); z-index: 40; }
  .pin { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(100%, 460px); z-index: 41; margin: 0; }
  .otp { display: flex; gap: 8px; justify-content: center; } .otp span { width: 52px; height: 58px; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.06); display: grid; place-items: center; font: 700 26px 'Geist Mono', monospace; } .otp span.on { border-color: #3de0ff; }
</style>
