import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // RC20.1.1: @capacitor/geolocation is used via dynamic import (current-location
  // button only). Pre-bundle it deterministically so the lazy import resolves to a
  // stable ESM module and does not perturb the react/react-dom dep graph.
  optimizeDeps: {
    // RC20.2: explicitly pre-bundle react + react-dom together so the dep
    // cache never splits them into mismatched chunks (the root cause of
    // "Invalid hook call / Cannot read properties of null (reading
    // 'useState')"). Pinning both here is the standard Vite fix for
    // duplicate-React-instance skew.
    include: ['react', 'react-dom', '@capacitor/geolocation']
  },
  // RC20.2.2: Force Vite to always resolve react/react-dom to a single
  // instance in the module graph. Without this, a transitive import path can
  // resolve to a second copy of React, leaving its internal dispatcher null
  // when AuthProvider calls useState → "Invalid hook call". dedupe is the
  // canonical module-resolution fix (not a dependency-version change).
  resolve: {
    dedupe: ['react', 'react-dom']
  },
  plugins: [
    base44({
      // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
      // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
      hmrNotifier: true,
      navigationNotifier: true,
      analyticsTracker: true,
      visualEditAgent: true
    }),
    react(),
  ]
});