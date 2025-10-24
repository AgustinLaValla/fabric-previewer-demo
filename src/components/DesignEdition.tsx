'use client'

import { useEffect, useState } from "react";
import { Scene, useActiveScene, useSnapMotion, snapMotionActions } from "fabric-previewer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface TextElement {
  id: string;
  text: string;
  type: 'Textbox' | 'TextTemplate';
  width: number;
  height: number;
  fontSize: number;
  // Add other relevant properties you might need
}


function extractTextElements(scene: Scene): TextElement[] {
  const textElements: TextElement[] = [];
  if (!scene) return textElements;

  // Loop through scenes and their objects

  scene.canvas.allObjects().forEach((obj: any) => {
    if (['textbox', 'texttemplate'].includes(obj.type?.toLowerCase())) {
      textElements.push({
        id: obj.id,
        text: obj.text,
        type: obj.type,
        width: obj.width,
        height: obj.height,
        fontSize: obj.fontSize
      });
    }

  });

  return textElements;
}

export const DesignEdition = () => {

  const [textElements, setTextElements] = useState<TextElement[]>([]);
  const [isThereLogo, setIsThereLogo] = useState(false);
  const scene = useActiveScene();
  const snapMotion = useSnapMotion();


  useEffect(() => {
    if (!scene) return;

    const elements = extractTextElements(scene);
    setTextElements(elements);

    const logo = scene.canvas.allObjects().some((o: any) => o?.id?.toLocaleLowerCase() === 'logo');

    // scene.canvas.allObjects().map(({id})=>)
    setIsThereLogo(logo);
  }, [scene])



  const handleTextChange = (id: string, newText: string) => {

    setTextElements(prev => {
      return prev.map(t => t.id === id ? { ...t, text: newText } : t)
    })

    const { width, height, fontSize } = textElements.find(t => t.id === id) as TextElement;

    snapMotion.do({
      action: snapMotionActions.LAYER_UPDATE_TEXT_VALUE,
      payload: {
        text: newText,
        width,
        fontSize,
        height
      },
      options: { id }
    });
  };


  const replaceLogo = async () => {
    if (snapMotion) {
      await snapMotion.do({
        action: snapMotionActions.LAYER_ADD_OR_REPLACE_LOGO,
        payload: {
          src: 'https://cdn.thecliquify.co/e/12/logo/bkl5FnVy-Style=Color,%20Dark%20mode=No.png',
        },
      });
    }
  }
  return (
    <div className="flex flex-col items-center gap-4">


      {
        !!textElements.length && (
          <span className="bold text-lg text-center">
            Texts
          </span>

        )
      }


      {
        textElements.map(t => (
          <div key={`text-input-field-${t.id}`}>
            <Input
              value={t.text}
              onChange={(ev) => handleTextChange(t.id, ev.target.value)}
              className="h-12 bg-white"
              style={{
                fontSize: '20px',
              }}
            />
          </div>
        ))
      }

      {
        isThereLogo && (
          <Button onClick={replaceLogo}>Replace logo</Button>
        )
      }


    </div>
  )
}
