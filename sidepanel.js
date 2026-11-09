const OLLAMA_HOST = 'http://localhost:11434';
const DEFAULT_FALLBACK_MODEL = 'bonsai-2:27b';

const chatBox = document.getElementById('chat-box');
const emptyState = document.getElementById('empty-state');
const promptInput = document.getElementById('prompt-input');
const sendBtn = document.getElementById('send-btn');
const includePageCheckbox = document.getElementById('include-page');
const enableFormAgentCheckbox = document.getElementById('enable-form-agent');
const autoCloseDevCheckbox = document.getElementById('auto-close-dev');
const modelSelect = document.getElementById('model-select');
const refreshModelsBtn = document.getElementById('refresh-models-btn');
const clearChatBtn = document.getElementById('clear-chat-btn');
const statusDot = document.getElementById('status-dot');

// Dev / Debugger & Mode UI Elements
const devModeBar = document.getElementById('dev-mode-bar');
const devBadge = document.getElementById('dev-badge');
const toggleDevBtn = document.getElementById('toggle-dev-btn');
const showBadgesBtn = document.getElementById('show-badges-btn');
const modeAutoBtn = document.getElementById('mode-auto-btn');
const modeManualBtn = document.getElementById('mode-manual-btn');

let conversationHistory = [];
let abortController = null;
let attachedTabId = null;
let badgesVisible = false;
let executionMode = 'auto'; // 'auto' | 'manual'
let autoDetachTimer = null;

// ==========================================
// 1. ระบบแปลง Markdown เป็น HTML ที่ปลอดภัย (Markdown Renderer)
// ==========================================
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInlineMarkdown(text) {
  let html = escapeHtml(text);
  // Inline code: `code`
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  // Bold: **text** or __text__
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  // Italic: *text* or _text_
  html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  // Strikethrough: ~~text~~
  html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  // Links: [text](https://...)
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return html;
}

