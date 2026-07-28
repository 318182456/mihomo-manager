import { useState } from 'react';
import { Globe } from 'lucide-react';
import { iconUrl } from '../../lib/icons';

/**
 * 订阅源图标。图标托管在第三方 CDN 上，加载失败时回退到通用图标，
 * 而不是留下一块空白占位。
 */
export function SourceIcon({ icon, size = 16 }: { icon?: string; size?: number }) {
  const [failed, setFailed] = useState(false);

  if (!icon || failed) {
    return <Globe size={size - 2} className="text-fg-subtle" />;
  }

  return (
    <img
      src={iconUrl(icon)}
      alt=""
      style={{ width: size, height: size }}
      className="object-contain"
      onError={() => setFailed(true)}
    />
  );
}
