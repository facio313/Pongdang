import { useState } from "react";
import { t } from "./i18n";
import { Icon } from "./pongdangUi";
import { placePhotoLicense, placePhotoSource, placePhotoUrl, type PlacePhoto as Photo } from "./placePhotos";
import "./placePhoto.css";

const SHARED_PHOTOS = {
  beach: { file: "common-beach.webp", label: "공용 바다 이미지", alt: "공용 바다 이미지 · 실제 장소 사진 아님", title: "AI로 만든 공용 바다 이미지입니다." },
  valley: { file: "common-valley.webp", label: "공용 계곡 이미지", alt: "공용 계곡 이미지 · 실제 장소 사진 아님", title: "AI로 만든 공용 계곡 이미지입니다." },
};

export function PlacePhoto({ photo, name, className = "", eager = false, fallback }: {
  photo?: Photo;
  name: string;
  className?: string;
  eager?: boolean;
  fallback?: "beach" | "valley";
}) {
  const url = placePhotoUrl(import.meta.env.BASE_URL, photo);
  const [failedUrl, setFailedUrl] = useState<string>();
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const visible = Boolean(url && url !== failedUrl);
  const sharedPhoto = fallback ? SHARED_PHOTOS[fallback] : null;
  const showSharedPhoto = !visible && sharedPhoto && !fallbackFailed;
  return (
    <span className={`place-photo ${className}`}>
      {visible ? (
        <img src={url} alt={t("{name} 대표 사진", { name })} loading={eager ? "eager" : "lazy"}
          decoding="async" onError={() => setFailedUrl(url)} />
      ) : showSharedPhoto ? (
        <>
          <img className="place-photo-generic" src={`${import.meta.env.BASE_URL}images/${sharedPhoto.file}`}
            alt={t(sharedPhoto.alt)} loading={eager ? "eager" : "lazy"}
            decoding="async" onError={() => setFallbackFailed(true)} />
          <span className="place-photo-generic-label" title={t(sharedPhoto.title)}>{t(sharedPhoto.label)}</span>
        </>
      ) : (
        <span className="place-photo-fallback" role="img" aria-label={t("{name} 대표 사진 없음", { name })}>
          <Icon name="pin" size={20} />
        </span>
      )}
    </span>
  );
}

/** Keep this beside a card's navigation link, never inside another anchor. */
export function PlacePhotoCredit({ photo }: { photo?: Photo }) {
  if (!photo || !placePhotoUrl(import.meta.env.BASE_URL, photo)) return null;
  const source = placePhotoSource(photo);
  const license = placePhotoLicense(photo);
  return (
    <span className="place-photo-credit">
      {source ? <a href={source} target="_blank" rel="noreferrer">{photo.attribution}</a> : photo.attribution}
      {!photo.attribution.includes(license) && ` · ${license}`}
    </span>
  );
}