function renderMarkdown(rawMarkdown) {
  if (!rawMarkdown) return '';

  // ซ่อนบล็อก ```action ... ``` ระหว่างแสดงผลในหน้าแชท
  const cleaned = rawMarkdown
    .replace(/```(?:action|json_action)\s*[\s\S]*?```/gi, '')
    .replace(/```(?:action|json_action)\s*[\s\S]*$/gi, '\n*(กำลังเตรียมคำสั่งควบคุมหน้าเว็บ...)*');

  const codeBlocks = [];
  // แยก Fenced Code Blocks (```lang ... ```) ออกมาก่อน
  let processed = cleaned.replace(/```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code class="lang-${escapeHtml(lang)}">${escapeHtml(code.replace(/\n$/, ''))}</code></pre>`);
    return `\n@@CODEBLOCK_${idx}@@\n`;
  });

  const lines = processed.split(/\r?\n/);
  const out = [];
  let inUl = false;
  let inOl = false;
  let inTable = false;
  let tableRows = [];

  const closeLists = () => {
    if (inUl) { out.push('</ul>'); inUl = false; }
    if (inOl) { out.push('</ol>'); inOl = false; }
  };

  const flushTable = () => {
    if (!inTable) return;
    inTable = false;
    if (tableRows.length === 0) return;
    let tbl = '<table>';
    tableRows.forEach((rowCells, rIdx) => {
      const tag = rIdx === 0 ? 'th' : 'td';
      tbl += '<tr>' + rowCells.map((c) => `<${tag}>${renderInlineMarkdown(c.trim())}</${tag}>`).join('') + '</tr>';
    });
    tbl += '</table>';
    out.push(tbl);
    tableRows = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Code block placeholder
    const cbMatch = trimmed.match(/^@@CODEBLOCK_(\d+)@@$/);
    if (cbMatch) {
      closeLists();
      flushTable();
      out.push(codeBlocks[Number(cbMatch[1])]);
      continue;
    }

    // Table row detection (| a | b |)
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.includes('|')) {
      closeLists();
      // ข้ามบรรทัดคั่นตาราง เช่น |---|---|
      if (/^\|[\s:-]+\|$/.test(trimmed.replace(/\|/g, '|'))) {
        continue;
      }
      inTable = true;
      const cells = trimmed.slice(1, -1).split('|');
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Empty line
    if (!trimmed) {
      closeLists();
      continue;
    }

    // Horizontal Rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      closeLists();
      out.push('<hr>');
      continue;
    }

    // Headings (# to ####)
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      closeLists();
      const level = headingMatch[1].length;
      out.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    // Blockquote (> text)
    const quoteMatch = trimmed.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      closeLists();
      out.push(`<blockquote>${renderInlineMarkdown(quoteMatch[1])}</blockquote>`);
      continue;
    }

    // Unordered list (- or * or •)
    const ulMatch = line.match(/^\s*[-*•]\s+(.*)$/);
    if (ulMatch) {
      if (inOl) { out.push('</ol>'); inOl = false; }
      if (!inUl) { out.push('<ul>'); inUl = true; }
      out.push(`<li>${renderInlineMarkdown(ulMatch[1])}</li>`);
      continue;
    }

    // Ordered list (1. text)
    const olMatch = line.match(/^\s*\d+\.\s+(.*)$/);
    if (olMatch) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (!inOl) { out.push('<ol>'); inOl = true; }
      out.push(`<li>${renderInlineMarkdown(olMatch[1])}</li>`);
      continue;
    }

    closeLists();
    out.push(`<p>${renderInlineMarkdown(line)}</p>`);
  }

  closeLists();
  flushTable();
  return out.join('');
}

// ==========================================
// 2. โหมด Auto / Manual และการควบคุม Chrome Dev / Debugger
// ==========================================
function setExecutionMode(mode) {
  executionMode = mode === 'manual' ? 'manual' : 'auto';
  modeAutoBtn.classList.toggle('selected', executionMode === 'auto');
  modeManualBtn.classList.toggle('selected', executionMode === 'manual');
  chrome.storage.local.set({ executionMode });
}

modeAutoBtn.addEventListener('click', () => setExecutionMode('auto'));
modeManualBtn.addEventListener('click', () => setExecutionMode('manual'));

chrome.storage.local.get(['executionMode', 'autoCloseDev'], (stored) => {
  if (stored.executionMode) setExecutionMode(stored.executionMode);
  if (typeof stored.autoCloseDev === 'boolean') {
    autoCloseDevCheckbox.checked = stored.autoCloseDev;
  }
});

autoCloseDevCheckbox.addEventListener('change', () => {
  chrome.storage.local.set({ autoCloseDev: autoCloseDevCheckbox.checked });
});

function updateDevModeUI(isActive, tabId = null) {
  attachedTabId = isActive ? tabId : null;
  if (isActive) {
    devModeBar.classList.add('active');
    devBadge.textContent = 'DEV ON';
    toggleDevBtn.textContent = '⏹ ปิด Dev';
  } else {
    devModeBar.classList.remove('active');
    devBadge.textContent = 'IDLE';
    toggleDevBtn.textContent = '🛠️ เปิด Dev';
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
    return null;
  }
  return tab;
}

// ฉีด/อัปเดต Visual Overlay บนหน้าเว็บ
async function syncPageDevOverlay(tabId, { active = true, showBadges = false, statusMessage = '' } = {}) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      args: [active, showBadges, statusMessage],
      func: (isActive, shouldShowBadges, msg) => {
        const OVERLAY_ID = 'claude-local-dev-overlay';
        let root = document.getElementById(OVERLAY_ID);

        if (!isActive) {
          if (root) root.remove();
          return;
        }

        if (!root) {
          root = document.createElement('div');
          root.id = OVERLAY_ID;
          root.innerHTML = `
            <style>
              #claude-local-dev-overlay {
                position: fixed;
                inset: 0;
                pointer-events: none;
                z-index: 2147483646;
                box-shadow: inset 0 0 0 4px #d97757, inset 0 0 28px rgba(217, 119, 87, 0.35);
                transition: box-shadow 0.25s ease;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
              }
              #claude-local-hud {
                position: fixed;
                bottom: 16px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(25, 24, 22, 0.94);
                color: #faf9f5;
                padding: 8px 14px;
                border-radius: 999px;
                font-size: 12.5px;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 10px;
                box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
                border: 1px solid #d97757;
                z-index: 2147483647;
                pointer-events: auto;
              }
              #claude-local-hud-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #ff7b54;
                box-shadow: 0 0 8px #ff7b54;
                animation: claudePulse 1.2s infinite alternate;
              }
              #claude-local-hud-close {
                background: #d97757;
                color: #fff;
                border: none;
                border-radius: 999px;
                padding: 3px 9px;
                font-size: 11px;
                font-weight: 700;
                cursor: pointer;
              }
              #claude-local-hud-close:hover {
                background: #c46547;
              }
              @keyframes claudePulse {
                from { opacity: 0.4; transform: scale(0.85); }
                to { opacity: 1; transform: scale(1.2); }
              }
              #claude-local-cursor {
                position: fixed;
                top: -100px;
                left: -100px;
                width: 22px;
                height: 22px;
                pointer-events: none;
                z-index: 2147483647;
                transition: top 0.28s cubic-bezier(0.22, 1, 0.36, 1), left 0.28s cubic-bezier(0.22, 1, 0.36, 1);
              }
              .claude-ext-badge {
                position: fixed;
                background: #d97757;
                color: #fff;
                font-size: 10.5px;
                font-weight: 700;
                padding: 1px 5px;
                border-radius: 4px;
                box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                border: 1px solid #fff;
                pointer-events: none;
                z-index: 2147483645;
                line-height: 1.3;
              }
            </style>
            <div id="claude-local-hud">
              <span id="claude-local-hud-dot"></span>
              <span id="claude-local-hud-text">LocalBar Dev Mode กำลังทำงาน</span>
              <button id="claude-local-hud-close" type="button">✕ ปิดโหมด Dev</button>
            </div>
            <div id="claude-local-cursor">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="#d97757" stroke="#ffffff" stroke-width="2">
                <path d="M4 3l16 7-7 2-2 7z"/>
              </svg>
            </div>
            <div id="claude-local-badges-layer"></div>
          `;
          document.documentElement.appendChild(root);

          const closeBtn = document.getElementById('claude-local-hud-close');
          if (closeBtn) {
            closeBtn.addEventListener('click', () => {
              chrome.runtime.sendMessage({ type: 'CLAUDE_CLOSE_DEV_MODE' });
              root.remove();
            });
          }
        }

        const hudText = document.getElementById('claude-local-hud-text');
        if (hudText && msg) {
          hudText.textContent = msg;
        }

        const badgesLayer = document.getElementById('claude-local-badges-layer');
        if (badgesLayer) {
          badgesLayer.innerHTML = '';
          if (shouldShowBadges) {
            const tagged = document.querySelectorAll('[data-claude-ext-id]');
            tagged.forEach((el) => {
              const rect = el.getBoundingClientRect();
              if (rect.width <= 0 || rect.height <= 0 || rect.bottom < 0 || rect.top > window.innerHeight) return;
              const badge = document.createElement('div');
              badge.className = 'claude-ext-badge';
              badge.textContent = `#${el.getAttribute('data-claude-ext-id')}`;
              badge.style.top = `${Math.max(2, rect.top - 10)}px`;
              badge.style.left = `${Math.max(2, rect.left - 4)}px`;
              badgesLayer.appendChild(badge);
            });
          }
        }
      }
    });
  } catch (e) {
    console.warn('ไม่สามารถแสดง Overlay บนหน้าเว็บได้:', e);
  }
}

