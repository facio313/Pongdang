"""Deterministic, isolated examples. Never observations or safety evidence."""

import math
from copy import deepcopy
from datetime import datetime, timedelta
from typing import Any

from app.data_reader import CATALOG

SCHEMA = "pongdang_demo"
VERSION = "collector-demo-v1"
NOTICE = "합성 더미: 실제 관측·예보·시설·안전 판단에 사용 금지"
SCENARIOS = (
    ("clear", "맑고 잔잔함", 26.0, 58.0, 0.0, 2.1, 0.35),
    ("humid", "고습·흐림", 28.0, 86.0, 0.0, 3.4, 0.65),
    ("rain", "비·탁도 상승", 23.0, 94.0, 8.5, 5.2, 1.2),
    ("wind", "강풍·높은 파도", 21.0, 72.0, 1.2, 12.5, 2.8),
    ("stale", "유효 기간 지난 값", 24.0, 68.0, 0.0, 3.0, 0.7),
    ("missing", "일부 측정값 누락", 25.0, 77.0, 0.0, 2.8, 0.5),
)
DEMO_CATALOG = deepcopy(CATALOG)
for dataset in DEMO_CATALOG:
    dataset["is_demo"] = True
    dataset["source"] = "PONGDANG_DEMO · " + dataset["source"]
    dataset["description"] = NOTICE + ". " + dataset["description"]
    dataset["columns"][1:1] = [
        {"key": "_demo_set", "label": "더미 세트", "type": "text"},
        {"key": "_demo_spot", "label": "연결 장소", "type": "text"},
    ]
    dataset["columns"].append(
        {"key": "_demo_note", "label": "생성 설명", "type": "text"}
    )
    dataset["search"] += ["_demo_set", "_demo_spot", "_demo_note"]
DEMO_DATASETS = {item["key"]: item for item in DEMO_CATALOG}


