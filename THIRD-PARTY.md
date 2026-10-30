# Third-Party Software and Asset Notices

This project incorporates third-party software components and assets under their respective open-source and permissive licenses.

---

## 1. Vendored Libraries

### three.js
- **Location:** `game/vendor/three/`, `node_modules/three`
- **License:** MIT License
- **Copyright:**
  ```text
  Copyright © 2010-2024 three.js authors
  ```
  *(node_modules/three: `Copyright © 2010-2026 three.js authors`)*
- **Notice:** Full license text is available at [`game/vendor/three/LICENSE`](game/vendor/three/LICENSE) and [`node_modules/three/LICENSE`](node_modules/three/LICENSE).

### Rapier 3D WebAssembly Physics (@dimforge/rapier3d-compat)
- **Location:** `game/vendor/rapier/`, `node_modules/@dimforge/rapier3d-compat`
- **License:** Apache License, Version 2.0
- **Copyright:**
  ```text
  Copyright 2020 Dimforge EURL
  ```
- **Notice:** Full license text is available at [`game/vendor/rapier/LICENSE`](game/vendor/rapier/LICENSE) and [`node_modules/@dimforge/rapier3d-compat/LICENSE`](node_modules/@dimforge/rapier3d-compat/LICENSE).

### Homeground Board Physics
- **Location:** `adapters/homeground/vendor/`
- **License:** MIT License
- **Copyright:**
  ```text
  Copyright (c) 2026 Parth Singh
  ```
- **Notice:** Full license text is available at [`adapters/homeground/vendor/LICENSE`](adapters/homeground/vendor/LICENSE). Vendored commit tracked in [`adapters/homeground/vendor/UPSTREAM_COMMIT`](adapters/homeground/vendor/UPSTREAM_COMMIT).

---

## 2. Concept Art and External Fonts

### AI Concept Art (`midnight-circuit.png`)
- **Location:** `game/assets/art/midnight-circuit.png`
- **Provenance:** Promotional concept art generated using an AI image generation tool (specific tool and date not recorded).
- **License:** Distributed under the project's root MIT License.

### Google Fonts (Barlow & Barlow Condensed)
- **Location:** Externally hosted via Google Fonts CDN, imported in `game/src/style.css`.
- **License:** SIL Open Font License, Version 1.1 (OFL-1.1).
- **Notice:** Optional external dependency loaded by client browsers when online; does not bundle font binaries into the repository.

---

## 3. NPM Dependencies Summary

The direct runtime and development dependencies listed in [`package.json`](package.json), along with transitive dependencies recorded in [`package-lock.json`](package-lock.json), are summarized below by license category:

| License | Description / Key Packages |
|---|---|
| **MIT** | `next` (Copyright (c) 2025 Vercel, Inc.), `react` (Copyright (c) Meta Platforms, Inc. and affiliates.), `react-dom` (Copyright (c) Meta Platforms, Inc. and affiliates.), `three` (Copyright © 2010-2026 three.js authors), `undici` (Copyright (c) Matteo Collina and Undici contributors), `@types/node` (Copyright (c) Microsoft Corporation.), `@types/react` (Copyright (c) Microsoft Corporation.), `@types/three` (Copyright (c) Microsoft Corporation.), `tsx` (Copyright (c) Hiroki Osame <hiroki.osame@gmail.com>), and 51 other transitive dependencies. |
| **Apache-2.0** | `@dimforge/rapier3d-compat` (Copyright 2020 Dimforge EURL), `typescript` (Apache License 2.0, Microsoft Corp.), `@img/sharp-*` platform bindings, and other permissive build tooling. |
| **ISC** | Transitive utilities (`picomatch`, `semver`). |
| **BSD-3-Clause** | Transitive utility (`source-map-js`). |
| **0BSD** | Transitive utility (`tslib`). |
| **CC-BY-4.0** | `caniuse-lite` (Copyright (c) Alexis Deveria), browser database in Next.js build. |

### Note on Optional Copyleft Transitive Binaries (`sharp-libvips`)
In `package-lock.json`, optional packages `@img/sharp-libvips-*` (10 platform packages) are licensed under **LGPL-3.0-or-later**, and `@img/sharp-wasm32` / `@img/sharp-win32-*` carry dual/triple licenses (**Apache-2.0 AND LGPL-3.0-or-later AND MIT**). These binaries are optional transitive dependencies pulled by Next.js for server-side image optimization.

**Compliance note:** These libraries are standard dynamically loaded native binaries/WASM modules. They are never modified, never statically linked into application source code, and never bundled into client browser bundles. They do not impose copyleft obligations on the project's MIT source code.
