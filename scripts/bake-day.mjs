import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringifyYaml } from './content-yaml.mjs';
import { localDateString } from './day-sources/time.mjs';
import { collectNow } from './day-sources/now.mjs';
import { collectMusic } from './day-sources/listenbrainz.mjs';
import { collectYami } from './day-sources/yami.mjs';
import { collectCode } from './day-sources/code.mjs';
import { collectRankedPlay } from './day-sources/ranked-play.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const requested=process.argv[2];
const now=new Date();
const date=requested || localDateString(new Date(now.getTime()-86400000));
if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Date must use YYYY-MM-DD');

const results=await Promise.allSettled([
  collectMusic(date), collectYami(date), collectCode(date), collectNow(root,date), collectRankedPlay(root,date),
]);
const value=(i,fallback)=>results[i].status==='fulfilled'?results[i].value:fallback;
const warnings=results.flatMap((r,i)=>r.status==='rejected'?[`${['music','yami','code','now','ranked-play'][i]}: ${r.reason?.message||r.reason}`]:[]);
const yami=value(1,{gaming:[],watching:[],podcasts:[]});
const rankedPlay=value(4,null);
if(rankedPlay) {
  let osu=yami.gaming.find((game)=>game.title==='osu!');
  if(!osu) { osu={title:'osu!',supported:true}; yami.gaming.push(osu); }
  osu.rankedPlay=rankedPlay;
}
const day={
  date,
  bakedAt:new Date().toISOString(),
  gaming:yami.gaming,
  watching:yami.watching,
  podcasts:yami.podcasts,
  music:value(0,{plays:0,tracks:0,artists:0,streaks:[]}),
  code:value(2,{commits:0,sources:{mira:0,github:0}}),
  now:value(3,[]),
};
if(warnings.length) day.warnings=warnings;
const dir=path.join(root,'content','days'); await mkdir(dir,{recursive:true});
const filename=path.join(dir,`${date}.yaml`); await writeFile(filename,stringifyYaml(day));
console.log(`Baked ${date} -> ${path.relative(root,filename)}`);
if(warnings.length) console.warn(`Warnings: ${warnings.join('; ')}`);
