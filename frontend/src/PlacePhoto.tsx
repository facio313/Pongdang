import { useState } from "react";
import { Icon } from "./pongdangUi";
import { placePhotoLicense, placePhotoSource, placePhotoUrl, type PlacePhoto as Photo } from "./placePhotos";
import "./placePhoto.css";

export function PlacePhoto({ photo, name, className = "", eager = false }: {
  photo?: Photo;
  name: string;
  className?: string;
  eager?: boolean;
}) {
  const url = placePhotoUrl(import.meta.env.BASE_URL, photo);
  const [failedUrl, setFailedUrl] = useState<string>();
  const visible = Boolean(url && url !== failedUrl);
  return (
    <span className={`place-photo ${className}`}>
      {visible ? (
        <img src={url} alt={`${name} 대표 사진`} loading={eager ? "eager" : "lazy"}
          decoding="async" onError={() => setFailedUrl(url)} />
      ) : (
        <span className="place-photo-fallback" role="img" aria-label={`${name} 대표 사진 없음`}>
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
