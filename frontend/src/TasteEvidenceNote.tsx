import { t } from "./i18n";

export function TasteEvidenceNote({ category }: { category: string }) {
  const note = category === "atmosphere"
    ? "분위기 취향은 저장하지만, 조용함·혼잡도·사진 촬영 여건은 현재 자료로 비교하지 않습니다."
    : category === "companion"
      ? "동행 정보는 요청에 반영합니다. 어린이·반려동물의 시설 이용 가능 여부는 장소 안내를 확인해 주세요."
      : null;
  return note ? <p className="pd-note">{t(note)}</p> : null;
}
