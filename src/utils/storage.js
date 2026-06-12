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
        if (typeof localStorage === 'undefined' || !localStorage) return;
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

function createSafeContentNode(content) {
    if (typeof Node !== 'undefined' && content instanceof Node) return content;
    if (content && typeof content === 'object' && !Array.isArray(content)) {
        const tag = /^[a-z][a-z0-9-]*$/i.test(content.tag || '') ? content.tag : 'span';
        const node = document.createElement(tag);
        if (content.className) node.className = String(content.className);
        if (content.text !== undefined) node.textContent = String(content.text);
        if (content.attrs && typeof content.attrs === 'object') {
            Object.entries(content.attrs).forEach(([key, value]) => {
                if (value === undefined || value === null) return;
                if (!/^[a-z_:][a-z0-9_:.\-]*$/i.test(key)) return;
                node.setAttribute(key, String(value));
            });
        }
        return node;
    }
    return document.createTextNode(String(content ?? ''));
}

function setSafeText(id, content, color, contentType = 'text') {
    const e = document.getElementById(id); 
    if (e) { 
        if (content !== undefined) {
            if (contentType === 'nodes') {
                const nodes = Array.isArray(content) ? content : [content];
                e.replaceChildren(...nodes.map(createSafeContentNode));
            } else if (contentType === 'html') {
                // Intentionally avoid innerHTML; callers must pass safe node descriptors instead.
                e.textContent = String(content ?? '');
            } else {
                e.textContent = String(content ?? '');
            }
        }
        if (color !== undefined) e.style.color = color; 
    } 
}

if (typeof window !== 'undefined') {
    window.safeStore = safeStore;
    window.escapeHTML = escapeHTML;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { safeLoad, safeStore, escapeHTML };
}
