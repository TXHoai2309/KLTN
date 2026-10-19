import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const web=fileURLToPath(new URL('..',import.meta.url)), root=`${web}/.cache/editorial-v3-5`;
async function sheet(rows,file) {
  const tiles=[];const hashes=[];
  for(const [rowIndex,row] of rows.entries())for(const [i,path] of row.paths.entries()) {
    const data=await readFile(path), metadata=await sharp(data).metadata();
    const height=Math.min(metadata.height,1200), width=metadata.width;
    const tile=await sharp(data).extract({left:0,top:0,width,height}).resize(576,480,{fit:'contain',background:'#eaf0ed',position:'top'}).png().toBuffer();
    const label=Buffer.from(`<svg width="576" height="40" xmlns="http://www.w3.org/2000/svg"><rect width="576" height="40" fill="#183126"/><text x="16" y="26" fill="white" font-family="Arial" font-size="16">${row.label} · ${row.columns[i]}</text></svg>`);
    tiles.push({input:label,left:i*576,top:rowIndex*520},{input:tile,left:i*576,top:rowIndex*520+40});hashes.push({path,sha256:createHash('sha256').update(data).digest('hex')});
  }
  await sharp({create:{width:1152,height:rows.length*520,channels:3,background:'#eaf0ed'}}).composite(tiles).png().toFile(`${root}/${file}.png`);
  await writeFile(`${root}/${file}-sources.json`,JSON.stringify(hashes,null,2));
}
await sheet(['dong-van','nho-que','bac-me','lo-lo-chai','no-photo'].map(slug=>({label:slug,columns:['Git HEAD baseline','V3.5'],paths:[`${root}/before/${slug}-1440-light.png`,`${root}/after/${slug}-1440-light.png`]})),'before-after-desktop-contact-sheet');
await sheet(['NATURE_SHOWCASE-PANORAMA','HERITAGE_STORY-SPLIT','VILLAGE_CULTURE-SPLIT','JOURNEY_EDITORIAL-EDITORIAL'].map(name=>({label:name,columns:['Pre-V3.5 working tree','V3.5 working tree'],paths:[`${root}/pre-v3-5-working-tree/${name}-1440-light.png`,`${web}/.cache/editorial-v3-3/${name}-1440-light.png`]})),'working-tree-before-after-contact-sheet');
await sheet(['dong-van','nho-que','bac-me','lo-lo-chai','no-photo'].map(slug=>({label:`${slug} 390px dark`,columns:['Git HEAD baseline','V3.5'],paths:[`${root}/before/${slug}-390-dark.png`,`${root}/after/${slug}-390-dark.png`]})),'before-after-mobile-dark-contact-sheet');
console.log(JSON.stringify({sheets:3,root,baseline:'HEAD and separately preserved pre-V3.5 working-tree screenshots; synthetic fixtures only'}));
