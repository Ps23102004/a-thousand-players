"""Package only the game and its course deliverables; never the containing vault."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
build = root / 'dist'
if not (build / 'index.html').exists():
    raise SystemExit('Run npm run build first.')
output = root / 'output'
output.mkdir(exist_ok=True)
archive = output / 'Market-Brawl-Submission.zip'
with ZipFile(archive, 'w', compression=ZIP_DEFLATED) as z:
    for file in sorted(build.rglob('*')):
        if file.is_file():
            z.write(file, file.relative_to(build))
    for name in ['README.md', 'QA.md', 'Development_Notebook_Project2.md', 'CSCI310_Project2_Slides.html', 'package.json', 'package-lock.json', '.gitignore']:
        z.write(root / name, name)
    for folder in ['scripts', 'tests']:
        for file in sorted((root / folder).rglob('*')):
            if file.is_file() and '__pycache__' not in file.parts:
                z.write(file, file.relative_to(root))
    for file in sorted((output / 'screenshots').glob('*.png')):
        z.write(file, 'evidence/' + file.name)
    for file in sorted(output.glob('*results.json')):
        z.write(file, 'evidence/' + file.name)
    z.writestr('START_HERE.txt', 'MARKET BRAWL - MIDNIGHT CIRCUIT\n\n1. Extract this archive to its own folder.\n2. Run python3 -m http.server 5173 in that folder.\n3. Open http://localhost:5173 in a current browser.\n4. Presentation: http://localhost:5173/CSCI310_Project2_Slides.html\n\nRead README.md for controls, hosting and architecture.\nQA.md contains actual verification results and limitations.\nThe notebook is a reviewable draft, not a submitted academic record.\n')
with ZipFile(archive) as z:
    assert z.testzip() is None
    assert 'index.html' in z.namelist()
    assert not any('/node_modules/' in n or n.startswith('assets/models/') or n.startswith('assets/textures/') for n in z.namelist())
    print(f'Validated {len(z.namelist())} files: {archive} ({archive.stat().st_size / 1024 / 1024:.1f} MB)')
