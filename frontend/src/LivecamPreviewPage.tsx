import { useState } from 'react';
import { date } from './data';
import { previewPlayerUrl, safeWebcamUrl } from './livecamApi';
import { cameraCategories, newWebcamShuffleSeed, webcamCategories, type WebcamCategory } from './livecamPreviewApi';
import { useWebcamCatalog } from './useWebcamCatalog';
import './livecamHub.css';

export function LivecamPreviewPage() {
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<WebcamCategory | ''>('');
  const [shuffleSeed, setShuffleSeed] = useState(newWebcamShuffleSeed);
  const { result, error, loading, expired, now } = useWebcamCatalog(page, category, shuffleSeed);
  const pages = result ? Math.min(5, Math.max(1, Math.ceil(result.total / result.page_size))) : 1;
  return <article className="livecam-hub">
    <h1>물 풍경 웹캠</h1>
    <p>전국의 해변·바다·항구·호수·강 풍경을 무작위로 만나보세요. 위치와 거리 제한 없이 물이 있는 곳의 카메라를 모았습니다.</p>
    <p className="lc-attribution">Webcams provided by <a href="https://www.windy.com/" target="_blank" rel="noopener noreferrer">windy.com</a> · <a href="https://www.windy.com/webcams/add" target="_blank" rel="noopener noreferrer">add new webcam</a></p>
    <div className="lc-search">
      <label>카메라 분류<select aria-label="카메라 분류" value={category} disabled={loading} onChange={event => { setCategory(event.target.value as WebcamCategory | ''); setPage(1); }}>
        <option value="">물 관련 전체</option>{Object.entries(webcamCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <button disabled={loading} onClick={() => { setShuffleSeed(newWebcamShuffleSeed); setPage(1); }}>다른 풍경 보기</button>
    </div>
    {loading && <p role="status">물 풍경 카메라를 불러오는 중… 첫 조회에는 잠시 시간이 걸립니다.</p>}
    {error && <p role="alert">{error}</p>}
    {result && <>
      <p role="status"><strong>{category ? webcamCategories[category] : '물 관련'} {result.total}개</strong> · {page} / {pages}페이지 · 이번 페이지 {result.rows.length}개</p>
      <p className="table-note">무작위 순서로 보여드립니다. 분류와 페이지를 바꿔도 순서는 유지되며, 다른 풍경 보기를 누르면 목록을 새로 섞습니다.</p>
      {result.truncated && <p className="lc-notice">분류별 첫 25개를 모은 목록입니다. 제공자의 조회 범위를 넘어선 카메라는 포함되지 않았습니다.</p>}
      <p className="table-note">조회 {date(result.fetched_at)}{result.cached ? ' · 캐시된 목록' : ''} · 등록 수이며 재생을 확인한 수는 아닙니다.</p>
      {expired && <p role="status">목록 유효기간이 지났습니다. 다른 풍경 보기를 누르면 새 목록의 타임랩스 링크를 사용할 수 있습니다.</p>}
      {result.rows.length ? <div className="table-scroll" role="region" aria-label="물 풍경 웹캠 목록" tabIndex={0}><table className="lc-catalog-table">
        <caption>카메라 이름과 제공 자료를 확인하고 열기</caption>
        <thead><tr><th scope="col">카메라</th><th scope="col">지역</th><th scope="col">제공자 분류</th><th scope="col">제공 자료</th><th scope="col">보기</th><th scope="col">마지막 갱신</th></tr></thead>
        <tbody>{result.rows.map(camera => {
          const player = previewPlayerUrl(camera, result.valid_until, now);
          const original = safeWebcamUrl(camera.public_page, camera.provider_camera_id);
          return <tr key={camera.provider_camera_id}>
            <td><strong>{camera.title}</strong><br /><small>ID {camera.provider_camera_id}</small></td>
            <td>{[camera.region, camera.city].filter(Boolean).join(' · ') || '지역 미제공'}</td>
            <td>{cameraCategories(camera.categories)}</td>
            <td>{[camera.timelapse_player && '타임랩스', camera.live_player && '실시간 안내 · 미검증', camera.photo_available && '사진'].filter(Boolean).join(' · ') || '미확인'}</td>
            <td><div className="lc-catalog-links">
              {player && <a href={player} target="_blank" rel="noopener noreferrer">타임랩스 열기 ↗</a>}
              {original && <a href={original} target="_blank" rel="noopener noreferrer">{camera.live_player ? '실시간 원본 · 미검증 ↗' : '원본 페이지 ↗'}</a>}
              {!player && !original && <span>공개 링크 없음</span>}
            </div></td>
            <td>{date(camera.provider_updated_at)}<br /><small>{camera.provider_status === 'active' ? '최근 갱신됨' : camera.provider_status === 'inactive' ? '갱신 중단' : '갱신 상태 미확인'}</small></td>
          </tr>;
        })}</tbody>
      </table></div> : <p className="lc-empty">이 분류에 표시할 카메라가 없습니다. 물 관련 전체나 다른 물 분류를 선택해 주세요.</p>}
      <nav className="lc-pages" aria-label="웹캠 페이지">
        <button disabled={page <= 1} onClick={() => setPage(value => value - 1)}>이전</button><span>{page} / {pages} · 25개씩</span>
        <button disabled={!result.has_more} onClick={() => setPage(value => value + 1)}>다음</button>
      </nav>
    </>}
    <p className="lc-note">분류는 Windy의 정보 기준이며 실제 촬영 대상은 플레이어에서 확인할 수 있습니다. 타임랩스는 시간을 압축한 영상입니다. 최근 갱신 표시는 생방송이나 재생 성공을 뜻하지 않습니다. 공식 플레이어는 새 탭에서 열리며 광고가 표시될 수 있습니다.</p>
  </article>;
}
