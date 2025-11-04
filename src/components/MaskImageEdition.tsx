import React, { useEffect, useMemo, useState } from "react";
import { nanoid } from "nanoid";
import { StaticCanvas } from "fabric";
import { SnapMotionCanvas, useActiveScene, Picture, ImageMask } from "fabric-previewer";

import { Button } from "./ui/button";

const HARDCODED_IMAGE_URL =
  "https://ik.imagekit.io/cliqdev/e/12/images/DYXgaNvOS16QzI6xKjRI.jpeg";

/** Return ALL empty masks (i.e., masks not currently used as clipPath by a Picture) */
function findEmptyMasks(canvas: SnapMotionCanvas): ImageMask[] {
  if (!canvas) return [];
  const objs = canvas.allObjects?.() ?? [];
  const masks = objs.filter(
    (o: any) => String(o.type || "").toLowerCase() === "imagemask"
  ) as ImageMask[];

  return masks.filter((mask) => {
    const inUse = objs.some(
      (o: any) =>
        String(o.type || "").toLowerCase() === "picture" &&
        o.clipPath &&
        (o.clipPath.id === (mask as any).id || o.clipPath === mask)
    );
    return !inUse;
  });
}

/** Render a small thumbnail (dataURL) of the mask path so the user can identify it. */
function makeMaskThumbnail(mask: any, thumbSize = 120): string {
  try {
    // Offscreen static canvas
    const sc = new StaticCanvas("", {
      width: thumbSize,
      height: thumbSize,
    });

    // Extract path data from the ImageMask (string or TComplexPathData)
    const pathData = (mask as any).path;
    if (!pathData) {
      // No path? Show a blank fallback thumb
      return sc.toDataURL({ format: "png", multiplier: 1, quality: 1 });
    }

    // Create a "display-only" ImageMask for the thumbnail
    const displayMask = new ImageMask(pathData, {
      left: thumbSize / 2,
      top: thumbSize / 2,
      originX: "center",
      originY: "center",
      angle: 0,
      // neutral appearance: outline only
      fill: null,
      stroke: "#888",
      strokeWidth: 2,
      objectCaching: false,
      // carry rounded info so the outline matches expected look
      isRoundable: (mask as any).isRoundable || false,
      radius: (mask as any).radius || 0,
    });

    // Scale to fit thumbnail safely
    const w = (mask.getScaledWidth && mask.getScaledWidth()) || (mask.width ?? 1);
    const h = (mask.getScaledHeight && mask.getScaledHeight()) || (mask.height ?? 1);

    const pad = 10; // small padding
    const targetW = thumbSize - pad * 2;
    const targetH = thumbSize - pad * 2;

    const scale = Math.min(targetW / Math.max(1, w), targetH / Math.max(1, h));
    displayMask.scale(scale);

    sc.add(displayMask);
    sc.renderAll();

    return sc.toDataURL({ format: "png", multiplier: 1, quality: 1 });
  } catch {
    // Fallback: transparent thumb if anything fails
    const sc = new StaticCanvas("", { width: thumbSize, height: thumbSize });
    return sc.toDataURL({ format: "png", multiplier: 1, quality: 1 });
  }
}

