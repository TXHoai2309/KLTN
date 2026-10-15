// Production components; isolated fixtures. Reads cached Owner metadata, never a database.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { basename } from 'node:path';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { editorialQualityFixture } from '../src/modules/destination-editorial/__fixtures__/editorial-quality-fixtures.ts';
import { autoLayout, resolveEditorial } from '../src/modules/destination-editorial/editorial-engine.ts';
const require=createRequire(import.meta.url);
const {chromium}=require(require.resolve('playwright',{paths:['C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const web=fileURLToPath(new URL('..',import.meta.url)),folder=web+'/.cache/premium-hero',phase=process.argv.includes('--before')?'before':'after';
await mkdir(folder+'/'+phase,{recursive:true});
const bundle=await build({absWorkingDir:web,stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import Renderer from'./src/components/editorial/editorial-renderer';import'./src/components/editorial/editorial.css';window.mount=data=>{window.root?.unmount();window.root=createRoot(document.getElementById('app'));window.root.render(<Renderer {...data}/>)};",resolveDir:web,loader:'tsx'},bundle:true,write:false,outdir:'.cache/hero-bundle',jsx:'automatic',plugins:[{name:'isolated',setup(b){
  if(phase==='before')b.onLoad({filter:/components[\\/]editorial[\\/](editorial-renderer\.tsx|editorial-story\.tsx|editorial-photo\.tsx|editorial\.css)$/},async args=>({contents:await readFile(folder+'/baseline/'+basename(args.path),'utf8'),loader:args.path.endsWith('.css')?'css':'tsx'}));
  b.onResolve({filter:/components\/map\/destination-map$/},args=>({path:args.path,namespace:'map'}));
  b.onLoad({filter:/.*/,namespace:'map'},()=>({loader:'jsx',resolveDir:web,contents:"import React from'react';export default function Map(){return <div className='destination-map'>Bản đồ fixture</div>}"}));
}}]});
const fonts=(await Promise.all((await readdir(web+'/.next/static/chunks')).filter(f=>f.endsWith('.css')).map(f=>readFile(web+'/.next/static/chunks/'+f,'utf8')))).flatMap(css=>css.match(/@font-face\s*\{[^}]+\}/g)??[]).join('\n').replaceAll('../media/','/font/');
const photo=await sharp(Buffer.from('<svg width="1800" height="1125" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="s" x2="0" y2="1"><stop stop-color="#8eaab7"/><stop offset="1" stop-color="#e1e8e6"/></linearGradient></defs><rect width="1800" height="1125" fill="url(#s)"/><path d="M0 800L230 370L450 680L720 180L1000 650L1300 270L1800 750V1125H0" fill="#68877f"/><path d="M0 1000L450 540L800 950L1250 450L1800 900V1125H0" fill="#284d43"/></svg>')).jpeg().toBuffer();
const server=createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/bundle.js'){res.setHeader('Content-Type','application/javascript');return res.end(bundle.outputFiles.find(f=>f.path.endsWith('.js')).text);}if(/^\/font\/[\w.-]+\.woff2$/.test(url.pathname)){res.setHeader('Content-Type','font/woff2');return res.end(await readFile(web+'/.next/static/media/'+basename(url.pathname)));}res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+fonts+":root{--font-editorial-serif:'Lora';--font-geist-sans:'Geist';--font-be-vietnam:'Be Vietnam Pro'}*{box-sizing:border-box}body{margin:0;background:#edf5ef}#app{max-width:1280px;margin:auto}"+bundle.outputFiles.filter(f=>f.path.endsWith('.css')).map(f=>f.text).join('\n')+'</style><div id="app"></div><script src="/bundle.js"></script></html>');});
const cases=[['dong-van','Cao nguyên đá Đồng Văn','thiên nhiên',3],['nho-que','Nho Quế','thiên nhiên',3],['vuong','Dinh thự họ Vương','di tích kiến trúc',3],['one-photo','Một miền xanh','thiên nhiên',1],['low-res','Cảnh quan miền đá','thiên nhiên',1],['no-photo','Một điểm đến chưa có ảnh','bản làng',0]].map(([slug,name,category,count])=>{
  const context=editorialQualityFixture(name,category,count);
  context.media.forEach(m=>{const storage=JSON.parse(m.storageReference);m.storageReference=JSON.stringify({...storage,width:slug==='low-res'?400:1800,height:slug==='low-res'?250:1125});});
  return {slug,context,layout:autoLayout(context)};
});
try{const snapshot=JSON.parse(await readFile(web+'/.cache/editorial-ai-empty/owner-readonly-snapshot.json','utf8'));cases.push({slug:'dong-van-real',...snapshot});}catch{console.log('NOTE No cached Owner snapshot; real-photo QA not claimed');}
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});const results=[];
try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://res.cloudinary.com/fixture/**',route=>route.fulfill({contentType:'image/jpeg',body:photo}));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|res\.cloudinary\.com)/,route=>route.abort());
  await page.goto('http://127.0.0.1:'+server.address().port);
  for(const entry of cases)for(const variant of ['PANORAMA','SPLIT','EDITORIAL'])for(const width of [390,768,1440])for(const theme of ['light','dark']){
    const layout={...entry.layout,variant};delete layout.hero;const before=JSON.stringify(layout);
    const payload={data:entry.context,editorial:resolveEditorial(layout,entry.context)};
    await page.setViewportSize({width,height:1100});await page.evaluate(t=>document.documentElement.classList.toggle('dark',t==='dark'),theme);
    await page.evaluate(data=>window.mount(data),payload);await page.locator('.emg-hero').waitFor();await page.evaluate(()=>document.fonts.ready);
    const beforeBoxes=await page.locator('.emg-hero img').evaluateAll(imgs=>imgs.map(i=>{const r=i.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}}));
    await page.locator('.emg img').evaluateAll(imgs=>Promise.all(imgs.map(i=>{const loading=i.loading;i.loading='eager';return i.decode().catch(()=>{}).then(()=>{i.loading=loading})})));
    const metrics=await page.locator('.emg').evaluate(root=>{
      const hero=root.querySelector('.emg-hero'),title=hero.querySelector('h1'),img=hero.querySelector('img');
      const nodes=[...hero.querySelectorAll('h1,.emg-kicker,.emg-deck,.emg-location')];
      const overlap=(a,b)=>{const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return x.left<y.right-1&&x.right>y.left+1&&x.top<y.bottom-1&&x.bottom>y.top+1};
      const bounds=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}};
      return{composition:hero.dataset.composition,hero:bounds(hero),title:bounds(title),img:img?{...bounds(img),naturalWidth:img.naturalWidth,fit:getComputedStyle(img).objectFit,focal:img.style.objectPosition}:null,overflow:document.documentElement.scrollWidth>innerWidth,textOverflow:nodes.some(n=>n.scrollWidth>n.clientWidth+1),textOverlap:nodes.some((a,i)=>nodes.slice(i+1).some(b=>overlap(a,b))),font:getComputedStyle(title).fontFamily};
    });
    if(phase==='after'){
      assert(!metrics.overflow,entry.slug+'/'+variant+'/'+width+' horizontal overflow');assert(!metrics.textOverflow,entry.slug+'/'+variant+'/'+width+' text overflow');assert(!metrics.textOverlap,entry.slug+'/'+variant+'/'+width+' text overlap');
      assert.equal(JSON.stringify(layout),before,'Stored input unchanged');
      if(entry.slug==='low-res'&&metrics.img)assert(metrics.img.w<=400,'Never upscale a small original');
      if(metrics.img){const b=beforeBoxes[0];assert(Math.max(Math.abs(b.w-metrics.img.w),Math.abs(b.h-metrics.img.h),Math.abs(b.y-metrics.img.y))<1,'Image decode must not shift Hero');}
      if(entry.slug==='dong-van'&&width===1440)assert.equal(metrics.composition,variant,'Three distinct full-quality compositions');
    }
    if(entry.slug==='dong-van-real'&&width===1440&&theme==='light')await page.screenshot({path:folder+'/'+phase+'/dong-van-real-'+variant+'-full.png',fullPage:true});
    results.push({slug:entry.slug,variant,width,theme,...metrics});
    await page.screenshot({path:folder+'/'+phase+'/'+entry.slug+'-'+variant+'-'+width+'-'+theme+'.png'});
    const preview=await page.locator('.emg').innerHTML();await page.evaluate(data=>window.mount(data),payload);await page.locator('.emg-hero').waitFor();assert.equal(await page.locator('.emg').innerHTML(),preview);
  }
  assert.deepEqual(errors,[]);await writeFile(folder+'/'+phase+'-results.json',JSON.stringify(results,null,2));
  console.log(JSON.stringify({phase,snapshots:results.length,realPhotoLoads:results.filter(r=>r.slug==='dong-van-real'&&r.img?.naturalWidth>0).length,folder}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
if(phase==='after'){
  for(const width of [390,768,1440])for(const theme of ['light','dark']){
    const tileWidth=width===390?260:480,tileHeight=Math.round(1100*tileWidth/width),tiles=[];
    for(const [row,entry] of cases.entries())for(const [column,variant] of ['PANORAMA','SPLIT','EDITORIAL'].entries()){
      const input=await sharp(folder+'/after/'+entry.slug+'-'+variant+'-'+width+'-'+theme+'.png').resize(tileWidth,tileHeight).png().toBuffer();tiles.push({input,left:column*tileWidth,top:row*tileHeight});
    }
    await sharp({create:{width:tileWidth*3,height:tileHeight*cases.length,channels:3,background:'#edf5ef'}}).composite(tiles).png().toFile(folder+'/contact-'+width+'-'+theme+'.png');
  }
  const tiles=[];let y=0;for(const variant of ['PANORAMA','SPLIT','EDITORIAL']){for(const [i,phase] of ['before','after'].entries()){const input=await sharp(folder+'/'+phase+'/dong-van-'+variant+'-1440-light.png').resize(576,440).png().toBuffer();tiles.push({input,left:i*576,top:y});}y+=440;}
  await sharp({create:{width:1152,height:y,channels:3,background:'#fff'}}).composite(tiles).png().toFile(folder+'/before-after.png');
}
