// ────────────────────────────────────────────────────────────────────────────
// HERO DEL INICIO
// Paisajes de fondo: se cruzan de a uno con opacidad baja detr\u00e1s del texto.
// Para usar fotos propias, reemplaz\u00e1 estas rutas por archivos de /assets.
// ────────────────────────────────────────────────────────────────────────────

const HERO_PAISAJES = [
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1920&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1506929562872-bb421503ef21?q=80&w=1920&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=1920&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1533105079780-92b9be482077?q=80&w=1920&auto=format&fit=crop'
];

const HERO_INTERVALO_MS = 9000;

let heroSlideTimer = null;

/**
 * Monta las capas de paisaje y las va cruzando.
 * Si una imagen no carga, el hero queda con su degradado: nunca se ve vac\u00edo.
 */
function initHeroBackgrounds() {
    const stack = document.getElementById('hero-bg-stack');
    if (!stack) return;

    clearInterval(heroSlideTimer);
    stack.innerHTML = '';

    const capas = HERO_PAISAJES.map((url, i) => {
        const capa = document.createElement('div');
        capa.className = 'hero-bg-layer';
        capa.style.backgroundImage = `url('${url}')`;
        if (i === 0) capa.classList.add('active');
        stack.appendChild(capa);
        return capa;
    });

    if (capas.length < 2) return;

    let actual = 0;
    heroSlideTimer = setInterval(() => {
        capas[actual].classList.remove('active');
        actual = (actual + 1) % capas.length;
        capas[actual].classList.add('active');
    }, HERO_INTERVALO_MS);
}

/**
 * Pastillas de actividad del agente, calculadas con las cotizaciones ya tra\u00eddas.
 */
function renderHeroStats({ total, esteMes, ultimoDestino }) {
    const cont = document.getElementById('hero-stats');
    if (!cont) return;

    const pills = [
        {
            label: total === 1 ? 'cotizaci\u00f3n armada' : 'cotizaciones armadas',
            value: String(total),
            icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
        },
        {
            label: 'este mes',
            value: String(esteMes),
            icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'
        }
    ];

    if (ultimoDestino) {
        pills.push({
            label: '\u00faltimo destino',
            value: ultimoDestino,
            icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z'
        });
    }

    cont.innerHTML = pills.map(p => `
        <div class="hero-stat inline-flex items-center gap-2.5 pl-3 pr-4 py-2 rounded-xl bg-white/[0.07] border border-white/10 backdrop-blur-sm">
            <svg class="w-3.5 h-3.5 text-white/40 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="${p.icon}" />
            </svg>
            <span class="text-sm font-black text-white max-w-[180px] truncate">${p.value}</span>
            <span class="text-[10px] font-bold uppercase tracking-wider text-white/40">${p.label}</span>
        </div>`).join('');
}

export async function initInicio() {
    const titleEl = document.getElementById('welcome-title');
    if (!titleEl) return;

    initHeroBackgrounds();

    // Capitalize Agent Name
    let rawUser = window.loggedInUser || localStorage.getItem('otg_agent_user');
    if (!rawUser || rawUser === 'Agente' || rawUser === 'guest' || rawUser === 'Invitado') {
        const payload = window.decodeTokenPayload ? window.decodeTokenPayload(window.authToken) : null;
        if (payload?.nombre && payload.nombre !== 'Agente') rawUser = payload.nombre;
        else if (payload?.username && payload.username !== 'Agente') rawUser = payload.username;
        else if (payload?.email) rawUser = payload.email.split('@')[0];
    }
    const username = (rawUser && rawUser !== 'guest' && rawUser !== 'Invitado') ? rawUser : "Agente";
    const agentName = username.charAt(0).toUpperCase() + username.slice(1);

    // Start loading quotes in parallel
    const quotesPromise = loadRecentQuotes();

    // Determine Franchise Name
    let franchiseName = "One Trip Giordano";
    let configPromise = Promise.resolve();
    if (window.userSucursalNombre) {
        franchiseName = `One Trip ${window.userSucursalNombre}`;
    } else if (window.agencyConfig && window.agencyConfig.nombre_agencia) {
        franchiseName = window.agencyConfig.nombre_agencia;
    } else {
        configPromise = fetch('/api/config', {
            headers: {
                'Authorization': `Bearer ${window.authToken || ''}`
            }
        }).then(res => res.ok ? res.json() : null)
          .then(config => {
              if (config) {
                  window.agencyConfig = config;
                  if (window.userSucursalNombre) {
                      franchiseName = `One Trip ${window.userSucursalNombre}`;
                  } else {
                      franchiseName = config.nombre_agencia || franchiseName;
                  }
              }
          }).catch(e => console.error("Error fetching config in initInicio:", e));
    }

    // Wait for both calculations to finish
    await Promise.all([quotesPromise, configPromise]);

    // Start Typewriter
    const text1 = `Hola, ${agentName} - `;
    const text2 = franchiseName;

    titleEl.innerHTML = ""; // Clear loader

    // Create inner span for the second part (finer font)
    const span = document.createElement('span');
    span.className = 'font-light text-white/50';

    let i = 0;
    let j = 0;
    const speed = 28; // ms per letter

    function typePart1() {
        if (i < text1.length) {
            titleEl.appendChild(document.createTextNode(text1.charAt(i)));
            i++;
            setTimeout(typePart1, speed);
        } else {
            titleEl.appendChild(span);
            typePart2();
        }
    }

    function typePart2() {
        if (j < text2.length) {
            span.appendChild(document.createTextNode(text2.charAt(j)));
            j++;
            setTimeout(typePart2, speed);
        }
    }

    typePart1();
}

