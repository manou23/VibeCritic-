import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';
const glyphs={V:['10001','10001','10001','10001','01010','01010','00100'],C:['01111','10000','10000','10000','10000','10000','01111']};
function crc32(b){let c=0xffffffff;for(const v of b){c^=v;for(let i=0;i<8;i++)c=(c>>>1)^(0xedb88320&-(c&1));}return(c^0xffffffff)>>>0;}
function chunk(t,d){const n=Buffer.from(t),b=Buffer.concat([n,d]),o=Buffer.alloc(12+d.length);o.writeUInt32BE(d.length,0);b.copy(o,4);o.writeUInt32BE(crc32(b),8+d.length);return o;}
function png(s){const p=Buffer.alloc(s*s*4),set=(x,y,c)=>{if(x<0||y<0||x>=s||y>=s)return;const i=(y*s+x)*4;p.set(c,i);};const z=Math.max(1,Math.floor(s/12)),r=Math.round(s*.22);
for(let y=0;y<s;y++)for(let x=0;x<s;x++){const a=x<r?r:x>=s-r?s-r-1:x,b=y<r?r:y>=s-r?s-r-1:y;if((x-a)**2+(y-b)**2<=r*r)set(x,y,[79,70,229,255]);}
const gap=Math.max(1,Math.round(z*.45)),left=Math.floor((s-(z*10+gap))/2),top=Math.floor((s-z*7)/2);
for(const [ch,off] of [['V',0],['C',z*6+gap]])glyphs[ch].forEach((row,ry)=>[...row].forEach((v,rx)=>{if(v==='1')for(let dy=0;dy<z;dy++)for(let dx=0;dx<z;dx++)set(left+off+rx*z+dx,top+ry*z+dy,[255,255,255,255]);}));
const raw=Buffer.alloc((s*4+1)*s);for(let y=0;y<s;y++)p.copy(raw,y*(s*4+1)+1,y*s*4,(y+1)*s*4);const h=Buffer.alloc(13);h.writeUInt32BE(s,0);h.writeUInt32BE(s,4);h[8]=8;h[9]=6;
return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);}
await mkdir('public',{recursive:true});for(const s of [96,180,192,512]){const n=s===180?'apple-touch-icon.png':s===96?'favicon-96.png':'icon-'+s+'.png';await writeFile(join('public',n),png(s));}console.log('Generated VibeCritic PNG icons.');