<script lang="ts">
  import { aller } from '../../router.svelte.ts';
  import { deconnecter, heureLocale } from '../../domain/actions.ts';
  import type { Colis } from '../../domain/types.ts';
  import { fcfa } from '../../core/money.ts';
  import { ETAPES_COURSE, etaCourse, formaterTel, GAIN_COURSE, kmCourse } from '../../core/relais.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { accepterCourse, acteur, avancerCourse, basculerDispo, busQuiArrivent, coursesDisponibles, coursesEnCours, depuisRayon, gainsLivreur, livreurDispo, livrerCourse, NOM_TAILLE, nomRelais, prenomDe, quartierDe, retournerCourse, signalerCourse } from './actions.ts';
  import { courseDe } from './etat.ts';
  import Pic from './Pic.svelte';

  const moi = $derived(acteur('livreur'));
  const dispo = $derived(moi ? livreurDispo(moi.id) : false);
  const gains = $derived(moi ? gainsLivreur(moi.id) : undefined);
  const missions = $derived(dispo ? coursesDisponibles() : []);
  const enCours = $derived(moi ? coursesEnCours(moi.id) : []);
  const bus = $derived(busQuiArrivent());
  let passees = $state<string[]>([]), saisies = $state<Record<string, string>>({}), messages = $state<Record<string, string>>({}), retourDemande = $state<string | null>(null);
  const visibles = $derived(missions.filter((m) => !passees.includes(m.id)));

  function signaler() { if (!moi) return; const r = signalerCourse(moi.id); if (r.ok) montrer(`Dossier ${r.dossier} ouvert : le support te répond sous 2 h`); else montrer(r.message, 'wa'); }
  function accepter(c: Colis) { if (!moi) return; const r = accepterCourse(c.id, moi.id); if (r.ok) montrer(`Course ${c.code} acceptée`); else montrer(r.message, 'er'); }
  function etapeSuivante(c: Colis) { if (moi) avancerCourse(c.id, moi.id); }
  function touche(c: Colis, d: string) {
    const actuel = saisies[c.id] ?? ''; if (actuel.length >= 4 || !moi) return;
    const code = actuel + d; saisies[c.id] = code; messages[c.id] = '';
    if (code.length < 4) return;
    const r = livrerCourse(c.id, code, moi.id);
    if (r.ok) { montrer(`Livré · +${fcfa(r.gain)} F`); delete saisies[c.id]; } else { messages[c.id] = r.message; saisies[c.id] = ''; montrer(r.message, 'er'); }
  }
  function retourner(c: Colis) { if (!moi) return; const r = retournerCourse(c.id, moi.id); retourDemande = null; montrer(r.ok ? 'Colis ramené au relais' : r.message, r.ok ? 'ok' : 'er'); }
  function quitter() { deconnecter(); aller('/entree'); }
  const lien = (e: MouseEvent, vers: string) => { e.preventDefault(); aller(vers); };
  const initiales = $derived(moi ? `${moi.prenom[0]}${moi.nom[0] ?? ''}` : '');
</script>