async function attachChromeDebugger(tabId) {
  if (autoDetachTimer) {
    clearTimeout(autoDetachTimer);
    autoDetachTimer = null;
  }

  if (attachedTabId === tabId) return true;
  if (attachedTabId && attachedTabId !== tabId) {
    await detachChromeDebugger(attachedTabId);
  }

  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    updateDevModeUI(true, tabId);
    await getPageContextAndForms({ includeText: false, includeForms: true });
    await syncPageDevOverlay(tabId, {
      active: true,
      showBadges: badgesVisible,
      statusMessage: 'Claude Dev Mode เชื่อมต่อแล้ว'
    });
    return true;
  } catch (err) {
    if (err.message && err.message.includes('Another debugger is already attached')) {
      updateDevModeUI(true, tabId);
      await syncPageDevOverlay(tabId, { active: true, showBadges: badgesVisible });
      return true;
    }
    console.error('ไม่สามารถเปิดโหมด Chrome Debugger ได้:', err);
    return false;
  }
}

async function detachChromeDebugger(tabId = attachedTabId) {
  if (autoDetachTimer) {
    clearTimeout(autoDetachTimer);
    autoDetachTimer = null;
  }
  const targetTabId = tabId || attachedTabId;
  badgesVisible = false;
  updateDevModeUI(false);

  if (!targetTabId) {
    const activeTab = await getActiveTab();
    if (activeTab) await syncPageDevOverlay(activeTab.id, { active: false });
    return;
  }

  try {
    await syncPageDevOverlay(targetTabId, { active: false });
  } catch (e) {}

  try {
    await chrome.debugger.detach({ tabId: targetTabId });
  } catch (e) {
    // อาจถูกปิดไปแล้ว
  }
}

chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId === attachedTabId) {
    syncPageDevOverlay(source.tabId, { active: false });
    updateDevModeUI(false);
  }
});

// รับคำสั่งเมื่อผู้ใช้กดปุ่ม "✕ ปิดโหมด Dev" บนแถบลอยในหน้าเว็บ
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'CLAUDE_CLOSE_DEV_MODE') {
    detachChromeDebugger();
  }
});

toggleDevBtn.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab) {
    alert('ไม่สามารถเปิดโหมด Dev บนหน้า chrome:// ได้ กรุณาเปิดหน้าเว็บปกติก่อนครับ');
    return;
  }
  if (attachedTabId === tab.id) {
    await detachChromeDebugger(tab.id);
  } else {
    badgesVisible = true;
    await attachChromeDebugger(tab.id);
  }
});

showBadgesBtn.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab) return;
  badgesVisible = !badgesVisible;
  await getPageContextAndForms({ includeText: false, includeForms: true });
  await syncPageDevOverlay(tab.id, {
    active: badgesVisible || attachedTabId === tab.id,
    showBadges: badgesVisible,
    statusMessage: badgesVisible ? 'แสดงป้ายหมายเลข #ID บนหน้าเว็บแล้ว' : 'ซ่อนป้ายหมายเลข #ID แล้ว'
  });
});