def build_demo(reference_spots: list[dict], anchor: datetime) -> dict[str, Any]:
    if not reference_spots or len(reference_spots) > 100:
        raise ValueError("Demo seed requires 1..100 explicit reference spots")
    if anchor.tzinfo is None:
        raise ValueError("Demo timestamps require a timezone")
    rows: dict[str, list[dict]] = {item["key"]: [] for item in DEMO_CATALOG}

    def add(dataset_key, *, scenario="공통 참조", spot=None, **values):
        row = {column["key"]: None for column in DEMO_DATASETS[dataset_key]["columns"]}
        row.update(
            id=len(rows[dataset_key]) + 1,
            _demo_set=scenario,
            _demo_spot=spot["name"] if spot else "전체",
            _demo_note=NOTICE,
        )
        row.update(values)
        rows[dataset_key].append(row)
        return row

    for source in sorted(reference_spots, key=lambda row: row["id"]):
        values = {
            column["key"]: source.get(column["key"]) for column in CATALOG[0]["columns"]
        }
        values.update(
            name="[더미 참조] " + source["name"],
            catalog_source="PONGDANG_DEMO_REFERENCE: " + str(source["id"]),
            catalog_verification="demo_unverified",
            tourapi_id="DEMO-TOUR-" + str(source["id"]),
            khoa_beach_code="DEMO-KHOA-" + str(source["id"]),
            catalog_verified_at=None,
        )
        add("spots", **values, _demo_note="기존 장소 ID·이름·좌표만 참조. " + NOTICE)
    base = reference_spots[0]
    for i, (kind, title) in enumerate(
        (("valley", "가상 계곡"), ("onsen", "가상 온천"), ("mudflat", "가상 갯벌")),
        start=1,
    ):
        add(
            "spots",
            id=-1000 - i,
            name="[더미 가상] " + title,
            region="강릉 인근 가상 지역",
            type=kind,
            catalog_source="PONGDANG_DEMO_FICTIONAL",
            catalog_verification="demo_unverified",
            tourapi_id=f"DEMO-TOUR-X{i}",
            khoa_beach_code=f"DEMO-KHOA-X{i}" if kind == "mudflat" else "",
            lat=round(float(base["lat"]) - 0.015 * i, 5),
            lng=round(float(base["lng"]) - 0.012 * i, 5),
            address="[더미] 실제 시설·주소가 아닌 관계 검증용 가상 장소",
        )
    spots = rows["spots"]
    for spot in spots:
        spot["_demo_spot"] = spot["name"]
        for offset, (kind, title) in enumerate(
            (
                ("parking", "주차장"),
                ("toilet", "화장실"),
                ("shower", "샤워실"),
                ("convenience", "편의점"),
            ),
            start=1,
        ):
            add(
                "facilities",
                spot=spot,
                spot_id=spot["id"],
                name=f"[더미] {spot['name']} {title}",
                type=kind,
                tag="DEMO_NOT_A_REAL_FACILITY",
                lat=round(spot["lat"] + offset * 0.0003, 5),
                lng=round(spot["lng"] + offset * 0.0002, 5),
                distance_min=offset * 2,
            )
        if spot["type"] == "mudflat":
            add(
                "catch-guides",
                spot=spot,
                spot_id=spot["id"],
                species="[더미] 바지락·동죽 예시; 현지 분포 미확인",
                banned_species="[더미] 법적 금지 종·보호종 정보 미확인",
                best_time="[더미] 가상 간조 전후 예시; 실제 진입 시간 아님",
                season_restriction="[더미] 실제 금어기·채취 허용 여부 미확인",
            )
        if spot["type"] == "onsen":
            add(
                "hot-springs",
                spot=spot,
                spot_id=spot["id"],
                minerals="[더미] 나트륨·탄산수소염 성분 예시, 실제 분석 아님",
                benefits="[더미] 실내탕·휴게실이 있는 가상 시설; 의료 효능 정보 아님",
            )
        if spot["type"] == "valley":
            add(
                "calibrations",
                spot=spot,
                spot_id=spot["id"],
                station_id="DEMO-GAUGE-" + str(spot["id"]),
                version=VERSION,
                authority="PONGDANG_DEMO_NOT_VERIFIED",
                verified=False,
                active=False,
                q_min=2.0,
                q_opt_low=4.0,
                q_opt_high=9.0,
                q_max=15.0,
                updated_at=anchor,
            )

    def metric(snapshot, name, value, unit, spot, scenario, **extra):
        return add(
            "metrics",
            spot=spot,
            scenario=scenario,
            snapshot_id=snapshot["id"],
            name=name,
            numeric_value=value,
            unit=unit,
            mode="demo",
            state="missing"
            if value is None
            else "stale"
            if "stale" in scenario
            else "demo",
            source=snapshot["provider"],
            confidence=0.0,
            observed_at=snapshot["observed_at"],
            fetched_at=snapshot["fetched_at"],
            valid_until=snapshot["valid_until"],
            station_id="DEMO-STATION-" + str(spot["id"]),
            spatial_scope=snapshot["spatial_scope"],
            **extra,
        )

    for scenario_index, (code, label, temp, humidity, rain, wind, wave) in enumerate(
        SCENARIOS
    ):
        scenario = code + " · " + label
        observed = anchor - timedelta(days=len(SCENARIOS) - scenario_index - 1)
        if code == "stale":
            observed = anchor - timedelta(days=3)
        for spot_index, spot in enumerate(spots):
            local_temp = round(temp + (spot_index % 3 - 1) * 0.6, 1)

            def snapshot(
                provider, spot=spot, scenario=scenario, code=code, observed=observed
            ):
                return add(
                    "snapshots",
                    spot=spot,
                    scenario=scenario,
                    spot_id=spot["id"],
                    provider="PONGDANG_DEMO_" + provider,
                    state="stale"
                    if code == "stale"
                    else "partial"
                    if code == "missing"
                    else "demo",
                    observed_at=observed,
                    fetched_at=observed + timedelta(minutes=5),
                    valid_from=observed,
                    valid_until=observed + timedelta(hours=3),
                    spatial_scope=f"DEMO/{code}/spot/{spot['id']}",
                    provider_record_id=f"DEMO-{provider}-{code}-{spot['id']}",
                    ingestion_version=VERSION,
                )

            weather = snapshot("KMA")
            weather_values = (
                ("air_temperature_c", local_temp, "degC"),
                (
                    "relative_humidity_pct",
                    None if code == "missing" else humidity,
                    "percent",
                ),
                ("precipitation_1h_mm", rain, "mm"),
                ("wind_speed_ms", wind, "m/s"),
                ("wind_direction_degrees", 90 + 25 * scenario_index, "degree"),
                (
                    "cloud_cover_pct",
                    15 if code == "clear" else 95 if code == "rain" else 70,
                    "percent",
                ),
                (
                    "precipitation_probability_pct",
                    85 if rain > 5 else 40 if rain else 10,
                    "percent",
                ),
                ("minimum_air_temperature_c", round(local_temp - 3.5, 1), "degC"),
                ("maximum_air_temperature_c", round(local_temp + 2.5, 1), "degC"),
            )
            inputs = {}
            for name, value, unit in weather_values:
                inputs[name] = metric(weather, name, value, unit, spot, scenario)
            if spot["type"] in {"beach", "mudflat"}:
                marine = snapshot("KHOA")
                for name, value, unit in (
                    (
                        "water_temperature_c",
                        round(23.5 - scenario_index * 0.3, 1),
                        "degC",
                    ),
                    ("wave_height_m", wave, "m"),
                    ("wave_period_seconds", 4.5 + scenario_index * 0.8, "s"),
                    ("tidal_height_cm", 45 + 12 * scenario_index, "cm"),
                    ("current_speed_ms", round(0.15 + wave * 0.12, 2), "m/s"),
                    ("rip_current_risk", 75 if code == "wind" else 20, "demo_index"),
                    (
                        "beach_activity_index",
                        max(10, 85 - round(wave * 20)),
                        "demo_index",
                    ),
                    ("surf_activity_index", 55 if code == "wind" else 40, "demo_index"),
                ):
                    metric(marine, name, value, unit, spot, scenario)
            quality = snapshot("MOE")
            for name, value, unit in (
                ("water_ph", 7.9 if spot["type"] == "beach" else 7.2, "pH"),
                ("turbidity_ntu", 18.0 if code == "rain" else 2.4, "NTU"),
                ("dissolved_oxygen_mg_l", 7.2 if code == "rain" else 8.5, "mg/L"),
            ):
                metric(
                    quality,
                    name,
                    value,
                    unit,
                    spot,
                    scenario,
                    _demo_note="수질 API 수집기 미구현: 전적으로 합성한 값. " + NOTICE,
                )
            if spot["type"] == "valley":
                metric(
                    quality,
                    "river_discharge_m3s",
                    13.0 if code == "rain" else 6.0,
                    "m3/s",
                    spot,
                    scenario,
                )
            if spot["type"] == "onsen":
                metric(
                    quality,
                    "hot_tub_temperature_c",
                    39.0 + scenario_index * 0.2,
                    "degC",
                    spot,
                    scenario,
                )
            derived = snapshot("DERIVED")
            # A mathematically linked example, not the production HCI/Water Index.
            dewpoint = (
                None
                if code == "missing"
                else round(
                    243.04
                    * (
                        math.log(humidity / 100)
                        + 17.625 * local_temp / (243.04 + local_temp)
                    )
                    / (
                        17.625
                        - math.log(humidity / 100)
                        - 17.625 * local_temp / (243.04 + local_temp)
                    ),
                    2,
                )
            )
            output = metric(derived, "dew_point_c", dewpoint, "degC", spot, scenario)
            for name in ("air_temperature_c", "relative_humidity_pct"):
                add(
                    "lineage",
                    spot=spot,
                    scenario=scenario,
                    derived_metric_id=output["id"],
                    source_metric_id=inputs[name]["id"],
                    relation="demo_calculation_input",
                    priority=1,
                    created_at=observed,
                )
            activity = {
                "beach": "swim",
                "valley": "rafting",
                "onsen": "onsen",
                "mudflat": "mudflat",
            }.get(spot["type"], "relax")
            add(
                "scores",
                spot=spot,
                scenario=scenario,
                spot_id=spot["id"],
                activity=activity,
                participant_profile="general",
                safety_status="unknown",
                decision="unknown",
                score=None,
                confidence=0.0,
                coverage=0.0,
                evaluated_at=observed,
                missing_metrics=["real_verified_evidence"],
                limitations=[NOTICE, "합성 값으로 실제 적합도 점수를 계산하지 않음"],
                methodology_version=VERSION,
            )
            for days in range(1, 4):
                target = observed + timedelta(days=days)
                add(
                    "forecasts",
                    spot=spot,
                    scenario=scenario,
                    spot_id=spot["id"],
                    forecast_date=target.date(),
                    activity=activity,
                    participant_profile="general",
                    availability="unavailable",
                    safety_status="unknown",
                    score=None,
                    confidence=0.0,
                    unavailable_reason="DEMO_NOT_REAL_FORECAST",
                    target_at=target,
                    valid_until=target,
                    evaluated_at=observed,
                    missing_metrics=["real_verified_forecast"],
                    limitations=[NOTICE],
                )

        for transport, speed in (("drive", 9.7), ("walk", 1.2), ("bicycle", 4.2)):
            route = add(
                "route-snapshots",
                scenario=scenario,
                provider="PONGDANG_DEMO_VALHALLA",
                transport=transport,
                state="demo",
                observed_at=observed,
                fetched_at=observed,
                valid_until=observed + timedelta(hours=48),
                provider_record_id=f"DEMO-ROUTE-{code}-{transport}",
            )
            for origin in spots:
                for destination in spots:
                    if origin["id"] == destination["id"]:
                        continue
                    lat = math.radians((origin["lat"] + destination["lat"]) / 2)
                    dx = (origin["lng"] - destination["lng"]) * 111_000 * math.cos(lat)
                    dy = (origin["lat"] - destination["lat"]) * 111_000
                    distance = round(math.hypot(dx, dy) * 1.35)
                    duration = round(
                        distance / speed * (1.2 if code in {"rain", "wind"} else 1)
                    )
                    add(
                        "route-entries",
                        scenario=scenario,
                        spot=origin,
                        snapshot_id=route["id"],
                        origin_spot_id=origin["id"],
                        destination_spot_id=destination["id"],
                        distance_metres=distance,
                        duration_seconds=duration,
                        _demo_note=(
                            "좌표 간 거리로 만든 모의 값: "
                            "실제 도로·경로 API 결과 아님. " + NOTICE
                        ),
                    )
        for task in (
            "weather-nowcast",
            "weather-short-forecast",
            "marine",
            "marine-activity-forecast",
            "water-quality-example",
            "sync-tour-spots-example",
            "derive-suitability",
            "daily-forecast",
            "route-matrix-drive",
            "route-matrix-walk",
            "route-matrix-bicycle",
        ):
            add(
                "runs",
                scenario=scenario,
                task_name="DEMO/" + task,
                status="demo",
                started_at=observed,
                finished_at=observed + timedelta(seconds=3),
                error_code="DEMO_NOT_EXECUTED",
            )
    add(
        "heartbeat",
        key="demo-not-a-running-collector",
        state="demo",
        current_tasks=[],
        last_seen_at=anchor,
        updated_at=anchor,
    )
    return {
        "rows": rows,
        "manifest": {
            "version": VERSION,
            "is_demo": True,
            "notice": NOTICE,
            "created_at": anchor.isoformat(),
            "reference_spots": [
                {"id": s["id"], "name": s["name"]} for s in reference_spots
            ],
            "scenarios": [{"key": s[0], "label": s[1]} for s in SCENARIOS],
            "counts": {key: len(value) for key, value in rows.items()},
            "limitations": [
                "Pongdang 운영 스키마는 변경하지 않음",
                "기존 장소 참조와 가상 장소를 구분",
                "수질 API 연동·수집기 실행·시설 실재·법적 채취 허용을 증명하지 않음",
            ],
        },
    }