<Mobile>
  {#snippet enteteLibre()}
    <header class="hd">
      <div class="row g12" style="min-width: 0"><span class="av" aria-hidden="true">{initiales}</span><div class="col"><span class="ttl t16 ell">{moi?.prenom ?? 'Livreur'} · livreur</span><span class="t13 mut ell">Douala · autour d’Akwa</span></div></div>
      {#if moi?.actif}<button type="button" class="pl {dispo ? 'ok' : 'wa'} pause" aria-pressed={dispo} aria-label="Disponibilité : {dispo ? 'disponible' : 'en pause'}. Toucher pour changer" onclick={() => moi && basculerDispo(moi.id)}><span class="dot"></span>{dispo ? 'disponible' : 'en pause'}</button>{/if}
    </header>
  {/snippet}

  {#if !moi?.actif}
    <div class="center">
      <span class="ill"><Pic nom="moto" taille={64} trait={1.5} /></span>
      <span class="ttl t18">Compte en attente de validation</span>
      <span class="t14 mut">Notre équipe vérifie ta candidature. Tu pourras prendre des courses dès l’acceptation (réponse sous 48 h).</span>
      <button type="button" class="b s" onclick={quitter}>Changer de compte</button>
    </div>
  {:else}
    <div class="row g8">
      <div class="gl grow col"><span class="lab">Aujourd’hui</span><span class="ttl t20" aria-live="polite">{fcfa(gains?.gainJour ?? 0)} F</span><span class="t12 mut">{gains?.nbJour ?? 0} course{(gains?.nbJour ?? 0) > 1 ? 's' : ''}</span></div>
      <div class="gl grow col"><span class="lab">Bus qui arrivent</span><span class="ttl t20">{bus.length}</span><span class="t12 mut">{bus.length ? bus.slice(0, 3).map((b) => b.heure).join(' · ') : 'aucun dans les 3 h'}</span></div>
    </div>

    {#if enCours.length}
      <span class="lab">Mes courses en cours · {enCours.length}</span>
      {#each enCours as c (c.id)}
        {@const etape = courseDe(c.id)?.etape ?? 0}
        {@const code = saisies[c.id] ?? ''}
        <article class="ms on" aria-label="Course {c.code}">
          <div class="row sp"><span class="col"><span class="t15 b7">{c.code} · {NOM_TAILLE[c.taille]}</span><span class="t12 mut">{nomRelais(c.relaisId)} → {quartierDe(c.id)} · {c.destinataire.nom}</span></span><span class="ttl t18">{fcfa(GAIN_COURSE)} F</span></div>
          <div class="etapes" role="img" aria-label="Étape : {ETAPES_COURSE[etape]}">{#each [0, 1, 2] as i (i)}<span class:on={etape >= i}></span>{/each}</div>
          <div class="row sp"><span class="pl ac">{ETAPES_COURSE[etape]}</span><span class="t12 mut" aria-live="polite">{etape >= 2 ? 'arrivé chez le client' : `arrivée dans ~${etaCourse(kmCourse(quartierDe(c.id)), etape)} min`} · {kmCourse(quartierDe(c.id))} km</span></div>
          <a class="b s sm" href="tel:+237{c.destinataire.tel}"><Pic nom="appel" taille={16} />Appeler {prenomDe(c.destinataire.nom)} · {formaterTel(c.destinataire.tel)}</a>
          {#if etape < 2}
            <button type="button" class="b p sm" onclick={() => etapeSuivante(c)}>Étape suivante · {ETAPES_COURSE[etape + 1]}</button>
          {:else}
            <div class="col g8">
              <span class="lab c">Preuve de livraison · {prenomDe(c.destinataire.nom)} donne son code</span>
              <div class="otp" role="img" aria-label="Code saisi : {code.length} chiffre{code.length > 1 ? 's' : ''} sur 4">{#each [0, 1, 2, 3] as i (i)}<span class:on={code.length === i}>{code[i] ?? ''}</span>{/each}</div>
              <span class="t13 c erc" role="alert">{messages[c.id] ?? ''}</span>
              <div class="pad">{#each ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as k (k)}<button type="button" onclick={() => touche(c, k)}>{k}</button>{/each}<button type="button" aria-label="Tout effacer" onclick={() => (saisies[c.id] = '')}>C</button><button type="button" onclick={() => touche(c, '0')}>0</button><button type="button" aria-label="Effacer un chiffre" onclick={() => (saisies[c.id] = code.slice(0, -1))}>←</button></div>
            </div>
          {/if}
          {#if retourDemande === c.id}<div class="row g8"><button type="button" class="b d sm" onclick={() => retourner(c)}>Oui, ramener au relais</button><button type="button" class="b g sm" onclick={() => (retourDemande = null)}>Non</button></div>
          {:else}<button type="button" class="b g sm" onclick={() => (retourDemande = c.id)}>Remise impossible · retour au relais</button>{/if}
        </article>
      {/each}
    {/if}

    <span class="lab">Missions proposées · {visibles.length}</span>
    {#each visibles as m (m.id)}
      <article class="ms" aria-label="Mission {m.code}">
        <div class="row sp"><span class="col"><span class="t15 b7">{m.code} · {NOM_TAILLE[m.taille]}</span><span class="t12 mut">{nomRelais(m.relaisId)} → {quartierDe(m.id)} · {m.destinataire.nom}</span></span><span class="ttl t18">{fcfa(GAIN_COURSE)} F</span></div>
        <div class="row sp"><span class="t12 mut">au relais depuis {heureLocale(depuisRayon(m))} · {kmCourse(quartierDe(m.id))} km</span>
          <div class="row g6"><button type="button" class="b p sm act" onclick={() => accepter(m)}>Accepter</button><button type="button" class="b g sm act" onclick={() => (passees = [...passees, m.id])}>Passer</button></div></div>
      </article>
    {:else}
      <div class="gl"><span class="t13 mut">{dispo ? (passees.length ? 'Plus de mission pour l’instant. Les missions passées reviennent si personne ne les prend.' : 'Aucune mission pour l’instant : elles apparaissent dès qu’un colis moto arrive au relais.') : 'Tu es en pause : passe en « disponible » pour voir les missions.'}</span></div>
    {/each}
    {#if passees.length && dispo}<button type="button" class="b g sm" onclick={() => (passees = [])}>Revoir les missions passées ({passees.length})</button>{/if}

    <div class="gl col" style="gap: 0">
      <div class="li"><span class="grow t14">Note</span><span class="t14 b7">{moi.note ? `★ ${moi.note.toLocaleString('fr-FR')}` : '—'}{moi.vehicule ? ` · ${moi.vehicule}` : ''}</span></div>
      <div class="li"><span class="grow t14">Cette semaine</span><span class="t14 b7">{fcfa(gains?.gainSemaine ?? 0)} F · {gains?.nbSemaine ?? 0} courses</span></div>
      <div class="li"><span class="grow t14">Versement</span><span class="t14 b7">chaque soir · MoMo</span></div>
      <button type="button" class="li" style="text-align: left; width: 100%; min-height: 44px" onclick={signaler}><span class="grow t14">Un problème sur une course</span><span class="t13 aq">signaler</span></button>
    </div>
    <a class="b g" href="/livreur/devenir" onclick={(e) => lien(e, '/livreur/devenir')}>Parrainer un livreur · +2 000 F</a>
    <button type="button" class="b g" onclick={quitter}>Changer de compte</button>
  {/if}
</Mobile>

<style>
  .ms { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: 20px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); }
  .ms.on { background: linear-gradient(135deg, rgba(139, 124, 255, 0.22), rgba(61, 224, 255, 0.14)); border-color: rgba(139, 124, 255, 0.45); }
  .t15 { font-size: 15px; } .ttl { white-space: nowrap; } .pause { cursor: pointer; min-height: 44px; padding: 0 14px; }
  .act { min-height: 44px; font-size: 13px; }
  .etapes { display: flex; gap: 6px; } .etapes span { flex: 1; height: 6px; border-radius: 3px; background: rgba(255, 255, 255, 0.12); } .etapes span.on { background: linear-gradient(90deg, #8b7cff, #3de0ff); }
  .otp { display: flex; gap: 6px; justify-content: center; }
  .otp span { width: 44px; height: 52px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.06); display: grid; place-items: center; font: 700 22px 'Geist Mono', monospace; } .otp span.on { border-color: #3de0ff; }
  button:focus-visible, a:focus-visible { outline: 2px solid #7febff; outline-offset: 2px; }
</style>