// ==========================================
// 3. ดึงรายชื่อโมเดลจาก Ollama (/api/tags)
// ==========================================
async function loadOllamaModels() {
  modelSelect.disabled = true;
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const models = data.models || [];

    statusDot.className = 'status-dot online';
    statusDot.title = `เชื่อมต่อ Ollama สำเร็จ (พบ ${models.length} โมเดล)`;

    modelSelect.innerHTML = '';

    if (models.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'ไม่พบโมเดลใน Ollama (รัน ollama pull ก่อน)';
      modelSelect.appendChild(opt);
      return;
    }

    const stored = await chrome.storage.local.get(['selectedModel']);
    let preferredModel = stored.selectedModel || DEFAULT_FALLBACK_MODEL;

    models.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m.name;
      const sizeGB = m.size ? ` (${(m.size / (1024 ** 3)).toFixed(1)} GB)` : '';
      opt.textContent = `${m.name}${sizeGB}`;
      modelSelect.appendChild(opt);
    });

    const hasPreferred = models.some((m) => m.name === preferredModel);
    modelSelect.value = hasPreferred ? preferredModel : models[0].name;
    await chrome.storage.local.set({ selectedModel: modelSelect.value });
  } catch (err) {
    console.error('ไม่สามารถโหลดรายการโมเดลจาก Ollama:', err);
    statusDot.className = 'status-dot offline';
    statusDot.title = 'ไม่สามารถเชื่อมต่อ Ollama ที่ localhost:11434';
    modelSelect.innerHTML = `<option value="${DEFAULT_FALLBACK_MODEL}">${DEFAULT_FALLBACK_MODEL} (Offline / Default)</option>`;
  } finally {
    modelSelect.disabled = false;
  }
}

modelSelect.addEventListener('change', () => {
  chrome.storage.local.set({ selectedModel: modelSelect.value });
});

refreshModelsBtn.addEventListener('click', loadOllamaModels);

clearChatBtn.addEventListener('click', () => {
  if (abortController) abortController.abort();
  conversationHistory = [];
  chatBox.innerHTML = '';
  if (emptyState) chatBox.appendChild(emptyState);
});

// ==========================================
// 4. อ่านข้อมูลหน้าเว็บ + สแกนโครงสร้าง Form / Input / ปุ่มทั้งหมด
// ==========================================
async function getPageContextAndForms({ includeText = true, includeForms = true } = {}) {
  const tab = await getActiveTab();
  if (!tab) return null;

  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [includeText, includeForms],
      func: (shouldGetText, shouldGetForms) => {
        const info = {
          title: document.title || '',
          url: location.href,
          selection: window.getSelection()?.toString().trim() || '',
          text: '',
          forms: []
        };

        if (shouldGetText) {
          info.text = (document.body?.innerText || '').replace(/\n{3,}/g, '\n\n').slice(0, 10000);
        }

        if (shouldGetForms) {
          const selector = 'input:not([type="hidden"]), textarea, select, button, [role="button"], [contenteditable="true"]';
          const elements = Array.from(document.querySelectorAll(selector));
          let nextId = 1;

          const getLabelForElement = (el) => {
            if (el.id) {
              const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
              if (lbl && lbl.innerText.trim()) return lbl.innerText.trim();
            }
            const parentLabel = el.closest('label');
            if (parentLabel && parentLabel.innerText.trim()) {
              return parentLabel.innerText.trim().slice(0, 80);
            }
            const ariaLabel = el.getAttribute('aria-label');
            if (ariaLabel) return ariaLabel.trim();
            const ariaLabelledBy = el.getAttribute('aria-labelledby');
            if (ariaLabelledBy) {
              const refEl = document.getElementById(ariaLabelledBy);
              if (refEl && refEl.innerText.trim()) return refEl.innerText.trim();
            }
            const prev = el.previousElementSibling;
            if (prev && ['LABEL', 'SPAN', 'DIV', 'P'].includes(prev.tagName) && prev.innerText.trim()) {
              return prev.innerText.trim().slice(0, 80);
            }
            return el.placeholder || el.name || el.innerText?.trim().slice(0, 60) || '';
          };

          for (const el of elements) {
            if (el.closest('#claude-local-dev-overlay')) continue;
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) {
              continue;
            }
            if (el.disabled) continue;

            const id = nextId++;
            el.setAttribute('data-claude-ext-id', String(id));

            const tag = el.tagName.toLowerCase();
            const type = (el.getAttribute('type') || (tag === 'button' ? 'button' : 'text')).toLowerCase();
            const label = getLabelForElement(el).replace(/\s+/g, ' ');

            const item = {
              id,
              tag,
              type,
              name: el.name || '',
              label: label || '(ไม่มีป้ายกำกับ)',
              placeholder: el.placeholder || '',
              value: el.isContentEditable ? el.innerText : (el.value || '')
            };

            if (type === 'checkbox' || type === 'radio') {
              item.checked = !!el.checked;
            }

            if (tag === 'select') {
              item.options = Array.from(el.options)
                .slice(0, 25)
                .map((o) => ({ value: o.value, text: o.text.trim() }));
            }

            info.forms.push(item);
            if (info.forms.length >= 80) break;
          }
        }

        return info;
      }
    });
    return result;
  } catch (e) {
    console.warn('ไม่สามารถดึงข้อมูลหน้าเว็บได้:', e);
    return null;
  }
}

