import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml, stringifyYaml } from './content-yaml.mjs';
import { rankedPlayForDay } from './day-sources/ranked-play.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const { matches }=JSON.parse(await readFile(path.join(root,'content/osu-ranked-play.json'),'utf8'));
const dates=[...new Set(matches.map(m=>{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(m.date));const get=type=>parts.find(p=>p.type===type).value;return `${get('year')}-${get('month')}-${get('day')}`;}))];
for(const date of dates){const file=path.join(root,'content/days',`${date}.yaml`);let day;try{day=parseYaml(await readFile(file,'utf8'))}catch(e){if(e.code==='ENOENT'){console.log('Skip date without baked day:',date);continue;}throw e;}
const ranked=rankedPlayForDay(matches,date);if(!ranked)continue;
day.gaming ||= [];let osu=day.gaming.find(g=>g.title==='osu!');if(!osu){osu={title:'osu!',supported:true};day.gaming.push(osu)}osu.rankedPlay=ranked;
await writeFile(file,stringifyYaml(day));console.log('Backfilled:',date,ranked.results.join(' '),ranked.maps.join(' '));}
