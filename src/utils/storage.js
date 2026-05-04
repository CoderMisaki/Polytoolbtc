function safeLoad(key, fallback, version = null) { 
    try { 
        const v = localStorage.getItem(key); 
        if (v === null || v === undefined || v === "undefined") {
            return fallback; 
        }
        const parsed = JSON.parse(v); 
        if (version && parsed && typeof parsed === 'object' && parsed.__v && parsed.__v !== version) {
            return fallback;
        }
        if (parsed && typeof parsed === 'object' && Object.prototype.hasOwnProperty.call(parsed, 'data') && Object.prototype.hasOwnProperty.call(parsed, '__v')) {
            return parsed.data;
        }
        return parsed; 
    } catch (e) { 
        return fallback; 
    } 
}

function safeStore(key, value, version = null) {
    try {
        localStorage.setItem(key, JSON.stringify(version ? { __v: version, data: value } : value));
    } catch (e) {
        console.warn('safeStore failed', key, e);
    }
}

function escapeHTML(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function setSafeText(id, text, color, isHtml = false) { 
    const e = document.getElementById(id); 
    if (e) { 
        if (text !== undefined) {
            if (isHtml) {
                e.innerHTML = text;
            } else {
                e.textContent = text;
            }
        }
        if (color !== undefined) e.style.color = color; 
    } 
}

window.safeStore = safeStore;
window.escapeHTML = escapeHTML;
