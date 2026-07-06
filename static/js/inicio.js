export function initInicio() {
    const btnToggleSub = document.getElementById('btn-toggle-sub');
    if (btnToggleSub) {
        btnToggleSub.onclick = (e) => {
            e.stopPropagation();
            toggleCardBSubmenu();
        };
    }
}

function toggleCardBSubmenu() {
    const submenu = document.getElementById('hacer-cotizacion-submenu');
    const arrow = document.getElementById('card-b-arrow');
    if (!submenu) return;
    if (submenu.classList.contains('max-h-0')) {
        submenu.classList.remove('max-h-0');
        submenu.classList.add('max-h-[300px]');
        if (arrow) arrow.classList.add('rotate-180');
    } else {
        submenu.classList.add('max-h-0');
        submenu.classList.remove('max-h-[300px]');
        if (arrow) arrow.classList.remove('rotate-180');
    }
}
