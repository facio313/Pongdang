import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { codeName, codeNeedsReview, isCodeField } from '../src/codeNames.ts';

test('metric codes have Korean names without changing the original value', () => {
  assert.equal(codeName('metrics', 'name', 'air_temperature_c'), '기온');
  assert.equal(codeName('metrics', 'name', 'relative_humidity_pct'), '상대 습도');
  assert.equal(codeName('metrics', 'unit', 'degC'), '섭씨 (°C)');
});
test('dictionaries are scoped to dataset and field', () => {
  assert.equal(codeName('spots', 'name', 'air_temperature_c'), undefined);
  assert.equal(codeName('facilities', 'type', 'parking'), '주차장');
  assert.equal(codeName('spots', 'type', 'parking'), '미등록 코드');
  assert.equal(isCodeField('metrics', 'value'), false);
});
test('unknown, empty and prototype keys never acquire invented meanings', () => {
  assert.equal(codeName('metrics', 'name', 'future_metric'), '미등록 코드');
  assert.equal(codeName('metrics', 'name', 'toString'), '미등록 코드');
  assert.equal(codeName('metrics', 'name', ''), undefined);
});
test('unregistered provider and task codes do not acquire invented meanings', () => {
  assert.equal(codeName('metrics', 'source', 'new-provider'), '미등록 코드');
  assert.equal(codeName('runs', 'task_name', 'unknown-task'), '미등록 코드');
  assert.equal(codeName('runs', 'task_name', 'weather-nowcast'), '현재 기상 수집');
});

test('all newly connected collector jobs have scoped display names', () => {
  const names = {
    khoa_tide_timeseries: '국립해양조사원 조석 시계열 예보',
    khoa_hf_current: '국립해양조사원 HF 해수유동 실측',
    khoa_current_timeseries: '국립해양조사원 조류 시계열 예보',
    khoa_roms: '국립해양조사원 ROMS 표층 예측',
    airkorea_stations: '에어코리아 측정소 목록',
    airkorea_observations: '에어코리아 대기오염 관측',
    kasi_rise_set: '한국천문연구원 출몰시각',
    kma_forecast_zones: '기상청 예보구역 목록',
    kma_uv_forecast: '기상청 자외선 예보',
    koem_wemo_catalog: '해양환경공단 특별관리해역 자동수질 정점 목록',
    koem_wemo_water_quality: '해양환경공단 특별관리해역 자동수질 관측',
    tourapi_english: '한국관광공사 영문 관광정보',
    tourapi_japanese: '한국관광공사 일문 관광정보',
    tourapi_chinese_simplified: '한국관광공사 중문 간체 관광정보',
    tourapi_chinese_traditional: '한국관광공사 중문 번체 관광정보',
    tourapi_daily_visitors: '한국관광공사 지역별 일 방문통계',
    kwater_dam_release: '한국수자원공사 수문 방류정보',
  };
  for (const [raw, label] of Object.entries(names)) {
    assert.equal(codeName('runs', 'task_name', raw), label);
    assert.equal(codeName('collection-jobs', 'task_name', raw), label);
    assert.equal(codeName('runs', 'error_code', raw), '미등록 코드');
  }
});

test('API provider names remain distinct from differently named scheduler jobs', () => {
  for (const dataset of ['snapshots', 'source-stations', 'source-places']) {
    assert.equal(codeName(dataset, 'provider', 'AIRKOREA'), '에어코리아 대기환경·측정소');
    assert.equal(codeName(dataset, 'provider', 'airkorea_observations'), '미등록 코드');
    assert.equal(codeName(dataset, 'provider', 'KMA_UV'), '기상청 자외선 예보');
    assert.equal(codeName(dataset, 'provider', 'khoa_roms'), '국립해양조사원 ROMS 표층 예측');
  }
  assert.equal(codeName('metrics', 'source', 'tourapi_daily_visitors'), '한국관광공사 지역별 일 방문통계');
  assert.equal(codeName('spots', 'catalog_source', 'KMA_FORECAST_ZONE'), '기상청 예보구역');
  assert.equal(codeName('spots', 'catalog_source', 'future-provider'), '미등록 코드');
});

