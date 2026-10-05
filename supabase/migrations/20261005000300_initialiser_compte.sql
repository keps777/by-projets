-- initialiser_compte : appelée par l'app après la première connexion (spec §3, §11 ; docs/04-mes-projets.md).
-- Crée ou complète le profil de auth.uid(), puis les 5 rubriques, 24 projets, 12 points de rapport et 3 préréglages
-- de départ (même contenu que RUBRIQUES_DEFAUT, POINTS_DEFAUT et PRESETS_DEFAUT du noyau, et que app/src/data/seed.ts).
-- Idempotente : identifiants déterministes et clés naturelles (rubriques.cle, projets.numero, points_rapport.code,
-- presets_export.nom), lignes supprimées comprises (on ne ressuscite rien). Une fois le profil « initialise », seules
-- les valeurs manquantes du profil sont complétées.

create or replace function public.initialiser_compte(p_prenom text)
returns public.profils
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_prenom text := coalesce(btrim(p_prenom), '');
  v_profil public.profils;
  v_rid uuid;
  r record;
  p record;
  v_rubriques constant jsonb := $j$[
    {"cle": "dieu", "nom": "Ma relation avec Dieu", "couleur": "#9D8CFF", "projets": [
      [1, "La lecture de la Bible"], [2, "RDQD"], [3, "La prière seule"], [4, "LLC · littérature chrétienne"],
      [5, "PWO · prière avec d’autres"], [6, "Le jeûne"], [7, "Le don à Dieu"], [8, "Le don à l’homme"]]},
    {"cle": "service", "nom": "Mon service à Dieu", "couleur": "#34D1B6", "projets": [
      [9, "L’évangélisation"], [10, "Le gagnement des âmes"], [11, "La formation des disciples"], [15, "Dons aux frères"]]},
    {"cle": "travail", "nom": "Mon travail et mes études", "couleur": "#5EA6FF", "projets": [
      [12, "L’excellence professionnelle"], [13, "Mon projet d’entrepreneuriat"], [14, "L’excellence académique"]]},
    {"cle": "vie", "nom": "Ma vie personnelle", "couleur": "#FF8F66", "projets": [
      [16, "La gestion de mes finances"], [17, "Ma garde-robe"], [18, "L’entretien de mon logement"], [19, "La forme physique"],
      [20, "L’achat d’une maison"], [21, "La préparation pour le mariage"], [22, "Le mariage"], [23, "La relation avec ma famille"]]},
    {"cle": "transversal", "nom": "Transversal", "couleur": "#F5B843", "projets": [[25, "Le suivi de tous les projets"]]}
  ]$j$;
  -- [code, libellé, numéro du projet, clés des mesures]
  v_points constant jsonb := $j$[
    ["DDEWG", "RDQD · rencontre dynamique quotidienne avec Dieu", 2, ["fois", "temps"]],
    ["PA", "Prière seule", 3, ["temps"]],
    ["BR", "Lecture de la Bible", 1, ["nombre:chapitres", "reference:passages", "temps"]],
    ["CL", "Littérature chrétienne", 4, ["nombre:pages", "temps"]],
    ["PWO", "Prière avec d’autres", 5, ["temps"]],
    ["JEÛNE", "Le jeûne", 6, ["choix:typedejeune"]],
    ["DON-DIEU", "Don à Dieu", 7, ["oui_non", "montant:montantdonne"]],
    ["DON-HOMME", "Don à l’homme", 8, ["oui_non", "montant:montantdonne"]],
    ["EVANG", "Évangélisation", 9, ["temps", "nombre:personnes"]],
    ["ÂMES", "Gagnement des âmes", 10, ["nombre:ames"]],
    ["DISCIPLES", "Formation des disciples", 11, ["fois", "temps"]],
    ["FRÈRES", "Dons aux frères", 15, ["fois", "montant:montantdonne"]]
  ]$j$;
  v_presets constant jsonb := $j$[
    ["Groupe de prière · 5", ["DDEWG", "PA", "BR", "CL", "PWO"]],
    ["Mentor · 12", ["DDEWG", "PA", "BR", "CL", "PWO", "JEÛNE", "DON-DIEU", "DON-HOMME", "EVANG", "ÂMES", "DISCIPLES", "FRÈRES"]],
    ["Service · 3", ["EVANG", "ÂMES", "DISCIPLES"]]
  ]$j$;
