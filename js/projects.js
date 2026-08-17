(() => {
  'use strict';

  const API_URL = 'https://api.github.com/users/Dott-rus/repos?sort=updated&per_page=100';
  const FEATURED_REPOSITORIES = [
    'website',
    'zametki',
    'apps',
    'dot-files-dott',
  ];
  const PROJECTS_CACHE_KEY = 'dott-projects';
  const PROJECTS_CACHE_MAX_AGE = 6 * 60 * 60 * 1000;
  const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const numberFormat = new Intl.NumberFormat('en');

  const container = document.getElementById('projects-container');
  const status = document.getElementById('projects-status');
  const featuredContainer = document.getElementById('featured-projects-container');
  const featuredStatus = document.getElementById('featured-projects-status');
  if (!container || !status || !featuredContainer || !featuredStatus) return;

  const cachedProjects = readProjectsCache();
  if (cachedProjects) renderProjectGroups(cachedProjects);
  loadProjects(false, Boolean(cachedProjects));

  async function loadProjects(moveFocus = false, hasCachedProjects = false) {
    if (!hasCachedProjects) {
      renderState(featuredStatus, 'loading', 'Loading selected repositories…');
      renderState(status, 'loading', 'Loading public repositories…');
    }
    featuredContainer.setAttribute('aria-busy', 'true');
    container.setAttribute('aria-busy', 'true');
    if (moveFocus) status.focus();

    try {
      const response = await fetch(API_URL);
      if (!response.ok) {
        throw new Error(`GitHub API returned ${response.status}`);
      }

      const projects = await response.json();
      if (!Array.isArray(projects)) {
        throw new Error('GitHub API returned an unexpected response');
      }

      writeProjectsCache(projects);
      const count = renderProjectGroups(projects);
      if (moveFocus && count > 0) container.querySelector('.project-link')?.focus();
    } catch (error) {
      console.error('Could not load GitHub projects:', error);
      if (!hasCachedProjects) {
        renderState(featuredStatus, 'error', 'Could not load selected repositories.');
        const retry = renderState(
          status,
          'error',
          'Could not load repositories from GitHub. You can try again in a moment.',
          true,
        );
        if (moveFocus) retry.focus();
      }
    } finally {
      featuredContainer.setAttribute('aria-busy', 'false');
      container.setAttribute('aria-busy', 'false');
    }
  }

  function renderProjectGroups(projects) {
    const visibleProjects = projects.filter(isDisplayableProject);
    const projectsByName = new Map(visibleProjects.map((project) => [project.name, project]));
    const featuredNames = new Set(FEATURED_REPOSITORIES);
    const featuredProjects = FEATURED_REPOSITORIES
      .map((name) => projectsByName.get(name))
      .filter(Boolean);
    const otherProjects = visibleProjects.filter((project) => !featuredNames.has(project.name));

    const featuredCount = renderProjectList(featuredContainer, featuredProjects);
    const otherCount = renderProjectList(container, otherProjects);

    if (featuredCount === 0) {
      renderState(featuredStatus, 'empty', 'No selected repositories found.');
    } else {
      clearState(featuredStatus);
    }

    if (otherCount === 0) {
      renderState(status, 'empty', 'No other original public repositories found.');
    } else {
      clearState(status);
    }

    return featuredCount + otherCount;
  }

  function renderProjectList(target, projects) {
    const fragment = document.createDocumentFragment();
    projects.forEach((project) => {
      fragment.append(createProjectCard(project));
    });
    target.replaceChildren(fragment);
    return projects.length;
  }

  function isDisplayableProject(project) {
    return Boolean(
      project
      && typeof project === 'object'
      && !project.fork
      && typeof project.name === 'string'
      && project.name.trim()
      && getHttpUrl(project.html_url),
    );
  }

  function createProjectCard(project) {
    const card = createElement('article', 'project-item');
    const title = createElement('h2', 'project-title');
    const repositoryLink = createExternalLink(
      project.html_url,
      project.name.trim(),
      'project-link',
    );

    title.append(repositoryLink);
    card.append(title);

    if (typeof project.description === 'string' && project.description.trim()) {
      card.append(
        createElement('p', 'project-description', project.description.trim()),
      );
    }

    const metadata = createElement('ul', 'project-meta');
    if (typeof project.language === 'string' && project.language.trim()) {
      metadata.append(createMetadataItem(`Language: ${project.language.trim()}`));
    }

    const stars = normalizeCount(project.stargazers_count);
    const forks = normalizeCount(project.forks_count);
    if (stars) metadata.append(createMetadataItem(`Stars: ${numberFormat.format(stars)}`));
    if (forks) metadata.append(createMetadataItem(`Forks: ${numberFormat.format(forks)}`));

    const updated = formatUpdatedTime(project.updated_at);
    if (updated) {
      const updatedItem = createMetadataItem(`Updated ${updated.relative}`);
      updatedItem.title = `Last updated: ${updated.absolute}`;
      metadata.append(updatedItem);
    }

    card.append(metadata);

    const homepageUrl = getHttpUrl(project.homepage);
    if (homepageUrl) {
      card.append(createExternalLink(homepageUrl, 'Visit project website', 'project-homepage'));
    }

    return card;
  }

  function createMetadataItem(text) {
    return createElement('li', 'project-meta-item', text);
  }

  function createExternalLink(url, label, className) {
    const link = createElement('a', className, label);
    link.href = getHttpUrl(url);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  }

  function createElement(tagName, className, text) {
    const element = document.createElement(tagName);
    element.className = className;
    if (text !== undefined) {
      element.textContent = text;
    }
    return element;
  }

  function renderState(target, state, message, allowRetry = false) {
    const status = createElement(
      'p',
      `project-state project-state--${state}`,
      message,
    );

    if (!allowRetry) {
      target.replaceChildren(status);
      return null;
    }

    const retry = createElement('button', 'project-retry', 'Try again');
    retry.type = 'button';
    retry.addEventListener(
      'click',
      () => loadProjects(true, false),
      { once: true },
    );
    target.replaceChildren(status, retry);
    return retry;
  }

  function clearState(target) {
    target.replaceChildren();
  }

  function readProjectsCache() {
    try {
      const cached = JSON.parse(localStorage.getItem(PROJECTS_CACHE_KEY));
      if (
        !cached
        || !Array.isArray(cached.value)
        || !Number.isFinite(cached.savedAt)
        || Date.now() - cached.savedAt > PROJECTS_CACHE_MAX_AGE
      ) return null;
      return cached.value;
    } catch {
      return null;
    }
  }

  function writeProjectsCache(projects) {
    try {
      localStorage.setItem(PROJECTS_CACHE_KEY, JSON.stringify({
        savedAt: Date.now(),
        value: projects,
      }));
    } catch {
      // The live response still works when storage is unavailable or full.
    }
  }

  function getHttpUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return null;

    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch {
      return null;
    }
  }

  function normalizeCount(value) {
    const count = Number(value);
    return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  }

  function formatUpdatedTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    return {
      relative: formatRelativeTime(date),
      absolute: date.toLocaleString('en', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    };
  }

  function formatRelativeTime(date) {
    const units = [
      ['second', 60],
      ['minute', 60],
      ['hour', 24],
      ['day', 7],
      ['week', 4.34524],
      ['month', 12],
      ['year', Number.POSITIVE_INFINITY],
    ];
    let difference = (date.getTime() - Date.now()) / 1000;

    for (const [unit, threshold] of units) {
      if (Math.abs(difference) < threshold) {
        return relativeTime.format(Math.round(difference), unit);
      }
      difference /= threshold;
    }

    return relativeTime.format(0, 'second');
  }
})();