async function loadRecentQuotes() {
    const recentSection = document.getElementById('inicio-recent-section');
    const container = document.getElementById('recent-quotes-container');
    if (!recentSection || !container) return;

    try {
        const [resQuotes, resBudgets] = await Promise.all([
            window.authenticatedFetch('/api/cotizaciones'),
            window.authenticatedFetch('/api/presupuestos')
        ]);

        if (!resQuotes.ok || !resBudgets.ok) throw new Error("Error al obtener los datos de cotizaciones.");

        const quotes = await resQuotes.json();
        const budgets = await resBudgets.json();

        const currentUser = (window.loggedInUser || '').toLowerCase();
        const currentUserId = (window.userId || '').toLowerCase();

        const isMine = (q) => {
            const name = (q.agente_nombre || q.agente_id || '').toLowerCase();
            const id = (q.agente_id || '').toLowerCase();
            if (currentUser && (name === currentUser || id === currentUser)) return true;
            if (currentUserId && (id === currentUserId || name === currentUserId)) return true;
            return false;
        };

        // Filter and sort detailed quotes (cotizaciones completas)
        const userQuotes = quotes
            .filter(isMine)
            .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

        // Filter and sort quick quotes (cotizaciones rapidas)
        const userBudgets = budgets
            .filter(isMine)
            .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

        const latestQuote = userQuotes[0] || null;
        const latestBudget = userBudgets[0] || null;

        // Resumen del hero con lo que ya tenemos en memoria
        const todas = [...userQuotes, ...userBudgets];
        const inicioDelMes = new Date();
        inicioDelMes.setDate(1);
        inicioDelMes.setHours(0, 0, 0, 0);
        const esteMes = todas.filter(q => new Date(q.created_at || 0) >= inicioDelMes).length;

        const masReciente = todas
            .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
        renderHeroStats({
            total: todas.length,
            esteMes,
            ultimoDestino: masReciente ? getDestino(masReciente) : ''
        });

        container.innerHTML = '';

        // Left Column: Latest Detailed Quote
        if (latestQuote) {
            container.appendChild(createQuoteCard(latestQuote, false));
        } else {
            container.appendChild(createPlaceholderCard('detailed'));
        }

        // Right Column: Latest Quick Quote
        if (latestBudget) {
            container.appendChild(createQuoteCard(latestBudget, true));
        } else {
            container.appendChild(createPlaceholderCard('quick'));
        }

    } catch (e) {
        console.error("Error loading recent quotes on hub page:", e);
    }
}

/** Destino de una cotizaci\u00f3n, sea completa o r\u00e1pida (va en su metadata). */
function getDestino(item) {
    if (item.destino) return item.destino;
    const meta = (item.hoteles || []).find(h => h && h.nombre === 'METADATA_PRESUPUESTO_RAPIDO');
    return (meta && meta.destino) ? meta.destino : '';
}

