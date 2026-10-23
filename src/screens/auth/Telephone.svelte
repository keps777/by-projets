<script lang="ts">
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import Bouton from '../../ui/Bouton.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { chiffresTel, formaterTel, operateurDuNumero, telValide } from '../../core/auth.ts';
  import { statutEmployeur, trouverEmployeur } from '../../core/inscription.ts';
  import Etape from './Etape.svelte';
  import { envoyerOtp } from './actions.ts';
  import { etatAuth } from './etat.ts';

  const e = etatAuth();
  const b = e.brouillon;
  let tel = $state(b.tel ? formaterTel(b.tel) : '');
  let emp = $state(b.employeur);
  let operateur = $state(b.operateur);
  let envoi = $state(false);

  const OPERATEURS = [{ nom: 'Orange', libelle: 'Orange Money', teinte: '#ff7a2f' }, { nom: 'MTN', libelle: 'MTN Money', teinte: '#e9b93b' }, { nom: 'Camtel', libelle: 'Camtel', teinte: '#7c93ff' }];
  const chiffres = $derived(chiffresTel(tel));
  const valide = $derived(telValide(tel));
  const statut = $derived(statutEmployeur(emp));
  const employeur = $derived(trouverEmployeur(emp));
  const existant = $derived(!!app.auth.hash && app.compte?.telephone === chiffres);

  function saisie(v: string) {
    tel = formaterTel(v);
    const op = operateurDuNumero(tel);
    if (op) operateur = OPERATEURS.findIndex((o) => o.nom === op);
  }
  async function envoyer() {
    if (!valide || envoi) return;
    envoi = true;
    b.tel = chiffres; b.operateur = operateur; b.employeur = statut === 'valide' ? emp.trim().toUpperCase() : '';
    if (b.etape === 0) b.debut = maintenant();
    b.etape = 1;
    await envoyerOtp(chiffres);
    envoi = false;
    aller('/inscription/code');
  }
</script>

