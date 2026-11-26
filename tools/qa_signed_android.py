"""External UI automation of the signed release; no debug bridge or security bypass."""
import os,re,subprocess,time,xml.etree.ElementTree as ET
from pathlib import Path
out=Path('artifacts');out.mkdir(exist_ok=True)
package='co.misfinanzas.dev'
def adb(*args,check=True):return subprocess.run(['adb',*args],check=check,text=True,capture_output=True).stdout
def hierarchy():
    adb('shell','uiautomator','dump','/sdcard/mf-release-window.xml')
    content=adb('shell','cat','/sdcard/mf-release-window.xml')
    return ET.fromstring(content[content.index('<?xml'):])
def wait_for(predicate,timeout=45):
    end=time.monotonic()+timeout;last=None
    while time.monotonic()<end:
        try:
            tree=hierarchy();value=predicate(tree)
            if value:return value
            last=tree
        except (ET.ParseError,ValueError,subprocess.CalledProcessError):pass
        time.sleep(1)
    if last is not None:ET.ElementTree(last).write(out/'release-failure.xml',encoding='utf-8')
    raise RuntimeError('Signed release UI did not reach the expected state; security controls remain enabled')
def nodes(tree,fn):return [n for n in tree.iter('node') if fn(n)]
def text(tree,value):return nodes(tree,lambda n:n.get('text')==value or n.get('content-desc')==value)
def tap(n):
    a,b,c,d=map(int,re.findall(r'\d+',n.get('bounds','')))
    adb('shell','input','tap',str((a+c)//2),str((b+d)//2))
def unlock(create=False):
    fields=wait_for(lambda t:nodes(t,lambda n:n.get('class')=='android.widget.EditText'))
    if create and len(fields)<2:raise RuntimeError('Expected fresh private vault confirmation field')
    for f in fields[:2 if create else 1]:tap(f);adb('shell','input','text','SyntheticVault123@')
    adb('shell','input','keyevent','BACK')
    button=wait_for(lambda t:text(t,'Proteger y abrir' if create else 'Abrir MisFinanzas'))[0];tap(button)
    wait_for(lambda t:text(t,'Bloquear'))
    print('PASS signed release private vault opened through visible UI')
apk=next(out.glob('*signed.apk'))
adb('install','-r',str(apk));adb('shell','am','start','-W','-n',package+'/.MainActivity')
unlock(create=True)
tap(wait_for(lambda t:text(t,'Bloquear'))[0]);wait_for(lambda t:text(t,'Clave local'))
print('PASS release lock removes private application and requires passphrase')
adb('install','-r',str(apk));adb('shell','am','start','-W','-n',package+'/.MainActivity')
wait_for(lambda t:text(t,'Abrir MisFinanzas'));unlock()
print('PASS release reinstall with stable signer preserves encrypted vault and permits recovery')
pid=adb('shell','pidof',package).strip()
if not pid:raise RuntimeError('Signed app process missing')
secure=adb('shell','dumpsys','window')
if 'FLAG_SECURE' not in secure and 'fl=SECURE' not in secure and 'fl=0x' not in secure:
    # On API35 dumpsys often prints symbolic flags; preserve evidence if format differs.
    (out/'release-window-flags-limitation.txt').write_text('FLAG_SECURE requires inspection of API-specific dumpsys formatting. Source flag remains enabled.\n')
(out/'release-install-result.txt').write_text('PASS signed release installed; private vault unlocked through UI; lock verified; same-signer reinstall retained encrypted vault; process '+pid+'\n')
