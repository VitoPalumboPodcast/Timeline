document.addEventListener('DOMContentLoaded', () => {
    const data = window.TIMELINE_DATA;
    if (!data) {
        console.error('TIMELINE_DATA is not defined.');
        return;
    }

    const state = {
        zoom: 1,
        minZoom: 0.05,
        maxZoom: 4,
        translateX: 0,
        translateY: 0,
        isPointerDown: false,
        pointerStartX: 0,
        pointerStartY: 0,
        translateStartX: 0,
        translateStartY: 0,
        timelineWidth: 0,
        activePointers: new Map(),
        isPinchZooming: false,
        pinchStartDistance: 0,
        pinchStartZoom: 1,
        pinchCenterStart: 0,
        pinchTranslateStartX: 0,
        contentBounds: { top: 0, bottom: 0 }
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
    const themeToggle = document.querySelector('.theme-toggle');
    const rootElement = document.documentElement;
    const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
    const themeStorageKey = 'timeline-theme';

    const normalizeTheme = (value) => {
        if (value === 'light' || value === 'dark') {
            return value;
        }
        return null;
    };

    const updateToggleLabels = (theme) => {
        if (!themeToggle) return;
        const nextTheme = theme === 'light' ? 'dark' : 'light';
        const label = nextTheme === 'light' ? 'Attiva tema chiaro' : 'Attiva tema scuro';
        themeToggle.dataset.theme = theme;
        themeToggle.setAttribute('aria-label', label);
        themeToggle.setAttribute('aria-pressed', String(theme === 'light'));
        const srLabel = themeToggle.querySelector('.sr-only');
        if (srLabel) {
            srLabel.textContent = label;
        }
    };

    const applyTheme = (theme) => {
        const active = theme === 'light' ? 'light' : 'dark';
        if (active === 'light') {
            rootElement.setAttribute('data-theme', 'light');
        } else {
            rootElement.removeAttribute('data-theme');
        }
        updateToggleLabels(active);
    };

    let storedTheme = null;
    try {
        storedTheme = normalizeTheme(localStorage.getItem(themeStorageKey));
    } catch (error) {
        console.warn('Impossibile accedere alle preferenze del tema.', error);
    }

    let userPreference = storedTheme !== null;
    let activeTheme = userPreference
        ? storedTheme
        : (prefersDarkScheme.matches ? 'dark' : 'light');

    applyTheme(activeTheme);

    const handleSystemThemeChange = (event) => {
        if (userPreference) return;
        activeTheme = event.matches ? 'dark' : 'light';
        applyTheme(activeTheme);
    };

    if (typeof prefersDarkScheme.addEventListener === 'function') {
        prefersDarkScheme.addEventListener('change', handleSystemThemeChange);
    } else if (typeof prefersDarkScheme.addListener === 'function') {
        prefersDarkScheme.addListener(handleSystemThemeChange);
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            activeTheme = activeTheme === 'dark' ? 'light' : 'dark';
            userPreference = true;
            try {
                localStorage.setItem(themeStorageKey, activeTheme);
            } catch (error) {
                console.warn('Impossibile salvare la preferenza del tema.', error);
            }
            applyTheme(activeTheme);
        });
    }

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

    const TIMELINE_MIN_YEAR = 1800;
    const TIMELINE_MAX_YEAR = 2025;

    const allDates = [
        ...data.periods.flatMap((period) => [period.start, period.end]),
        ...data.events.map((event) => parseDate(event.date))
    ];
    const computedMinYear = Math.floor(Math.min(...allDates));
    const computedMaxYear = Math.ceil(Math.max(...allDates));
    const minYear = Math.min(computedMinYear, TIMELINE_MIN_YEAR);
    const maxYear = Math.max(computedMaxYear, TIMELINE_MAX_YEAR);
    const totalYears = maxYear - minYear;
    const basePixelsPerYear = 110;
    const baseWidth = totalYears * basePixelsPerYear;

    inner.style.width = `${baseWidth}px`;
    mainLine.style.width = `${baseWidth}px`;

    const laneOffsets = [-150, 120, -240, 260, -330, 360, -420];
    const computeLaneOffset = (lane) => {
        if (Number.isFinite(laneOffsets[lane])) {
            return laneOffsets[lane];
        }

        const direction = lane % 2 === 0 ? -1 : 1;
        const tier = Math.floor(lane / 2);
        const baseDistance = 150 + tier * 90;
        return direction * baseDistance;
    };
    const minimapLaneBase = 35;
    const minimapLaneSpacing = 15;
    const levelCardOffsets = { 1: 0, 2: 110, 3: 200 };

    const tickElements = [];
    const periodEntries = [];
    const eventEntries = [];
    let activePeriodEntry = null;
    let activeEventEntry = null;

    const closePeriodEntry = (entry, options = {}) => {
        if (!entry) return;
        const { focusMarker = false } = options;
        entry.element.classList.remove('period--active');
        entry.element.setAttribute('aria-expanded', 'false');
        entry.card.setAttribute('aria-hidden', 'true');
        entry.markers.forEach((marker) => marker.setAttribute('aria-pressed', 'false'));
        if (focusMarker && entry.markers[0]) {
            entry.markers[0].focus();
        }
        if (activePeriodEntry === entry) {
            activePeriodEntry = null;
        }
    };

    const openPeriodEntry = (entry) => {
        if (!entry) return;
        if (activePeriodEntry && activePeriodEntry !== entry) {
            closePeriodEntry(activePeriodEntry);
        }
        entry.element.classList.add('period--active');
        entry.element.setAttribute('aria-expanded', 'true');
        entry.card.setAttribute('aria-hidden', 'false');
        entry.markers.forEach((marker) => marker.setAttribute('aria-pressed', 'true'));
        activePeriodEntry = entry;
    };

    const togglePeriodEntry = (entry) => {
        if (!entry) return;
        if (activePeriodEntry === entry) {
            closePeriodEntry(entry);
        } else {
            openPeriodEntry(entry);
        }
    };

    const closeEventEntry = (entry) => {
        if (!entry) return;
        entry.element.classList.remove('event--active');
        entry.element.setAttribute('aria-expanded', 'false');
        entry.element.setAttribute('aria-pressed', 'false');
        entry.card.setAttribute('aria-hidden', 'true');
        if (activeEventEntry === entry) {
            activeEventEntry = null;
        }
    };

    const openEventEntry = (entry) => {
        if (!entry) return;
        if (activeEventEntry && activeEventEntry !== entry) {
            closeEventEntry(activeEventEntry);
        }
        entry.element.classList.add('event--active');
        entry.element.setAttribute('aria-expanded', 'true');
        entry.element.setAttribute('aria-pressed', 'true');
        entry.card.setAttribute('aria-hidden', 'false');
        activeEventEntry = entry;
    };

    const toggleEventEntry = (entry) => {
        if (!entry) return;
        if (activeEventEntry === entry) {
            closeEventEntry(entry);
        } else {
            openEventEntry(entry);
        }
    };

    const tickConfigs = [
        {
            maxZoom: 0.35,
            step: 50,
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
            maxZoom: 0.55,
            step: 25,
            majorStep: 50
        },
        {
            maxZoom: 0.9,
            step: 10,
            majorStep: 20
        },
        {
            maxZoom: 1.5,
            step: 5,
            majorStep: 10
        },
        {
            maxZoom: 2.3,
            step: 2,
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

    const layoutMinimapLabels = () => {
        if (!minimap) return;

        const labels = Array.from(minimap.querySelectorAll('.minimap-period-label'));
        if (!labels.length) return;

        labels.forEach((label) => {
            label.style.setProperty('--label-row', '0');
        });

        const labelData = labels
            .map((label) => {
                const rect = label.getBoundingClientRect();
                return { label, left: rect.left, right: rect.right };
            })
            .sort((a, b) => a.left - b.left);

        const rowEndings = [];
        const gap = 8;

        labelData.forEach(({ label, left, right }) => {
            let rowIndex = rowEndings.findIndex((end) => left >= end);
            if (rowIndex === -1) {
                rowIndex = rowEndings.length;
                rowEndings.push(right + gap);
            } else {
                rowEndings[rowIndex] = right + gap;
            }
            label.style.setProperty('--label-row', String(rowIndex));
        });
    };

    const addTicks = () => {
        for (let year = minYear; year <= maxYear; year++) {
            const tick = document.createElement('div');
            tick.className = 'timeline-tick';
            const position = ((year - minYear) / totalYears) * baseWidth;
            tick.style.left = `${position}px`;

            if (year === minYear) {
                tick.classList.add('timeline-tick-start');
            } else if (year === maxYear) {
                tick.classList.add('timeline-tick-end');
            }

            inner.appendChild(tick);

            const label = document.createElement('div');
            label.className = 'timeline-tick-label';
            label.style.left = `${position}px`;
            inner.appendChild(label);

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
                label.style.display = 'none';
                label.classList.remove('visible');
                return;
            }

            tick.style.display = '';
            const majorStep = config.majorStep ?? config.step;
            const isMajor = (year % majorStep === 0) || isFirstYear || isLastYear;
            tick.classList.toggle('major', isMajor);

            if (!isMajor) {
                label.style.display = 'none';
                label.classList.remove('visible');
                return;
            }

            if (isFirstYear || isLastYear) {
                label.textContent = String(year);
            } else if (typeof config.formatLabel === 'function') {
                label.textContent = config.formatLabel(year);
            } else {
                label.textContent = String(year);
            }

            label.style.display = '';
            label.classList.add('visible');
        });
    };

    const addPeriods = () => {
        data.periods.forEach((period, index) => {
            const el = document.createElement('div');
            el.className = 'period';
            el.setAttribute('tabindex', '0');
            el.setAttribute('aria-expanded', 'false');

            const content = document.createElement('div');
            content.className = 'period-content';

            const main = document.createElement('div');
            main.className = 'period-main';

            if (period.icon) {
                const iconWrapper = document.createElement('div');
                iconWrapper.className = 'period-icon-wrapper';

                const icon = document.createElement('img');
                icon.className = 'period-icon';
                icon.src = period.icon;
                icon.alt = period.iconAlt ?? period.name;
                icon.loading = 'lazy';
                icon.decoding = 'async';

                iconWrapper.appendChild(icon);
                main.appendChild(iconWrapper);
            }

            const label = document.createElement('span');
            label.className = 'period-name';
            label.textContent = period.name;
            main.appendChild(label);

            content.appendChild(main);

            el.appendChild(content);

            const card = document.createElement('div');
            card.className = 'period-card';
            const cardId = `period-card-${index}`;
            card.id = cardId;
            card.setAttribute('aria-hidden', 'true');

            if (period.icon) {
                const cardMedia = document.createElement('div');
                cardMedia.className = 'period-card-media';

                const cardImage = document.createElement('img');
                cardImage.className = 'period-card-image';
                cardImage.src = period.icon;
                cardImage.alt = period.iconAlt ?? period.name;
                cardImage.loading = 'lazy';
                cardImage.decoding = 'async';

                cardMedia.appendChild(cardImage);
                card.appendChild(cardMedia);
            }

            const range = document.createElement('div');
            range.className = 'period-range';
            range.textContent = `${period.start} – ${period.end}`;
            card.appendChild(range);

            const cardTitle = document.createElement('div');
            cardTitle.className = 'period-card-title';
            cardTitle.textContent = period.name;
            card.appendChild(cardTitle);

            if (period.description) {
                const description = document.createElement('div');
                description.className = 'period-card-description';
                description.textContent = period.description;
                card.appendChild(description);
            }

            el.appendChild(card);
            const start = ((period.start - minYear) / totalYears) * baseWidth;
            const width = ((period.end - period.start) / totalYears) * baseWidth;
            el.style.left = `${start}px`;
            el.style.width = `${width}px`;
            const laneOffset = computeLaneOffset(period.lane);
            el.style.top = `calc(50% + ${laneOffset}px)`;
            el.style.background = period.color;
            inner.appendChild(el);

            const entry = {
                element: el,
                card,
                markers: []
            };
            periodEntries.push(entry);

            el.addEventListener('click', (event) => {
                if (card.contains(event.target)) {
                    return;
                }
                togglePeriodEntry(entry);
            });

            el.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    togglePeriodEntry(entry);
                }
            });

            el.addEventListener('pointerdown', (event) => {
                event.stopPropagation();
            });

            const createBoundaryMarker = (year, variant) => {
                const marker = document.createElement('button');
                marker.type = 'button';
                marker.className = `period-boundary period-boundary--${variant}`;
                marker.style.left = `${((year - minYear) / totalYears) * baseWidth}px`;
                marker.setAttribute('aria-controls', cardId);
                marker.setAttribute('aria-pressed', 'false');
                const labelSuffix = variant === 'start' ? 'inizio' : 'fine';
                marker.setAttribute('aria-label', `${labelSuffix} di ${period.name}`);
                marker.dataset.periodIndex = String(index);
                entry.markers.push(marker);

                marker.addEventListener('pointerdown', (event) => {
                    event.stopPropagation();
                });

                marker.addEventListener('click', (event) => {
                    event.stopPropagation();
                    togglePeriodEntry(entry);
                });

                marker.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        togglePeriodEntry(entry);
                    }
                });

                mainLine.appendChild(marker);
            };

            createBoundaryMarker(period.start, 'start');
            if (period.end !== period.start) {
                createBoundaryMarker(period.end, 'end');
            }

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

        requestAnimationFrame(layoutMinimapLabels);
    };

    document.addEventListener('pointerdown', (event) => {
        if (activePeriodEntry) {
            const { element, markers } = activePeriodEntry;
            if (!element.contains(event.target) && !markers.some((marker) => marker.contains(event.target))) {
                closePeriodEntry(activePeriodEntry);
            }
        }

        if (activeEventEntry) {
            const { element, card } = activeEventEntry;
            if (!element.contains(event.target) && !card.contains(event.target)) {
                closeEventEntry(activeEventEntry);
            }
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            let handled = false;
            if (activeEventEntry) {
                closeEventEntry(activeEventEntry);
                handled = true;
            }
            if (activePeriodEntry) {
                closePeriodEntry(activePeriodEntry, { focusMarker: true });
                handled = true;
            }
            if (handled) {
                event.preventDefault();
            }
        }
    });

    const addEvents = () => {
        data.events.forEach((eventData, index) => {
            const el = document.createElement('button');
            el.type = 'button';
            el.className = 'event';
            el.dataset.level = eventData.level;
            el.setAttribute('aria-expanded', 'false');
            el.setAttribute('aria-pressed', 'false');
            const position = ((parseDate(eventData.date) - minYear) / totalYears) * baseWidth;
            el.style.left = `${position}px`;
            el.style.top = '50%';
            const cardOffset = levelCardOffsets[eventData.level] ?? 0;
            el.style.setProperty('--event-card-offset', `${cardOffset}px`);

            const marker = document.createElement('div');
            marker.className = 'event-marker';
            el.appendChild(marker);

            const card = document.createElement('div');
            card.className = 'event-card';
            const cardId = `event-card-${index}`;
            card.id = cardId;
            card.setAttribute('aria-hidden', 'true');

            const date = document.createElement('div');
            date.className = 'event-date';
            date.textContent = new Intl.DateTimeFormat('it-IT', { year: 'numeric', month: 'short', day: 'numeric' }).format(
                new Date(eventData.date)
            );
            card.appendChild(date);

            const title = document.createElement('div');
            title.className = 'event-title';
            title.textContent = eventData.title;
            card.appendChild(title);

            const description = document.createElement('div');
            description.className = 'event-description';
            description.textContent = eventData.description;
            card.appendChild(description);

            if (eventData.image) {
                const img = document.createElement('img');
                img.src = eventData.image;
                img.alt = eventData.title;
                img.loading = 'lazy';
                img.className = 'event-image';
                card.appendChild(img);
            }

            el.appendChild(card);
            inner.appendChild(el);

            el.setAttribute('aria-controls', cardId);

            const entry = { element: el, card };
            eventEntries.push(entry);

            el.addEventListener('click', (domEvent) => {
                if (card.contains(domEvent.target)) {
                    return;
                }
                toggleEventEntry(entry);
            });

            el.addEventListener('keydown', (domEvent) => {
                if (domEvent.key === 'Enter' || domEvent.key === ' ') {
                    domEvent.preventDefault();
                    toggleEventEntry(entry);
                }
            });

            el.addEventListener('pointerdown', (domEvent) => {
                domEvent.stopPropagation();
            });

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

    const measureContentBounds = () => {
        const elements = inner.querySelectorAll('.period, .event, .timeline-main');
        if (elements.length === 0) {
            return { top: 0, bottom: shell.clientHeight };
        }

        const wrapperRect = wrapper.getBoundingClientRect();
        let top = Infinity;
        let bottom = -Infinity;

        elements.forEach((element) => {
            const rect = element.getBoundingClientRect();
            top = Math.min(top, rect.top - wrapperRect.top);
            bottom = Math.max(bottom, rect.bottom - wrapperRect.top);
        });

        return { top, bottom };
    };

    const updateZoomLevel = () => {
        zoomLevelEl.textContent = `${Math.round(state.zoom * 100)}%`;
    };

    const computeTextScale = (zoom) => {
        if (zoom >= 1) {
            const compensated = Math.pow(zoom, -0.35);
            return clamp(compensated, 0.85, 1);
        }
        const compensated = 1 / zoom;
        return clamp(compensated, 1, 5);
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
        const offset = available === 0 ? 0 : clamp(-state.translateX / available, 0, 1);
        minimapViewport.style.left = `${offset * maxOffset * 100}%`;
    };

    let yearTimeout;
    const showYearIndicator = () => {
        const centerPx = -state.translateX + shell.clientWidth / 2;
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
            state.translateX = availableSpace / 2;
        } else {
            const minTranslateX = availableSpace;
            state.translateX = clamp(state.translateX, minTranslateX, 0);
        }

        const textScale = computeTextScale(state.zoom);
        inner.style.transform = `translateY(-50%) scale(${state.zoom}, 1)`;
        inner.style.setProperty('--timeline-font-scale', textScale.toFixed(3));
        inner.style.setProperty('--timeline-zoom', state.zoom.toFixed(3));
        inner.style.setProperty('--timeline-zoom-inverse', (1 / state.zoom).toFixed(3));

        updateDetailLevels();

        const bounds = measureContentBounds();
        state.contentBounds = bounds;
        const containerHeight = shell.clientHeight;
        const contentHeight = bounds.bottom - bounds.top;

        if (contentHeight <= containerHeight) {
            const centeredOffset = (containerHeight - contentHeight) / 2 - bounds.top;
            state.translateY = centeredOffset;
        } else {
            const maxTranslateY = -bounds.top;
            const minTranslateY = containerHeight - bounds.bottom;
            state.translateY = clamp(state.translateY, minTranslateY, maxTranslateY);
        }

        wrapper.style.transform = `translate(${state.translateX}px, ${state.translateY}px)`;
        state.timelineWidth = scaledWidth;
        updateZoomLevel();
        updateMinimap();
        showYearIndicator();
    };

    const zoomTo = (factor, originX) => {
        const previousZoom = state.zoom;
        state.zoom = clamp(state.zoom * factor, state.minZoom, state.maxZoom);
        const scaleChange = state.zoom / previousZoom;
        const rect = shell.getBoundingClientRect();
        const origin = originX !== undefined ? originX - rect.left : rect.width / 2;
        state.translateX = origin - scaleChange * (origin - state.translateX);
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

    const addActivePointer = (event) => {
        state.activePointers.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY
        });
    };

    const updateActivePointer = (event) => {
        const pointer = state.activePointers.get(event.pointerId);
        if (pointer) {
            pointer.x = event.clientX;
            pointer.y = event.clientY;
        }
    };

    const removeActivePointer = (event) => {
        state.activePointers.delete(event.pointerId);
    };

    const getPointerPair = () => {
        const iterator = state.activePointers.values();
        const first = iterator.next();
        const second = iterator.next();
        if (first.done || second.done) {
            return null;
        }
        return [first.value, second.value];
    };

    const startPinchZoom = () => {
        const pair = getPointerPair();
        if (!pair) return;
        const [first, second] = pair;
        state.isPinchZooming = true;
        state.isPointerDown = false;
        shell.classList.remove('dragging');
        state.pinchStartDistance = Math.hypot(
            second.x - first.x,
            second.y - first.y
        );
        if (state.pinchStartDistance === 0) {
            state.pinchStartDistance = 1;
        }
        state.pinchStartZoom = state.zoom;
        const rect = shell.getBoundingClientRect();
        state.pinchCenterStart = ((first.x + second.x) / 2) - rect.left;
        state.pinchTranslateStartX = state.translateX;
    };

    const updatePinchZoom = () => {
        const pair = getPointerPair();
        if (!pair) return;
        const [first, second] = pair;
        const distance = Math.hypot(
            second.x - first.x,
            second.y - first.y
        );
        if (distance === 0) return;
        let targetZoom = state.pinchStartZoom * (distance / state.pinchStartDistance);
        targetZoom = clamp(targetZoom, state.minZoom, state.maxZoom);
        const rect = shell.getBoundingClientRect();
        const center = ((first.x + second.x) / 2) - rect.left;
        const scale = targetZoom / state.pinchStartZoom;
        state.zoom = targetZoom;
        state.translateX = center - scale * (state.pinchCenterStart - state.pinchTranslateStartX);
        updateTransforms();
    };

    const endPinchZoom = () => {
        state.isPinchZooming = false;
        state.pinchStartDistance = 0;
    };

    shell.addEventListener('pointerdown', (event) => {
        addActivePointer(event);
        if (state.activePointers.size === 1) {
            state.isPointerDown = true;
            state.pointerStartX = event.clientX;
            state.pointerStartY = event.clientY;
            state.translateStartX = state.translateX;
            state.translateStartY = state.translateY;
            shell.classList.add('dragging');
        } else if (state.activePointers.size === 2) {
            startPinchZoom();
        }
        shell.setPointerCapture(event.pointerId);
    });

    const updateFromPointerMove = (event) => {
        if (state.isPinchZooming) {
            updateActivePointer(event);
            updatePinchZoom();
            return;
        }
        if (!state.isPointerDown) {
            updateActivePointer(event);
            return;
        }
        updateActivePointer(event);
        const deltaX = event.clientX - state.pointerStartX;
        const deltaY = event.clientY - state.pointerStartY;
        state.translateX = state.translateStartX + deltaX;
        state.translateY = state.translateStartY + deltaY;
        updateTransforms();
    };

    const endPointer = (event) => {
        updateActivePointer(event);
        removeActivePointer(event);
        if (state.isPinchZooming) {
            if (state.activePointers.size < 2) {
                endPinchZoom();
                if (state.activePointers.size === 1) {
                    const remaining = state.activePointers.values().next().value;
                    state.isPointerDown = true;
                    state.pointerStartX = remaining.x;
                    state.pointerStartY = remaining.y;
                    state.translateStartX = state.translateX;
                    state.translateStartY = state.translateY;
                    shell.classList.add('dragging');
                }
            }
        } else if (state.isPointerDown) {
            state.isPointerDown = false;
            shell.classList.remove('dragging');
        }
        if (state.activePointers.size === 0) {
            state.isPointerDown = false;
            shell.classList.remove('dragging');
        }
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
        state.translateX = clamp(-ratio * (scaledWidth - shell.clientWidth), minTranslate, maxTranslate);
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
        requestAnimationFrame(layoutMinimapLabels);
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
