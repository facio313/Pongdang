import { useState, type CSSProperties, type ReactNode } from 'react';
import { t } from './i18n';
import { storedWebcamThumbnailUrl } from './livecamApi';
import type { PreviewCamera } from './livecamPreviewApi';
import './webcamThumbnail.css';

type Props = {
  camera: Pick<PreviewCamera, 'provider_camera_id' | 'title' | 'thumbnail_url'>;
  className?: string;
  style?: CSSProperties;
  fallback?: ReactNode;
  children?: ReactNode;
};

export function WebcamThumbnail({ camera, className = '', style, fallback, children }: Props) {
  const src = storedWebcamThumbnailUrl(import.meta.env.BASE_URL, camera);
  const [failedSrc, setFailedSrc] = useState<string>();
  const showImage = src !== undefined && src !== failedSrc;
  return <span className={`webcam-thumbnail ${className}`} style={style}>
    {showImage ? <>
      <img className="webcam-thumbnail-photo" src={src} alt={t('{name} 대표 이미지', { name: camera.title })}
        loading="lazy" decoding="async" width={320} height={180} onError={() => setFailedSrc(src)} />
      <span className="webcam-thumbnail-label">{t('대표 이미지')}</span>
    </> : fallback}
    {children}
  </span>;
}
