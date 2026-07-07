export async function initInicio() {
    const titleEl = document.getElementById('welcome-title');
    if (!titleEl) return;
    
    // Capitalize Agent Name
    const username = window.loggedInUser || "Agente";
    const agentName = username.charAt(0).toUpperCase() + username.slice(1);
    
    // Determine Franchise Name
    let franchiseName = "One Trip Giordano";
    if (window.agencyConfig && window.agencyConfig.nombre_agencia) {
        franchiseName = window.agencyConfig.nombre_agencia;
    } else {
        try {
            const res = await fetch('/api/config', {
                headers: {
                    'Authorization': `Bearer ${window.authToken || ''}`
                }
            });
            if (res.ok) {
                const config = await res.json();
                window.agencyConfig = config;
                franchiseName = config.nombre_agencia || franchiseName;
            }
        } catch (e) {
            console.error("Error fetching config in initInicio:", e);
        }
    }
    
    // Start Typewriter
    const text1 = `Hola, ${agentName} - `;
    const text2 = franchiseName;
    
    titleEl.innerHTML = ""; // Clear loader
    
    // Create inner span for the second part (finer font)
    const span = document.createElement('span');
    span.className = 'font-light text-slate-500'; 
    
    let i = 0;
    let j = 0;
    const speed = 40; // ms per letter
    
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

export function initOpciones() {
    // No specific initialization script logic is required for static options links
}
