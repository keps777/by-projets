// Assistant du patron : un moteur de RÈGLES (aucune IA externe, aucun réseau). Il reconnaît l'intention de la question, lit le monde et répond par des chiffres.
import { analyseBaisse, dansPortee, fcfa, pluriel, type Chiffre, type Contexte, type Intention, type Point, type Portee, type Reponse } from './assistantBaisse.ts';
import { OFFRES, simuler } from './financement.ts';
import { bilanMois, repartition } from './interagences.ts';
import { derniersJours, fenetre, jourDeTs, libelleVariation, minuteDe, moyenne, nomGare, parCle, remplissages, tableau, total, variation, ventes, decaler } from './indicateurs.ts';

export type { Contexte, Reponse, Action, Intention, Portee } from './assistantBaisse.ts';
export { simulerPrix } from './assistantBaisse.ts';
export const SUGGESTIONS = [
  'Pourquoi les ventes baissent sur Yaoundé → Douala ?', 'Quelle ligne rapporte le plus par bus ?', 'Compare Mvan et Douala sur la semaine',
  'Qu’est-ce qui manque au rapprochement MoMo ?', 'Est-ce que je peux acheter un bus ce trimestre ?', 'Où en sont les écarts de caisse ?'
];
export const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/\s+/g, ' ').trim();

/** Villes et gares citées dans la question, dans l'ordre où elles apparaissent. */
export function lieux(c: Contexte, question: string): Portee[] {
  const q = ` ${norm(question)} `, trouves: { pos: number; p: Portee }[] = [], villes = [...new Set(c.d.gares.map((g) => g.ville))];
  for (const v of villes) { const i = q.indexOf(norm(v)); if (i >= 0) trouves.push({ pos: i, p: { libelle: v, deVille: v } }); }
  for (const g of c.d.gares) {
    if (norm(g.nom) === norm(g.ville) || norm(g.nom).startsWith(norm(g.ville))) continue;
    const i = q.indexOf(norm(g.nom).split(' ')[0]); if (i >= 0) trouves.push({ pos: i, p: { libelle: nomGare(g), gareId: g.id } });
  }
  return trouves.sort((a, b) => a.pos - b.pos).map((t) => t.p);
}
/** Portée d'une question de baisse : « Yaoundé → Douala » (ligne), une ville, une gare, ou toute la compagnie. */
export function portee(c: Contexte, question: string): Portee {
  const l = lieux(c, question);
  if (l.length >= 2 && l[0].deVille && l[1].deVille) return { libelle: `${l[0].deVille} → ${l[1].deVille}`, deVille: l[0].deVille, versVille: l[1].deVille };
  return l[0] ?? { libelle: 'Tes ventes' };
}
const reponseVide = (intention: Intention, question: string): Reponse => ({ intention, question, titre: '', texte: '', chiffres: [], pointsTitre: '', points: [], actions: [], sources: 'sources : billets vendus, caisses' });
const nomLigne = (c: Contexte, id: string) => { const l = c.d.lignes.find((x) => x.id === id); return l ? `${l.de} → ${l.vers}` : id; };

