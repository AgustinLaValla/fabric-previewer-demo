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
  name: string;               // current param.name (label)
  key: string;                // stable back-ticked token, e.g. `job_title`
  placeholder: string;
  value: string;
};

const TEXT_TYPES = ["textbox", "texttemplate"] as const;
const norm = (t: any) => String(t || "").toLowerCase();

/** Build preview text by replacing each param.key with its UI value (or keep the key). */
function buildTextFromParams(
  baseline: string,
  params: Param[],
  valuesByKey: Record<string, string | undefined>
) {
  let out = baseline;
  for (const p of params) {
    const v = valuesByKey[p.key];
    const rep = v == null || v === "" ? p.key : v;
    out = out.split(p.key).join(rep);
  }
  return out;
}

/** Normalize the param.name from a user-entered value. */
function toParamName(value: string, fallbackKey: string) {
  const base = (value && value.trim().length > 0 ? value : fallbackKey.replace(/`/g, "")) || "";
  return base
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export const SmartTextEdition = () => {
  const sceneInstances = useScenes();
  const activeScene = useActiveScene() as any;
  const snapMotion = useSnapMotion();

  // Scenes JSON snapshot for scanning smart texts
  const scenes = useMemo(() => sceneInstances.map((s) => s.toJSON()), [sceneInstances]);

  // Baseline text per object (oKey = `${sceneId}:${objectId}`)
  const baselinesRef = useRef<Record<string, string>>({});

  // Values store **by param.key** (stable), not by volatile param.id
  const valuesByKeyRef = useRef<Record<string, Record<string, string>>>({});

  // Controlled UI state (by param.key as well)
  const [uiValues, setUiValues] = useState<Record<string, Record<string, string>>>({});

  // 1) Collect entries from all scenes; ensure buckets exist
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
        if (!valuesByKeyRef.current[oKey]) valuesByKeyRef.current[oKey] = {};
        if (!uiValues[oKey]) setUiValues((v) => ({ ...v, [oKey]: {} }));

        params.forEach((p, idx) => {
          list.push({
            id: `${oKey}:${idx}`,
            sceneId: sid,
            objectId: obj.id,
            name: p.name,
            key: p.key,                           // use stable token as the field key
            placeholder: p.key,
            value: uiValues[oKey]?.[p.key] ?? "", // drive UI by key
          });
        });

        // Optional: prune any stale UI keys that don't exist in current params
        const validKeys = new Set(params.map((p) => p.key));
        const currentUi = uiValues[oKey] || {};
        const currentRef = valuesByKeyRef.current[oKey] || {};
        const cleanedUi: Record<string, string> = {};
        const cleanedRef: Record<string, string> = {};
        let mutated = false;

        Object.keys(currentUi).forEach((k) => {
          if (validKeys.has(k)) cleanedUi[k] = currentUi[k];
          else mutated = true;
        });
        Object.keys(currentRef).forEach((k) => {
          if (validKeys.has(k)) cleanedRef[k] = currentRef[k];
        });

        if (mutated) {
          setUiValues((prev) => ({ ...prev, [oKey]: cleanedUi }));
          valuesByKeyRef.current[oKey] = cleanedRef;
        }
      }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    return list;
  }, [JSON.stringify(scenes?.map((s) => ({ id: s.id, n: s.objects?.length ?? 0 }))), JSON.stringify(uiValues)]);

  // 2) Handle change (no scaleTextToFit here)
  const onChange = (entry: SmartEntry, newValue: string) => {
    const oKey = `${entry.sceneId}:${entry.objectId}`;
    const scene = (scenes || []).find((s) => s.id === entry.sceneId);
    const obj = scene?.objects?.find((o: any) => o.id === entry.objectId);
    if (!obj) return;

    const params: Param[] = obj.params ?? [];
    // Find the param by its stable key
    const param = params.find((p) => p.key === entry.key) ?? params[0];
    if (!param) return;

    // Update UI & ref stores by **param.key**
    setUiValues((prev) => ({
      ...prev,
      [oKey]: { ...(prev[oKey] || {}), [param.key]: newValue },
    }));
    valuesByKeyRef.current[oKey] = {
      ...(valuesByKeyRef.current[oKey] || {}),
      [param.key]: newValue,
    };

    // Rebuild preview text
    const baseline = baselinesRef.current[oKey] ?? String(obj.text ?? "");
    const finalText = buildTextFromParams(baseline, params, valuesByKeyRef.current[oKey]);

    const isActive = activeScene && activeScene.id === entry.sceneId;

    // Compute the updated param.name and apply it
    const nextName = toParamName(newValue, param.key);

    if (isActive) {
      // Live Fabric object
      const live = snapMotion?.LAYER_FIND_BY_ID?.({ id: entry.objectId }) as any;

      // Keep partial styles (if any)
      if (live && live.styles && Object.keys(live.styles).length > 0) {
        const nextStyles = mergePartialStyles(
          setPartialStyles(baseline, newValue, param.key, live.styles)
        );
        live.styles = nextStyles;
      }

      // Update param.name on the live object
      if (Array.isArray(live?.params)) {
        live.params = (live.params as Param[]).map((p) =>
          p.key === param.key ? { ...p, name: nextName } : p
        );
      }

      live.dirty = true;

      // Update text on canvas, no fitting
      snapMotion.do({
        action: snapMotionActions.LAYER_UPDATE_TEXT_VALUE,
        payload: { text: finalText, fit: false } as any,
        options: { id: entry.objectId },
      });
    } else {
      // Inactive scene: clone JSON, update text and param.name
      const nextScenes = (scenes || []).map((s) => {
        if (s.id !== entry.sceneId) return s;
        const cloned = { ...s, objects: s.objects.map((o: any) => ({ ...o })) } as any;
        const target = cloned.objects.find((o: any) => o.id === entry.objectId);
        if (target) {
          // Keep partial styles in JSON
          if (target.styles && Object.keys(target.styles).length > 0) {
            let next = setPartialStyles(baseline, newValue, param.key, target.styles);
            next = mergePartialStyles(next);
            target.styles = next;
          }
          // Update text only (no size changes)
          target.text = finalText;

          // Update param.name in JSON
          if (Array.isArray(target.params)) {
            target.params = (target.params as Param[]).map((p) =>
              p.key === param.key ? { ...p, name: nextName } : p
            );
          }
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
          return (
            <div key={e.id} className="flex flex-col gap-1">
              <label className="text-sm opacity-70 font-bold">{`Scene ${e.sceneId} · ${e.key}`}</label>
              <Input
                value={uiValues[oKey]?.[e.key] ?? ""}     // drive by stable key
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
};
