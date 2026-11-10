type Box = { left: number; top: number; width: number; height: number };
type Input = { imageBox: Box; frameBox: Box; naturalWidth: number; naturalHeight: number; clientX: number; clientY: number; viewportWidth: number };

/** Account for object-fit: contain, so the lens and enlarged crop show the same area. */
export function imageZoomGeometry({ imageBox, frameBox, naturalWidth, naturalHeight, clientX, clientY, viewportWidth }: Input) {
  if (imageBox.width <= 0 || imageBox.height <= 0 || naturalWidth <= 0 || naturalHeight <= 0) return null;
  const fit = Math.min(imageBox.width / naturalWidth, imageBox.height / naturalHeight);
  const imageWidth = naturalWidth * fit;
  const imageHeight = naturalHeight * fit;
  const imageLeft = (imageBox.width - imageWidth) / 2;
  const imageTop = (imageBox.height - imageHeight) / 2;
  const x = clientX - imageBox.left - imageLeft;
  const y = clientY - imageBox.top - imageTop;
  if (x < 0 || x > imageWidth || y < 0 || y > imageHeight) return null;
  const panelWidth = Math.min(frameBox.width, viewportWidth - frameBox.left - frameBox.width - 20);
  const panelHeight = frameBox.height;
  if (panelWidth < 200 || panelHeight <= 0) return null;
  const scale = Math.max(2, panelWidth / imageWidth, panelHeight / imageHeight);
  const lensWidth = panelWidth / scale;
  const lensHeight = panelHeight / scale;
  const cropX = Math.max(0, Math.min(imageWidth - lensWidth, x - lensWidth / 2));
  const cropY = Math.max(0, Math.min(imageHeight - lensHeight, y - lensHeight / 2));
  return {
    panel: { left: frameBox.left + frameBox.width, top: frameBox.top, width: panelWidth, height: panelHeight },
    lens: { left: imageLeft + cropX, top: imageTop + cropY, width: lensWidth, height: lensHeight },
    enlarged: { width: imageWidth * scale, height: imageHeight * scale, left: -cropX * scale, top: -cropY * scale },
  };
}
