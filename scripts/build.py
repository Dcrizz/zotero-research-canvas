"""Build deterministic installable and source archives; no runtime dependencies."""
from pathlib import Path
import zipfile
import hashlib

root = Path(__file__).resolve().parent.parent
out = root.parent
import json
version = json.loads((root / 'manifest.json').read_text())['version']
files = [root / 'manifest.json', root / 'bootstrap.js', root / 'LICENSE', *sorted((root / 'content').glob('*'))]
def archive(path, entries):
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        for f, name in entries:
            info = zipfile.ZipInfo(name, (2026, 10, 21, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, f.read_bytes())
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None
    print(path.name, hashlib.sha256(path.read_bytes()).hexdigest())
archive(out / f'zotero-canvas-{version}.xpi', [(f, str(f.relative_to(root))) for f in files])
source = [p for p in root.rglob('*') if p.is_file() and not {'.git', 'node_modules', '.impeccable'} & set(p.parts) and not p.name.startswith('.env') and p.name not in {'.DS_Store','VERIFICATION.md'} and not (p.parent.name == 'test' and (p.name.startswith(('live-','native-')) and p.suffix == '.json' or p.name.endswith('-result.json')))]
archive(out / f'zotero-canvas-{version}-source.zip', [(f, str(Path(root.name) / f.relative_to(root))) for f in sorted(source)])
