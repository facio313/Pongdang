# Condition producer recovery

- Scope: backend-only operational recovery; preserve source corrections, missing
  values, conflicts, expiry and the existing 31-day target contract.
- Source SQL no longer runs a correlated scan of the entire materialized history
  for every candidate metric. A window aggregate finds the earliest active fetch
  per source identity before latest-revision selection. Strict earlier-fetch
  comparison preserves equal-timestamp handling.
- `ProjectionInputs.iter_records()` yields finalized, merged intervals so the
  production worker need not retain every JSON payload. `records()` retains its
  list-returning convenience contract. Storage publishes these in bounded COPY
  batches and rechecks source revision before atomic commit (separate change).
- A bounded 2,048-entry per-input cache shares assembled results only when exact
  target/cutoff times, source slots, mappings, interpreted authority and relative
  station distances (including ties) match. Each place keeps its own identity,
  name and real distances in measurements, displayed metrics and score components.
  The immutable cached result is not mutated. Explicit historical-cutoff queries
  bypass this cache. Replica key profiling found 94.19% reuse across 144,491
  candidate intervals, versus 46.55% when exact distances were part of the key.
- Disposable PostgreSQL 18 integration verification: 10 producer tests passed in
  101.28 seconds under concurrent host load, including active/superseded/equal-fetch
  revision regressions, existing raw-reader parity, arbitrary forecast times,
  31-day coverage and expiry. The two cache cases were subsequently strengthened
  and both passed in 11 seconds: real distances, reversed nearest stations, exact
  distance ties, per-place official restriction, expiry, and unchanged original
  cached objects all match the raw reader. Ruff lint and formatting checks passed.
- Sanitized production collection replica: 7,900 places, 1,235 stations,
  2,641 selected metric rows. Critical source SELECT completed in 1.879 seconds;
  all input loading took 2.232 seconds under the unchanged 10-second statement
  timeout. 151,637 candidate intervals merged into 115,440 published-record
  payloads; streaming computation took 182.3 seconds. Process peak RSS was
  224,500 KiB, with about 95 MiB resident after loading.
- Full replica publication succeeded with 108,490 records in 292.76 seconds and
  230,868 KiB peak RSS (wall-clock expiry boundaries reduced the earlier count).
  Ten product queries read back in 54 ms. Gyeongpo place 7 returned a forecast
  score of 63.8 with temperature, wind and humidity; direct Gyeongpo station
  place 12 returned an observation score of 62.5. Place 7's current observations
  had no applicable live metrics and place 5476 had no applicable snapshot;
  unavailable evidence was not fabricated. Shared-input memoization was added
  after this baseline because rebuilding after global invalidation took minutes.
  Memoized streaming subsequently produced 107,318 records in 80.53 seconds with
  233,604 KiB peak RSS under concurrent host work, versus 182.3 seconds before
  memoization (different wall-clock expiry boundaries change the count). Input
  loading during this run took 5.02 seconds, including a 4.045-second main SELECT.
  An earlier concurrent rollover/assessment stress run saturated the 1.5-CPU
  replica and timed out loading; no database timeout was increased.
- The final memoized publication with UTF-8 JSON serialization reached cleanup
  after generating and copying its records, but the single DELETE of the oldest
  108,490-record generation exceeded the unchanged 10-second statement timeout.
  The transaction rolled back, preserving the two previous complete generations.
  The root task replaced that cleanup with bounded delete batches; real-size
  rollover then completed successfully in the final attempt below.
- Final publication with memoization, UTF-8 JSON and bounded cleanup succeeded:
  107,312 records committed in 204.95 seconds, peak RSS 248,160 KiB. Generation 6
  has 107,312 actual rows and generation 2 retains 108,490; generation 1's metadata
  remains while its snapshots are pruned. Source revision stayed 0 throughout.
  `published_at` now records the end of publication. Representative product reads
  took 40 ms. All six activities were also checked for places 7 and 5476:
  Gyeongpo's +3-hour forecast returns swim 72.9, surf 55.8 and relax 63.8; swimming
  includes forecast water temperature 23.1°C and wave height 0.5m. Current
  observations at Gyeongpo and all tested conditions at Gajin remain unavailable
  in this frozen collection copy; the recovery does not invent missing evidence.
- Remaining operational limitation: a complete refresh still takes about
  3 minutes 25 seconds on this replica, and the existing global revision guard
  withholds an invalidated generation until its replacement commits. No stale
  score fallback, target-window reduction or frontend change was introduced.
  No production source writes or deployments were performed by this subtask.
- Do not narrow generation to the public beach/valley list without changing the
  API contract: existing condition endpoints and integration tests also query
  measurement-station places directly.