// ==========================================
// 5. สั่งกรอกฟอร์ม / คลิกปุ่ม พร้อมเปิดและปิดโหมด Dev อัตโนมัติ (Auto-Close Dev Mode)
// ==========================================
async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function executePageActions(actions) {
  if (!Array.isArray(actions) || actions.length === 0) return [];

  const tab = await getActiveTab();
  if (!tab) return [];

  // เปิดโหมด Chrome Debugger อัตโนมัติเมื่อเริ่มรันคำสั่ง
  await attachChromeDebugger(tab.id);

  const results = [];

  for (const act of actions) {
    const actionType = (act.action || 'fill').toLowerCase();
    const labelDesc = act.label || `#${act.id}`;

    await syncPageDevOverlay(tab.id, {
      active: true,
      showBadges: true,
      statusMessage: `🤖 กำลังทำงาน: ${actionType.toUpperCase()} ที่ ${labelDesc}`
    });

    const [{ result: targetInfo }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [act],
      func: (actionObj) => {
        const el = document.querySelector(`[data-claude-ext-id="${actionObj.id}"]`);
        if (!el) return { found: false };

        el.scrollIntoView({ behavior: 'instant', block: 'center' });
        const rect = el.getBoundingClientRect();
        const x = Math.round(rect.left + rect.width / 2);
        const y = Math.round(rect.top + rect.height / 2);

        const cursor = document.getElementById('claude-local-cursor');
        if (cursor) {
          cursor.style.left = `${x}px`;
          cursor.style.top = `${y}px`;
        }

        const origOutline = el.style.outline;
        const origBg = el.style.backgroundColor;
        el.style.transition = 'all 0.25s ease';
        el.style.outline = '2.5px solid #d97757';
        el.style.backgroundColor = '#fff6f2';
        setTimeout(() => {
          el.style.outline = origOutline;
          el.style.backgroundColor = origBg;
        }, 2000);

        return {
          found: true,
          x,
          y,
          tag: el.tagName.toLowerCase(),
          type: (el.getAttribute('type') || '').toLowerCase()
        };
      }
    });

    if (!targetInfo || !targetInfo.found) {
      results.push({ ...act, ok: false, reason: `ไม่พบฟิลด์ #${act.id}` });
      continue;
    }

    await sleep(200);

    if (attachedTabId === tab.id) {
      try {
        await chrome.debugger.sendCommand({ tabId: tab.id }, 'Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: targetInfo.x,
          y: targetInfo.y
        });
      } catch (e) {}
    }

    const [{ result: domResult }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [act],
      func: (actionObj) => {
        const el = document.querySelector(`[data-claude-ext-id="${actionObj.id}"]`);
        if (!el) return { ok: false, reason: 'Element หายไปจากหน้าเว็บ' };

        const setNativeValue = (element, value) => {
          const proto =
            element instanceof HTMLTextAreaElement
              ? window.HTMLTextAreaElement.prototype
              : element instanceof HTMLSelectElement
              ? window.HTMLSelectElement.prototype
              : window.HTMLInputElement.prototype;
          const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
          if (descriptor && descriptor.set) {
            descriptor.set.call(element, value);
          } else {
            element.value = value;
          }
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          element.dispatchEvent(new Event('blur', { bubbles: true }));
        };

        try {
          const type = (actionObj.action || 'fill').toLowerCase();
          el.focus();

          if (type === 'fill' || type === 'type') {
            if (el.isContentEditable) {
              el.innerText = String(actionObj.value ?? '');
              el.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
              setNativeValue(el, String(actionObj.value ?? ''));
            }
            return { ok: true };
          } else if (type === 'select') {
            if (el.tagName.toLowerCase() === 'select') {
              const targetVal = String(actionObj.value ?? '').toLowerCase();
              const matchedOpt = Array.from(el.options).find(
                (o) =>
                  o.value.toLowerCase() === targetVal ||
                  o.text.trim().toLowerCase() === targetVal ||
                  o.text.trim().toLowerCase().includes(targetVal)
              );
              setNativeValue(el, matchedOpt ? matchedOpt.value : actionObj.value);
            } else {
              setNativeValue(el, String(actionObj.value ?? ''));
            }
            return { ok: true };
          } else if (type === 'check') {
            const shouldCheck = actionObj.checked !== undefined ? Boolean(actionObj.checked) : true;
            if (el.checked !== shouldCheck) {
              el.click();
            }
            el.checked = shouldCheck;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return { ok: true };
          } else if (type === 'click') {
            el.click();
            return { ok: true };
          }
          return { ok: false, reason: `ไม่รู้จักคำสั่ง ${type}` };
        } catch (err) {
          return { ok: false, reason: err.message };
        }
      }
    });

    results.push({ ...act, ...domResult });
    await sleep(140);
  }

  const successCount = results.filter((r) => r.ok).length;

  // ถ้าตั้งค่า "ปิดโหมด Dev อัตโนมัติเมื่อเสร็จ" ให้แสดงผลสำเร็จสั้นๆ แล้วถอด Debugger + ปิดกรอบสีส้มทันที
  if (autoCloseDevCheckbox.checked) {
    await syncPageDevOverlay(tab.id, {
      active: true,
      showBadges: false,
      statusMessage: `✅ เสร็จสิ้น (${successCount}/${results.length}) — กำลังปิดโหมด Dev อัตโนมัติ...`
    });
    autoDetachTimer = setTimeout(() => {
      detachChromeDebugger(tab.id);
    }, 1200);
  } else {
    await syncPageDevOverlay(tab.id, {
      active: attachedTabId === tab.id,
      showBadges: badgesVisible,
      statusMessage: `✅ ดำเนินการเสร็จสิ้น (${successCount}/${results.length} รายการ)`
    });
  }

  return results;
}

