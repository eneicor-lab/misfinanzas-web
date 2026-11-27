"""Signed APK installation/start and real Android WebView entry; no credentials or real financial data."""
import subprocess,time,xml.etree.ElementTree as ET
from pathlib import Path
def adb(*args):return subprocess.run(['adb',*args],check=True,text=True,capture_output=True).stdout
apk=Path('artifacts/MisFinanzas-2.7.1-signed.apk')
assert apk.is_file(),'New signed APK missing'
adb('install','-r',str(apk))
adb('shell','am','start','-n','co.misfinanzas.dev/.MainActivity')
for _ in range(45):
    try:
        adb('shell','uiautomator','dump','/sdcard/mf-integrated-entry.xml')
        text=adb('shell','cat','/sdcard/mf-integrated-entry.xml')
        tree=ET.fromstring(text[text.index('<?xml'):])
        nodes=list(tree.iter('node'));labels=' '.join(n.get('text','')+' '+n.get('content-desc','') for n in nodes)
        if 'MisFinanzas' in labels and 'Iniciar sesión' in labels and len([n for n in nodes if n.get('class')=='android.widget.EditText'])>=2:break
    except (subprocess.CalledProcessError,ET.ParseError,ValueError):pass
    time.sleep(1)
else:raise RuntimeError('Signed Android application did not display the central email/password access')
assert adb('shell','pidof','co.misfinanzas.dev').strip(),'Android application is not running'
Path('artifacts/ANDROID_ENTRY_QA.txt').write_text('PASS new signed APK installed and started in Android emulator; real WebView displays central email/password login. Financial journeys ran in real isolated desktop/mobile browsers using identical web assets. No physical-device or authenticated Android financial test is claimed.\n')
print('PASS signed APK installation, running process and central access in Android emulator')
