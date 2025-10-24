import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  webpack: (config, { isServer }) => {
    // Use the browser build of paper
    config.resolve.alias['paper'] = require.resolve('paper/dist/paper-core.js');

    // Prevent bundling Node-only modules on the client
    if (!isServer) {
      config.resolve.alias['canvas'] = false;  // node-canvas: disable
      config.resolve.alias['fs'] = false;      // just in case
      config.resolve.alias['path'] = false;
    }

    return config;
  },
};

export default nextConfig;
