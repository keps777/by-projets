<script lang="ts">
  import Carte from '../../ui/Carte.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Champ from '../../ui/Champ.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { jourLong } from '../../core/dates.ts';
  import { fcfa } from '../../core/money.ts';
  import { codeCarte } from '../../core/sante.ts';
  import { app, maintenant, reinitialiser } from '../../data/store.svelte.ts';
  import { verifierPatient, type Droits } from '../../screens/sante/actions.ts';

  /** Identifier le patient : numéro (ou téléphone) + code de la carte (qui tourne toutes les 30 s). */
  let { droits = $bindable(null), patient = $bindable('') }: { droits?: Extract<Droits, { ok: true }> | null; patient?: string } = $props();
  let membre = $state(''); let code = $state(''); let erreur = $state(''); let lecture = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(timer));

  function verifier(e?: Event) {
    e?.preventDefault();
    const d = verifierPatient(membre, code);
    if (d.ok) { droits = d; patient = d.beneficiaires.includes(patient) ? patient : d.beneficiaires[0]; erreur = ''; } else { droits = null; erreur = d.erreur; }
  }
  /** Simulation de la lecture du QR : sur cet appareil de démonstration, on lit la carte du compte ouvert. */
  function lire() {
    erreur = ''; lecture = true; clearTimeout(timer);
    timer = setTimeout(() => {
      lecture = false;
      if (!app.compte) { erreur = 'Aucune carte à lire sur cet appareil.'; return; }
      membre = app.compte.numeroMembre; code = codeCarte(app.compte.numeroMembre, maintenant()); verifier();
    }, 1200);
  }
  function nouveau() { droits = null; membre = ''; code = ''; erreur = ''; }
  const initiales = (nom: string) => nom.split(' ').map((m) => m[0]).slice(0, 2).join('');
</script>

<Carte rayon={16}>
  <h2>Vérifier un patient</h2>
  {#if !app.compte}
    <div class="vide" role="status"><p><b>Aucun membre AssureMe sur cet appareil.</b></p><p class="muted">Ce portail lit les données de l'application du membre. Créez un compte, ou chargez les données de démonstration (Aïcha Ndiba).</p>
      <Bouton variante="secondaire" plein={false} onclick={() => reinitialiser('demo')}>Charger la démonstration</Bouton></div>
  {/if}
  <form onsubmit={verifier}>
    <Champ etiquette="Numéro de membre ou téléphone" bind:valeur={membre} placeholder="AM4821 ou 690 12 34 56" oninput={() => (erreur = '')} />
    <Champ etiquette="Code de la carte (6 chiffres)" bind:valeur={code} inputmode="numeric" placeholder="483 920" oninput={() => (erreur = '')} />
    <div class="boutons"><Bouton type="submit" plein={false}>Vérifier</Bouton><Bouton variante="secondaire" plein={false} onclick={lire} desactive={lecture}><Icone nom="scan" taille={18} />Lire la carte (démo)</Bouton></div>
  </form>
  <p class="aide muted">Le code change toutes les 30 secondes : demandez au patient de montrer l'écran de sa carte. « Lire la carte » simule le scan du QR.</p>
  {#if lecture}<p class="info" role="status">Lecture de la carte en cours…</p>{/if}
  {#if erreur}<p class="err" role="alert">{erreur}</p>{/if}
</Carte>

{#if droits}
  <Carte rayon={16}>
    <div class="pat"><span class="av" aria-hidden="true">{initiales(droits.titulaire)}</span>
      <div><b>{droits.titulaire}</b><small>Membre {droits.numeroMembre} · AssureMe Santé {droits.pass[0].toUpperCase()}{droits.pass.slice(1)}{app.compte?.employeur ? ` · employeur ${app.compte.employeur}` : ''}</small></div>
      <span class="actif"><Icone nom="ok" taille={14} trait={2.4} />Couverture active</span></div>
    <dl>
      <div><dt>Prise en charge</dt><dd>{Math.round(droits.taux * 100)} %</dd></div>
      <div><dt>Pharmacie sur ordonnance</dt><dd>{Math.round(droits.pharmacie * 100)} %</dd></div>
      <div><dt>Plafond restant</dt><dd class="mono" class:zero={droits.restant <= 0}>{fcfa(droits.restant)}</dd></div>
      <div><dt>Valide jusqu'au</dt><dd>{jourLong(droits.validiteJusqua)}</dd></div>
    </dl>
    {#if droits.restant <= 0}<p class="err" role="alert">Plafond annuel atteint : AssureMe ne prend plus rien en charge, le patient paiera la totalité.</p>{/if}
    <div class="chips" role="radiogroup" aria-label="Patient du jour"><span class="lab">Patient du jour</span>
      {#each droits.beneficiaires as b (b)}<button role="radio" aria-checked={patient === b} class:on={patient === b} onclick={() => (patient = b)}>{b}</button>{/each}</div>
    <button class="autre" onclick={nouveau}>Changer de membre</button>
  </Carte>
{/if}

<style>
  h2 { font-size: 17px; margin-bottom: 12px; } form { display: flex; flex-direction: column; gap: 12px; } .boutons { display: flex; flex-wrap: wrap; gap: 8px; }
  .aide { font-size: 12.5px; margin-top: 10px; } .info { margin-top: 8px; color: var(--primaire); font-size: 13.5px; } .err { margin-top: 8px; color: #b3261e; font-size: 13.5px; }
  .vide { background: var(--carte2); border-radius: 12px; padding: 12px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 8px; font-size: 13.5px; }
  .pat { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; } .pat div { flex: 1; min-width: 180px; display: flex; flex-direction: column; } small { color: var(--muted); font-size: 12.5px; }
  .av { width: 44px; height: 44px; border-radius: 22px; background: var(--primaire-fond); color: var(--primaire); display: grid; place-items: center; font-weight: 700; }
  .actif { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 99px; background: #e2f6ec; color: #0b5a3a; font-size: 12px; font-weight: 600; }
  dl { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; margin: 14px 0; } dl div { display: flex; flex-direction: column; } dt { color: var(--muted); font-size: 12px; } dd { font-weight: 650; font-size: 17px; } .zero { color: #b3261e; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; } .lab { color: var(--muted); font-size: 12px; margin-right: 4px; }
  .chips button { min-height: 44px; padding: 0 16px; border-radius: 22px; border: 1px solid var(--ligne-forte); background: var(--carte); font-weight: 550; } .chips button.on { border-color: var(--primaire); background: var(--primaire-fond); color: var(--primaire); }
  .autre { margin-top: 10px; min-height: 44px; color: var(--primaire); font-weight: 600; }
</style>