/** Apply a mask to a specific ImageMask id using a hardcoded image URL */
async function applyMaskToGivenMask(
  canvas: SnapMotionCanvas,
  maskId: string,
  url: string
) {
  if (!canvas) return;

  const objs = canvas.getObjects();
  const mask: any =
    objs.find((o: any) => String(o.type || "").toLowerCase() === "imagemask" && o.id === maskId) ||
    null;
  if (!mask) return;

  const picId = nanoid();
  const picture = await Picture.fromURL(url, {
    id: picId,
    crossOrigin: "anonymous",
    canvas,
  });

  // Insert picture at the mask's index to preserve z-order
  const all = canvas.getObjects();
  const maskIndex = all.indexOf(mask);
  const insertIndex = maskIndex >= 0 ? maskIndex : all.length;
  canvas.insertAt(insertIndex, picture);

  // Scale picture to cover the mask bounds (same logic as editor drag-drop)
  const currentMaskWidth = mask.getScaledWidth();
  const currentMaskHeight = mask.getScaledHeight();

  const adjustToWidth = () => {
    const scale = currentMaskWidth / picture.width;
    picture.scale(scale);
    const excessHeight = currentMaskHeight - picture.getScaledHeight();
    picture.set({
      height: picture.height - Math.abs(excessHeight) / picture.scaleY,
    });
  };
  const adjustToHeight = () => {
    const scale = currentMaskHeight / picture.height;
    picture.scale(scale);
    const excessWidth = currentMaskWidth - picture.getScaledWidth();
    picture.set({
      width: picture.width - Math.abs(excessWidth) / picture.scaleX,
    });
  };

  if (currentMaskHeight < currentMaskWidth) {
    const scale = currentMaskWidth / picture.width;
    if (picture.height * scale > currentMaskHeight) {
      adjustToWidth();
    } else {
      adjustToHeight();
    }
  } else {
    const scale = currentMaskHeight / picture.height;
    if (picture.width * scale > currentMaskWidth) {
      adjustToHeight();
    } else {
      adjustToWidth();
    }
  }

  // Center the picture to the mask
  const centerPoint = mask.getCenterPoint();
  picture.setPositionByOrigin(centerPoint, "center", "center");

  // Assign clipPath to the picture and normalize it (handles roundable masks too)
  picture.set({ clipPath: mask });
  picture.validateMask();

  // Propagate lock flags if the mask had them
  if (mask.locked) {
    picture.set({
      locked: mask.locked,
      hasControls: mask.hasControls,
      lockMovementY: mask.lockMovementY,
      lockMovementX: mask.lockMovementX,
      adminLock: mask.adminLock,
    });
  }

  // Remove the original mask object (same as editor mixin)
  canvas.remove(mask);
  canvas.requestRenderAll();

  // Notify if your app relies on this event
  canvas.fire("object:modified", { target: picture });
}

export const MaskImageEdition: React.FC = () => {
  const scene = useActiveScene();
  const canvas = scene?.canvas as SnapMotionCanvas | undefined;

  const [tick, setTick] = useState(0);

  // Collect all empty masks
  const emptyMasks = useMemo(() => {
    if (!canvas) return [];
    return findEmptyMasks(canvas);
  }, [canvas, scene?.id, tick])

  // Build thumbnails per mask id (memoized; recompute if mask set changes)
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!emptyMasks.length) {
      setThumbs({});
      return;
    }
    const next: Record<string, string> = {};
    for (const mask of emptyMasks) {
      try {
        next[mask.id] = makeMaskThumbnail(mask, 120);
      } catch {
        // ignore per-mask failures
      }
    }
    setThumbs(next);
  }, [emptyMasks]);

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

  if (!emptyMasks.length) return null;

  return (
    <div className="flex flex-col items-center gap-3 w-full ">
      <div className="text-lg font-semibold text-center">Empty Masks</div>

      <div className="flex flex-wrap gap-4 justify-center">
        {emptyMasks.map((mask) => {
          const thumb = thumbs[mask.id];
          return (
            <div
              key={mask.id}
              className="flex flex-col items-center gap-3 p-3 rounded-xl border border-gray-200 bg-white shadow-sm w-[180px]"
            >
              <div className="text-xs opacity-70">ID: {mask.id}</div>

              <div className="w-[120px] h-[120px] flex items-center justify-center rounded-md border border-gray-100 bg-gray-50 overflow-hidden">
                {thumb ? (
                  <img
                    src={thumb}
                    alt={`mask-${mask.id}`}
                    width={120}
                    height={120}
                    style={{ objectFit: "contain" }}
                  />
                ) : (
                  <div className="text-[11px] opacity-60">Generating…</div>
                )}
              </div>

              <Button
                className="bg-secondary text-black hover:text-white shadow-lg"
                onClick={() => canvas && applyMaskToGivenMask(canvas, mask.id, HARDCODED_IMAGE_URL)}
              >
                Mask image
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
