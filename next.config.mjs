/** @type {import('next').NextConfig)} */
const nextConfig = {
  serverExternalPackages: ["undici"],
  // The live triage route (app/api/triage) replays rounds in child Node processes that import engine/*.mjs and game/src/*.js
  // straight from disk, plus three and the self-contained Rapier compat build (its WASM is inlined, no .wasm file). The bundler
  // never sees those imports, so the function bundle gets them by hand.
  outputFileTracingIncludes: {
    "/api/triage": [
      "./app/api/triage/round.mjs", "./engine/sim.mjs", "./engine/policy.mjs", "./game/src/**/*",
      "./node_modules/three/package.json", "./node_modules/three/build/three.module.js", "./node_modules/three/build/three.core.js",
      "./node_modules/@dimforge/rapier3d-compat/package.json", "./node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs",
    ],
  },
  // NEXT_DIST_DIR lets a second production build run beside one that is already serving (it does not change a normal build).
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};
export default nextConfig;