begin
  if v_uid is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;

  -- 1. Profil : créé avec les valeurs par défaut des colonnes, ou complété (prénom et nom du rapport s'ils sont vides).
  insert into public.profils (id, user_id, prenom, nom_rapport)
  values (v_uid, v_uid, v_prenom, v_prenom)
  on conflict (id) do update set
    prenom = case when public.profils.prenom = '' then excluded.prenom else public.profils.prenom end,
    nom_rapport = case when public.profils.nom_rapport = '' then excluded.nom_rapport else public.profils.nom_rapport end
  returning * into v_profil;

  if v_profil.initialise then
    return v_profil;
  end if;

  -- 2. Rubriques et projets.
  for r in select e.value as v, e.n - 1 as ordre from jsonb_array_elements(v_rubriques) with ordinality e(value, n) loop
    select id into v_rid from public.rubriques where user_id = v_uid and cle = r.v ->> 'cle' order by created_at limit 1;
    if v_rid is null then
      v_rid := md5('luther:rubrique:' || v_uid || ':' || (r.v ->> 'cle'))::uuid;
      insert into public.rubriques (id, user_id, cle, nom, couleur, ordre)
      values (v_rid, v_uid, r.v ->> 'cle', r.v ->> 'nom', r.v ->> 'couleur', r.ordre)
      on conflict (id) do nothing;
    end if;
    for p in select e.value as v, e.n - 1 as ordre from jsonb_array_elements(r.v -> 'projets') with ordinality e(value, n) loop
      if not exists (select 1 from public.projets where user_id = v_uid and numero = (p.v ->> 0)::integer) then
        insert into public.projets (id, user_id, rubrique_id, numero, nom, ordre, statut)
        values (md5('luther:projet:' || v_uid || ':' || (p.v ->> 0))::uuid, v_uid, v_rid, (p.v ->> 0)::integer, p.v ->> 1, p.ordre, 'actif')
        on conflict (id) do nothing;
      end if;
    end loop;
  end loop;

  -- 3. Points de rapport : projet résolu par son numéro, mesures sans sous-projet imposé.
  for r in select e.value as v, e.n - 1 as ordre from jsonb_array_elements(v_points) with ordinality e(value, n) loop
    if not exists (select 1 from public.points_rapport where user_id = v_uid and code = r.v ->> 0) then
      insert into public.points_rapport (id, user_id, ordre, code, libelle, projet_id, mesures, actif)
      values (
        md5('luther:point:' || v_uid || ':' || (r.v ->> 0))::uuid, v_uid, r.ordre, r.v ->> 0, r.v ->> 1,
        (select id from public.projets where user_id = v_uid and numero = (r.v ->> 2)::integer and supprime_le is null
          order by created_at limit 1),
        (select coalesce(jsonb_agg(jsonb_build_object('cle', c.cle, 'sous_projet_id', null) order by c.n), '[]'::jsonb)
           from jsonb_array_elements_text(r.v -> 3) with ordinality c(cle, n)),
        true)
      on conflict (id) do nothing;
    end if;
  end loop;

  -- 4. Préréglages d'export : liste des identifiants des points, dans l'ordre des codes.
  for r in select e.value as v, e.n - 1 as ordre from jsonb_array_elements(v_presets) with ordinality e(value, n) loop
    if not exists (select 1 from public.presets_export where user_id = v_uid and nom = r.v ->> 0) then
      insert into public.presets_export (id, user_id, nom, points, ordre)
      values (
        md5('luther:preset:' || v_uid || ':' || (r.v ->> 0))::uuid, v_uid, r.v ->> 0,
        array(select pr.id from jsonb_array_elements_text(r.v -> 1) with ordinality c(code, n)
                join public.points_rapport pr on pr.user_id = v_uid and pr.code = c.code and pr.supprime_le is null
               order by c.n),
        r.ordre)
      on conflict (id) do nothing;
    end if;
  end loop;

  update public.profils set initialise = true where id = v_uid returning * into v_profil;
  return v_profil;
end $$;

revoke all on function public.initialiser_compte(text) from public, anon, authenticated;
grant execute on function public.initialiser_compte(text) to authenticated;
