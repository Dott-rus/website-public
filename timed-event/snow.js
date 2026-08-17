// Lightweight canvas snowfall. Creates #snow-canvas if missing.
(function () {
    if (typeof window === 'undefined') return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ID = 'snow-canvas';
    if (document.getElementById(ID)) return;

    const canvas = document.createElement('canvas');
    canvas.id = ID;
    canvas.style.display = 'none';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    let w = 0, h = 0, flakes = [], count = 0;

    function resize() {
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        w = window.innerWidth;
        h = window.innerHeight;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // adjust count relative to viewport area
        count = Math.min(200, Math.round((w * h) / 6000));
        initFlakes();
    }

    function rand(min, max) { return Math.random() * (max - min) + min; }

    function initFlakes() {
        flakes = [];
        for (let i = 0; i < count; i++) {
            flakes.push({
                x: rand(0, w),
                y: rand(-h, h),
                r: rand(0.6, 3.2),        // radius
                vx: rand(-0.3, 0.6),     // horizontal drift
                vy: rand(0.5, 2.0),      // vertical speed
                o: rand(0.4, 1.0),       // opacity
                swing: rand(0, Math.PI * 2),
                swingSpeed: rand(0.002, 0.01)
            });
        }
    }

    let last = performance.now();
    function frame(now) {
        if (document.hidden) {
            animationId = null;
            canvas.style.display = 'none';
            return;
        }

        const dt = Math.min(50, now - last);
        last = now;
        ctx.clearRect(0, 0, w, h);
        for (let f of flakes) {
            f.swing += f.swingSpeed * dt;
            f.x += f.vx + Math.sin(f.swing) * 0.3;
            f.y += f.vy;

            if (f.y - f.r > h) {
                f.y = rand(-10, -50);
                f.x = rand(0, w);
            }
            if (f.x < -50) f.x = w + 50;
            if (f.x > w + 50) f.x = -50;

            ctx.beginPath();
            ctx.fillStyle = `rgba(255,255,255,${f.o})`;
            ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
            ctx.fill();
        }
        animationId = requestAnimationFrame(frame);
    }

    let animationId = null;
    function start() {
        if (animationId == null && !document.hidden) {
            canvas.style.display = '';
            last = performance.now();
            animationId = requestAnimationFrame(frame);
        }
    }
    function stop() {
        if (animationId != null) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
        canvas.style.display = 'none';
    }

    window.addEventListener('resize', () => {
        resize();
    }, { passive: true });

    // init
    resize();

    // Expose simple control on window for debugging/toggle
    window.__snow = { start, stop };
})();
