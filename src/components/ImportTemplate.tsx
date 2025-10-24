'use client'

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { useSnapMotion, loadDesignAssets } from "fabric-previewer";

export const ImportTemplate = () => {

  const snapMotion = useSnapMotion();
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onChange = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const files = ev.target.files;
    if (!files || !files.length) return;

    const file = (ev.target.files as FileList)[0];

    if (!file.name.endsWith('.json')) {
      console.error('Only JSON files are allowed')
      return;
    }

    setLoading(true);

    try {
      const string = await readFileAsText(file);
      const designData = JSON.parse(string);


      await loadDesignAssets(designData);

      await snapMotion.do({
        action: "DESIGN_SET_DATA",
        payload: designData
      });
      setLoading(false);
    } catch (error) {
      console.log(`Something went wrong`);
      console.log(error);
      setLoading(false);
    }

  }

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          resolve(event.target.result as string);
        } else {
          reject(new Error('File reading failed'));
        }
      };
      reader.onerror = () => {
        reject(new Error('File reading failed'));
      };
      reader.readAsText(file);
    });
  };


  return (
    <>
      <Button
        className="bg-secondary text-black cursor-pointer hover:text-white shadow-lg"
        onClick={() => {
          if (loading) return;
          inputRef.current?.click();
        }}
        disabled={loading}
      >
        {
          !loading
            ? 'Import Design'
            : 'Loading Design...'
        }
      </Button>

      <input
        ref={inputRef}
        type="file"
        hidden
        accept="application/json"
        onChange={onChange}
      />
    </>
  )
}