test('disabled does not incorrectly imply a missing key when approval or implementation is pending', () => {
  assert.equal(codeName('collection-jobs', 'state', 'disabled'), '비활성화');
  assert.equal(codeName('runs', 'status', 'disabled'), '비활성화');
  const reasons = {
    KEY_NOT_CONFIGURED: '서버에 필요한 API 키가 설정되지 않음',
    APPROVAL_PENDING: '제공처 서비스 심의·승인 대기',
    SERVICE_APPROVAL_UNCONFIRMED: '해당 서비스 승인·인증 성공 확인 필요',
    ADAPTER_PENDING: '자동 수집 연결 구현 대기',
  };
  for (const [raw, label] of Object.entries(reasons)) {
    assert.equal(codeName('collection-jobs', 'last_error', raw), label);
    assert.equal(codeName('runs', 'error_code', raw), label);
  }
});

test('new physical units and forecasts have distinct names without inferring safety or units', () => {
  assert.equal(codeName('metrics', 'unit', 'cm/s'), '초당 센티미터');
  assert.equal(codeName('metrics', 'unit', 'm/s'), '초당 미터');
  assert.equal(codeName('metrics', 'unit', '16-point'), '16방위');
  assert.equal(codeName('metrics', 'unit', 'degree'), '각도 (°)');
  assert.equal(codeName('metrics', 'name', 'current_direction'), '유향');
  assert.equal(codeName('metrics', 'name', 'uv_index'), '자외선 지수');
  assert.equal(codeName('metrics', 'name', 'pm10_24h_predicted_moving'), '미세먼지 24시간 예측 이동 농도');
  assert.equal(codeName('metrics', 'name', 'daily_visitors'), '지역별 일 방문자 수');
  assert.equal(codeName('metrics', 'unit', ''), undefined);
  assert.equal(codeName('metrics', 'name', 'future_safe_score'), '미등록 코드');
});


