"""キャラのドット絵（images/chanz-source.png）から、動くアイコン images/chanz.gif を作る。
まばたき・胸と腕のライトの明滅・呼吸の上下・キラキラを付ける。
使い方: python3 tools/make_avatar_gif.py （numpy, pillow, opencv-python-headless が必要）
"""
import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'images'))
from PIL import Image, ImageDraw
import numpy as np, math
src=Image.open('chanz-source.png').convert('RGB')
# 1) 背景（クリーム色）を外側から塗りつぶして透明に
W=512
key=(255,0,255)
im=src.copy()
for x in range(0,W,4):
    for y in (0,W-1):
        if sum(abs(a-b) for a,b in zip(im.getpixel((x,y)),(253,244,230)))<60: ImageDraw.floodfill(im,(x,y),key,thresh=48)
for y in range(0,W,4):
    for x in (0,W-1):
        if sum(abs(a-b) for a,b in zip(im.getpixel((x,y)),(253,244,230)))<60: ImageDraw.floodfill(im,(x,y),key,thresh=48)
a=np.array(im); base=np.array(src).astype(np.float32)
alpha=np.where((a==key).all(2),0,255).astype(np.uint8)
# 残ったクリーム色のふち（輪郭の外側1〜2px）も消す
cream=(np.abs(base-np.array([253,244,230])).sum(2)<70)
import cv2
near=cv2.dilate((alpha==0).astype(np.uint8),np.ones((7,7),np.uint8))>0
light=(base.min(2)>185)&((base.max(2)-base.min(2))<45)
alpha[(cream|light)&near]=0
skin=np.array([253,200,155],np.float32)
print('skin',skin, 'transparent %', (alpha==0).mean())
def frame(i,n):
    f=base.copy()
    t=i/n
    # 胸と腕のライト：明るさを脈打たせる
    cyan=(f[...,2]>140)&(f[...,1]>140)&(f[...,0]<f[...,2]-25)
    white=(f.min(2)>225)&(np.arange(W)[:,None]>330)&(alpha>0)
    p=0.5+0.5*math.sin(2*math.pi*t)          # 0..1
    k=0.72+0.38*p
    f[cyan]=np.clip(f[cyan]*k,0,255)
    f[white]=np.clip(np.array([200,250,255])*(0.85+0.15*p),0,255) if p<0.5 else f[white]
    # まばたき
    if i in (n-3,n-2):
        for (x0,x1) in ((192,248),(287,341)):
            box=f[192:234,x0:x1]
            notskin=np.abs(box-skin).sum(2)>70
            box[notskin]=skin
            f[219:225,x0+6:x1-6]=(70,38,30)
            f[214:219,x0+1:x0+7]=(70,38,30); f[214:219,x1-7:x1-1]=(70,38,30)
    return f
def star(d,cx,cy,s,col):
    b=s
    d.rectangle([cx-b//2,cy-b*2,cx+b//2-1,cy+b*2-1],fill=col)
    d.rectangle([cx-b*2,cy-b//2,cx+b*2-1,cy+b//2-1],fill=col)
    d.rectangle([cx-b//2,cy-b//2,cx+b//2-1,cy+b//2-1],fill=(255,255,255,255))
N=12; frames=[]
bob=[0,0,0,4,8,8,8,8,4,0,0,0]
spark={1:(430,120,'s'),2:(430,120,'b'),3:(430,120,'s'),5:(78,250,'s'),6:(78,250,'b'),7:(78,250,'s'),9:(458,300,'s'),10:(458,300,'b'),11:(458,300,'s')}
for i in range(N):
    f=frame(i,N).astype(np.uint8)
    rgba=np.dstack([f,alpha])
    img=Image.fromarray(rgba,'RGBA')
    canvas=Image.new('RGBA',(W,W),(0,0,0,0))
    canvas.alpha_composite(img,(0,bob[i]))
    if i in spark:
        x,y,sz=spark[i]; d=ImageDraw.Draw(canvas)
        star(d,x,y,8 if sz=='s' else 10,(140,235,255,255) if sz=='s' else (190,245,255,255))
    frames.append(canvas)
# GIF（透明あり）
out=[]
for fr in frames:
    small=fr.resize((256,256),Image.NEAREST)
    al=np.array(small)[...,3]
    rgb=Image.fromarray(np.array(small)[...,:3]).convert('RGB')
    q=rgb.quantize(colors=255,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE)
    qa=np.array(q); qa[al<128]=255
    q2=Image.fromarray(qa,'P'); pal=q.getpalette()[:765]+[0,0,0]; q2.putpalette(pal)
    out.append(q2)
out[0].save('chanz.gif',save_all=True,append_images=out[1:],duration=110,loop=0,transparency=255,disposal=2,optimize=False)
