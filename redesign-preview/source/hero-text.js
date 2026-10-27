(() => {
    'use strict';

    const text = document.querySelector('#home .hero-text');
    const home = document.getElementById('home');
    if (!text || !home) return;

    // Units are CSS pixels and a fixed 60 Hz physics step. No gravity or idle motion.
    const settings = {
        pointerRadius: 70,
        pointerStrength: 0.7,
        springStrength: 0.095,
        neighbourStrength: 0.045,
        damping: 0.78, // Velocity retained per step; higher means less damping.
        maxDisplacement: 3.5,
        maxRotation: 0.45 // Degrees; set to 0 to disable rotation.
    };
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const mouse = matchMedia('(hover: hover) and (pointer: fine)');
    const stepMs = 1000 / 60;
    let particles = [];
    let layer = null;
    let frame = 0;
    let lastTime = 0;
    let accumulator = 0;
    let pointer = null;
    let enabled = false;
    let listeners = null;
    let resize = null;

    const reset = () => {
        cancelAnimationFrame(frame);
        frame = 0;
        lastTime = 0;
        accumulator = 0;
        pointer = null;
        text.classList.remove('is-interacting');
        layer?.remove();
        layer = null;
        particles = [];
    };

    const measure = () => {
        // Measure the unchanged text nodes, never a guessed font width or line break.
        const bounds = text.getBoundingClientRect();
        const style = getComputedStyle(text);
        const lineHeight = parseFloat(style.lineHeight);
        const source = text.textContent;
        const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        const boxes = [];
        while (walker.nextNode()) {
            const node = walker.currentNode;
            for (const word of node.data.matchAll(/\S+/gu)) {
                range.setStart(node, word.index);
                range.setEnd(node, word.index + word[0].length);
                // A hyphenated word may span lines; keep each fragment on its line.
                for (const rect of range.getClientRects()) {
                    if (rect.width > 0) boxes.push({
                        x: rect.left - bounds.left,
                        y: rect.top - bounds.top + (rect.height - lineHeight) / 2,
                        width: rect.width,
                        height: lineHeight
                    });
                }
            }
        }
        layer = document.createElement('span');
        layer.className = 'hero-text-layer';
        layer.setAttribute('aria-hidden', 'true');
        layer.style.color = style.color;
        const fragment = document.createDocumentFragment();
        particles = boxes.map(box => {
            const element = document.createElement('span');
            element.className = 'hero-text-particle';
            // A small ink allowance fits inside the existing spaces between words.
            const left = box.x - 0.5;
            element.style.cssText = `left:${left}px;top:${box.y}px;width:${box.width + 1}px;height:${box.height}px`;
            const copy = document.createElement('span');
            copy.className = 'hero-text-copy';
            copy.style.cssText = `left:${-left}px;top:${-box.y}px;width:${bounds.width}px`;
            copy.textContent = source;
            element.append(copy);
            fragment.append(element);
            return { element, cx: box.x + box.width / 2, cy: box.y + box.height / 2,
                halfWidth: box.width / 2, x: 0, y: 0, vx: 0, vy: 0, neighbours: [] };
        });
        particles.forEach((p, i) => {
            // Couple nearby words on the same/adjacent lines, never distant line ends.
            particles.forEach((q, j) => {
                if (i !== j && Math.hypot(p.cx - q.cx, p.cy - q.cy) < lineHeight * 2.5) {
                    p.neighbours.push(j);
                }
            });
        });
        layer.append(fragment);
        text.append(layer);
        text.classList.add('is-interacting');
    };

    const simulate = () => {
        // Read all old positions before integrating, so coupling is order-independent.
        const forces = particles.map(p => {
            let fx = -p.x * settings.springStrength;
            let fy = -p.y * settings.springStrength;
            for (const index of p.neighbours) {
                const q = particles[index];
                fx += (q.x - p.x) * settings.neighbourStrength / p.neighbours.length;
                fy += (q.y - p.y) * settings.neighbourStrength / p.neighbours.length;
            }
            if (pointer) {
                const dx = p.cx + p.x - pointer.x;
                const dy = p.cy + p.y - pointer.y;
                const distance = Math.hypot(dx, dy);
                const edgeDistance = Math.hypot(Math.max(0, Math.abs(dx) - p.halfWidth), dy);
                const falloff = Math.max(0, 1 - edgeDistance / settings.pointerRadius);
                const force = settings.pointerStrength * falloff * falloff;
                fx += (distance > 0.01 ? dx / distance : 0) * force;
                fy += (distance > 0.01 ? dy / distance : -1) * force;
            }
            return { fx, fy };
        });
        let moving = false;
        particles.forEach((p, i) => {
            p.vx = (p.vx + forces[i].fx) * settings.damping;
            p.vy = (p.vy + forces[i].fy) * settings.damping;
            const oldX = p.x;
            const oldY = p.y;
            p.x += p.vx;
            p.y += p.vy;
            const distance = Math.hypot(p.x, p.y);
            if (distance > settings.maxDisplacement) {
                p.x *= settings.maxDisplacement / distance;
                p.y *= settings.maxDisplacement / distance;
                p.vx = p.x - oldX;
                p.vy = p.y - oldY;
            }
            if (Math.hypot(p.x - oldX, p.y - oldY) > 0.008 ||
                (!pointer && Math.hypot(p.x, p.y) > 0.015)) moving = true;
        });
        return moving;
    };

    const tick = time => {
        frame = 0;
        if (!enabled || document.hidden) { reset(); return; }
        accumulator += lastTime ? Math.min(time - lastTime, 50) : stepMs;
        lastTime = time;
        let moving = true;
        while (accumulator >= stepMs) {
            moving = simulate();
            accumulator -= stepMs;
        }
        for (const p of particles) {
            const angle = p.y / settings.maxDisplacement * settings.maxRotation;
            p.element.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${angle}deg)`;
        }
        if (moving) frame = requestAnimationFrame(tick);
        else if (!pointer) reset(); // Restore the exact original native rendering.
        else lastTime = 0; // Stationary pointer at equilibrium needs no animation loop.
    };
    const wake = () => {
        if (!frame && layer) frame = requestAnimationFrame(tick);
    };
    const leave = () => { pointer = null; wake(); };
    const move = event => {
        if (event.pointerType !== 'mouse' || event.buttons || document.hidden ||
            document.documentElement.classList.contains('intro-active') ||
            !window.getSelection()?.isCollapsed) { reset(); return; }
        // Do not replace the paragraph during its existing entrance animation.
        if (text.getAnimations().some(animation => animation.playState === 'running')) return;
        const rect = text.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const radius = settings.pointerRadius;
        if (x < -radius || x > rect.width + radius || y < -radius || y > rect.height + radius) {
            leave();
            return;
        }
        if (!layer) measure();
        pointer = { x, y };
        wake();
    };

    const disable = () => {
        enabled = false;
        listeners?.abort();
        listeners = null;
        resize?.disconnect();
        resize = null;
        reset();
        text.classList.remove('hero-text-physics');
    };
    const configure = () => {
        disable();
        if (motion.matches || !mouse.matches) return;
        enabled = true;
        text.classList.add('hero-text-physics');
        listeners = new AbortController();
        const options = { signal: listeners.signal, passive: true };
        home.addEventListener('pointermove', move, options);
        home.addEventListener('pointerleave', leave, options);
        home.addEventListener('pointerdown', reset, options); // Native text selection wins.
        window.addEventListener('blur', reset, options);
        window.addEventListener('scroll', reset, options);
        window.addEventListener('resize', reset, options);
        document.addEventListener('visibilitychange', reset, options);
        document.fonts?.addEventListener('loadingdone', reset, options);
        resize = new ResizeObserver(reset);
        resize.observe(text);
    };
    motion.addEventListener('change', configure);
    mouse.addEventListener('change', configure);
    window.addEventListener('pagehide', () => {
        disable();
        motion.removeEventListener('change', configure);
        mouse.removeEventListener('change', configure);
    });
    window.addEventListener('pageshow', event => {
        if (!event.persisted) return;
        motion.addEventListener('change', configure);
        mouse.addEventListener('change', configure);
        configure();
    });
    configure();
})();
