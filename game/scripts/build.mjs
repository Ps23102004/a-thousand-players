import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const item of ['index.html', 'CSCI310_Project2_Slides.html', 'src', 'vendor']) await cp(item, `dist/${item}`, { recursive: true });
try { await cp('assets/art', 'dist/assets/art', { recursive: true }); } catch (e) { if (e.code !== 'ENOENT') throw e; }
try { await cp('output/screenshots', 'dist/output/screenshots', { recursive: true }); } catch (e) { if (e.code !== 'ENOENT') throw e; }
console.log('Built dist/: self-contained static game. Serve over HTTP or deploy to GitHub Pages.');
