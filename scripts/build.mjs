import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  loadTracks,
  renderTrackIndex,
  renderTrackTemplate,
} from './tracks.mjs';
import {
  loadNow,
  renderNowArchive,
  renderNowHome,
} from './now.mjs';
import {
  loadCollections,
  renderCollectionIndex,
  renderCollections,
  renderStuffFilters,
} from './collections.mjs';
import {
  composeFeed,
  loadFeedEntries,
  renderFeed,
  renderFeedFilters,
} from './feed.mjs';
import { loadDays, renderDays, renderDaysArchive } from './days.mjs';
import { generateCspHeaders } from './csp.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(scriptDirectory, '..');
export const outputDirectory = path.join(projectRoot, 'dist');

const layoutFile = path.join(projectRoot, 'components', 'layout.html');
const trackPageTemplateFile = path.join(projectRoot, 'components', 'track-page.html');
const homepageStylesheets = new Set([
  '/css/style.css',
  '/css/wavy-text.css',
  '/timed-event/snow.css',
  '/timed-event/seasonal-effects.css',
]);
const skippedRootEntries = new Set([
  '.agents',
  '.codex',
  '.git',
  '.github',
  '.openai',
  'components',
  'content',
  'CODEX_HANDOFF.md',
  'dist',
  'functions',
  'node_modules',
  'scripts',
  'tests',
  'LOCAL_DEVELOPMENT.md',
  'package.json',
  'package-lock.json',
  'presence-clients',
  'wrangler.jsonc',
]);
const skippedFiles = new Set([
  '.gitattributes',
  '.gitignore',
  path.join('js', 'components.js'),
]);
const productionSourceOnlyFiles = new Set([
  path.join('timed-event', 'snow.css'),
  path.join('timed-event', 'seasonal-effects.css'),
]);
const siteIcons = [
  '<link rel="icon" href="/favicon.ico" sizes="16x16">',
  '<link rel="icon" type="image/png" href="/img/dott-sprite.png" sizes="24x24">',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
].join('\n');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceRequiredPlaceholder(source, placeholder, replacement, sourcePath) {
  const occurrences = source.split(placeholder).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${sourcePath} must contain exactly one ${placeholder} placeholder`);
  }
  return source.replace(placeholder, replacement);
}

function readLayoutTemplates(layoutSource) {
  const templates = new Map();
  const templatePattern = /<template\s+data-layout=(["'])([^"']+)\1\s*>([\s\S]*?)<\/template>/gi;

  for (const match of layoutSource.matchAll(templatePattern)) {
    templates.set(match[2], match[3].trim());
  }

  if (!templates.size) {
    throw new Error('No layout templates were found in components/layout.html');
  }

  return templates;
}

function removeRuntimeComponentLoader(html) {
  return html.replace(
    /\s*<script\b[^>]*\bsrc=(["'])\/js\/components\.js\1[^>]*>\s*<\/script>/gi,
    '',
  );
}

function addWavyTextStylesheet(html) {
  if (html.includes('href="/css/wavy-text.css"')) return html;

  return html.replace(
    /<\/head>/i,
    '  <link rel="stylesheet" href="/css/wavy-text.css">\n</head>',
  );
}

function addNavigationScript(html) {
  if (html.includes('src="/js/navigation.js"')) return html;

  return html.replace(
    /<\/body>/i,
    '  <script src="/js/navigation.js" defer></script>\n</body>',
  );
}

function addSiteIcons(html) {
  if (html.includes('href="/favicon.ico"')) return html;
  if (!/<\/head>/i.test(html)) return html;

  return html.replace(/<\/head>/i, `  ${siteIcons}\n</head>`);
}

function getStylesheetHref(tag) {
  const rel = tag.match(/\brel=(["'])([^"']+)\1/i)?.[2];
  if (!rel?.split(/\s+/).includes('stylesheet')) return '';
  return tag.match(/\bhref=(["'])([^"']+)\1/i)?.[2] || '';
}

function escapeHtmlAttribute(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}

function addAsyncFontStylesheet(html, fontUrl) {
  if (!fontUrl || html.includes('data-async-font="ibm-plex-mono"')) return html;

  const safeFontUrl = escapeHtmlAttribute(fontUrl);
  const fontMarkup = [
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    `<link rel="stylesheet" href="${safeFontUrl}" media="print" onload="this.media='all'" data-async-font="ibm-plex-mono">`,
    `<noscript><link rel="stylesheet" href="${safeFontUrl}"></noscript>`,
  ].join('');

  return html.replace(/<\/head>/i, `${fontMarkup}</head>`);
}

async function optimizeHomepage(html, tools) {
  let fontUrl = '';
  let output = html.replace(/<link\b[^>]*>/gi, (tag) => {
    const stylesheetHref = getStylesheetHref(tag);
    if (!homepageStylesheets.has(stylesheetHref)) return tag;

    let css = tools.stylesheets.get(stylesheetHref);
    if (stylesheetHref === '/css/style.css') {
      css = css.replace(
        /@import\s+url\((["']?)(https:\/\/fonts\.googleapis\.com\/css2\?[^)"']+)\1\);\s*/i,
        (match, quote, importedUrl) => {
          fontUrl = importedUrl;
          return '';
        },
      );
    }

    return `<style data-source="${stylesheetHref}">${tools.minifyCss(css)}</style>`;
  });

  output = addAsyncFontStylesheet(output, fontUrl);

  const minifiedNavigation = await tools.minifyJs(
    await readFile(path.join(projectRoot, 'js', 'navigation.js'), 'utf8'),
  );
  output = output.replace(
    /\s*<script\s+src=(["'])\/js\/navigation\.js\1\s+defer><\/script>/i,
    `<script>${minifiedNavigation}</script>`,
  );

  return output;
}

async function loadProductionTools() {
  const [{ minify: minifyHtml }, cleanCssModule, { minify: terserMinify }] =
    await Promise.all([
      import('html-minifier-terser'),
      import('clean-css'),
      import('terser'),
    ]);
  const CleanCSS = cleanCssModule.default;

  function minifyCss(css) {
    const result = new CleanCSS({ level: 2 }).minify(css);
    if (result.errors.length) {
      throw new Error(`CSS minification failed: ${result.errors.join('; ')}`);
    }
    return result.styles;
  }

  async function minifyJs(javascript) {
    const result = await terserMinify(javascript, {
      compress: true,
      format: { comments: false },
      mangle: true,
    });
    if (!result.code) throw new Error('JavaScript minification returned no code');
    return result.code;
  }

  return {
    minifyCss,
    minifyHtml: (html) =>
      minifyHtml(html, {
        collapseBooleanAttributes: true,
        collapseWhitespace: true,
        minifyCSS: true,
        minifyJS: true,
        removeComments: true,
        removeRedundantAttributes: true,
        sortAttributes: true,
        sortClassName: true,
        useShortDoctype: true,
      }),
    minifyJs,
    stylesheets: new Map(),
  };
}

function inlineLayoutSlots(html, templates, sourcePath) {
  const requestedLayouts = Array.from(
    html.matchAll(/\bdata-layout=(["'])([^"']+)\1/gi),
    (match) => match[2],
  );

  if (!requestedLayouts.length) return html;

  let output = html;
  for (const layoutName of new Set(requestedLayouts)) {
    let component = templates.get(layoutName);
    if (!component) {
      throw new Error(`${sourcePath} requests unknown layout "${layoutName}"`);
    }

    if (layoutName === 'sidebar') {
      component = component.replace(
        /\s*<link\s+rel=(["'])stylesheet\1\s+href=(["'])\/css\/wavy-text\.css\2\s*>/i,
        '',
      );
    }

    const slotPattern = new RegExp(
      `(<([a-z][\\w:-]*)\\b[^>]*\\bdata-layout=(["'])${escapeRegExp(layoutName)}\\3[^>]*>)[\\s\\S]*?(<\\/\\2>)`,
      'gi',
    );
    let replacements = 0;

    output = output.replace(
      slotPattern,
      (match, openingTag, tagName, quote, closingTag) => {
        replacements += 1;
        const cleanOpeningTag = openingTag.replace(
          /\s+data-layout=(["'])[^"']+\1/i,
          '',
        );
        return `${cleanOpeningTag}\n${component}\n${closingTag}`;
      },
    );

    if (!replacements) {
      throw new Error(`Could not inline layout "${layoutName}" in ${sourcePath}`);
    }
  }

  if (requestedLayouts.includes('sidebar')) {
    output = addWavyTextStylesheet(output);
    output = addNavigationScript(output);
  }

  output = removeRuntimeComponentLoader(output);
  if (/\bdata-layout=(["'])[^"']+\1/i.test(output)) {
    throw new Error(`Unresolved layout slot remains in ${sourcePath}`);
  }

  return output;
}

function shouldSkip(relativePath, productionExcludedFiles) {
  const [rootEntry] = relativePath.split(path.sep);
  return (
    skippedRootEntries.has(rootEntry) ||
    skippedFiles.has(relativePath) ||
    productionExcludedFiles.has(relativePath)
  );
}

async function buildEntry(
  sourcePath,
  destinationPath,
  relativePath,
  templates,
  counters,
  productionTools,
  tracks,
  nowDocument,
  collectionsDocument,
  feedEntries,
  days,
  productionExcludedFiles,
) {
  const entries = await readdir(sourcePath, { withFileTypes: true });
  await mkdir(destinationPath, { recursive: true });

  for (const entry of entries) {
    const childRelativePath = path.join(relativePath, entry.name);
    if (shouldSkip(childRelativePath, productionExcludedFiles)) continue;

    const childSourcePath = path.join(sourcePath, entry.name);
    const childDestinationPath = path.join(destinationPath, entry.name);

    if (entry.isDirectory()) {
      await buildEntry(
        childSourcePath,
        childDestinationPath,
        childRelativePath,
        templates,
        counters,
        productionTools,
        tracks,
        nowDocument,
        collectionsDocument,
        feedEntries,
        days,
        productionExcludedFiles,
      );
      continue;
    }

    if (!entry.isFile()) continue;

    await mkdir(path.dirname(childDestinationPath), { recursive: true });
    if (path.extname(entry.name).toLowerCase() === '.html') {
      let html = await readFile(childSourcePath, 'utf8');
      if (childRelativePath === path.join('tracks', 'index.html')) {
        html = renderTrackIndex(html, tracks);
      }
      if (childRelativePath === path.join('now', 'index.html')) {
        html = replaceRequiredPlaceholder(
          html,
          '{{{now_archive}}}',
          renderNowArchive(nowDocument),
          childRelativePath,
        );
      }
      if (childRelativePath === path.join('stuff', 'index.html')) {
        html = replaceRequiredPlaceholder(
          html,
          '{{{collection_index}}}',
          renderCollectionIndex(collectionsDocument),
          childRelativePath,
        );
        html = replaceRequiredPlaceholder(
          html,
          '{{{stuff_filters}}}',
          renderStuffFilters(collectionsDocument),
          childRelativePath,
        );
        html = replaceRequiredPlaceholder(
          html,
          '{{{collections}}}',
          renderCollections(collectionsDocument),
          childRelativePath,
        );
      }
      if (childRelativePath === path.join('days', 'index.html')) {
        html = replaceRequiredPlaceholder(
          html,
          '{{{days}}}',
          renderDays(days, nowDocument, { demo: !productionTools }),
          childRelativePath,
        );
        html = replaceRequiredPlaceholder(html, '{{{days_archive}}}', renderDaysArchive(days, { demo: !productionTools }), childRelativePath);
      }
      if (childRelativePath === path.join('feed', 'index.html')) {
        html = replaceRequiredPlaceholder(
          html,
          '{{{feed_filters}}}',
          renderFeedFilters(feedEntries),
          childRelativePath,
        );
        html = replaceRequiredPlaceholder(
          html,
          '{{{feed_items}}}',
          renderFeed(feedEntries),
          childRelativePath,
        );
      }
      let output = inlineLayoutSlots(html, templates, childRelativePath);
      output = addSiteIcons(output);
      if (productionTools && childRelativePath === 'index.html') {
        output = await optimizeHomepage(output, productionTools);
      }
      if (productionTools) {
        output = await productionTools.minifyHtml(output);
      }
      await writeFile(childDestinationPath, output);
      counters.pages += 1;
    } else if (
      productionTools &&
      ['.css', '.js'].includes(path.extname(entry.name).toLowerCase())
    ) {
      const source = await readFile(childSourcePath, 'utf8');
      const output =
        path.extname(entry.name).toLowerCase() === '.css'
          ? productionTools.minifyCss(source)
          : await productionTools.minifyJs(source);
      await writeFile(childDestinationPath, output);
      counters.assets += 1;
    } else {
      await copyFile(childSourcePath, childDestinationPath);
      counters.assets += 1;
    }
  }
}

async function buildTrackPages(
  tracks,
  trackPageTemplate,
  templates,
  counters,
  productionTools,
) {
  for (const track of tracks) {
    const sourcePath = track.sourcePath;
    let output = inlineLayoutSlots(trackPageTemplate, templates, sourcePath);
    output = renderTrackTemplate(output, track);
    output = addSiteIcons(output);
    if (productionTools) {
      output = await productionTools.minifyHtml(output);
    }

    const destinationPath = path.join(
      outputDirectory,
      'tracks',
      track.slug,
      'index.html',
    );
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await writeFile(destinationPath, output);
    counters.pages += 1;
  }
}

export async function build({ production = true } = {}) {
  const startedAt = performance.now();
  const [
    rawLayoutSource,
    trackPageTemplate,
    allTracks,
    nowDocument,
    collectionsDocument,
    curatedFeedEntries,
    days,
  ] = await Promise.all([
    readFile(layoutFile, 'utf8'),
    readFile(trackPageTemplateFile, 'utf8'),
    loadTracks(projectRoot),
    loadNow(projectRoot),
    loadCollections(projectRoot),
    loadFeedEntries(projectRoot),
    loadDays(projectRoot),
  ]);
  const tracks = production
    ? allTracks.filter((track) => !track.draft)
    : allTracks;
  const feedEntries = composeFeed(curatedFeedEntries, tracks, nowDocument);
  const layoutWithNow = replaceRequiredPlaceholder(
    rawLayoutSource,
    '{{{now_home}}}',
    renderNowHome(nowDocument),
    'components/layout.html',
  );
  const randomRoutes = [
    '/',
    '/about/',
    '/projects/',
    '/tracks/',
    '/buttons/',
    '/now/',
    '/feed/',
    '/days/',
    '/stuff/',
    ...tracks.map((track) => `/tracks/${track.slug}/`),
    'https://album.somedott.space/',
  ];
  const layoutSource = replaceRequiredPlaceholder(
    layoutWithNow,
    '{{{random_routes}}}',
    JSON.stringify(randomRoutes),
    'components/layout.html',
  );
  const templates = readLayoutTemplates(layoutSource);
  const counters = { pages: 0, assets: 0 };
  const productionTools = production ? await loadProductionTools() : null;
  const publishedCovers = new Set(
    tracks
      .filter((track) => track.cover)
      .map((track) => path.join('img', 'tracks', track.cover)),
  );
  const productionExcludedFiles = production
    ? new Set([
        ...productionSourceOnlyFiles,
        ...allTracks
          .filter((track) => track.draft && track.cover)
          .map((track) => path.join('img', 'tracks', track.cover))
          .filter((coverPath) => !publishedCovers.has(coverPath)),
      ])
    : new Set();

  if (productionTools) {
    for (const stylesheetHref of homepageStylesheets) {
      productionTools.stylesheets.set(
        stylesheetHref,
        await readFile(path.join(projectRoot, stylesheetHref.slice(1)), 'utf8'),
      );
    }
  }

  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  await buildEntry(
    projectRoot,
    outputDirectory,
    '',
    templates,
    counters,
    productionTools,
    tracks,
    nowDocument,
    collectionsDocument,
    feedEntries,
    days,
    productionExcludedFiles,
  );
  await buildTrackPages(
    tracks,
    trackPageTemplate,
    templates,
    counters,
    productionTools,
  );

  if (production) {
    const { policy } = await generateCspHeaders(outputDirectory);
    counters.assets += 1;
    console.log(`Generated CSP (${policy.length} chars)`);
  }

  const elapsed = Math.round(performance.now() - startedAt);
  const skippedDrafts = production
    ? allTracks.length - tracks.length
    : 0;
  const draftMessage = skippedDrafts
    ? `; skipped ${skippedDrafts} draft track${skippedDrafts === 1 ? '' : 's'}`
    : '';
  console.log(
    `Built ${counters.pages} pages and ${counters.assets} assets into dist/ (${production ? 'production, ' : ''}${elapsed} ms${draftMessage})`,
  );
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  build().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
