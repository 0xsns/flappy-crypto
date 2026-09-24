#!/usr/bin/env python3
"""Build flappy-crypto index.html: embed the 5 crypto logos as base64."""
import base64, pathlib

d = pathlib.Path('/home/ubuntu/flappy-crypto')
tpl = (d / 'template.html').read_text()

logos = []
for i in range(1, 6):
    png = d / f'logo{i}.png'
    if png.exists():
        b = png.read_bytes()
        logos.append('data:image/png;base64,' + base64.b64encode(b).decode())
    else:
        b = (d / f'logo{i}.jpg').read_bytes()
        logos.append('data:image/jpeg;base64,' + base64.b64encode(b).decode())

out = tpl
for i, b64 in enumerate(logos, 1):
    out = out.replace('{{LOGO' + str(i) + '}}', b64)

(d / 'index.html').write_text(out)
print('OK', len(out), 'bytes')