// ==========================================
// 6. แยกคำสั่ง Action Block จากข้อความตอบกลับของ AI
// ==========================================
function parseActionBlocks(rawText) {
  const actionRegex = /```(?:action|json_action)\s*([\s\S]*?)```/gi;
  const actions = [];
  let match;

  while ((match = actionRegex.exec(rawText)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (Array.isArray(parsed)) {
        actions.push(...parsed);
      } else if (parsed && typeof parsed === 'object') {
        actions.push(parsed);
      }
    } catch (e) {
      console.warn('แปลง JSON ใน action block ไม่สำเร็จ:', e);
    }
  }

  const cleanText = rawText.replace(actionRegex, '').trim();
  return { cleanText, actions };
}

// ==========================================
// 7. ส่วนจัดการการแสดงผล UI ในหน้าแชท (รองรับ Markdown + โหมด Auto/Manual)
// ==========================================
function hideEmptyState() {
  if (emptyState && emptyState.parentNode) {
    emptyState.parentNode.removeChild(emptyState);
  }
}

function appendMessage(text, sender) {
  hideEmptyState();
  const div = document.createElement('div');
  div.className = `msg ${sender}`;

  const contentDiv = document.createElement('div');
  if (sender === 'ai') {
    contentDiv.className = 'md-body';
    contentDiv.innerHTML = renderMarkdown(text);
  } else {
    contentDiv.className = 'msg-content';
    contentDiv.textContent = text;
  }
  div.appendChild(contentDiv);

  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
  return { container: div, contentDiv };
}

// แสดงการ์ดคำสั่ง (รองรับทั้งโหมด Manual ที่รอกดยืนยัน และโหมด Auto ที่รันเสร็จแล้ว)
function renderActionCard(parentDiv, actions, executedResults = null) {
  if (!actions || actions.length === 0) return;

  // ลบการ์ดเดิมในกล่องข้อความเดียวกันถ้ามี (เช่น ตอนกดปุ่มยืนยันในโหมด Manual)
  const existingCard = parentDiv.querySelector('.action-card');
  if (existingCard) existingCard.remove();

  const isPending = !executedResults;
  const card = document.createElement('div');
  card.className = `action-card ${isPending ? 'pending' : ''}`;

  const header = document.createElement('div');
  header.className = 'action-card-header';

  if (isPending) {
    header.innerHTML = `<span>🖐️ รอยืนยันคำสั่งกรอกข้อมูล (${actions.length} รายการ)</span>`;
    const runBtn = document.createElement('button');
    runBtn.className = 'run-actions-btn';
    runBtn.textContent = '▶️ ยืนยันและรันคำสั่ง';
    runBtn.addEventListener('click', async () => {
      runBtn.disabled = true;
      runBtn.textContent = '⏳ กำลังทำงาน...';
      const results = await executePageActions(actions);
      renderActionCard(parentDiv, actions, results);
    });
    header.appendChild(runBtn);
  } else {
    const successCount = executedResults.filter((r) => r.ok).length;
    header.innerHTML = `<span>⚡ ดำเนินการบนหน้าเว็บแล้ว (${successCount}/${executedResults.length})</span>`;
    const rerunBtn = document.createElement('button');
    rerunBtn.className = 'icon-btn';
    rerunBtn.textContent = '🔄 ทำซ้ำ';
    rerunBtn.style.fontSize = '11px';
    rerunBtn.style.padding = '2px 6px';
    rerunBtn.addEventListener('click', async () => {
      const results = await executePageActions(actions);
      renderActionCard(parentDiv, actions, results);
    });
    header.appendChild(rerunBtn);
  }

  card.appendChild(header);

  const displayList = executedResults || actions;
  displayList.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'action-item';
    const statusIcon = isPending ? '⏳' : item.ok ? '✅' : '⚠️';
    const labelText = escapeHtml(item.label || `Field #${item.id}`);
    const valText =
      item.action === 'click'
        ? 'คลิกปุ่ม'
        : item.action === 'check'
        ? `ตั้งค่า = ${item.checked}`
        : `"${escapeHtml(item.value ?? '')}"`;
    row.innerHTML = `
      <span>${statusIcon} <strong>${labelText}</strong>: ${valText}</span>
      <span class="action-badge">${escapeHtml((item.action || 'fill').toUpperCase())} #${escapeHtml(item.id)}</span>
    `;
    card.appendChild(row);
  });

  parentDiv.appendChild(card);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// ==========================================
