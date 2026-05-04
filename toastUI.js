let toastTimeout;

function toggleToast(show, msg, isError = false) { 
    const t = document.getElementById('sys-toast'); 
    if (!t) return; 
    if (msg) t.innerText = msg; 
    t.style.background = isError ? 'rgba(248, 113, 113, 0.95)' : 'rgba(24, 24, 27, 0.95)'; 
    t.style.borderColor = isError ? '#ef4444' : '#3f3f46'; 
    t.style.display = show ? 'block' : 'none'; 
}

function showToast(msg, isError = false) { 
    if (toastTimeout) clearTimeout(toastTimeout); 
    toggleToast(true, msg, isError); 
    toastTimeout = setTimeout(() => { toggleToast(false); }, 2500); 
}