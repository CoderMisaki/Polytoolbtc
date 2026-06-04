let toastTimeout;

function toggleToast(show, msg, isError = false) { 
    const t = document.getElementById('sys-toast'); 
    if (!t) return; 
    if (msg) t.innerText = msg; 
    t.classList.toggle('toast-error', !!isError);
    t.classList.toggle('toast-normal', !isError);
    t.classList.toggle('toast-visible', !!show); 
}

function showToast(msg, isError = false) { 
    if (toastTimeout) clearTimeout(toastTimeout); 
    toggleToast(true, msg, isError); 
    toastTimeout = setTimeout(() => { toggleToast(false); }, 2500); 
}