// 8. การส่งข้อความคุยกับ Ollama (/api/chat)
// ==========================================
function buildSystemPrompt(pageInfo, formAgentEnabled) {
  let sys = `คุณคือ LocalBar ผู้ช่วย AI อัจฉริยะในเบราว์เซอร์ ตอบกระชับ ชัดเจน จัดรูปแบบด้วย Markdown (เช่น หัวข้อ, ตัวหนา, รายการ bullet, ตาราง) ให้สวยงามและอ่านง่ายด้วยภาษาไทย (หรือภาษาเดียวกับผู้ใช้)`;

  if (formAgentEnabled) {
    sys += `\n\n[ความสามารถในการกรอกฟอร์มและควบคุมหน้าเว็บ]
คุณสามารถกรอกแบบฟอร์ม เลือกตัวเลือก หรือคลิกปุ่มบนหน้าเว็บให้ผู้ใช้ได้โดยตรง!
เมื่อผู้ใช้สั่งให้กรอกข้อมูล กรอกฟอร์ม เลือกตัวเลือก หรือคลิกปุ่ม ให้คุณตอบอธิบายสั้นๆ และแนบบล็อกคำสั่ง \`\`\`action ที่เป็น JSON Array ท้ายคำตอบตามรูปแบบนี้เท่านั้น:

\`\`\`action
[
  {"action": "fill", "id": 1, "value": "ข้อความที่จะกรอก", "label": "ชื่อช่อง"},
  {"action": "select", "id": 2, "value": "ค่าของ option", "label": "ชื่อ dropdown"},
  {"action": "check", "id": 3, "checked": true, "label": "ชื่อ checkbox"},
  {"action": "click", "id": 4, "label": "ชื่อปุ่ม"}
]
\`\`\`

กฎสำคัญ:
1. ใช้เฉพาะค่า "id" ที่มีอยู่ในรายการ [รายการ Form / Input บนหน้าเว็บปัจจุบัน] เท่านั้น
2. ถ้าเป็น <select> ให้ใส่ "value" ให้ตรงกับตัวเลือกที่มีใน options
3. ห้ามคลิกปุ่ม Submit หรือส่งฟอร์มเอง ยกเว้นผู้ใช้จะสั่งให้กดส่งอย่างชัดเจน`;
  }

  if (pageInfo) {
    sys += `\n\n=== ข้อมูลหน้าเว็บปัจจุบัน ===\nชื่อหน้า: ${pageInfo.title}\nURL: ${pageInfo.url}`;
    if (pageInfo.selection) {
      sys += `\n\n[ข้อความที่ผู้ใช้คลุมดำ (Highlight) ไว้]:\n"""\n${pageInfo.selection}\n"""`;
    }
    if (pageInfo.text) {
      sys += `\n\n[เนื้อหาหน้าเว็บ]:\n"""\n${pageInfo.text}\n"""`;
    }
    if (formAgentEnabled && pageInfo.forms && pageInfo.forms.length > 0) {
      sys += `\n\n[รายการ Form / Input บนหน้าเว็บปัจจุบัน (${pageInfo.forms.length} รายการ)]:\n${JSON.stringify(pageInfo.forms, null, 2)}`;
    }
  }

  return sys;
}

