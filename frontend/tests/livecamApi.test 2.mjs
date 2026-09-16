import assert from 'node:assert/strict';
import test from 'node:test';
import { mediaLabels, relationLabels, searchLabels, safeWebcamUrl, playableUrl, publicCameraPage } from '../src/livecamApi.ts';

const player = 'https://webcams.windy.com/webcams/public//player?webcamId=1&playerType=day';
const camera = { camera_key: 'windy:1', provider_camera_id: '1', public_page: 'https://webcams.windy.com/webcams/1', valid_until: '2030-01-01T00:00:00Z' };
const option = { media_kind: 'timelapse', playback_method: 'iframe', url: player, verified: false, valid_until: null, connection_status: 'unverifiable' };
test('exact Windy public and player URL policy excludes tokens, spoofed hosts and other IDs', () => {
  assert.equal(safeWebcamUrl(camera.public_page, '1'), camera.public_page);
  assert.equal(safeWebcamUrl(player, '1', 'day'), player);
  assert.equal(safeWebcamUrl(player.replace('public//', 'public/'), '1', 'day'), null);
  for (const url of [player + '&token=private', player + '&webcamId=1', player.replace('webcams.windy.com', 'webcams.windy.com.evil.test'), player.replace('https:', 'http:'), player.replace('webcamId=1', 'webcamId=2'), player + '#secret', player.replace('https://', 'https://user:pass@'), player.replace('webcams.windy.com', '127.0.0.1')]) assert.equal(safeWebcamUrl(url, '1', 'day'), null);
  assert.equal(safeWebcamUrl('https://webcams.windy.com/webcams/%31', '1'), null);
});
test('unverified live and expired media never acquire an internal live player', () => {
  assert.equal(playableUrl(camera, option, Date.parse('2026-01-01')), player);
  assert.equal(playableUrl(camera, option, Date.parse('2031-01-01')), null);
  const live = { ...option, media_kind: 'live', url: player.replace('day', 'live') };
  assert.equal(playableUrl(camera, live, Date.parse('2026-01-01')), null);
  assert.equal(playableUrl(camera, { ...live, verified: true, valid_until: '2027-01-01T00:00:00Z' }, Date.parse('2026-01-01')), live.url);
  assert.equal(playableUrl(camera, { ...option, connection_status: 'offline' }), null);
  assert.equal(playableUrl(camera, { ...option, url: live.url }), null);
  assert.equal(playableUrl(camera, { ...option, media_kind: 'photo' }), null);
  assert.equal(playableUrl(camera, { ...option, url: camera.public_page }), null);
});
test('current API path-based embeds play with exact identity, period and expiry checks', () => {
  const detail = 'https://windy.com/webcams/1';
  const prefix = 'https://webcams.windy.com/webcams/public/embed/player/1/';
  assert.equal(publicCameraPage({ ...camera, public_page: detail }), detail);
  for (const period of ['day', 'month', 'year', 'lifetime']) {
    const url = prefix + period;
    assert.equal(safeWebcamUrl(url, '1', period), url);
    assert.equal(playableUrl(camera, { ...option, url }, Date.parse('2026-01-01')), url);
    assert.equal(playableUrl(camera, { ...option, url }, Date.parse('2031-01-01')), null);
  }
  for (const url of [prefix + 'day?token=private', prefix + 'day#private', prefix.replace('/1/', '/2/') + 'day', prefix.replace('webcams.windy.com', 'windy.com') + 'day', prefix.replace('webcams.windy.com', 'webcams.windy.com:443') + 'day']) assert.equal(safeWebcamUrl(url, '1', 'day'), null);
  assert.equal(playableUrl(camera, { ...option, url: prefix + 'live' }), null);
  assert.equal(playableUrl(camera, { ...option, media_kind: 'live', url: prefix + 'live', verified: false }), null);
});
test('external playback remains a safe link and manual official registrations remain compatible', () => {
  assert.equal(playableUrl(camera, { ...option, playback_method: 'external_page', url: camera.public_page }), camera.public_page);
  assert.equal(playableUrl(camera, { ...option, playback_method: 'external_page', url: 'https://evil.test' }), null);
  assert.equal(publicCameraPage({ ...camera, camera_key: 'registered:agency', public_page: 'https://www.khoa.go.kr/camera' }), 'https://www.khoa.go.kr/camera');
  assert.equal(publicCameraPage({ ...camera, camera_key: 'registered:agency', public_page: 'https://www.khoa.go.kr/camera?key=secret' }), null);
});
test('media, relation and empty states use independent labels', () => {
  assert.equal(mediaLabels.timelapse, '타임랩스');
  assert.equal(relationLabels.nearby, '주변 풍경');
  assert.equal(new Set(Object.values(searchLabels)).size, 7);
  assert.notEqual(searchLabels.not_searched, searchLabels.no_nearby_cameras);
  assert.notEqual(searchLabels.unconfigured, searchLabels.failed);
});
