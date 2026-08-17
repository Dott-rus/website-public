(function () {
    if (typeof window === 'undefined') return;

    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    // Optional: set window.__birthdayConfig = { month: 7, day: 3, text: 'Happy Birthday!' }
    const DEFAULT_BIRTHDAY = { month: 0, day: 1, text: 'Happy Birthday!' };
    const rawBirthday = (window.__birthdayConfig && typeof window.__birthdayConfig === 'object') ? window.__birthdayConfig : {};
    const birthdayMonthInput = Number.isFinite(rawBirthday.month) ? rawBirthday.month : DEFAULT_BIRTHDAY.month;
    const normalizedMonth = (birthdayMonthInput >= 1 && birthdayMonthInput <= 12)
        ? birthdayMonthInput - 1
        : birthdayMonthInput;
    const birthdayMonth = Math.min(11, Math.max(0, Math.round(normalizedMonth)));
    const birthdayDayInput = Number.isFinite(rawBirthday.day) ? rawBirthday.day : DEFAULT_BIRTHDAY.day;
    const birthdayDay = Math.min(31, Math.max(1, Math.round(birthdayDayInput)));
    const birthdayText = (typeof rawBirthday.text === 'string' && rawBirthday.text.trim())
        ? rawBirthday.text
        : DEFAULT_BIRTHDAY.text;
    const BIRTHDAY = { month: birthdayMonth, day: birthdayDay, text: birthdayText };

    // ========================================
    // WEATHER EFFECTS (AUTUMN/WINTER)
    // ========================================

    const WeatherEffects = (function () {
        let currentEffect = 'autumn';
        let effectEnabled = false;
        let effectGeneration = 0;
        let effectInterval = null;
        let snowScriptPromise = null;
        const pendingParticleTimeouts = new Set();
        const particleCleanupTimeouts = new Set();

        const config = {
            autumn: {
                emojis: ['🍂', '🍁'],
                spawnRate: 400,
                minSize: 12,
                maxSize: 22,
                minDuration: 6,
                maxDuration: 10,
                className: 'leaf',
                themeClass: 'autumn-theme',
            },
            winter: {
                themeClass: 'winter-theme',
            },
            spring: {
                emojis: ['🌸', '💮', '🌼'],
                spawnRate: 450,
                minSize: 12,
                maxSize: 20,
                minDuration: 7,
                maxDuration: 12,
                className: 'petal',
                themeClass: 'spring-theme',
            },
            summer: {
                spawnRate: 500,
                minSize: 6,
                maxSize: 14,
                minDuration: 6,
                maxDuration: 10,
                className: 'sun-spark',
                themeClass: 'summer-theme',
            },
        };

        function createEmojiParticle(type) {
            const cfg = config[type];
            const el = document.createElement('div');
            el.className = cfg.className;
            el.textContent = cfg.emojis[Math.floor(Math.random() * cfg.emojis.length)];
            el.style.left = Math.random() * 100 + 'vw';
            el.style.top = '-50px';
            el.style.fontSize = (cfg.minSize + Math.random() * (cfg.maxSize - cfg.minSize)) + 'px';
            el.style.animationDuration = (cfg.minDuration + Math.random() * (cfg.maxDuration - cfg.minDuration)) + 's';
            document.body.appendChild(el);
            scheduleParticleRemoval(el, 15000);
        }

        function createSunSpark() {
            const cfg = config.summer;
            const spark = document.createElement('div');
            spark.className = cfg.className;
            spark.style.left = Math.random() * 100 + 'vw';
            spark.style.top = 105 + Math.random() * 20 + 'vh';
            const size = cfg.minSize + Math.random() * (cfg.maxSize - cfg.minSize);
            spark.style.width = size + 'px';
            spark.style.height = size + 'px';
            spark.style.animationDuration = (cfg.minDuration + Math.random() * (cfg.maxDuration - cfg.minDuration)) + 's';
            spark.style.setProperty('--drift', (Math.random() * 60 - 30) + 'px');
            document.body.appendChild(spark);
            scheduleParticleRemoval(spark, 15000);
        }

        function scheduleParticleRemoval(element, delay) {
            const timer = setTimeout(() => {
                particleCleanupTimeouts.delete(timer);
                element.remove();
            }, delay);
            particleCleanupTimeouts.add(timer);
        }

        function stopEmojiParticles() {
            if (effectInterval) {
                clearInterval(effectInterval);
                effectInterval = null;
            }
            pendingParticleTimeouts.forEach((timer) => clearTimeout(timer));
            pendingParticleTimeouts.clear();
            particleCleanupTimeouts.forEach((timer) => clearTimeout(timer));
            particleCleanupTimeouts.clear();
            document.querySelectorAll('.leaf, .petal, .sun-spark').forEach((el) => el.remove());
        }

        function scheduleInitialParticle(callback, delay) {
            const timer = setTimeout(() => {
                pendingParticleTimeouts.delete(timer);
                if (!document.hidden) callback();
            }, delay);
            pendingParticleTimeouts.add(timer);
        }

        function startEmojiParticles(type) {
            for (let i = 0; i < 8; i++) {
                scheduleInitialParticle(() => createEmojiParticle(type), i * 80);
            }
            effectInterval = setInterval(() => createEmojiParticle(type), config[type].spawnRate);
        }

        function startSunSparks() {
            for (let i = 0; i < 10; i++) {
                scheduleInitialParticle(createSunSpark, i * 60);
            }
            effectInterval = setInterval(createSunSpark, config.summer.spawnRate);
        }

        function stopCanvasSnow() {
            if (window.__snow && typeof window.__snow.stop === 'function') {
                window.__snow.stop();
            }
        }

        function loadCanvasSnow() {
            if (window.__snow) return Promise.resolve(window.__snow);
            if (snowScriptPromise) return snowScriptPromise;

            snowScriptPromise = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = '/timed-event/snow.js';
                script.async = true;
                script.dataset.seasonalSnow = '';
                script.addEventListener('load', () => resolve(window.__snow || null), { once: true });
                script.addEventListener('error', () => {
                    script.remove();
                    reject(new Error('Failed to load snowfall'));
                }, { once: true });
                document.head.appendChild(script);
            }).catch(() => {
                snowScriptPromise = null;
                return null;
            });

            return snowScriptPromise;
        }

        function startCanvasSnow(generation) {
            if (document.hidden) return;
            loadCanvasSnow().then((snow) => {
                if (
                    snow
                    && effectEnabled
                    && generation === effectGeneration
                    && currentEffect === 'winter'
                    && !document.hidden
                    && typeof snow.start === 'function'
                ) {
                    snow.start();
                }
            });
        }

        function startEffect(type) {
            currentEffect = type;
            effectEnabled = true;
            effectGeneration++;
            const generation = effectGeneration;
            stopEmojiParticles();
            stopCanvasSnow();
            if (document.hidden) return;
            if (type === 'winter') {
                startCanvasSnow(generation);
                return;
            }
            if (type === 'summer') {
                startSunSparks();
                return;
            }
            startEmojiParticles(type);
        }

        function pauseEffect() {
            effectGeneration++;
            stopEmojiParticles();
            stopCanvasSnow();
        }

        function resumeEffect() {
            if (effectEnabled) startEffect(currentEffect);
        }

        function setEffect(type) {
            if (!config[type]) return;
            document.body.classList.remove(
                config.autumn.themeClass,
                config.winter.themeClass,
                config.spring.themeClass,
                config.summer.themeClass
            );
            document.body.classList.add(config[type].themeClass);
            startEffect(type);
        }

        function getSeasonForDate(date) {
            const month = date.getMonth();
            if (month >= 2 && month <= 4) return 'spring';
            if (month >= 5 && month <= 7) return 'summer';
            if (month >= 8 && month <= 10) return 'autumn';
            return 'winter';
        }

        return {
            start: () => setEffect(getSeasonForDate(new Date())),
            pause: pauseEffect,
            resume: resumeEffect,
            setEffect: setEffect,
        };
    })();

    // ========================================
    // SEASON ANIMATIONS (SPECIAL DATES)
    // ========================================

    const SEASON_EVENT_CONFIG = {
        autumn: {
            month: 8,
            day: 1,
            storageKey: 'september1_animation_played',
            hero: { text: '🍁' },
            trail: {
                className: 'trail-element',
                sizeMode: 'font',
                content: ['🍂', '🍁'],
                positions: [
                    { delay: 300, left: '10%', bottom: '20%', size: 35 },
                    { delay: 500, left: '20%', bottom: '35%', size: 45 },
                    { delay: 700, left: '30%', bottom: '45%', size: 40 },
                    { delay: 900, left: '40%', bottom: '50%', size: 50 },
                    { delay: 1100, left: '50%', bottom: '52%', size: 45 },
                    { delay: 1300, left: '60%', bottom: '54%', size: 40 },
                    { delay: 1500, left: '70%', bottom: '48%', size: 35 },
                ],
            },
            text: {
                heading: '🍂 September 1st! 🍁',
                subtitle: 'Happy Knowledge Day!',
            },
            burst: {
                kind: 'emoji-rain',
                className: 'rain-element',
                content: ['🍂', '🍁'],
                delay: 2500,
                count: 50,
                stagger: 60,
                lifetime: 4000,
                minSize: 20,
                maxSize: 50,
                minDuration: 2,
                maxDuration: 4,
            },
            cleanupDelay: 6000,
        },
        winter: {
            month: 0,
            day: 1,
            storageKey: 'newyear_animation_played',
            hero: { childClass: 'hero-snowflake' },
            trail: {
                className: 'trail-element trail-snowflake',
                sizeMode: 'box',
                positions: [
                    { delay: 300, left: '10%', bottom: '20%', size: 25 },
                    { delay: 500, left: '20%', bottom: '35%', size: 35 },
                    { delay: 700, left: '30%', bottom: '45%', size: 30 },
                    { delay: 900, left: '40%', bottom: '50%', size: 40 },
                    { delay: 1100, left: '50%', bottom: '52%', size: 35 },
                    { delay: 1300, left: '60%', bottom: '54%', size: 30 },
                    { delay: 1500, left: '70%', bottom: '48%', size: 25 },
                ],
            },
            text: {
                heading: '❄️ Happy New Year! ❄️',
                subtitle: () => `🎄 ${new Date().getFullYear()} 🎄`,
            },
            burst: {
                kind: 'snow-rain',
                className: 'rain-element rain-snowflake',
                delay: 2500,
                count: 70,
                stagger: 40,
                lifetime: 4000,
                minSize: 8,
                maxSize: 28,
                minDuration: 2,
                maxDuration: 4,
            },
            cleanupDelay: 6000,
        },
        summer: {
            month: 5,
            day: 1,
            storageKey: 'june1_animation_played',
            hero: { childClass: 'hero-sun' },
            trail: {
                className: 'trail-element trail-spark',
                sizeMode: 'box',
                positions: [
                    { delay: 250, left: '15%', bottom: '18%', size: 18 },
                    { delay: 450, left: '28%', bottom: '32%', size: 22 },
                    { delay: 650, left: '40%', bottom: '44%', size: 20 },
                    { delay: 850, left: '52%', bottom: '50%', size: 26 },
                    { delay: 1050, left: '64%', bottom: '52%', size: 22 },
                    { delay: 1250, left: '76%', bottom: '48%', size: 18 },
                ],
            },
            text: {
                heading: '☀️ June 1st! ☀️',
                subtitle: 'Summer is here!',
            },
            burst: {
                kind: 'spark-rise',
                className: 'spark-element',
                delay: 2200,
                count: 60,
                stagger: 50,
                lifetime: 5000,
                minSize: 6,
                maxSize: 22,
                minDuration: 2.5,
                maxDuration: 5,
            },
            cleanupDelay: 6000,
        },
    };
    const BIRTHDAY_STORAGE_KEY = 'birthday_animation_played';

    const SeasonAnimations = (function () {
        const animationTimers = new Set();
        const transientSelector = [
            '.fullscreen-overlay',
            '.hero-element',
            '.trail-element',
            '.event-text',
            '.rain-element',
            '.spark-element',
            '.confetti',
        ].join(', ');

        function scheduleAnimationStep(callback, delay) {
            const timer = setTimeout(() => {
                animationTimers.delete(timer);
                if (!document.hidden) callback();
            }, delay);
            animationTimers.add(timer);
            return timer;
        }

        function stopActiveAnimations() {
            animationTimers.forEach((timer) => clearTimeout(timer));
            animationTimers.clear();
            document.querySelectorAll(transientSelector).forEach((el) => el.remove());
        }

        function hasPlayed(key) {
            const stored = localStorage.getItem(key);
            if (!stored) return false;
            const data = JSON.parse(stored);
            return data.year === new Date().getFullYear() && data.played === true;
        }

        function markPlayed(key) {
            localStorage.setItem(
                key,
                JSON.stringify({
                    year: new Date().getFullYear(),
                    played: true,
                })
            );
        }

        function createOverlay(theme) {
            const overlay = document.createElement('div');
            overlay.className = `fullscreen-overlay ${theme}`;
            return overlay;
        }

        function createHero(theme, config) {
            const hero = document.createElement('div');
            hero.className = `hero-element ${theme}`;
            if (config.text) {
                hero.textContent = config.text;
            } else if (config.childClass) {
                const child = document.createElement('div');
                child.className = config.childClass;
                hero.appendChild(child);
            }
            return hero;
        }

        function createEventText(theme, config) {
            const text = document.createElement('div');
            text.className = `event-text ${theme}`;
            text.appendChild(document.createTextNode(config.heading));
            text.appendChild(document.createElement('br'));

            const subtitle = document.createElement('span');
            subtitle.className = 'event-text-subtitle';
            subtitle.textContent = typeof config.subtitle === 'function'
                ? config.subtitle()
                : config.subtitle;
            text.appendChild(subtitle);
            return text;
        }

        function appendTracked(element, elementsToRemove) {
            document.body.appendChild(element);
            elementsToRemove.push(element);
            return element;
        }

        function randomBetween(min, max) {
            return min + Math.random() * (max - min);
        }

        function randomItem(items) {
            return items[Math.floor(Math.random() * items.length)];
        }

        function setParticleSize(element, size, mode) {
            if (mode === 'font') {
                element.style.fontSize = size + 'px';
                return;
            }
            element.style.width = size + 'px';
            element.style.height = size + 'px';
        }

        function createTrail(config, position) {
            const trail = document.createElement('div');
            trail.className = config.className;
            if (config.content) {
                trail.textContent = randomItem(config.content);
            }
            trail.style.left = position.left;
            trail.style.bottom = position.bottom;
            setParticleSize(trail, position.size, config.sizeMode);
            return trail;
        }

        function createBurstParticle(config) {
            const particle = document.createElement('div');
            particle.className = config.className;

            if (config.kind === 'emoji-rain') {
                particle.textContent = randomItem(config.content);
                particle.style.left = Math.random() * 100 + 'vw';
                particle.style.fontSize = randomBetween(config.minSize, config.maxSize) + 'px';
                particle.style.animationDuration = randomBetween(config.minDuration, config.maxDuration) + 's';
                return particle;
            }

            const size = randomBetween(config.minSize, config.maxSize);
            setParticleSize(particle, size, 'box');
            particle.style.left = Math.random() * 100 + 'vw';

            if (config.kind === 'snow-rain') {
                particle.style.animationDuration = randomBetween(config.minDuration, config.maxDuration) + 's';
                return particle;
            }

            particle.style.bottom = '-40px';
            particle.style.animationDuration = randomBetween(config.minDuration, config.maxDuration) + 's';
            particle.style.setProperty('--drift', (Math.random() * 60 - 30) + 'px');
            return particle;
        }

        function spawnBurst(config) {
            for (let i = 0; i < config.count; i++) {
                scheduleAnimationStep(() => {
                    const particle = createBurstParticle(config);
                    document.body.appendChild(particle);
                    scheduleAnimationStep(() => particle.remove(), config.lifetime);
                }, i * config.stagger);
            }
        }

        function triggerSeason(type) {
            const config = SEASON_EVENT_CONFIG[type];
            if (!config) return;

            stopActiveAnimations();
            WeatherEffects.setEffect(type);
            const elementsToRemove = [];

            appendTracked(createOverlay(type), elementsToRemove);
            appendTracked(createHero(type, config.hero), elementsToRemove);

            config.trail.positions.forEach((position) => {
                scheduleAnimationStep(() => {
                    appendTracked(createTrail(config.trail, position), elementsToRemove);
                }, position.delay);
            });

            appendTracked(createEventText(type, config.text), elementsToRemove);
            scheduleAnimationStep(() => spawnBurst(config.burst), config.burst.delay);
            scheduleAnimationStep(() => {
                elementsToRemove.forEach((element) => {
                    if (element.parentNode) element.remove();
                });
            }, config.cleanupDelay);
        }

        function triggerBirthday() {
            stopActiveAnimations();
            const elementsToRemove = [];
            appendTracked(createOverlay('birthday'), elementsToRemove);

            const text = document.createElement('div');
            text.className = 'event-text birthday';
            text.textContent = BIRTHDAY.text;
            appendTracked(text, elementsToRemove);

            const colors = ['#ff4d6d', '#ffd166', '#06d6a0', '#4cc9f0', '#f72585', '#b5179e', '#f9c74f'];
            for (let i = 0; i < 140; i++) {
                scheduleAnimationStep(() => {
                    const confetti = document.createElement('div');
                    confetti.className = 'confetti';
                    const size = 6 + Math.random() * 8;
                    confetti.style.width = size + 'px';
                    confetti.style.height = (size * 0.6) + 'px';
                    confetti.style.left = Math.random() * 100 + 'vw';
                    confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
                    confetti.style.animationDuration = 3 + Math.random() * 3 + 's';
                    confetti.style.setProperty('--drift', (Math.random() * 200 - 100) + 'px');
                    confetti.style.setProperty('--spin', (Math.random() * 720 - 360) + 'deg');
                    document.body.appendChild(confetti);
                    scheduleAnimationStep(() => confetti.remove(), 7000);
                }, i * 20);
            }

            scheduleAnimationStep(() => {
                elementsToRemove.forEach((el) => el.parentNode && el.remove());
            }, 7000);
        }

        return {
            triggerSeason,
            triggerBirthday,
            hasPlayed,
            markPlayed,
            stop: stopActiveAnimations,
        };
    })();

    function isBirthdayMidnight(date) {
        if (date.getMonth() !== BIRTHDAY.month || date.getDate() !== BIRTHDAY.day) return false;
        // Allow a short window after midnight to avoid timer throttling misses.
        return date.getHours() === 0 && date.getMinutes() < 5;
    }

    function checkSpecialDates() {
        if (document.hidden) return;
        const now = new Date();
        const month = now.getMonth();
        const day = now.getDate();
        Object.entries(SEASON_EVENT_CONFIG).forEach(([type, config]) => {
            if (
                month === config.month
                && day === config.day
                && !SeasonAnimations.hasPlayed(config.storageKey)
            ) {
                SeasonAnimations.triggerSeason(type);
                SeasonAnimations.markPlayed(config.storageKey);
            }
        });

        if (
            isBirthdayMidnight(now)
            && !SeasonAnimations.hasPlayed(BIRTHDAY_STORAGE_KEY)
        ) {
            SeasonAnimations.triggerBirthday();
            SeasonAnimations.markPlayed(BIRTHDAY_STORAGE_KEY);
        }
    }

    let specialDateTimer = null;

    function clearSpecialDateTimer() {
        if (specialDateTimer !== null) {
            clearTimeout(specialDateTimer);
            specialDateTimer = null;
        }
    }

    function scheduleSpecialDateCheck() {
        clearSpecialDateTimer();
        if (document.hidden) return;

        const now = new Date();
        const nextDay = new Date(now);
        nextDay.setHours(24, 0, 0, 50);
        const delay = Math.max(1000, nextDay.getTime() - now.getTime());

        specialDateTimer = setTimeout(() => {
            specialDateTimer = null;
            checkSpecialDates();
            scheduleSpecialDateCheck();
        }, delay);
    }

    function handleVisibilityChange() {
        if (document.hidden) {
            clearSpecialDateTimer();
            WeatherEffects.pause();
            SeasonAnimations.stop();
            return;
        }

        WeatherEffects.resume();
        checkSpecialDates();
        scheduleSpecialDateCheck();
    }

    function init() {
        WeatherEffects.start();
        checkSpecialDates();
        scheduleSpecialDateCheck();
        document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    function boot() {
        if ('requestIdleCallback' in window) {
            requestIdleCallback(init, { timeout: 2000 });
            return;
        }
        setTimeout(init, 0);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();
