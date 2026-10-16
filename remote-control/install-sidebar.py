"""Install the editable sidebar UI in the local portable Soundux, with backup.

The distributed binary embeds its UI. Switch its null-terminated navigation
prefix to the standard file prefix, preserving every byte offset and PE section.
The embedded-resource handler only intercepts file:///embedded URLs, so the
existing normal file navigation loads dist/index.html instead.
"""
import os
import base64
from pathlib import Path
import shutil
import subprocess

root = Path(__file__).resolve().parent.parent
target = Path(os.environ['LOCALAPPDATA']) / 'Soundux-Pouf'
exe = target / 'soundux.exe'
old = b'file:///embedded/\0'
new = b'file:///' + b'\0' * (len(old) - len(b'file:///'))
data = exe.read_bytes()
if data.count(old) != 1 and data.count(new) != 1:
    raise SystemExit('Executavel nao reconhecido; nenhuma alteracao aplicada.')
running = subprocess.run(
    ['tasklist', '/FI', 'IMAGENAME eq soundux.exe', '/FO', 'CSV', '/NH'],
    capture_output=True, text=True, check=True,
)
if 'soundux.exe' in running.stdout.lower():
    raise SystemExit('Feche o Soundux pela bandeja e execute novamente.')
backup = target / 'soundux.before-remote-sidebar.exe'
if not backup.exists():
    if data.count(old) != 1:
        raise SystemExit('Backup original ausente; nenhuma alteracao aplicada.')
    shutil.copy2(exe, backup)
ui = root / 'src/ui/impl/webview/lib/soundux-ui'
dist = target / 'dist'
shutil.copytree(ui, dist, dirs_exist_ok=True, ignore=shutil.ignore_patterns('.git'))
# This frontend build renders the Linux-only application field for the current
# selection. Reuse its cross-platform formatter for Windows device names too.
app = dist / 'js/app.2c18cf02.js'
bundle = app.read_text(encoding='utf-8')
start = bundle.index('"item-text":"name",items:e.$store.getters.outputs')
end = bundle.index('name:"OutputSelection"', start)
selection = bundle[start:end]
if selection.count('e._s(n.application)') != 2:
    raise SystemExit('Formato do seletor de audio nao reconhecido.')
bundle = bundle[:start] + selection.replace('e._s(n.application)', 'e._s(e.getPrettyName(n))') + bundle[end:]
bundle = bundle.replace('var t=e.name,a=e.application;return t?', 'var t=e.name,a=e.application||e.name||"";return t?', 1)
app.write_text(bundle, encoding='utf-8')
shutil.copy2(root / 'remote-control/sidebar.js', dist / 'remote-sidebar.js')
index = dist / 'index.html'
html = index.read_text(encoding='utf-8')
if 'remote-sidebar.js' not in html:
    html = html.replace('</body>', '<script src="remote-sidebar.js"></script></body>')
index.write_text(html, encoding='utf-8')
for action in ('start', 'copy'):
    script = root / 'remote-control/sidebar-action.ps1'
    invocation = "& '" + str(script).replace("'", "''") + "' -Action " + action
    encoded = base64.b64encode(invocation.encode('utf-16le')).decode('ascii')
    command = ('powershell.exe -NoProfile -STA -ExecutionPolicy Bypass '
               f'-WindowStyle Hidden -EncodedCommand {encoded}')
    launcher = 'CreateObject("WScript.Shell").Run "' + command + '", 0, False\n'
    (target / f'remote-{action}.vbs').write_text(launcher, encoding='ascii')
if data.count(old) == 1:
    patched = data.replace(old, new, 1)
    assert len(patched) == len(data)
    exe.write_bytes(patched)
print('Barra lateral instalada. Backup: ' + str(backup))
