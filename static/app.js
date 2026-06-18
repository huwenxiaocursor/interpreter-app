// ==================== Shared ====================

let appConfig = { logo: null, active_department: null, departments: [] };

async function fetchConfig() {
  const res = await fetch('/api/config');
  appConfig = await res.json();
  return appConfig;
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ==================== Display Page ====================

let recognition = null;
let isListening = false;

async function loadDisplayConfig() {
  await fetchConfig();
  const dept = appConfig.departments.find(d => d.name === appConfig.active_department);
  document.getElementById('deptLabel').textContent  = dept ? dept.name   : '';
  document.getElementById('bannerText').textContent = dept ? dept.banner : '';
  const logoImg = document.getElementById('logoImg');
  if (appConfig.logo) { logoImg.src = appConfig.logo; logoImg.style.display = 'block'; }
  else { logoImg.style.display = 'none'; }
}

function toggleListening() {
  isListening ? stopListening() : startListening();
}

function startListening() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    showStatus('❌ 当前浏览器不支持语音识别，请使用 Chrome 或 Edge');
    return;
  }

  recognition = new SR();
  recognition.lang = 'zh-CN';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => showStatus('🎤 已就绪，请开始发言');

  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i];
      if (r.isFinal) {
        const text = r[0].transcript.trim();
        if (text) {
          showStatus('');
          // 立刻把中文显示出来（复用或新建 source-text 块）
          const content = document.getElementById('translationContent');
          const scrollBox = document.getElementById('translationScroll');
          let srcEl = document.getElementById('interimLive');
          if (srcEl) {
            srcEl.id = '';
            srcEl.className = 'source-text';
            srcEl.textContent = text;
          } else {
            srcEl = document.createElement('div');
            srcEl.className = 'source-text';
            srcEl.textContent = text;
            content.appendChild(srcEl);
          }
          // 翻译段落紧跟其后，异步填充
          const para = document.createElement('p');
          content.appendChild(para);
          scrollBox.scrollTop = scrollBox.scrollHeight;
          streamTranslation(text, para);
        }
      } else {
        interim += r[0].transcript;
      }
    }
    setInterimBlock(interim);
    if (interim) showStatus('🎤 识别中...');
  };

  recognition.onerror = (e) => {
    const msgs = {
      'not-allowed':   '❌ 麦克风权限被拒绝',
      'audio-capture': '❌ 无法捕获音频，请检查麦克风',
      'network':       '❌ 网络错误，语音识别服务无法连接',
      'no-speech':     '⚠️ 未检测到语音',
    };
    showStatus(msgs[e.error] || '❌ 识别错误：' + e.error);
    if (e.error === 'not-allowed' || e.error === 'audio-capture') stopListening();
  };

  recognition.onend = () => {
    if (isListening) try { recognition.start(); } catch {}
  };

  recognition.start();
  isListening = true;

  const btn = document.getElementById('startBtn');
  btn.textContent = '停止发言';
  btn.classList.add('is-listening');
}

function stopListening() {
  if (recognition) {
    recognition.onend = null;
    try { recognition.stop(); } catch {}
    recognition = null;
  }
  isListening = false;
  showStatus('');
  setInterimBlock('');

  const btn = document.getElementById('startBtn');
  btn.textContent = '开始发言';
  btn.classList.remove('is-listening');
}

// Show a status line above the translation area
function showStatus(msg) {
  document.getElementById('interimBar').textContent = msg;
}

// Show live interim recognition text as a large blue block inside the scroll area
function setInterimBlock(text) {
  let block = document.getElementById('interimLive');
  if (text) {
    if (!block) {
      block = document.createElement('div');
      block.id = 'interimLive';
      block.className = 'interim-live';
      document.getElementById('translationContent').appendChild(block);
    }
    block.textContent = text;
    document.getElementById('translationScroll').scrollTop = 99999;
  } else {
    if (block) block.remove();
  }
}

async function streamTranslation(chineseText, para) {
  const scrollBox = document.getElementById('translationScroll');
  try {
    const res = await fetch(window.location.origin + '/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: chineseText }),
    });
    if (!res.ok) {
      para.textContent = '[翻译失败: ' + (await res.text()) + ']';
      para.style.color = '#e53935';
      return;
    }
    if (res.body && typeof res.body.getReader === 'function') {
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        para.textContent += decoder.decode(value, { stream: true });
        scrollBox.scrollTop = scrollBox.scrollHeight;
      }
    } else {
      para.textContent = await res.text();
      scrollBox.scrollTop = scrollBox.scrollHeight;
    }
  } catch (err) {
    para.textContent = '[错误: ' + (err.message || err) + ']';
    para.style.color = '#e53935';
  }
}

function clearTranslation() {
  document.getElementById('translationContent').innerHTML = '';
  showStatus('');
}

// ==================== Admin Page ====================

async function loadAdminConfig() {
  await fetchConfig();
  renderLogoPreview(appConfig.logo);
  renderDeptList();
}

function renderLogoPreview(path) {
  const img    = document.getElementById('logoPreview');
  const noLogo = document.getElementById('noLogoText');
  if (path) { img.src = path; img.style.display = 'block'; noLogo.style.display = 'none'; }
  else       { img.style.display = 'none'; noLogo.style.display = 'inline'; }
}

async function uploadLogo(input) {
  const file = input.files[0];
  if (!file) return;
  const form = new FormData();
  form.append('file', file);
  try {
    const res = await fetch('/api/upload-logo', { method: 'POST', body: form });
    if (!res.ok) { alert((await res.json()).detail || '上传失败'); return; }
    const data = await res.json();
    appConfig.logo = data.path;
    renderLogoPreview(data.path);
  } catch { alert('上传失败，请检查服务器连接'); }
}

function renderDeptList() {
  const list = document.getElementById('deptList');
  list.innerHTML = '';
  appConfig.departments.forEach((dept, i) => {
    const isActive = dept.name === appConfig.active_department;
    const item = document.createElement('div');
    item.className = 'dept-item' + (isActive ? ' is-active' : '');
    item.innerHTML = `
      <input class="input-name" type="text" value="${esc(dept.name)}"
             placeholder="部门名称"
             oninput="appConfig.departments[${i}].name = this.value">
      <input class="input-banner" type="text" value="${esc(dept.banner)}"
             placeholder="欢迎标语"
             oninput="appConfig.departments[${i}].banner = this.value">
      <button class="btn btn-active-toggle btn-sm ${isActive ? 'activated' : ''}"
              onclick="setActiveDept(${i})">${isActive ? '✓ 当前部门' : '设为当前'}</button>
      <button class="btn btn-delete btn-sm" onclick="removeDept(${i})">删除</button>`;
    list.appendChild(item);
  });
}

function setActiveDept(idx) {
  appConfig.active_department = appConfig.departments[idx].name;
  renderDeptList();
}

function addDept() {
  appConfig.departments.push({ name: '', banner: '' });
  renderDeptList();
}

function removeDept(idx) {
  const removed = appConfig.departments.splice(idx, 1)[0];
  if (removed.name === appConfig.active_department)
    appConfig.active_department = appConfig.departments[0]?.name ?? null;
  renderDeptList();
}

async function saveConfig() {
  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(appConfig),
    });
    const msg = document.getElementById('saveFeedback');
    if (res.ok) { msg.textContent = '✓ 保存成功'; msg.style.color = '#4caf50'; }
    else         { msg.textContent = '保存失败';   msg.style.color = '#e53935'; }
    setTimeout(() => (msg.textContent = ''), 3000);
  } catch { alert('保存失败，请检查服务器连接'); }
}
