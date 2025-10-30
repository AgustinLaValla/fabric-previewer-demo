'use client'
// ~/components/SmartTextEdition.tsx
import { useMemo, useRef, useState } from "react";
import { useScenes, useActiveScene, useSnapMotion, Scene, snapMotionActions, mergePartialStyles, setPartialStyles } from "fabric-previewer";
import { Input } from "./ui/input";


type Param = {
  id: string;
  key: string;
  startIndex: number;
  endIndex: number;
  name: string;
};

type SmartEntry = {
  id: string;                 // `${sceneId}:${objectId}:${paramIndex}`
  sceneId: string | number;
  objectId: string;
  name: string;
  key: string;
  placeholder: string;
  value: string;
};

const TEXT_TYPES = ["textbox", "texttemplate"] as const;
const norm = (t: any) => String(t || "").toLowerCase();

function buildTextFromParams(
  baseline: string,
  params: Param[],
  valuesByParamId: Record<string, string | undefined>
) {
  let out = baseline;
  for (const p of params) {
    const v = valuesByParamId[p.id];
    const rep = v == null || v === "" ? p.key : v;
    out = out.split(p.key).join(rep);
  }
  return out;
}

export const SmartTextEdition = () => {
  const sceneInstances = useScenes();
  const activeScene = useActiveScene() as any;
  const snapMotion = useSnapMotion();

  // Snapshot scenes as JSON for scanning
  const scenes = useMemo(() => sceneInstances.map((s) => s.toJSON()), [sceneInstances]);

  // Baselines per object and current values per param-id
  const baselinesRef = useRef<Record<string, string>>({});
  const valuesRef = useRef<Record<string, Record<string, string>>>({});

  // Controlled UI values so inputs reflect every keystroke
  const [uiValues, setUiValues] = useState<Record<string, Record<string, string>>>({});

  // 1) Collect dynamic entries from all scenes
  const entries: SmartEntry[] = useMemo(() => {
    if (!scenes?.length) return [];
    const list: SmartEntry[] = [];

    for (const scene of scenes) {
      const sid = scene.id;
      const objects = scene.objects ?? [];
      for (const obj of objects) {
        if (!TEXT_TYPES.includes(norm(obj.type) as any)) continue;
        const params: Param[] = obj.params ?? [];
        if (!params.length) continue;

        const oKey = `${sid}:${obj.id}`;
        if (!baselinesRef.current[oKey]) baselinesRef.current[oKey] = String(obj.text ?? "");
        if (!valuesRef.current[oKey]) valuesRef.current[oKey] = {};
        if (!uiValues[oKey]) setUiValues((v) => ({ ...v, [oKey]: {} }));

        params.forEach((p, idx) => {
          list.push({
            id: `${oKey}:${idx}`,
            sceneId: sid,
            objectId: obj.id,
            name: p.name,
            key: p.key,
            placeholder: p.key,
            value: uiValues[oKey]?.[p.id] ?? "",
          });
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return list;
  }, [JSON.stringify(scenes?.map((s) => ({ id: s.id, n: s.objects?.length ?? 0 }))), JSON.stringify(uiValues)]);

  // 2) Change handler (no scaleTextToFit involved)
  const onChange = (entry: SmartEntry, newValue: string) => {
    const oKey = `${entry.sceneId}:${entry.objectId}`;
    const scene = (scenes || []).find((s) => s.id === entry.sceneId);
    const obj = scene?.objects?.find((o: any) => o.id === entry.objectId);
    if (!obj) return;

    const params: Param[] = obj.params ?? [];
    const param = params.find((p) => p.key === entry.key) ?? params[0];
    if (!param) return;

    // Update UI and internal store
    setUiValues((prev) => ({ ...prev, [oKey]: { ...(prev[oKey] || {}), [param.id]: newValue } }));
    valuesRef.current[oKey] = { ...(valuesRef.current[oKey] || {}), [param.id]: newValue };

    // Rebuild final text from baseline + current param values
    const baseline = baselinesRef.current[oKey] ?? String(obj.text ?? "");
    const finalText = buildTextFromParams(baseline, params, valuesRef.current[oKey]);

    const isActive = activeScene && activeScene.id === entry.sceneId;

    if (isActive) {
      // Active scene: update directly on canvas WITHOUT fitting
      const live: any = snapMotion?.LAYER_FIND_BY_ID?.({ id: entry.objectId });

      // Preserve partial styles if any (so styles on dynamic ranges remain consistent)
      if (live && live.styles && Object.keys(live.styles).length > 0) {
        const nextStyles = mergePartialStyles(
          setPartialStyles(baseline, newValue, param.key, live.styles)
        );
        live.styles = nextStyles;
      }

      // IMPORTANT: flag to skip fitting in your action handler
      snapMotion.do({
        action: snapMotionActions.LAYER_UPDATE_TEXT_VALUE,
        payload: {
          text: finalText,
          fit: false, // your flag to bypass scaleTextToFit
        } as any,
        options: { id: entry.objectId },
      });
    } else {
      // Inactive scene: update JSON only (no font size or box changes)
      const nextScenes = (scenes || []).map((s) => {
        if (s.id !== entry.sceneId) return s;
        const cloned = { ...s, objects: s.objects.map((o: any) => ({ ...o })) } as any;
        const target = cloned.objects.find((o: any) => o.id === entry.objectId);
        if (target) {
          // Keep partial styles aligned in JSON as well
          if (target.styles && Object.keys(target.styles).length > 0) {
            let next = setPartialStyles(baseline, newValue, param.key, target.styles);
            next = mergePartialStyles(next);
            target.styles = next;
          }
          // Only update text; do not touch fontSize/width/height
          target.text = finalText;
        }
        return cloned;
      });

      // Push updated scenes back into state
      snapMotion.SCENE_SET_MANY({
        scenes: nextScenes.map(
          (s) =>
            new Scene({
              id: s.id,
              canvas: snapMotion.canvas,
              data: s,
              root: snapMotion,
              metadata: structuredClone(s.metadata),
            })
        ),
      });
    }
  };

  if (!entries.length) return null;

  return (
    <div className="w-full max-w-[560px] mt-6">
      <div className="text-lg font-semibold text-center mb-2">Smart Texts</div>
      <div className="flex flex-col gap-3">
        {entries.map((e) => {
          const oKey = `${e.sceneId}:${e.objectId}`;
          const resolvedParamId =
            (scenes?.find((s) => s.id === e.sceneId)?.objects?.find((o: any) => o.id === e.objectId)?.params ??
              []
            ).find((p: Param) => p.key === e.key)?.id as string;

          return (
            <div key={e.id} className="flex flex-col gap-1">
              <label className="text-sm opacity-70">{`Scene ${e.sceneId} · ${e.name}`}</label>
              <Input
                value={uiValues[oKey]?.[resolvedParamId] ?? ""}
                placeholder={e.placeholder}
                onChange={(ev) => onChange(e, ev.target.value)}
                className="h-10 bg-white"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
