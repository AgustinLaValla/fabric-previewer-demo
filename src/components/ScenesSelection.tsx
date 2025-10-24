'use client'

import { Scene, snapMotionActions, useScenes, useSnapMotion } from "fabric-previewer"
import { Button } from "@/components/ui/button";
import { useCallback } from "react";

export const ScenesSelection = () => {

  const scenes = useScenes();
  const snapMotion = useSnapMotion();

  const onPageSelected = useCallback(
    (id: string) => {
      if (snapMotion) {
        snapMotion.do({
          action: snapMotionActions.SCENE_SET_ACTIVE,
          payload: {
            id,
          },
        });
      }
    },
    [snapMotion]
  );

  if (!scenes || scenes.length > 2) return;

  return (
    <div className="flex items-center gap-4">
      {
        scenes.map((s, i) => (
          <Button
            className="bg-secondary text-black cursor-pointer hover:text-white shadow-lg"
            onClick={() => onPageSelected(s.id)}
          >
            Page {i + 1}
          </Button>
        ))
      }
    </div>
  )
}
