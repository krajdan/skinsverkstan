#!/usr/bin/env python3
"""Build the three workshops.

Outputs
  foremalsverkstaden.html, mobverkstaden.html   artifact pages (core inlined)
  standalone/*.html                              single files for PC, three.js inlined
  site/                                          GitHub Pages site (index, workshops, lib, icons)
"""
import os, re, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
import argparse
ap = argparse.ArgumentParser()
ap.add_argument('--site', default=os.path.join(HERE, 'site'), help='GitHub Pages output folder')
ap.add_argument('--out', default=HERE, help='folder for the assembled artifact pages and standalone/')
args = ap.parse_args()
SITE, OUT = args.site, args.out
THREE_TAG = '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>'
THREE_JS = next(p for p in [os.path.join(HERE, 'e2e/node_modules/three/build/three.min.js'), os.path.join(HERE, 'three.min.js'), os.path.join(HERE, '..', 'lib', 'three.min.js')] if os.path.exists(p))

def rd(p): return open(os.path.join(HERE, p), encoding='utf-8').read()
def wr(p, s):
    os.makedirs(os.path.dirname(p) or '.', exist_ok=True)
    open(p, 'w', encoding='utf-8', newline='\n').write(s)

# 1. artifact pages: main + core
pages = {
    'skinverkstaden': rd('skinverkstaden.html'),
    'foremalsverkstaden': rd('fv-main.html').replace('/*@@CORE@@*/', rd('fv-core.js')),
    'mobverkstaden': rd('mv-main.html').replace('/*@@CORE@@*/', rd('mv-core.js')),
}
wr(os.path.join(OUT, 'foremalsverkstaden.html'), pages['foremalsverkstaden'])
wr(os.path.join(OUT, 'mobverkstaden.html'), pages['mobverkstaden'])
if OUT != HERE: wr(os.path.join(OUT, 'skinverkstaden.html'), pages['skinverkstaden'])

def split(src):
    i = src.index('</style>') + len('</style>\n')
    return src[:i], src[i:]

BASE_HEAD = '''<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>[hidden]{display:none!important}body{margin:0}</style>
'''

# 2. standalone single files (PC): three.js inlined
three = open(THREE_JS, encoding='utf-8').read()
names = {'skinverkstaden': 'Skinverkstaden', 'foremalsverkstaden': 'Föremålsverkstaden', 'mobverkstaden': 'Mobverkstaden'}
for key, src in pages.items():
    head, body = split(src)
    assert THREE_TAG in body, key
    body = body.replace(THREE_TAG, '<script>\n' + three + '\n</script>')
    wr(os.path.join(OUT, 'standalone', names[key] + '.html'), BASE_HEAD + head + '</head>\n<body>\n' + body + '</body>\n</html>\n')

# 3. site
SITE_HEAD = '''<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#5B45A8">
<meta name="apple-mobile-web-app-title" content="Verkstan">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<style>[hidden]{display:none!important}body{margin:0}
.sitenav{max-width:1340px;margin:0 auto;padding:8px max(16px,env(safe-area-inset-right,0px)) 0 max(16px,env(safe-area-inset-left,0px))}
.sitenav a{display:inline-flex;align-items:center;gap:6px;min-height:40px;font:700 15px/1.2 "Atkinson Hyperlegible","Segoe UI",system-ui,sans-serif;color:var(--accent);text-decoration:none}
.sitenav a:hover{text-decoration:underline}
</style>
'''
NAV = '<nav class="sitenav"><a href="./">&larr; Alla verkstäder</a></nav>\n<script>if (\'serviceWorker\' in navigator) navigator.serviceWorker.register(\'sw.js\').catch(() => {});</script>\n'
os.makedirs(os.path.join(SITE, 'lib'), exist_ok=True)
dst = os.path.join(SITE, 'lib', 'three.min.js')
if os.path.abspath(THREE_JS) != os.path.abspath(dst): shutil.copyfile(THREE_JS, dst)
for key, src in pages.items():
    head, body = split(src)
    head = head.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
    body = body.replace(THREE_TAG, '<script src="lib/three.min.js"></script>')
    wr(os.path.join(SITE, key + '.html'), SITE_HEAD + head + '</head>\n<body>\n' + NAV + body + '</body>\n</html>\n')

for f in ['index.html', 'berattare.html', 'manifest.webmanifest', 'README.md', 'sw.js']:
    p = os.path.join(HERE, 'site-src', f)
    if os.path.exists(p): shutil.copyfile(p, os.path.join(SITE, f))
icons = os.path.join(HERE, 'site-src', 'icons')
if os.path.isdir(icons): shutil.copytree(icons, os.path.join(SITE, 'icons'), dirs_exist_ok=True)
open(os.path.join(SITE, '.nojekyll'), 'w').close()
print('built', SITE)
