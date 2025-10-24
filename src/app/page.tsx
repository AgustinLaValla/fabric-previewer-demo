'use client'
import { DesignEdition } from '@/components/DesignEdition';
import { ImportTemplate } from '@/components/ImportTemplate';
import { ScenesSelection } from '@/components/ScenesSelection';
import dynamic from 'next/dynamic';

const Canvas = dynamic(() =>
  import('fabric-previewer').then(m => m.Canvas),
  { ssr: false }
);

export default function Home() {
  return (
    <div className="w-screen h-screen flex flex-col">
      <header className="bg-background shadow py-5 px-20 sticky top-0 left-0">
        <span className="text-xl font-bold text-[#222]">Cliquify</span>
      </header>


      <div className="flex h-full">


        {/* Inputs */}
        <div className="flex-1 h-full flex p-6 flex-col gap-4 items-center bg-pink-400">

          <ImportTemplate />
          <DesignEdition />
          <ScenesSelection />

        </div>

        {/* Previewer */}

        <div className="flex-1 h-fulh bg-gray-100">
          <Canvas />
        </div>

      </div>

    </div>
  )
}