<Etape retourVers="/bienvenue" repere="ÉTAPE 1 / 5 · 20 SECONDES" segments={5} segmentActif={1} titre="Votre numéro, et le code de votre employeur." sous="Le code employeur active le prélèvement sur salaire et votre niveau de départ.">
  <div class="champ" class:ok={valide}>
    <label for="tel">TÉLÉPHONE</label>
    <div class="boite">
      <span class="pref mono">+237</span>
      <input id="tel" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="6 XX XX XX XX" value={tel} oninput={(ev) => saisie(ev.currentTarget.value)} aria-describedby="tel-aide" />
      {#if valide}<span class="coche" aria-hidden="true"><Icone nom="ok" taille={18} trait={2.4} /></span>{/if}
    </div>
    <div class="ops" role="radiogroup" aria-label="Opérateur mobile">
      {#each OPERATEURS as o, i (o.nom)}
        <button type="button" role="radio" aria-checked={operateur === i} class:on={operateur === i} onclick={() => (operateur = i)}><i style:background={o.teinte}></i>{o.libelle}</button>
      {/each}
    </div>
    <p id="tel-aide" class="aide" class:err={!!chiffres && !valide}>
      {#if !chiffres}Numéro camerounais à 9 chiffres, par exemple 6 91 22 48 21.
      {:else if chiffres.length < 9}Entrez votre numéro à 9 chiffres.
      {:else if !valide}Un numéro camerounais commence par 6 (mobile) ou 2 (fixe).
      {:else}Nous enverrons un code par SMS à ce numéro.{/if}
    </p>
    {#if existant}<p class="aide">Un compte existe déjà sur cet appareil pour ce numéro. <a href="/connexion" onclick={(ev) => { ev.preventDefault(); aller('/connexion'); }}>Se connecter</a></p>{/if}
  </div>

  <div class="champ" class:ok={statut === 'valide'} class:bad={statut === 'inconnu'}>
    <label for="emp">CODE EMPLOYEUR <span>(FACULTATIF)</span></label>
    <div class="boite">
      <input id="emp" type="text" autocapitalize="characters" autocomplete="off" maxlength="14" placeholder="NDIBA-2026" bind:value={emp} />
      {#if statut === 'valide'}<span class="coche" aria-hidden="true"><Icone nom="ok" taille={18} trait={2.4} /></span>{/if}
      {#if statut === 'inconnu'}<span class="alerte" aria-hidden="true"><Icone nom="attention" taille={18} /></span>{/if}
    </div>
  </div>

  {#if statut === 'valide' && employeur}
    <div class="carte-emp ok" role="status"><span class="logo-emp">NL</span><div><b>{employeur.nom}</b><small>Partenaire vérifié · {employeur.effectif} salariés · part employeur {Math.round(employeur.part * 100)} % du Pass</small></div></div>
  {:else if statut === 'inconnu'}
    <div class="carte-emp bad" role="alert"><span class="logo-emp"><Icone nom="attention" taille={18} /></span><div><b>Code inconnu</b><small>Vérifiez avec les RH, ou continuez : vous pourrez l'ajouter plus tard.</small><button type="button" onclick={() => { emp = ''; montrer('Pass Essentiel, niveau Start'); }}>Continuer sans code</button></div></div>
  {:else}
    <div class="carte-emp"><span class="logo-emp"><Icone nom="info" taille={18} /></span><div><small>Pas de code ? Vous démarrez au niveau Start avec le Pass Essentiel.</small><button type="button" onclick={() => (emp = 'NDIBA-2026')}>Essayer NDIBA-2026</button></div></div>
  {/if}

  {#snippet pied()}
    <Bouton desactive={!valide || envoi} onclick={envoyer}>{envoi ? 'Envoi du SMS…' : 'Recevoir le code par SMS'}{#if !envoi}<Icone nom="fleche" taille={18} trait={2.2} />{/if}</Bouton>
  {/snippet}
</Etape>

<style>
  .champ { display: flex; flex-direction: column; gap: 8px; }
  label { font: 500 10.5px var(--mono); letter-spacing: 0.1em; color: var(--muted); } label span { color: var(--faint); }
  .boite { display: flex; align-items: center; gap: 10px; min-height: 56px; padding: 0 16px; border-radius: 16px; background: var(--carte); border: 1px solid var(--ligne-forte); transition: border-color 0.2s, box-shadow 0.2s; }
  .boite:focus-within { border-color: var(--primaire); box-shadow: 0 0 0 4px rgba(48, 80, 255, 0.15); }
  .ok .boite { border-color: var(--bon); } .ok .boite:focus-within { box-shadow: 0 0 0 4px rgba(61, 213, 152, 0.12); } .bad .boite { border-color: rgba(255, 122, 47, 0.6); }
  .pref { color: var(--doux); font-size: 17px; padding-right: 10px; border-right: 1px solid var(--ligne-forte); } input { flex: 1; min-width: 0; font-size: 18px; outline: none; letter-spacing: 0.02em; } .boite input::placeholder { color: var(--faint); }
  .coche { color: var(--bon); display: flex; } .alerte { color: var(--alerte); display: flex; }
  .ops { display: flex; gap: 6px; flex-wrap: wrap; }
  .ops button { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 10px; border-radius: 22px; background: var(--carte); border: 1px solid var(--ligne); color: var(--muted); font-size: 12.5px; font-weight: 550; }
  .ops button.on { background: var(--primaire-fond); border-color: var(--primaire); color: var(--texte); } .ops i { width: 8px; height: 8px; border-radius: 4px; }
  .aide { font-size: 12.5px; color: var(--muted); line-height: 1.4; } .aide.err { color: var(--danger); } .aide a { color: var(--primaire-clair); font-weight: 600; }
  .carte-emp { display: flex; gap: 12px; align-items: flex-start; padding: 14px; border-radius: 16px; background: var(--carte); border: 1px solid var(--ligne); }
  .carte-emp.ok { border-color: rgba(61, 213, 152, 0.4); background: rgba(61, 213, 152, 0.06); } .carte-emp.bad { border-color: rgba(255, 122, 47, 0.45); background: rgba(255, 122, 47, 0.07); }
  .logo-emp { width: 38px; height: 38px; border-radius: 12px; background: var(--carte2); display: grid; place-items: center; font: 600 11px var(--mono); flex: none; color: var(--doux); }
  .carte-emp div { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; } b { font-size: 14.5px; } small { color: var(--muted); font-size: 12.5px; line-height: 1.4; }
  .carte-emp button { min-height: 44px; color: var(--primaire-clair); font-weight: 600; font-size: 13.5px; padding: 0; }
</style>
