# 공용 바다 이미지 · 2026-09-30

- 용도: 홈의 해변 명소에서 대표 사진이 없거나 불러오지 못했을 때만 표시한다. 기존 실제 장소 사진을 우선한다.
- 에셋: `frontend/public/images/common-beach.webp` (1536 × 1024, WebP).
- 출처: 내장 image_gen 도구로 생성한 공용 이미지. 실제 특정 장소의 사진이나 관측 자료로 사용하지 않는다.
- 화면: ‘공용 바다 이미지’ 표시와 실제 장소 사진이 아니라는 대체 텍스트를 함께 제공한다.
- 웹 배포용 형식 변환: cwebp 품질 82. 장면·구도는 변경하지 않았다.

생성 프롬프트:

Use case: photorealistic-natural. Asset type: shared fallback beach photograph for a Korean water-travel website's small destination cards. Primary request: a beautiful generic open sea and sandy beach, not depicting or claiming to depict any identifiable real location. Landscape 3:2 composition, natural blue water fading to turquoise near the shore, a gentle small white wave curving diagonally across pale sand, clear light blue sky and a simple horizon. Soft natural daylight, realistic water and sand texture, restrained serene travel photography. Framing should work in a wide card or centered square crop, with sea occupying most of the frame. No people, buildings, signs, landmarks, tropical palm trees, text, logos, borders, or watermarks. Opaque image.