function createQuoteCard(item, isQuick) {
    const card = document.createElement('div');
    card.className = "inicio-card group cursor-pointer relative bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm hover:border-slate-300 flex items-center justify-between gap-6";

    if (isQuick) {
        card.onclick = () => {
            window.pendingEditQuickBudgetId = item.id;
            window.navigateTo('/cotizacion-rapida');
        };
    } else {
        card.onclick = () => {
            window.navigateTo('/ver-cotizacion?id=' + item.id);
        };
    }

    const iconHtml = isQuick
        ? `<div class="w-16 h-16 bg-gradient-to-br from-brand-primary/10 to-[#ff7f85]/5 rounded-2xl flex items-center justify-center text-brand-primary group-hover:scale-105 transition-transform duration-300 shrink-0 shadow-sm shadow-brand-primary/5">
             <svg class="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                 <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
             </svg>
           </div>`
        : `<div class="w-16 h-16 bg-gradient-to-br from-brand-accent/10 to-[#fabf8f]/5 rounded-2xl flex items-center justify-center text-brand-accent group-hover:scale-105 transition-transform duration-300 shrink-0 shadow-sm shadow-brand-accent/5">
             <svg class="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                 <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
             </svg>
           </div>`;

    const badgeHtml = isQuick
        ? `<span class="text-[10px] font-black uppercase tracking-wider text-brand-primary bg-rose-50 px-2.5 py-1 rounded-md">Rápida</span>`
        : `<span class="text-[10px] font-black uppercase tracking-wider text-brand-accent bg-orange-50 px-2.5 py-1 rounded-md">Completa</span>`;

    const title = isQuick ? item.pasajero_nombre : item.nombre_pax;

    const destination = getDestino(item) || 'Sin Destino';

    const total = isQuick ? item.total_cotizacion : item.costo_total;

    card.innerHTML = `
        <div class="flex items-center gap-5 min-w-0 flex-grow">
            ${iconHtml}
            <div class="space-y-1 min-w-0 flex-grow">
                <div class="flex items-center gap-2">
                    <h4 class="font-bold text-slate-800 truncate text-base leading-snug group-hover:text-brand-primary transition-colors duration-200">${title || 'Sin Nombre'}</h4>
                    ${badgeHtml}
                </div>
                <p class="text-slate-400 text-sm font-semibold truncate flex items-center gap-1.5">
                    <svg class="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    ${destination}
                </p>
            </div>
        </div>
        <div class="text-right shrink-0 flex flex-col items-end gap-1">
            <span class="text-base font-black text-slate-700">USD ${window.formatPriceES(total)}</span>
            <span class="text-[10px] font-semibold text-slate-400">${formatCreatedAt(item.created_at)}</span>
        </div>
    `;
    return card;
}

function createPlaceholderCard(type) {
    const card = document.createElement('div');
    card.className = "inicio-card group cursor-pointer bg-white/60 border border-dashed border-slate-200 rounded-3xl p-6 hover:border-slate-300 hover:bg-white flex flex-col items-center justify-center text-center gap-2 h-full min-h-[110px]";

    if (type === 'quick') {
        card.onclick = () => window.navigateTo('/cotizacion-rapida');
        card.innerHTML = `
            <div class="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 group-hover:scale-105 transition-transform duration-300">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
            </div>
            <h4 class="font-bold text-slate-700 text-xs">Sin cotización rápida reciente</h4>
            <p class="text-[10px] text-slate-400 font-semibold max-w-xs">Haz clic aquí para crear tu primera cotización rápida.</p>
        `;
    } else {
        card.onclick = () => window.navigateTo('/hacer-cotizacion');
        card.innerHTML = `
            <div class="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 group-hover:scale-105 transition-transform duration-300">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
            </div>
            <h4 class="font-bold text-slate-700 text-xs">Sin cotización completa reciente</h4>
            <p class="text-[10px] text-slate-400 font-semibold max-w-xs">Haz clic aquí para crear tu primera cotización detallada.</p>
        `;
    }
    return card;
}

function formatCreatedAt(isoStr) {
    if (!isoStr) return '-';
    try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return '-';

        const hh = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');

        const today = new Date();
        const todayYear = today.getFullYear();
        const todayMonth = today.getMonth();
        const todayDay = today.getDate();

        const targetYear = d.getFullYear();
        const targetMonth = d.getMonth();
        const targetDay = d.getDate();

        if (todayYear === targetYear && todayMonth === targetMonth && todayDay === targetDay) {
            return `Hoy, ${hh}:${min}`;
        }

        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        if (yesterday.getFullYear() === targetYear && yesterday.getMonth() === targetMonth && yesterday.getDate() === targetDay) {
            return `Ayer, ${hh}:${min}`;
        }

        const dd = String(targetDay).padStart(2, '0');
        const mm = String(targetMonth + 1).padStart(2, '0');
        const yyyy = targetYear;
        return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
    } catch (e) {
        return '-';
    }
}

export function initOpciones() {
    // No specific initialization script logic is required for static options links
}
