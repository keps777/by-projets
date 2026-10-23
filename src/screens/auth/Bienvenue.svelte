<script lang="ts">
  import { app } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import Bouton from '../../ui/Bouton.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Logo from './Logo.svelte';
  import { activerDemo } from './actions.ts';

  const cartes = [
    { k: 'SANTÉ', icone: 'sante', teinte: 'var(--bon)', t: "Zéro franc à sortir à l'accueil de l'hôpital.", s: 'Tiers payant dans les cliniques, pharmacies et laboratoires du réseau.' },
    { k: 'MOBILITÉ', icone: 'auto', teinte: 'var(--alerte)', t: 'Une voiture ou une moto, remboursée sur salaire.', s: 'Décision en 2 minutes. Assurance et entretien dans la mensualité.' },
    { k: 'LOGEMENT', icone: 'logement', teinte: 'var(--primaire-clair)', t: "L'avance de loyer payée au bailleur le jour de la signature.", s: 'Puis le loyer réglé chaque 1er du mois, et chaque paiement monte votre score.' },
    { k: 'ÉDUCATION', icone: 'ecole', teinte: 'var(--pale)', t: 'La rentrée payée à l\'école dès septembre.', s: 'Et les notes de vos enfants directement dans l\'app.' },
    { k: 'ASSURESCORE', icone: 'score', teinte: 'var(--or)', t: 'Chaque paiement débloque le pilier suivant.', s: 'Start, Plus, Pro, Elite : un seul score pour toute la famille.' }
  ];
  const n = cartes.length;
  let courante = $state(0);
  const suivante = () => (courante = (courante + 1) % n);
  const precedente = () => (courante = (courante - 1 + n) % n);

  // Glisser la carte du dessus : au-delà de 60 px la pile avance ou recule.
  let depart: number | null = null;
  let decalage = $state(0);
  function appui(e: PointerEvent) { depart = e.clientX; decalage = 0; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
  function bouge(e: PointerEvent) { if (depart != null) decalage = e.clientX - depart; }
  function lache() {
    if (depart == null) return;
    if (decalage < -60) suivante(); else if (decalage > 60) precedente();
    depart = null; decalage = 0;
  }

  let confirmerDemo = $state(false);
  let enCours = $state(false);
  const compteExistant = $derived(!!app.auth.hash && app.mode === 'vierge');
  async function essayerDemo() {
    if (enCours) return;
    if (compteExistant && !confirmerDemo) { confirmerDemo = true; return; }
    enCours = true; confirmerDemo = false;
    await activerDemo();
    enCours = false;
    aller('/');
  }
</script>

<main class="bienvenue">
  <header>
    <Logo taille={28} nom />
    <button type="button" class="langue" aria-label="Changer de langue : le français est la seule langue disponible pour l'instant" onclick={() => montrer('English : bientôt disponible')}>FR · EN</button>
  </header>

  <div class="titre">
    <h1>Les grosses dépenses de la vie, en mensualités.</h1>
    <p>Un compte, un score, un prélèvement. Vos partenaires sont payés directement.</p>
  </div>

  <div class="scene" role="group" aria-roledescription="carrousel" aria-label="Ce qu'AssureMe finance">
    {#each cartes as c, i (c.k)}
      {@const rang = (i - courante + n) % n}
      <article
        class="carte" class:devant={rang === 0} style:--teinte={c.teinte}
        style:transform={rang === 0 ? `translateX(${decalage}px) rotate(${decalage / 40}deg)` : `translateY(${Math.min(rang, 3) * 14}px) scale(${1 - Math.min(rang, 3) * 0.055})`}
        style:opacity={rang > 2 ? 0 : 1} style:z-index={n - rang}
        aria-hidden={rang !== 0} aria-label="Carte {i + 1} sur {n}"
        onpointerdown={rang === 0 ? appui : undefined} onpointermove={rang === 0 ? bouge : undefined} onpointerup={rang === 0 ? lache : undefined} onpointercancel={rang === 0 ? lache : undefined}
      >
        <div class="haut"><span class="ico"><Icone nom={c.icone} taille={22} /></span><span class="kick">{c.k}</span><span class="num mono">{i + 1} / {n}</span></div>
        <h2>{c.t}</h2>
        <p>{c.s}</p>
      </article>
    {/each}
  </div>

  <div class="nav">
    <button type="button" class="rond" aria-label="Carte précédente" onclick={precedente}><Icone nom="retour" taille={18} trait={2.2} /></button>
    <div class="points" aria-hidden="true">{#each cartes as c, i (c.k)}<i class:on={i === courante}></i>{/each}</div>
    <button type="button" class="suiv" onclick={suivante}>Suivante<Icone nom="suivant" taille={16} trait={2.2} /></button>
  </div>
  <p class="glisse" aria-hidden="true">← GLISSEZ LES CARTES →</p>

  <div class="actions">
    <Bouton href="/inscription/telephone">Créer mon compte en 2 minutes</Bouton>
    <Bouton variante="secondaire" href="/connexion">J'ai déjà un compte</Bouton>
    <button type="button" class="demo" onclick={essayerDemo} disabled={enCours}>{enCours ? 'Ouverture du compte de démonstration…' : 'Essayer avec un compte de démonstration'}</button>
    <p class="legal">Crédit opéré avec [ÉTABLISSEMENT AGRÉÉ COBAC] · Assurances portées par [ASSUREUR AGRÉÉ CIMA]</p>
  </div>
</main>

<Feuille bind:ouverte={confirmerDemo} titre="Remplacer le compte ?" sous="Démonstration">
  <p class="muted">Un compte est déjà enregistré sur cet appareil. Passer en démonstration le remplace par celui d'Aïcha Ndiba (données d'exemple).</p>
  <Bouton onclick={essayerDemo}>Ouvrir la démonstration</Bouton>
  <Bouton variante="discret" onclick={() => (confirmerDemo = false)}>Annuler</Bouton>
</Feuille>

<style>
  .bienvenue { display: flex; flex-direction: column; min-height: 100dvh; padding: calc(env(safe-area-inset-top) + 14px) 20px calc(env(safe-area-inset-bottom) + 16px); gap: 14px; position: relative; overflow: hidden; }
  header { display: flex; align-items: center; justify-content: space-between; min-height: 44px; }
  .langue { min-width: 64px; min-height: 44px; border-radius: 22px; padding: 0 14px; background: var(--carte); border: 1px solid var(--ligne); font: 500 11px var(--mono); letter-spacing: 0.1em; color: var(--doux); }
  h1 { font-size: 28px; font-weight: 650; letter-spacing: -0.04em; line-height: 1.08; } .titre p { color: var(--muted); font-size: 14.5px; line-height: 1.45; margin-top: 8px; }
  .scene { position: relative; height: 218px; margin: 6px 0 4px; touch-action: pan-y; border-radius: 26px; }
  .carte { position: absolute; inset: 0 8px 28px; padding: 18px; border-radius: 24px; background: linear-gradient(160deg, color-mix(in srgb, var(--teinte) 16%, var(--carte2)), var(--carte) 70%); border: 1px solid color-mix(in srgb, var(--teinte) 40%, transparent); display: flex; flex-direction: column; gap: 10px; transition: transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.3s; user-select: none; box-shadow: 0 18px 40px -20px rgba(0, 0, 0, 0.7); }
  .devant { cursor: grab; transition: transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.3s; }
  .haut { display: flex; align-items: center; gap: 10px; } .ico { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; color: var(--teinte); background: color-mix(in srgb, var(--teinte) 16%, transparent); flex: none; }
  .kick { font: 500 11px var(--mono); letter-spacing: 0.12em; color: var(--teinte); flex: 1; } .num { font-size: 11px; color: var(--muted); }
  h2 { font-size: 19px; font-weight: 650; letter-spacing: -0.02em; line-height: 1.2; } .carte p { color: var(--doux); font-size: 13.5px; line-height: 1.4; }
  .nav { display: flex; align-items: center; gap: 12px; } .rond { width: 44px; height: 44px; border-radius: 22px; background: var(--carte); border: 1px solid var(--ligne); display: grid; place-items: center; flex: none; }
  .points { flex: 1; display: flex; justify-content: center; align-items: center; gap: 6px; } .points i { width: 6px; height: 6px; border-radius: 3px; background: #1e2638; transition: all 0.25s; } .points i.on { width: 18px; background: var(--texte); }
  .suiv { display: inline-flex; align-items: center; gap: 4px; min-height: 44px; padding: 0 16px; border-radius: 22px; background: var(--carte); border: 1px solid var(--ligne); font-weight: 600; font-size: 14px; }
  .glisse { text-align: center; font: 400 10px var(--mono); letter-spacing: 0.14em; color: var(--faint); }
  .actions { margin-top: auto; display: flex; flex-direction: column; gap: 10px; }
  .demo { min-height: 44px; color: var(--primaire-clair); font-weight: 600; font-size: 14px; } .demo:disabled { opacity: 0.6; }
  .legal { text-align: center; font: 400 10px var(--mono); letter-spacing: 0.04em; color: var(--faint); line-height: 1.5; }
</style>
