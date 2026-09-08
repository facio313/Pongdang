\set ON_ERROR_STOP on
\getenv reader_password MULTTARA_EXPLORER_PASSWORD
BEGIN;
DO $check$ BEGIN
  IF current_database() <> 'pongdang' THEN
    RAISE EXCEPTION 'This grant script is only for Multtara database pongdang';
  END IF;
END $check$;
SELECT format(
  'CREATE ROLE multtara_explorer LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 4 PASSWORD %L',
  :'reader_password'
) WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'multtara_explorer')
\gexec
ALTER ROLE multtara_explorer SET default_transaction_read_only = on;
ALTER ROLE multtara_explorer SET statement_timeout = '3s';
ALTER ROLE multtara_explorer SET lock_timeout = '500ms';
GRANT CONNECT ON DATABASE pongdang TO multtara_explorer;
GRANT USAGE ON SCHEMA public TO multtara_explorer;
GRANT SELECT (id, name, region, type, catalog_source, catalog_verification, tourapi_id, khoa_beach_code, lat, lng, address, catalog_verified_at) ON public.spots_waterspot TO multtara_explorer;
GRANT SELECT (id, spot_id, provider, state, observed_at, fetched_at, valid_until, valid_from, spatial_scope, provider_record_id, ingestion_version) ON public.conditions_observationsnapshot TO multtara_explorer;
GRANT SELECT (id, snapshot_id, name, numeric_value, text_value, boolean_value, unit, mode, state, source, confidence, observed_at, fetched_at, valid_until, station_id, spatial_scope) ON public.conditions_observationmetric TO multtara_explorer;
GRANT SELECT (id, spot_id, activity, participant_profile, safety_status, decision, score, confidence, coverage, evaluated_at, missing_metrics, limitations, methodology_version) ON public.conditions_conditionscore TO multtara_explorer;
GRANT SELECT (id, spot_id, forecast_date, activity, participant_profile, availability, safety_status, score, confidence, unavailable_reason, target_at, valid_until, evaluated_at, missing_metrics, limitations) ON public.forecasts_dailyforecast TO multtara_explorer;
GRANT SELECT (id, task_name, status, started_at, finished_at, error_code) ON public.conditions_ingestionrun TO multtara_explorer;
GRANT SELECT (id, key, state, current_tasks, last_seen_at, updated_at) ON public.conditions_pipelineheartbeat TO multtara_explorer;
GRANT SELECT (id, derived_metric_id, source_metric_id, relation, priority, created_at) ON public.conditions_observationmetriclineage TO multtara_explorer;
GRANT SELECT (id, spot_id, station_id, version, authority, verified, active, q_min, q_opt_low, q_opt_high, q_max, updated_at) ON public.conditions_hydrauliccalibration TO multtara_explorer;
GRANT SELECT (id, provider, transport, state, observed_at, fetched_at, valid_until, provider_record_id) ON public.trips_routematrixsnapshot TO multtara_explorer;
GRANT SELECT (id, snapshot_id, origin_spot_id, destination_spot_id, duration_seconds, distance_metres) ON public.trips_routematrixentry TO multtara_explorer;
GRANT SELECT (id, spot_id, name, type, tag, lat, lng, distance_min) ON public.spots_nearbyfacility TO multtara_explorer;
GRANT SELECT (id, spot_id, species, banned_species, best_time, season_restriction) ON public.spots_catchguide TO multtara_explorer;
GRANT SELECT (id, spot_id, minerals, benefits) ON public.spots_hotspringdetail TO multtara_explorer;
COMMIT;
