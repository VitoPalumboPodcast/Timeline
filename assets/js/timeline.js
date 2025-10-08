document.addEventListener('DOMContentLoaded', () => {
    const data = window.TIMELINE_DATA;
    if (!data) {
        console.error('TIMELINE_DATA is not defined.');
        return;
    }

    const state = {
        zoom: 1,
        minZoom: 0.35,
        maxZoom: 4,
        translate: 0,
        isPointerDown: false,
        pointerStartX: 0,
        translateStart: 0,
        timelineWidth: 0
    };

    const shell = document.querySelector('.timeline-shell');
    const wrapper = document.querySelector('.timeline-wrapper');
    const inner = document.querySelector('.timeline-inner');
    const mainLine = document.querySelector('.timeline-main');
    const zoomLevelEl = document.querySelector('.zoom-level');
    const zoomButtons = document.querySelectorAll('.zoom-btn');
    const minimap = document.querySelector('.minimap-track');
    const minimapViewport = document.querySelector('.minimap-viewport');
    const yearIndicator = document.querySelector('.year-indicator');
    const yearBadge = document.querySelector('.year-badge');
    const particlesLayer = document.querySelector('.bg-particles');

    if (!shell || !wrapper || !inner || !mainLine) {
        console.error('Missing timeline container elements.');
        return;
    }

    const parseDate = (value) => {
        const [year, month = '01', day = '01'] = value.split('-');
        const y = Number(year);
        const m = Number(month);
        const d = Number(day);
        return y + (m - 1) / 12 + (d - 1) / 365;
    };

    const allDates = [
        ...data.periods.flatMap((period) => [period.start, period.end]),
        ...data.events.map((event) => parseDate(event.date))
    ];
    const minYear = Math.floor(Math.min(...allDates));
    const maxYear = Math.ceil(Math.max(...allDates));
    const totalYears = maxYear - minYear;
    const basePixelsPerYear = 110;
    const baseWidth = totalYears * basePixelsPerYear;

    inner.style.width = `${baseWidth}px`;
    mainLine.style.width = `${baseWidth}px`;

    const laneOffsets = [-110, 90, -180, 200];
    const minimapLaneBase = 35;
    const minimapLaneSpacing = 15;
    const levelOffsets = { 1: 0, 2: -110, 3: -200 };

    const tickElements = [];

    const tickConfigs = [
        {
            maxZoom: 0.45,
            step: 100,
            majorStep: 100,
            formatLabel: (year) => {
                const century = Math.floor((year - 1) / 100) + 1;
                const romanNumerals = [
                    '', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
                    'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX',
                    'XX', 'XXI'
                ];
                const roman = romanNumerals[century] ?? century;
                return `${roman} secolo`;
            }
        },
        {
            maxZoom: 0.75,
            step: 50,
            majorStep: 50
        },
        {
            maxZoom: 1.2,
            step: 25,
            majorStep: 50
        },
        {
            maxZoom: 1.8,
            step: 10,
            majorStep: 20
        },
        {
            maxZoom: 2.6,
            step: 5,
            majorStep: 10
        },
        {
            maxZoom: Infinity,
            step: 1,
            majorStep: 5
        }
    ];

    const getCompactPeriodLabel = (name) => {
        const clean = name.replace(/\s+•\s+/g, ' · ').trim();
        return clean.length > 22 ? `${clean.slice(0, 22).trim()}…` : clean;
    };

    const addTicks = () => {
        for (let year = minYear; year <= maxYear; year++) {
            const tick = document.createElement('div');
            tick.className = 'timeline-tick';
            const position = ((year - minYear) / totalYears) * baseWidth;
            tick.style.left = `${position}px`;

            const label = document.createElement('div');
            label.className = 'timeline-tick-label';
            tick.appendChild(label);
            inner.appendChild(tick);

            tickElements.push({ tick, label, year });
        }
    };

    const updateTickDetail = () => {
        if (tickElements.length === 0) return;

        const config = tickConfigs.find((entry) => state.zoom < entry.maxZoom) || tickConfigs[tickConfigs.length - 1];
        const anchor = Math.ceil(minYear / config.step) * config.step;

        tickElements.forEach(({ tick, label, year }) => {
            const isFirstYear = year === minYear;
            const isLastYear = year === maxYear;
            const isAligned = year >= anchor && ((year - anchor) % config.step === 0);
            const visible = isFirstYear || isLastYear || isAligned;
            if (!visible) {
                tick.style.display = 'none';
                return;
            }

            tick.style.display = '';
            const majorStep = config.majorStep ?? config.step;
            const isMajor = year % majorStep === 0;
            tick.classList.toggle('major', isMajor);
            const formatter = (isFirstYear || isLastYear)
                ? ((value) => value)
                : (config.formatLabel ?? ((value) => value));
            label.textContent = `${formatter(year)}`;
        });
    };

    const addPeriods = () => {
        data.periods.forEach((period) => {
            const el = document.createElement('div');
            el.className = 'period';
            el.textContent = period.name;
            const start = ((period.start - minYear) / totalYears) * baseWidth;
            const width = ((period.end - period.start) / totalYears) * baseWidth;
            el.style.left = `${start}px`;
            el.style.width = `${width}px`;
            const laneOffset = laneOffsets[period.lane] ?? 0;
            el.style.top = `calc(50% + ${laneOffset}px)`;
            el.style.background = period.color;
            inner.appendChild(el);

            const mini = document.createElement('div');
            mini.className = 'minimap-period';
            mini.style.background = period.color;
            mini.style.left = `${(start / baseWidth) * 100}%`;
            mini.style.width = `${(width / baseWidth) * 100}%`;
            mini.style.top = `${minimapLaneBase + period.lane * minimapLaneSpacing}%`;
            minimap.appendChild(mini);

            const miniLabel = document.createElement('div');
            miniLabel.className = 'minimap-period-label';
            miniLabel.textContent = getCompactPeriodLabel(period.name);
            miniLabel.title = period.name;
            miniLabel.style.left = `${(start / baseWidth) * 100}%`;
            miniLabel.style.width = `${(width / baseWidth) * 100}%`;
            minimap.appendChild(miniLabel);
        });
    };

    const addEvents = () => {
        data.events.forEach((event) => {
            const el = document.createElement('div');
            el.className = 'event';
            el.dataset.level = event.level;
            const position = ((parseDate(event.date) - minYear) / totalYears) * baseWidth;
            el.style.left = `${position}px`;
            const levelOffset = levelOffsets[event.level] ?? 0;
            el.style.top = `calc(50% + ${levelOffset}px)`;

            const marker = document.createElement('div');
            marker.className = 'event-marker';
            el.appendChild(marker);

            const card = document.createElement('div');
            card.className = 'event-card';

            const date = document.createElement('div');
            date.className = 'event-date';
            date.textContent = new Intl.DateTimeFormat('it-IT', { year: 'numeric', month: 'short', day: 'numeric' }).format(
                new Date(event.date)
            );
            card.appendChild(date);

            const title = document.createElement('div');
            title.className = 'event-title';
            title.textContent = event.title;
            card.appendChild(title);

            const description = document.createElement('div');
            description.className = 'event-description';
            description.textContent = event.description;
            card.appendChild(description);

            if (event.image) {
                const img = document.createElement('img');
                img.src = event.image;
                img.alt = event.title;
                img.loading = 'lazy';
                img.className = 'event-image';
                card.appendChild(img);
            }

            el.appendChild(card);
            inner.appendChild(el);

            const mini = document.createElement('div');
            mini.className = 'minimap-event';
            mini.style.left = `${(position / baseWidth) * 100}%`;
            minimap.appendChild(mini);
        });
    };

    const addParticles = () => {
        const total = 42;
        for (let i = 0; i < total; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.left = `${Math.random() * 100}%`;
            particle.style.top = `${Math.random() * 100}%`;
            const size = 6 + Math.random() * 10;
            particle.style.width = `${size}px`;
            particle.style.height = `${size}px`;
            particle.style.animationDuration = `${14 + Math.random() * 10}s`;
            particle.style.animationDelay = `${Math.random() * 6}s`;
            particlesLayer.appendChild(particle);
        }
    };

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    const updateZoomLevel = () => {
        zoomLevelEl.textContent = `${Math.round(state.zoom * 100)}%`;
    };

    const updateDetailLevels = () => {
        inner.classList.remove('zoom-low', 'zoom-medium', 'zoom-high');
        if (state.zoom < 0.55) {
            inner.classList.add('zoom-low');
        } else if (state.zoom < 1.3) {
            inner.classList.add('zoom-medium');
        } else {
            inner.classList.add('zoom-high');
        }
        updateTickDetail();
    };

    const updateMinimap = () => {
        const scaledWidth = baseWidth * state.zoom;
        const ratio = shell.clientWidth / scaledWidth;
        const viewWidth = clamp(ratio, 0.05, 1);
        minimapViewport.style.width = `${viewWidth * 100}%`;
        const maxOffset = 1 - viewWidth;
        const available = Math.max(1, scaledWidth - shell.clientWidth);
        const offset = available === 0 ? 0 : clamp(-state.translate / available, 0, 1);
        minimapViewport.style.left = `${offset * maxOffset * 100}%`;
    };

    let yearTimeout;
    const showYearIndicator = () => {
        const centerPx = -state.translate + shell.clientWidth / 2;
        const centerRatio = clamp(centerPx / (baseWidth * state.zoom), 0, 1);
        const yearValue = minYear + centerRatio * totalYears;
        yearBadge.textContent = Math.round(yearValue);
        yearIndicator.classList.add('show');
        clearTimeout(yearTimeout);
        yearTimeout = setTimeout(() => yearIndicator.classList.remove('show'), 800);
    };

    const updateTransforms = () => {
        const scaledWidth = baseWidth * state.zoom;
        const containerWidth = shell.clientWidth;
        const availableSpace = containerWidth - scaledWidth;

        if (scaledWidth <= containerWidth) {
            state.translate = availableSpace / 2;
        } else {
            const minTranslate = availableSpace;
            state.translate = clamp(state.translate, minTranslate, 0);
        }

        wrapper.style.transform = `translateX(${state.translate}px)`;
        inner.style.transform = `translateY(-50%) scale(${state.zoom}, 1)`;
        const textScale = clamp(1 / state.zoom, 1, 2.3);
        inner.style.setProperty('--timeline-font-scale', textScale.toFixed(3));
        state.timelineWidth = scaledWidth;
        updateZoomLevel();
        updateDetailLevels();
        updateMinimap();
        showYearIndicator();
    };

    const zoomTo = (factor, originX) => {
        const previousZoom = state.zoom;
        state.zoom = clamp(state.zoom * factor, state.minZoom, state.maxZoom);
        const scaleChange = state.zoom / previousZoom;
        const rect = shell.getBoundingClientRect();
        const origin = originX !== undefined ? originX - rect.left : rect.width / 2;
        state.translate = origin - scaleChange * (origin - state.translate);
        updateTransforms();
    };

    zoomButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const direction = btn.dataset.action === 'in' ? 1 : -1;
            const factor = direction > 0 ? 1.25 : 0.8;
            zoomTo(factor);
        });
    });

    shell.addEventListener('wheel', (event) => {
        if (!event.ctrlKey) {
            event.preventDefault();
            const factor = event.deltaY > 0 ? 0.92 : 1.08;
            zoomTo(factor, event.clientX);
        }
    }, { passive: false });

    shell.addEventListener('pointerdown', (event) => {
        state.isPointerDown = true;
        state.pointerStartX = event.clientX;
        state.translateStart = state.translate;
        shell.classList.add('dragging');
        shell.setPointerCapture(event.pointerId);
    });

    const updateFromPointerMove = (event) => {
        if (!state.isPointerDown) return;
        const delta = event.clientX - state.pointerStartX;
        state.translate = state.translateStart + delta;
        updateTransforms();
    };

    const endPointer = (event) => {
        if (!state.isPointerDown) return;
        state.isPointerDown = false;
        shell.classList.remove('dragging');
        shell.releasePointerCapture(event.pointerId);
    };

    shell.addEventListener('pointermove', updateFromPointerMove);
    shell.addEventListener('pointerup', endPointer);
    shell.addEventListener('pointercancel', endPointer);

    const moveViewportToRatio = (ratio) => {
        const scaledWidth = baseWidth * state.zoom;
        if (scaledWidth <= shell.clientWidth) return;
        const maxTranslate = 0;
        const minTranslate = shell.clientWidth - scaledWidth;
        state.translate = clamp(-ratio * (scaledWidth - shell.clientWidth), minTranslate, maxTranslate);
        updateTransforms();
    };

    minimapViewport.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        const rect = minimap.getBoundingClientRect();
        const viewportRect = minimapViewport.getBoundingClientRect();
        const offsetWithin = event.clientX - viewportRect.left;

        const move = (clientX) => {
            const rawRatio = (clientX - rect.left - offsetWithin) / (rect.width - viewportRect.width);
            moveViewportToRatio(clamp(rawRatio, 0, 1));
        };

        const onPointerMove = (moveEvent) => move(moveEvent.clientX);
        const onPointerUp = () => {
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
        };

        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
    });

    minimap.addEventListener('pointerdown', (event) => {
        if (event.target === minimapViewport) return;
        const rect = minimap.getBoundingClientRect();
        const viewRatio = minimapViewport.offsetWidth / rect.width;
        const availableRatio = Math.max(0, 1 - viewRatio);
        const rawRatio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        const targetRatio = availableRatio === 0 ? 0 : clamp(rawRatio - viewRatio / 2, 0, availableRatio) / availableRatio;
        moveViewportToRatio(targetRatio);
    });

    window.addEventListener('resize', () => {
        updateTransforms();
    });

    const init = () => {
        addParticles();
        addTicks();
        addPeriods();
        addEvents();
        updateTickDetail();
        updateTransforms();
    };

    init();
});