function classement(c: Contexte, question: string): Reponse {
  const v = fenetre(ventes(c.d, c.compagnieId), derniersJours(c.jour, 7), minuteDe(c.now));
  const lignes = parCle(v, (x) => x.ligne.id).map((e) => ({ ...e, departs: new Set(v.filter((x) => x.ligne.id === e.cle).map((x) => x.depart.id)).size })).map((e) => ({ ...e, parBus: Math.round(e.recette / Math.max(1, e.departs)) })).sort((a, b) => b.parBus - a.parBus);
  const r = reponseVide('classement', question);
  if (!lignes.length) return { ...r, titre: 'Pas encore de vente sur 7 jours', texte: 'Je n’ai aucun billet vendu cette semaine : rien à classer.' };
  const top = lignes[0], l = c.d.lignes.find((x) => x.id === top.cle);
  return {
    ...r, titre: `${nomLigne(c, top.cle)}${l ? ` · ${l.classe}` : ''} rapporte le plus : ${fcfa(top.parBus)}\u00a0F par bus`, texte: 'Recette des billets vendus sur 7 jours, divisée par le nombre de départs concernés.', pointsTitre: 'Classement par bus',
    points: lignes.slice(0, 4).map((e, i) => ({ titre: `${i + 1}. ${nomLigne(c, e.cle)}${c.d.lignes.find((x) => x.id === e.cle)?.classe === 'VIP' ? ' · VIP' : ''}`, detail: `${fcfa(e.parBus)}\u00a0F par bus · ${e.billets} billets sur ${pluriel(e.departs, 'départ', 'départs')} · ${fcfa(e.recette)}\u00a0F` })),
    actions: [{ libelle: 'Voir la ligne', style: 'p', lien: `/siege/analyses/ligne?ligne=${encodeURIComponent(top.cle)}` }, { libelle: 'Analyses du siège', style: 's', lien: '/siege/analyses' }]
  };
}
function comparer(c: Contexte, question: string): Reponse {
  const l = lieux(c, question), r = reponseVide('comparer', question);
  if (l.length < 2) return { ...r, titre: 'Quelles gares veux-tu comparer ?', texte: 'Cite deux gares ou deux villes, par exemple « Compare Mvan et Douala sur la semaine ».', actions: [{ libelle: 'Voir les gares', style: 'p', lien: '/patron/equipe' }] };
  const jours = derniersJours(c.jour, 7), min = minuteDe(c.now), tous = ventes(c.d, c.compagnieId), rempl = remplissages(c.d, c.now);
  const stats = l.slice(0, 2).map((p) => {
    const mes = tous.filter((x) => dansPortee(x.ligne, p)), cur = fenetre(mes, jours, min), ref = fenetre(mes, decaler(jours, -7), min);
    const ids = new Set(c.d.lignes.filter((x) => x.compagnieId === c.compagnieId && dansPortee(x, p)).map((x) => x.id)), deps = c.d.departs.filter((x) => ids.has(x.ligneId) && jours.includes(x.jour) && x.statut !== 'annule');
    const gares = new Set(c.d.lignes.filter((x) => ids.has(x.id)).map((x) => x.gareDe)), ecart = c.d.caisses.filter((k) => gares.has(k.gareId) && k.ecart && jours.includes(jourDeTs(k.ouvertA))).reduce((s, k) => s + (k.ecart ?? 0), 0);
    return { p, recette: total(cur), billets: cur.length, v: variation(total(cur), total(ref)), remplissage: moyenne(deps.map((x) => rempl.get(x.id) ?? 0)), ecart };
  });
  const [a, b] = stats, gagnant = a.recette >= b.recette ? a : b, perdant = gagnant === a ? b : a;
  return {
    ...r, titre: `${gagnant.p.libelle} devance ${perdant.p.libelle} de ${fcfa(gagnant.recette - perdant.recette)}\u00a0F sur 7 jours`, texte: 'Recette des billets vendus, même heure que la semaine d’avant :',
    chiffres: stats.flatMap((s): Chiffre[] => [{ libelle: `${s.p.libelle} · recette`, valeur: `${fcfa(s.recette)}\u00a0F (${libelleVariation(s.v)})`, ton: (s.v ?? 0) < 0 ? 'er' : 'ok' }, { libelle: `${s.p.libelle} · billets`, valeur: `${s.billets} · remplissage ${Math.round(s.remplissage * 100)}\u00a0%` }, { libelle: `${s.p.libelle} · écarts de caisse`, valeur: s.ecart === 0 ? 'aucun' : `${s.ecart > 0 ? '+' : '−'}${fcfa(Math.abs(s.ecart))}\u00a0F`, ton: s.ecart < 0 ? 'wa' : undefined }]),
    actions: [{ libelle: 'Toutes les gares', style: 'p', lien: '/patron/equipe' }], sources: 'sources : billets, départs, caisses'
  };
}
function convention(c: Contexte, question: string): Reponse {
  const r = reponseVide('convention', question), q = norm(question), cs = c.conventions ?? [];
  const c1 = cs.find((x) => q.includes(norm(c.d.compagnies.find((k) => k.id === x.partenaireId)?.nom ?? '#'))) ?? cs.find((x) => x.statut !== 'demandee') ?? cs[0];
  if (!c1) return { ...r, titre: 'Tu n’as pas encore de convention inter-agences', texte: 'Propose-en une à une compagnie partenaire pour lui confier des colis.', actions: [{ libelle: 'Inter-agences', style: 'p', lien: '/inter-agences' }] };
  const nom = c.d.compagnies.find((k) => k.id === c1.partenaireId)?.nom ?? c1.partenaireId, liens = (c.liens ?? []).filter((l) => l.partenaireId === c1.partenaireId), bilan = bilanMois(liens, c.jour, c1.partenaireId);
  const exemple = repartition(2500, c1.partBetaPct), cinquante = repartition(2500, 50), juste = c1.partBetaPct >= 45 && c1.partBetaPct <= 60;
  return {
    ...r, titre: juste ? `${c1.partBetaPct} / ${100 - c1.partBetaPct} avec ${nom} est un partage raisonnable` : `${c1.partBetaPct} / ${100 - c1.partBetaPct} avec ${nom} s’écarte d’un partage équilibré`,
    texte: `Bêta vend le colis et garde ${c1.partBetaPct}\u00a0% du prix ; ${nom} transporte et reçoit ${100 - c1.partBetaPct}\u00a0%. Entre 45\u00a0% et 60\u00a0% pour celui qui vend, le partage est d’usage.`,
    chiffres: [{ libelle: 'Colis M à 2 500\u00a0F', valeur: `Bêta ${fcfa(exemple.beta)}\u00a0F · ${nom} ${fcfa(exemple.partenaire)}\u00a0F` }, { libelle: 'À 50 / 50', valeur: `Bêta ${fcfa(cinquante.beta)}\u00a0F · ${nom} ${fcfa(cinquante.partenaire)}\u00a0F` }, { libelle: 'Colis confiés ce mois', valeur: `${bilan.colis} · ${fcfa(bilan.aPayer)}\u00a0F à verser`, ton: bilan.aPayer ? 'wa' : undefined }],
    actions: [{ libelle: 'Ouvrir la convention', style: 'p', lien: `/inter-agences/convention?partenaire=${c1.partenaireId}` }], sources: 'sources : convention, colis confiés'
  };
}
function rapprochement(c: Contexte, question: string): Reponse {
  const lignesBX = new Set(c.d.lignes.filter((l) => l.compagnieId === c.compagnieId).map((l) => l.id)), departsBX = new Set(c.d.departs.filter((d) => lignesBX.has(d.ligneId)).map((d) => d.id));
  const billetsBX = new Set(c.d.billets.filter((b) => departsBX.has(b.departId)).map((b) => b.id)), r = reponseVide('rapprochement', question);
  const mobiles = c.d.paiements.filter((p) => (p.moyen === 'momo' || p.moyen === 'om') && p.pour.type === 'billet' && p.pour.ids.some((id) => billetsBX.has(id)));
  const attente = mobiles.filter((p) => p.statut === 'attente' && (p.expireLe ?? 0) > c.now), perdues = mobiles.filter((p) => p.statut === 'attente' && (p.expireLe ?? 0) <= c.now), refuses = mobiles.filter((p) => p.statut === 'refuse');
  const somme = (xs: typeof mobiles) => xs.reduce((s, p) => s + p.montant, 0);
  const incoherents = c.d.billets.filter((b) => (b.statut === 'valide' || b.statut === 'scanne') && c.d.paiements.find((p) => p.id === b.paiementId)?.statut !== 'ok');
  const points: Point[] = [];
  if (attente.length) points.push({ titre: `${pluriel(attente.length, 'paiement en attente', 'paiements en attente')} · ${fcfa(somme(attente))}\u00a0F`, detail: 'le voyageur a 10 minutes pour confirmer sur son téléphone' });
  if (perdues.length) points.push({ titre: `${pluriel(perdues.length, 'paiement expiré', 'paiements expirés')} · ${fcfa(somme(perdues))}\u00a0F`, detail: 'jamais confirmés : les places ont été libérées, rien à encaisser' });
  if (refuses.length) points.push({ titre: `${pluriel(refuses.length, 'paiement refusé', 'paiements refusés')} · ${fcfa(somme(refuses))}\u00a0F`, detail: 'solde insuffisant ou refus de l’opérateur : billets expirés' });
  if (incoherents.length) points.push({ titre: `${pluriel(incoherents.length, 'billet valide sans paiement confirmé', 'billets valides sans paiement confirmé')}`, detail: 'à vérifier avec la comptable avant la clôture' });
  return {
    ...r, titre: points.length ? `${pluriel(points.length, 'point', 'points')} à regarder dans le rapprochement Mobile Money` : 'Tout est rapproché : rien ne manque', texte: `${pluriel(mobiles.length, 'paiement Mobile Money', 'paiements Mobile Money')} dans le monde, dont ${mobiles.filter((p) => p.statut === 'ok').length} confirmés.`,
    pointsTitre: points.length ? 'Ce qui manque' : '', points, actions: [{ libelle: 'Ouvrir le rapprochement', style: 'p', lien: '/siege/comptable/rapprochement' }, { libelle: 'Comptable', style: 's', lien: '/siege/comptable' }], sources: 'sources : paiements, billets'
  };
}
/** Recette mensuelle estimée : moyenne des jours avec ventes sur 14 jours × 30. */
export function recetteMensuelleEstimee(c: Contexte): number {
  const v = ventes(c.d, c.compagnieId), jours = derniersJours(c.jour, 14), par = jours.map((j) => total(fenetre(v, [j], j === c.jour ? minuteDe(c.now) : 1440)));
  const avecVentes = par.filter((x, i) => x > 0 && jours[i] !== c.jour);
  return Math.round(moyenne(avecVentes) * 30);
}
function financement(c: Contexte, question: string): Reponse {
  const mensuelle = recetteMensuelleEstimee(c), offre = OFFRES[0], s = simuler(offre, { montant: offre.montantMax, duree: offre.dureeDefaut, recetteMensuelle: mensuelle }), r = reponseVide('financement', question);
  const ok = !s.depasse;
  return {
    ...r, titre: ok ? `Oui : un ${offre.nom.split(' · ')[0].toLowerCase()} est finançable ce trimestre` : `Pas encore : le plafond selon tes recettes est de ${fcfa(Math.max(0, s.plafond))}\u00a0F`,
    texte: `Tes recettes ressortent à environ ${fcfa(mensuelle)}\u00a0F par mois. ${offre.nom} à ${fcfa(offre.montantMax)}\u00a0F, ${offre.dureeDefaut} mois : mensualité ${fcfa(s.mensualite)}\u00a0F${s.partRecette !== null ? `, soit ${s.partRecette.toLocaleString('fr-FR')}\u00a0% de ta recette` : ''}.`,
    chiffres: [{ libelle: 'Recette mensuelle estimée', valeur: `${fcfa(mensuelle)}\u00a0F` }, { libelle: 'Mensualité', valeur: `${fcfa(s.mensualite)}\u00a0F`, ton: ok ? 'ok' : 'er' }, { libelle: 'Plafond selon recettes', valeur: `${fcfa(s.plafond)}\u00a0F` }, { libelle: 'Apport (15\u00a0%)', valeur: `${fcfa(s.apport)}\u00a0F` }],
    actions: [{ libelle: 'Simuler le financement', style: 'p', lien: '/financement' }], sources: 'sources : caisses, simulateur de financement'
  };
}
function caisse(c: Contexte, question: string): Reponse {
  const jours = new Set(derniersJours(c.jour, 7)), r = reponseVide('caisse', question), liste = c.d.caisses.filter((k) => k.ecart && jours.has(jourDeTs(k.ouvertA))).sort((a, b) => Math.abs(b.ecart ?? 0) - Math.abs(a.ecart ?? 0));
  const net = liste.reduce((s, k) => s + (k.ecart ?? 0), 0), ouvertes = c.d.caisses.filter((k) => k.statut === 'ouverte').length;
  return {
    ...r, titre: liste.length ? `${pluriel(liste.length, 'écart de caisse', 'écarts de caisse')} cette semaine : ${net < 0 ? '−' : '+'}${fcfa(Math.abs(net))}\u00a0F au total` : 'Aucun écart de caisse cette semaine',
    texte: `${pluriel(ouvertes, 'caisse encore ouverte', 'caisses encore ouvertes')}. Les écarts de 1 000\u00a0F ou moins sont tolérés, au-delà le superviseur valide.`, pointsTitre: liste.length ? 'Les plus gros écarts' : '',
    points: liste.slice(0, 4).map((k) => { const p = c.d.personnes.find((x) => x.id === k.agentId); return { titre: `${p?.prenom ?? k.agentId} · ${k.ecart! < 0 ? '−' : '+'}${fcfa(Math.abs(k.ecart!))}\u00a0F`, detail: `${k.jour} · ${k.statut === 'validee' ? 'clôture validée' : k.statut === 'fermee' ? 'clôture à valider' : k.statut}` }; }),
    actions: [{ libelle: 'Voir les gares', style: 'p', lien: '/patron/equipe' }, { libelle: 'Comptable', style: 's', lien: '/siege/comptable' }], sources: 'sources : caisses'
  };
}
function retards(c: Contexte, question: string): Reponse {
  const lignes = new Map(c.d.lignes.map((l) => [l.id, l])), du = c.d.departs.filter((x) => x.jour === c.jour && lignes.get(x.ligneId)?.compagnieId === c.compagnieId), r = reponseVide('retards', question);
  const touches = du.filter((x) => x.retardMin > 0 || x.statut === 'annule');
  return {
    ...r, titre: touches.length ? `${pluriel(touches.length, 'départ perturbé', 'départs perturbés')} aujourd’hui sur ${du.length}` : `Tous tes départs du jour sont à l’heure (${du.length})`, texte: 'Retards annoncés et annulations de la journée.',
    pointsTitre: touches.length ? 'Départs concernés' : '', points: touches.slice(0, 5).map((x) => ({ titre: `${x.heure} ${nomLigne(c, x.ligneId)}`, detail: x.statut === 'annule' ? 'annulé · billets remboursés' : `retard de ${x.retardMin} min` })),
    actions: [{ libelle: 'Salle de contrôle', style: 'p', lien: '/siege/controle' }], sources: 'sources : départs'
  };
}
function colisReponse(c: Contexte, question: string): Reponse {
  const actifs = c.d.colis.filter((k) => k.statut !== 'livre' && k.statut !== 'annule'), t = tableau(c.d, { jour: c.jour, now: c.now, compagnieId: c.compagnieId }), r = reponseVide('colis', question);
  return {
    ...r, titre: `${pluriel(c.d.colis.length, 'colis', 'colis')} dans le réseau, ${actifs.length} en cours`, texte: `${pluriel(t.colis.envoyes, 'colis envoyé', 'colis envoyés')} aujourd’hui pour ${fcfa(t.colis.chiffre)}\u00a0F.`,
    chiffres: [{ libelle: 'En route', valeur: String(c.d.colis.filter((k) => k.statut === 'en_route').length) }, { libelle: 'Livrés', valeur: String(c.d.colis.filter((k) => k.statut === 'livre').length) }, { libelle: 'Litiges', valeur: String(c.d.colis.filter((k) => k.statut === 'litige').length), ton: c.d.colis.some((k) => k.statut === 'litige') ? 'er' : undefined }],
    actions: [{ libelle: 'Colis entre compagnies', style: 'p', lien: '/inter-agences' }], sources: 'sources : colis'
  };
}
function bilan(c: Contexte, question: string): Reponse {
  const t = tableau(c.d, { jour: c.jour, now: c.now, compagnieId: c.compagnieId }), r = reponseVide('bilan', question), pire = [...t.gares].filter((g) => g.variation !== null && g.variation <= -10).sort((a, b) => (a.variation ?? 0) - (b.variation ?? 0))[0];
  const nom = (id: string) => { const g = c.d.gares.find((x) => x.id === id); return g ? nomGare(g) : id; };
  return {
    ...r, titre: `Journée à ${fcfa(t.recette)}\u00a0F (${libelleVariation(t.variation)})`, texte: `${pluriel(t.billets, 'billet vendu', 'billets vendus')} aujourd’hui, ${t.bus} bus, ${Math.round(t.remplissage * 100)}\u00a0% remplis.${pire ? ` À regarder : ${nom(pire.gareId)} (${libelleVariation(pire.variation)}).` : ''}`,
    chiffres: [{ libelle: 'Écarts de caisse', valeur: t.ecart === 0 ? 'aucun' : `${t.ecart < 0 ? '−' : '+'}${fcfa(Math.abs(t.ecart))}\u00a0F`, ton: t.ecart < 0 ? 'wa' : undefined }, { libelle: 'Retards / annulations', valeur: `${t.retards} / ${t.annules}` }, { libelle: 'Litiges ouverts', valeur: String(t.litigesOuverts) }],
    actions: pire ? [{ libelle: `Pourquoi ${nom(pire.gareId)} baisse ?`, style: 'p', lien: `/assistant/reponse?q=${encodeURIComponent(`Pourquoi ${nom(pire.gareId)} baisse ?`)}` }] : [{ libelle: 'Voir les gares', style: 'p', lien: '/patron/equipe' }], sources: 'sources : billets, départs, caisses'
  };
}
const REGLES: [Intention, RegExp][] = [
  ['convention', /(convention|partage|commission|inter agences?|partenaire)/], ['baisse', /(baiss|chut|recul|diminu|descend|moins de vente|ventes? (en )?(berne|bas))/], ['comparer', /(compar|versus|\bvs\b|face a|difference entre)/], ['classement', /(ligne.*(rapport|rentab|meilleur|plus)|rentab|meilleure ligne|par bus)/],
  ['rapprochement', /(rapproch|momo|mobile money|orange money|\bom\b|paiement)/], ['financement', /(acheter|achat|financ|pret|credit|emprunt|tresorerie|nouveau bus)/], ['caisse', /(caisse|ecart|manque d argent)/],
  ['retards', /(retard|annul|en retard|ponctual)/], ['colis', /colis|livraison|relais/], ['bilan', /(aujourd|journee|bilan|recette|ca du jour|comment (ca )?va|resume|chiffre)/]
];
export function intention(question: string): Intention {
  const q = norm(question); for (const [i, re] of REGLES) if (re.test(q)) return i; return 'inconnue';
}
/** Répond à une question du patron. Ne modifie jamais le monde : les actions proposées attendent son feu vert. */
export function repondre(c: Contexte, question: string): Reponse {
  const q = question.trim(), i = q ? intention(q) : 'inconnue';
  switch (i) {
    case 'convention': return convention(c, q);
    case 'baisse': return analyseBaisse(c, portee(c, q), q);
    case 'comparer': return comparer(c, q);
    case 'classement': return classement(c, q);
    case 'rapprochement': return rapprochement(c, q);
    case 'financement': return financement(c, q);
    case 'caisse': return caisse(c, q);
    case 'retards': return retards(c, q);
    case 'colis': return colisReponse(c, q);
    case 'bilan': return bilan(c, q);
    default: return { ...reponseVide('inconnue', q), titre: q ? 'Je ne sais pas encore répondre à ça' : 'Pose-moi une question', texte: 'Je lis tes billets, tes caisses, tes départs et tes colis. Essaie par exemple :', pointsTitre: 'Questions possibles', points: SUGGESTIONS.slice(0, 4).map((s) => ({ titre: s, detail: '' })), actions: [{ libelle: 'Retour à l’assistant', style: 'p', lien: '/assistant' }] };
  }
}
