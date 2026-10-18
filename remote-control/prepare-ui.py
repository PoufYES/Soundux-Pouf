"""Prepare the desktop UI without modifying the compiled executable."""
from pathlib import Path
import shutil
import json

root = Path(__file__).resolve().parent.parent
source = root / 'src/ui/impl/webview/lib/soundux-ui'
dist = root / 'dist'
shutil.copytree(source, dist, dirs_exist_ok=True, ignore=shutil.ignore_patterns('.git'))
app = dist / 'js/app.2c18cf02.js'
bundle = app.read_text(encoding='utf-8')
start = bundle.index('"item-text":"name",items:e.$store.getters.outputs')
end = bundle.index('name:"OutputSelection"', start)
selection = bundle[start:end]
if selection.count('e._s(n.application)') != 2:
    raise SystemExit('Formato do seletor de audio nao reconhecido.')
bundle = bundle[:start] + selection.replace('e._s(n.application)', 'e._s(e.getPrettyName(n))') + bundle[end:]
bundle = bundle.replace('var t=e.name,a=e.application;return t?', 'var t=e.name,a=e.application||e.name||"";return t?', 1)
# Windows exposes devices by name; Linux exposes applications by application.
# Missing identifiers become null over JSON and must never reach native settings.
output_identifier = 'var t=e.application;return t'
if bundle.count(output_identifier) != 2:
    raise SystemExit('Formato dos identificadores de saida nao reconhecido.')
bundle = bundle.replace(output_identifier, 'var t=e.application;return t||e.name')

# The upstream UI is distributed as a prebuilt Webpack bundle. Keep the locale
# source editable here and apply checked replacements during every build.
def replace_once(old, new):
    global bundle
    if bundle.count(old) != 1:
        raise SystemExit('Formato de idioma da interface nao reconhecido: ' + old[:70])
    bundle = bundle.replace(old, new, 1)

portuguese = json.loads((root / 'i18n/pt-BR.json').read_text(encoding='utf-8-sig'))
controls = json.loads((root / 'i18n/vuetify-pt-BR.json').read_text(encoding='utf-8-sig'))
module_start = bundle.index('"0c31":function(e){')
module_end = bundle.index("')}", module_start) + 3
replace_once(bundle[module_start:module_end],
             '"0c31":function(e){e.exports=' + json.dumps(portuguese, ensure_ascii=False) + '}')
replace_once('"./pt_BR.json":"0c31"', '"./pt-BR.json":"0c31"')
replace_once('function C(e){if(_.has(e))',
             'function C(e){if(e==="pt-BR")return "Português (Brasil)";if(_.has(e))')
replace_once('var c=new u["a"]({theme:',
             'var c=new u["a"]({lang:{locales:{"pt-BR":' + json.dumps(controls, ensure_ascii=False) + '}},theme:')
# Normalize old saved pt_BR and the browser's pt/pt-BR locale to the same key.
helper = """function sounduxLocale(value){var locale=(value||navigator.language||"en");return /^pt(?:[-_]|$)/i.test(locale)?"pt-BR":locale}
function sounduxSetLocale(value){var locale=sounduxLocale(value);k.locale=locale;c.framework.lang.current=locale==="pt-BR"?"pt-BR":"en";document.documentElement.lang=locale;if(sounduxSetLocale.lastTrayLocale===locale)return;sounduxSetLocale.lastTrayLocale=locale;if(typeof window.updateTrayLanguage==="function")Promise.resolve(window.updateTrayLanguage({exit:k.t("tray.exit"),hide:k.t("tray.hide"),show:k.t("tray.show"),settings:k.t("settings.title"),tabHotkeys:k.t("settings.tabHotkeysOnly"),muteDuringPlayback:k.t("settings.muteDuringPlayback")})).catch(console.error)}
"""
replace_once('function p(){', helper + 'function p(){')
replace_once('locale:navigator.language,fallbackLocale:', 'locale:sounduxLocale(),fallbackLocale:')
replace_once('k.locale=t.language||navigator.language',
             't.language&&(t.language=sounduxLocale(t.language)),sounduxSetLocale(t.language)')
replace_once('e.settings.language=t,k.locale=t||navigator.language',
             'e.settings.language=t?sounduxLocale(t):null,sounduxSetLocale(t)')

app.write_text(bundle, encoding='utf-8')
shutil.copy2(root / 'remote-control/sidebar.js', dist / 'remote-sidebar.js')
index = dist / 'index.html'
html = index.read_text(encoding='utf-8').replace('</body>', '<script src="remote-sidebar.js"></script></body>')
index.write_text(html, encoding='utf-8')
print('Interface preparada em dist/.')
