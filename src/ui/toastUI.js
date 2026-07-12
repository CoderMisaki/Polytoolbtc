let toastTimeout;

function toggleToast(show, msg, isError = false) { 
    const t = document.getElementById('sys-toast'); 
    if (!t) return; 
    if (msg) t.innerHTML = msg;
    t.classList.toggle('toast-error', !!isError);
    t.classList.toggle('toast-normal', !isError);
    t.classList.toggle('toast-visible', !!show); 
}

function showToast(msg, isError = false, duration = null) {
    if (toastTimeout) clearTimeout(toastTimeout); 
    toggleToast(true, msg, isError); 

    let time = duration;
    if (!time) {
        time = isError ? 5000 : 3000;
    }

    toastTimeout = setTimeout(() => { toggleToast(false); }, time);
}
