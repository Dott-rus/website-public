import { dayBounds } from './time.mjs';

async function json(url, headers) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${new URL(url).host} returned ${response.status}`);
  return response.json();
}

async function miraCommits(date) {
  const token = process.env.MIRA_TOKEN;
  if (!token) return [];
  const headers = { Accept:'application/json', Authorization:`token ${token}` };
  const repos = await json('https://mira.somedott.space/api/v1/user/repos?limit=100', headers);
  const { start,end } = dayBounds(date);
  const commits=[];
  for (const repo of repos) {
    const owner=repo.owner?.login || repo.owner?.username;
    if (!owner || !repo.name) continue;
    const url=new URL(`https://mira.somedott.space/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo.name)}/commits`);
    url.searchParams.set('since',start.toISOString()); url.searchParams.set('until',end.toISOString()); url.searchParams.set('limit','100');
    try {
      for (const c of await json(url,headers)) if (c.sha) commits.push({sha:c.sha,source:'mira'});
    } catch (e) { if (!String(e.message).includes('409')) throw e; }
  }
  return commits;
}

async function githubCommits(date) {
  const token=process.env.GITHUB_TOKEN;
  if (!token) return [];
  const headers={ Accept:'application/vnd.github+json', Authorization:`Bearer ${token}`, 'X-GitHub-Api-Version':'2022-11-28' };
  const repos=await json('https://api.github.com/user/repos?per_page=100&affiliation=owner',headers);
  const {start,end}=dayBounds(date); const commits=[];
  for (const repo of repos) {
    if (!repo.full_name) continue;
    const url=new URL(`https://api.github.com/repos/${repo.full_name}/commits`);
    url.searchParams.set('since',start.toISOString()); url.searchParams.set('until',end.toISOString()); url.searchParams.set('per_page','100');
    try { for (const c of await json(url,headers)) if(c.sha) commits.push({sha:c.sha,source:'github'}); }
    catch(e){
      // A fine-grained token can list all repos visible to the account while only
      // being granted Contents access to a subset. Skip those inaccessible repos.
      if(!String(e.message).match(/returned (403|404|409|422|451)/)) throw e;
    }
  }
  return commits;
}

export async function collectCode(date) {
  const [mira,github]=await Promise.all([miraCommits(date),githubCommits(date)]);
  const seen=new Set(); let miraCount=0, githubCount=0;
  for (const c of mira) if(!seen.has(c.sha)){seen.add(c.sha);miraCount++;}
  for (const c of github) if(!seen.has(c.sha)){seen.add(c.sha);githubCount++;}
  return { commits:miraCount+githubCount, sources:{mira:miraCount,github:githubCount} };
}
