import assert from 'node:assert/strict';
import test from 'node:test';
import { placePhotosPath, placePhotoUrl, placePhotoSource, placePhotoLicense } from '../src/placePhotos.ts';

const photo = {
  id: 72, spot_id: 15, url: '/api/data/attachments/72/file',
  attribution: '한국관광공사', license: '공공누리 3유형', name: '대표 사진',
  source_url: 'https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=test',
};

test('photo metadata requests are stable, unique, positive, and bounded to 100 places', () => {
  assert.equal(placePhotosPath([]), null);
  assert.equal(placePhotosPath([NaN, Infinity, 0, -2, 1.5]), null);
  assert.equal(placePhotosPath([15, 3, 15, -2, 0]), 'attachments?spot_ids=3,15');
  const path = placePhotosPath(Array.from({ length: 200 }, (_, index) => index + 1));
  assert.equal(path.split('=')[1].split(',').length, 100);
});

test('stored attachment image URLs preserve deployment base and reject provider URLs', () => {
  assert.equal(placePhotoUrl('/pongdang/', photo), '/pongdang/api/data/attachments/72/file');
  assert.equal(placePhotoUrl('/', photo), '/api/data/attachments/72/file');
  assert.equal(placePhotoUrl('/pongdang/', undefined), undefined);
  for (const url of [
    'https://example.org/image.jpg', '//example.org/image.jpg',
    '/api/data/attachments/71/file', '/api/data/attachments/72/file?token=private',
    '/api/data/attachments/72/../file', 'javascript:alert(1)',
  ]) assert.equal(placePhotoUrl('/pongdang/', { ...photo, url }), undefined);
  assert.equal(placePhotoUrl('/', { ...photo, id: NaN }), undefined);
});

test('photo attribution links accept public HTTPS pages and reject authenticated or executable URLs', () => {
  assert.equal(placePhotoSource(photo), photo.source_url);
  for (const source_url of ['', 'javascript:alert(1)', 'data:text/html,photo', 'http://example.org', 'https://user:pass@example.org']) {
    assert.equal(placePhotoSource({ ...photo, source_url }), undefined);
  }
});

test('official copyright codes display their Korean license names', () => {
  assert.equal(placePhotoLicense({ ...photo, license: 'Type1' }), '공공누리 1유형');
  assert.equal(placePhotoLicense({ ...photo, license: 'Type3' }), '공공누리 3유형');
  assert.equal(placePhotoLicense({ ...photo, license: 'unknown' }), 'unknown');
});