async function sendPrompt(customPromptText) {
  if (abortController) {
    abortController.abort();
    return;
  }

  const userText = (customPromptText ?? promptInput.value).trim();
  if (!userText) return;

  const selectedModel = modelSelect.value || DEFAULT_FALLBACK_MODEL;

  appendMessage(userText, 'user');
  if (!customPromptText) {
    promptInput.value = '';
  }

  const shouldReadPage = includePageCheckbox.checked;
  const shouldUseForms = enableFormAgentCheckbox.checked;

  let pageInfo = null;
  if (shouldReadPage || shouldUseForms) {
    pageInfo = await getPageContextAndForms({
      includeText: shouldReadPage,
      includeForms: shouldUseForms
    });
  }

  const systemPrompt = buildSystemPrompt(pageInfo, shouldUseForms);
  conversationHistory.push({ role: 'user', content: userText });

  const messagesPayload = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-10)
  ];

  const { container: aiContainer, contentDiv: aiContentDiv } = appendMessage('กำลังคิด...', 'ai');

  abortController = new AbortController();
  sendBtn.textContent = 'หยุด';
  sendBtn.classList.add('stop');

  let fullResponse = '';

  try {
    const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: abortController.signal,
      body: JSON.stringify({
        model: selectedModel,
        messages: messagesPayload,
        stream: true
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${errText || response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    aiContentDiv.innerHTML = '';

    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          const token = parsed.message?.content ?? parsed.response ?? '';
          fullResponse += token;
          aiContentDiv.innerHTML = renderMarkdown(fullResponse);
          chatBox.scrollTop = chatBox.scrollHeight;
        } catch (e) {
          // ข้ามบรรทัดที่ยังไม่สมบูรณ์
        }
      }
    }

    conversationHistory.push({ role: 'assistant', content: fullResponse });

    if (shouldUseForms && fullResponse) {
      const { cleanText, actions } = parseActionBlocks(fullResponse);
      if (actions.length > 0) {
        aiContentDiv.innerHTML = renderMarkdown(cleanText || 'เตรียมข้อมูลสำหรับกรอกบนหน้าเว็บเรียบร้อยแล้วครับ:');
        if (executionMode === 'auto') {
          // โหมด Auto: รันคำสั่งทันที และปิดโหมด Dev อัตโนมัติเมื่อเสร็จ (ตาม Checkbox)
          const results = await executePageActions(actions);
          renderActionCard(aiContainer, actions, results);
        } else {
          // โหมด Manual: แสดงการ์ดพรีวิวให้ผู้ใช้กด "▶️ ยืนยันและรันคำสั่ง" เอง
          renderActionCard(aiContainer, actions, null);
        }
      }
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      aiContentDiv.innerHTML = renderMarkdown((fullResponse ? fullResponse + '\n\n' : '') + '*(หยุดการสร้างคำตอบ)*');
    } else {
      aiContentDiv.innerHTML = renderMarkdown(
        `**เกิดข้อผิดพลาดในการเชื่อมต่อกับโมเดล \`${selectedModel}\`**:\n\`${error.message}\`\n\n> คำแนะนำ: ตรวจสอบว่าเปิดโปรแกรม Ollama อยู่ และติดตั้งโมเดลนี้แล้ว`
      );
      statusDot.className = 'status-dot offline';
      console.error(error);
    }
  } finally {
    abortController = null;
    sendBtn.textContent = 'ส่ง';
    sendBtn.classList.remove('stop');
  }
}

// ==========================================
// 9. การผูก Event ปุ่มกดและคีย์ลัด
// ==========================================
sendBtn.addEventListener('click', () => sendPrompt());

promptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendPrompt();
  }
});

document.querySelectorAll('.chip-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const type = btn.getAttribute('data-quick');
    if (type === 'summarize') {
      includePageCheckbox.checked = true;
      sendPrompt('ช่วยสรุปเนื้อหาสำคัญของหน้าเว็บนี้เป็นข้อๆ ด้วย Markdown ให้เข้าใจง่ายหน่อย');
    } else if (type === 'scan-form') {
      enableFormAgentCheckbox.checked = true;
      const tab = await getActiveTab();
      if (tab) {
        badgesVisible = true;
        await getPageContextAndForms({ includeText: false, includeForms: true });
        await syncPageDevOverlay(tab.id, {
          active: true,
          showBadges: true,
          statusMessage: '🔍 สแกนและแสดงป้ายหมายเลข #ID บนหน้าเว็บแล้ว'
        });
      }
      sendPrompt('แสดงรายการช่องกรอกฟอร์ม (Form Fields) และปุ่มทั้งหมดที่พบในหน้านี้ในรูปแบบตาราง Markdown พร้อมบอกหมายเลข #ID และหน้าที่ของแต่ละช่อง');
    } else if (type === 'fill-sample') {
      enableFormAgentCheckbox.checked = true;
      promptInput.value = 'ช่วยกรอกฟอร์มในหน้านี้ด้วยข้อมูลตัวอย่างที่เหมาะสมให้ครบทุกช่อง (ไม่ต้องกดปุ่ม Submit)';
      promptInput.focus();
    }
  });
});

loadOllamaModels();
