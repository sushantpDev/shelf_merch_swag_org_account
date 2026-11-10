import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { imageZoomGeometry } from "./imageZoomGeometry";
import "./product-image-magnifier.css";

export function ProductImageMagnifier({ src, alt }: { src: string; alt: string }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [zoom, setZoom] = useState<ReturnType<typeof imageZoomGeometry>>(null);
  const visible = zoom !== null;
  useEffect(() => {
    if (!visible) return;
    const close = () => setZoom(null);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", escape);
    };
  }, [visible]);

  const follow = (event: PointerEvent<HTMLDivElement>) => {
    const image = imageRef.current;
    if (!image || event.pointerType !== "mouse" || !window.matchMedia("(min-width: 901px) and (hover: hover) and (pointer: fine)").matches) {
      setZoom(null);
      return;
    }
    const imageBox = event.currentTarget.getBoundingClientRect();
    const frameBox = event.currentTarget.closest(".catalog-pdp-main-media")?.getBoundingClientRect() ?? imageBox;
    setZoom(imageZoomGeometry({ imageBox, frameBox, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, clientX: event.clientX, clientY: event.clientY, viewportWidth: window.innerWidth }));
  };

  return (
    <div className="catalog-image-zoom" onPointerEnter={follow} onPointerMove={follow} onPointerLeave={() => setZoom(null)} onPointerCancel={() => setZoom(null)}>
      <img ref={imageRef} src={src} alt={alt} loading="eager" decoding="async" referrerPolicy="no-referrer" onLoad={() => setZoom(null)} onError={() => setZoom(null)} />
      {zoom ? <div className="catalog-image-zoom__lens" style={zoom.lens} aria-hidden="true" /> : null}
      {zoom ? createPortal(<div className="catalog-image-zoom__preview" style={zoom.panel} aria-hidden="true"><img src={src} alt="" referrerPolicy="no-referrer" style={zoom.enlarged} /></div>, document.body) : null}
    </div>
  );
}
