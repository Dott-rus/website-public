// Loads the left sidebar, the page-specific right sidebar, and the footer
// from one shared file.
document.addEventListener('DOMContentLoaded', async function () {
    const slots = Array.from(document.querySelectorAll('[data-layout]'));
    if (!slots.length) return;

    try {
        const response = await fetch('/components/layout.html');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const source = document.createElement('template');
        source.innerHTML = await response.text();

        slots.forEach(function (slot) {
            const componentName = slot.dataset.layout;
            const component = Array.from(
                source.content.querySelectorAll('template[data-layout]')
            ).find(function (candidate) {
                return candidate.dataset.layout === componentName;
            });

            if (!component) {
                console.error(`Layout component "${componentName}" was not found`);
                return;
            }

            slot.replaceChildren(component.content.cloneNode(true));
        });
    } catch (error) {
        console.error('Could not load shared layout:', error);
    }

    let navigationScript = document.querySelector('script[src="/js/navigation.js"]');
    if (!navigationScript) {
        navigationScript = document.createElement('script');
        navigationScript.src = '/js/navigation.js';
        navigationScript.addEventListener('load', function () {
            document.dispatchEvent(new Event('dott:layout-ready'));
        }, { once: true });
        document.body.appendChild(navigationScript);
    } else {
        document.dispatchEvent(new Event('dott:layout-ready'));
    }
});