test('all implemented collection mappings, jobs, providers and validation errors have names', () => {
  // Parse source without importing backend modules, loading settings, making requests,
  // or requiring backend packages. Python's stdlib AST is available in frontend CI.
  // New unhandled provider/job expressions fail instead of silently reducing coverage.
  const result = spawnSync(process.env.PYTHON || 'python3', ['-c', String.raw`
import ast, json, pathlib, re, sys
root = pathlib.Path(sys.argv[1])

def parse(path):
    # PEP 758 only removes parentheses from multi-exception handlers in 3.14.
    # Equivalent syntax lets the frontend runner's Python 3.9+ inspect source.
    source = re.sub(r"(?m)^([ \t]*)except ([\w.]+(?:, [\w.]+)+)( as \w+)?:",
                    r"\1except (\2)\3:", path.read_text())
    return ast.parse(source)

worker = parse(root / 'ingestion/worker.py')
modules = {
    node.module.removeprefix('app.').replace('.', '/') + '.py'
    for node in ast.walk(worker)
    if isinstance(node, ast.ImportFrom) and node.module
    and any(alias.name.endswith('_jobs') for alias in node.names)
}
modules.update({'ingestion/http.py', 'ingestion/jobs.py', 'ingestion/worker.py'})
collected = {key: set() for key in ('metrics', 'units', 'providers', 'tasks', 'errors', 'kinds')}

def literal(node):
    try:
        return ast.literal_eval(node)
    except (ValueError, TypeError):
        return None

def add(key, value):
    if isinstance(value, str) and value:
        collected[key].add(value)

def named(node):
    return node.id if isinstance(node, ast.Name) else ''

for module in sorted(modules):
    tree = parse(root / module)
    bindings = {
        named(node.targets[0]): literal(node.value)
        for node in tree.body if isinstance(node, ast.Assign)
    }
    calls = [node for node in ast.walk(tree) if isinstance(node, ast.Call)]
    local_jobs = {
        literal(node.args[0]) for node in calls
        if named(node.func) == 'Job' and node.args and isinstance(literal(node.args[0]), str)
    }
    def resolve_code(node):
        if isinstance(literal(node), str):
            return [literal(node)]
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
            prefix = literal(node.left)
            variable = named(node.right)
            if prefix == 'khoa_' and variable == 'kind':
                return [prefix + kind for kind in bindings['ENDPOINTS']]
            if prefix == 'tourapi_' and variable == 'language':
                return [prefix + lang for lang in bindings['LANGUAGES']]
            if prefix == 'kma_' and variable == 'kind':
                return sorted(code for code in local_jobs if code.startswith(prefix))
        raise AssertionError(f'Unreviewed code expression in {module}: {ast.dump(node)}')
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Tuple) and isinstance(node.value, ast.Tuple):
                    for destination, source in zip(target.elts, node.value.elts):
                        if named(destination) == 'error':
                            add('errors', literal(source))
        if isinstance(node, ast.Dict):
            # Every (normalized metric, declared unit) mapping in live adapters.
            for value in node.values:
                pair = literal(value)
                if isinstance(pair, tuple) and len(pair) in (2, 3):
                    if isinstance(pair[0], str) and pair[0].islower() and isinstance(pair[1], str):
                        add('metrics', pair[0]); add('units', pair[1])
        if isinstance(node, ast.Assign):
            if named(node.targets[0]) in {'AIR_GRADES', 'EVENTS', 'WEMO_FIELDS'}:
                for metric in literal(node.value).values():
                    add('metrics', metric)
        # Inline field/metric(/unit) loops used by water and visitor adapters.
        if isinstance(node, (ast.For, ast.comprehension)) and isinstance(node.target, ast.Tuple):
            entries = literal(node.iter)
            if isinstance(entries, (tuple, list)):
                names = [named(part) for part in node.target.elts]
                for entry in entries:
                    if not isinstance(entry, tuple):
                        continue
                    for index, name in enumerate(names):
                        if name in {'name', 'metric'}:
                            add('metrics', entry[index])
                        if name == 'unit':
                            add('units', entry[index])
    for node in calls:
        function = named(node.func)
        keywords = {item.arg: item.value for item in node.keywords}
        if function in {'Job', 'SourceBatch'}:
            expr = node.args[0] if function == 'Job' else keywords['provider']
            for code in resolve_code(expr):
                add('tasks' if function == 'Job' else 'providers', code)
            if function == 'Job' and 'disabled_reason' in keywords:
                expr = keywords['disabled_reason']
                for part in ast.walk(expr):
                    if isinstance(part, ast.Constant):
                        add('errors', literal(part))
        if function == 'ProviderError' and node.args:
            expr = node.args[0]
            if isinstance(literal(expr), str):
                add('errors', literal(expr))
            else:
                # Arbitrary upstream codes intentionally retain an unknown meaning.
                assert (isinstance(expr, ast.BinOp) and literal(expr.left) == 'PROVIDER_') or (
                    isinstance(expr, ast.JoinedStr) and literal(expr.values[0]) == 'HTTP_'
                ), f'Unreviewed error expression in {module}: {ast.dump(expr)}'
        if function in {'value', 'source_value', 'source_text', '_number', 'Value'}:
            if function == 'Value':
                expr, unit = keywords['name'], keywords.get('unit')
            else:
                position = 2 if function == '_number' else 0
                if len(node.args) <= position:
                    continue
                expr = node.args[position]
                unit_position = 3 if function == '_number' else 2
                unit = node.args[unit_position] if len(node.args) > unit_position else None
            add('units', literal(unit))
            if isinstance(literal(expr), str):
                add('metrics', literal(expr))
            elif isinstance(expr, ast.Name):
                assert expr.id in {'name', 'metric', 'n'}, f'Unreviewed metric variable: {expr.id}'
            elif isinstance(expr, ast.Subscript) and named(expr.value) == 'EVENTS':
                for metric in bindings['EVENTS'].values():
                    add('metrics', metric)
            elif isinstance(expr, ast.BinOp) and named(expr.left) == 'pollutant':
                pollutants = next(literal(loop.iter) for loop in ast.walk(tree)
                                  if isinstance(loop, ast.For) and named(loop.target) == 'pollutant')
                for pollutant in pollutants:
                    add('metrics', pollutant + literal(expr.right))
            elif isinstance(expr, ast.JoinedStr) and literal(expr.values[0]) == 'weather_outlook_part_':
                mid = next(fn for fn in tree.body if isinstance(fn, ast.FunctionDef) and fn.name == '_mid')
                maximum = next(literal(c.comparators[0]) for c in ast.walk(mid)
                               if isinstance(c, ast.Compare) and isinstance(c.left, ast.Call)
                               and named(c.left.func) == 'len')
                stride = next(literal(call.args[2]) for call in ast.walk(mid)
                              if isinstance(call, ast.Call) and named(call.func) == 'range')
                for index in range((maximum + stride - 1) // stride):
                    add('metrics', f'weather_outlook_part_{index + 1}')
            else:
                raise AssertionError(f'Unreviewed metric expression in {module}: {ast.dump(expr)}')
        if function in {'Station', 'Place'}:
            expr = keywords['kind']
            for part in ast.walk(expr):
                if isinstance(part, ast.Constant):
                    # Only literal/conditional result arms, not condition operands.
                    if isinstance(expr, ast.Constant) or isinstance(expr, ast.IfExp) and part in (expr.body, expr.orelse):
                        add('kinds', literal(part))
# Process jobs expose only their bounded summary error codes to collection runs.
for module, function in [('livecams/service.py', 'run_checks'), ('notifications/delivery.py', 'run_notifications')]:
    tree = parse(root / module)
    summary = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == function)
    for node in ast.walk(summary):
        if isinstance(node, ast.keyword) and node.arg == 'error':
            for part in ast.walk(node.value):
                if isinstance(part, ast.Constant):
                    add('errors', literal(part))
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Tuple) and isinstance(node.value, ast.Tuple):
                    for destination, source in zip(target.elts, node.value.elts):
                        if named(destination) == 'error':
                            add('errors', literal(source))
print(json.dumps({key: sorted(values) for key, values in collected.items()}))
`, fileURLToPath(new URL('../../backend/app/', import.meta.url))], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const inventory = JSON.parse(result.stdout);
  const scopes = {
    metrics: [['metrics', 'name']],
    units: [['metrics', 'unit']],
    providers: [['metrics', 'source'], ['snapshots', 'provider'], ['source-stations', 'provider'], ['source-places', 'provider'], ['spots', 'catalog_source']],
    tasks: [['runs', 'task_name'], ['collection-jobs', 'task_name']],
    errors: [['runs', 'error_code'], ['collection-jobs', 'last_error']],
    kinds: [['spots', 'type']],
  };
  // A missing import/mapping must not turn this into a vacuously passing test.
  assert.ok(inventory.metrics.length >= 140, JSON.stringify(inventory));
  assert.ok(inventory.tasks.length >= 45);
  assert.ok(inventory.providers.length >= 37);
  assert.ok(inventory.errors.length >= 85);
  for (const [kind, values] of Object.entries(inventory)) {
    for (const raw of values) {
      for (const [dataset, field] of scopes[kind]) {
        const label = codeName(dataset, field, raw);
        assert.ok(label && label !== '미등록 코드', `${dataset}.${field}: ${raw}`);
      }
    }
  }
});

test('historical error codes describe the known failure without guessing provider-specific meanings', () => {
  assert.equal(codeName('runs', 'error_code', 'HTTP_504'), '제공처 게이트웨이 응답 시간 초과 (HTTP 504)');
  assert.equal(codeName('collection-jobs', 'last_error', 'PROVIDER_MISSING_STATUS'), '제공처 응답의 처리 결과 코드가 없음');
  assert.equal(codeName('runs', 'error_code', 'PROVIDER_10'), '제공처 오류 응답 (코드 10 · 해당 서비스 명세 확인 필요)');
  assert.equal(codeName('runs', 'error_code', 'PROVIDER_98765'), '미등록 코드');
  assert.equal(codeName('runs', 'error_code', 'SOURCE_SCOPE_TOO_LARGE'), '처리 대상 자료가 작업당 조회 상한 (5,000건)을 초과함');
  assert.equal(codeName('metrics', 'unit', 'hPa'), '헥토파스칼');
  assert.equal(codeName('metrics', 'name', 'weather_outlook_part_20'), '중기 기상 전망 (20번째 부분)');
  assert.equal(codeName('metrics', 'name', 'weather_outlook_part_21'), '미등록 코드');
});


test('provider-specific meanings awaiting review remain visible despite a generic label', () => {
  assert.equal(codeNeedsReview('runs', 'error_code', 'PROVIDER_10'), true);
  assert.equal(codeNeedsReview('collection-jobs', 'last_error', 'PROVIDER_10'), true);
  assert.equal(codeNeedsReview('runs', 'error_code', 'HTTP_504'), false);
  assert.equal(codeNeedsReview('snapshots', 'provider', 'PROVIDER_10'), true);
  assert.equal(codeNeedsReview('metrics', 'name', 'future_metric'), true);
  assert.equal(codeNeedsReview('metrics', 'name', 'toString'), true);
  assert.equal(codeNeedsReview('metrics', 'name', 'wave_height'), false);
  assert.equal(codeNeedsReview('metrics', 'name', ''), false);
  assert.equal(codeNeedsReview('metrics', 'value', 'PROVIDER_10'), false);
});
