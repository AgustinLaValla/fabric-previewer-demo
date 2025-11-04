import React, { useEffect, useMemo, useState } from "react";
import { StaticCanvas } from "fabric";
import { SnapMotionCanvas, useActiveScene, Picture, ImageMask } from "fabric-previewer";
import { Button } from "./ui/button";

const HARDCODED_REPLACE_URL = "https://ik.imagekit.io/cliqdev/users/132/uploads/RGXtths0kB.jpg";

/** Find all masked pictures (i.e., Picture with a clipPath of type ImageMask) */
function findMaskedPictures(canvas?: SnapMotionCanvas): Picture[] {
  if (!canvas) return [];
  const objs = canvas.allObjects?.() ?? [];
  return objs.filter((o: any) => {
    if (String(o.type || "").toLowerCase() !== "picture") return false;
    const cp = (o as any).clipPath;
    return !!cp && String(cp.type || "").toLowerCase() === "imagemask";
  }) as Picture[];
}

/** Build a thumbnail (dataURL) for a masked picture by cloning into a StaticCanvas */
async function makeMaskedThumb(picture: Picture, size = 140): Promise<string> {
  // Clone via toObject / fromObject so we keep the clipPath enlivened
  const json = picture.toObject([
    "clipPath",
    "id",
    "rx",
    "ry",
    "innerBorderWidth",
    "innerBorderColor",
  ]);

  // Enliven Picture + clipPath back into a fresh Picture instance
  const cloned = await Picture.fromObject(json as any, {
    // AbortSignal dummy — you can pass a real one if you need cancel
    signal: new AbortController().signal,
  });

  // Render it offscreen
  const sc = new StaticCanvas("", { width: size, height: size });

  // Scale cloned picture to fit thumbnail box (contain), keep aspect
  // NOTE: we want to *preview* the final masked look, not stretch it.
  const bw = cloned.getScaledWidth();
  const bh = cloned.getScaledHeight();
  const pad = 6;
  const boxW = size - pad * 2;
  const boxH = size - pad * 2;
  const scale = Math.min(boxW / Math.max(1, bw), boxH / Math.max(1, bh));

  if (scale !== 1) cloned.scale(cloned.scaleX * scale);

  cloned.set({
    left: size / 2,
    top: size / 2,
    originX: "center",
    originY: "center",
    angle: 0,
  });

  sc.add(cloned);
  sc.renderAll();

  const dataUrl = sc.toDataURL({ format: "png", quality: 1, multiplier: 1 });

  // cleanup
  sc.dispose();
  return dataUrl;
}

/** Replace the content of a masked Picture (keep the same clipPath & geometry) */
async function replaceMaskedPictureSource(picture: Picture, newUrl: string) {
  if (!picture || !picture.clipPath) return;

  const canvas = picture.canvas;
  const mask = picture.clipPath as unknown as ImageMask;

  // ——— Preserve current geometry so nothing "jumps" or resizes ———
  const prevCenter = picture.getCenterPoint();
  const prevOriginX = picture.originX;
  const prevOriginY = picture.originY;
  const prevAngle = picture.angle;

  // Displayed (scaled) size BEFORE replacement
  const prevScaledW = picture.getScaledWidth();
  const prevScaledH = picture.getScaledHeight();

  // Reset crop for a clean swap (optional; remove if you want to preserve cropping)
  picture.set({ cropX: 0, cropY: 0 });

  // Some fabric builds expose async setSrc; await if present
  const setSrc = (picture as any).setSrc?.bind(picture);
  if (setSrc) {
    await setSrc(newUrl, { crossOrigin: "anonymous" });
  } else {
    // Fallback: recreate via fromURL then transfer props (rarely needed)
    const tmp = await Picture.fromURL(newUrl, { crossOrigin: "anonymous" });
    picture._element = tmp._element;
    (picture as any)._originalElement = tmp._originalElement;
    picture.set({ width: tmp.width, height: tmp.height });
  }

  // —— Recompute scale so final displayed size matches the previous one ——
  // (width/height updated by setSrc to intrinsic dimensions)
  const targetScaleX = prevScaledW / Math.max(1, picture.width);
  const targetScaleY = prevScaledH / Math.max(1, picture.height);

  picture.set({
    scaleX: targetScaleX,
    scaleY: targetScaleY,
    angle: prevAngle,
    originX: prevOriginX,
    originY: prevOriginY,
  });

  // Restore center BEFORE validating the mask
  picture.setPositionByOrigin(prevCenter, "center", "center");

  // Normalize/refresh the clipPath for the new image geometry
  picture.validateMask();

  // Some validateMask flows rebuild clipPath and can slightly perturb coords:
  // re-apply scale + center to be absolutely consistent
  picture.set({
    scaleX: targetScaleX,
    scaleY: targetScaleY,
    angle: prevAngle,
    originX: prevOriginX,
    originY: prevOriginY,
  });
  picture.setPositionByOrigin(prevCenter, "center", "center");
  picture.setCoords();

  canvas?.requestRenderAll();
  canvas?.fire("object:modified", { target: picture });
}


export const MaskedImagesReplaceEdition: React.FC = () => {
  const scene = useActiveScene();
  const canvas = scene?.canvas as SnapMotionCanvas | undefined;

  // A simple version counter to trigger re-renders on canvas changes
  const [tick, setTick] = useState(0);

  // Collect masked pictures on the active scene
  const pictures = useMemo(() => {
    return canvas ? findMaskedPictures(canvas) : [];
  }, [canvas, tick, scene?.id]);

  // Thumbnails state per picture id
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  // Recompute thumbnails whenever pictures or canvas change
  useEffect(() => {
    let isMounted = true;
    (async () => {
      const next: Record<string, string> = {};
      for (const pic of pictures) {
        try {
          next[pic.id] = await makeMaskedThumb(pic, 140);
        } catch {
          // ignore per-item failures
        }
      }
      if (isMounted) setThumbs(next);
    })();
    return () => {
      isMounted = false;
    };
  }, [pictures, tick]);

  // Listen to canvas changes to refresh thumbs live
  useEffect(() => {
    if (!canvas) return;

    const bump = () => setTick((t) => t + 1);

    canvas.on("object:modified", bump);
    canvas.on("object:added", bump);
    canvas.on("object:removed", bump);

    return () => {
      canvas.off("object:modified", bump);
      canvas.off("object:added", bump);
      canvas.off("object:removed", bump);
    };
  }, [canvas]);

  if (!pictures.length) return null;

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-[760px]">
      <div className="text-lg font-semibold text-center">Masked Images</div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-12 w-full place-items-center">
        {pictures.map((pic) => {
          const thumb = thumbs[pic.id];
          return (
            <div
              key={pic.id}
              className="flex flex-col items-center gap-3 p-3 rounded-xl border border-gray-200 bg-white shadow-sm w-[200px]"
            >
              <div className="text-xs opacity-70">ID: {pic.id}</div>

              <div className="w-[140px] h-[140px] flex items-center justify-center rounded-md border border-gray-100 bg-gray-50 overflow-hidden">
                {thumb ? (
                  <img
                    src={thumb}
                    alt={`masked-${pic.id}`}
                    width={140}
                    height={140}
                    style={{ objectFit: "contain" }}
                  />
                ) : (
                  <div className="text-[11px] opacity-60">Rendering…</div>
                )}
              </div>

              <Button
                className="bg-secondary text-black hover:text-white shadow-lg"
                onClick={async () => {
                  await replaceMaskedPictureSource(pic, HARDCODED_REPLACE_URL);
                  // Force a local refresh of this thumb
                  setTick((t) => t + 1);
                }}
              >
                Replace image
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
