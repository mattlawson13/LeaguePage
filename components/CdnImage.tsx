"use client";

import { useState } from "react";
import Image, { type ImageProps } from "next/image";

/**
 * Wraps next/image for Sleeper CDN assets that may 404 (retired players,
 * missing avatars) or simply not apply to a given manager. Renders nothing —
 * no placeholder box, no broken-image icon — the moment there's no image to
 * show, so the surrounding layout collapses cleanly.
 */
export function CdnImage({ alt, ...rest }: ImageProps) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return <Image alt={alt} {...rest} onError={() => setHidden(true)} />;
}
