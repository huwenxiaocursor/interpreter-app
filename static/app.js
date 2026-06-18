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

let mediaRecorder  = null;
let isListening    = false;
let mediaStream    = null;
let chunkTimer     = null;
let countdownTimer = null;
let audioChunks    = [];

const CHUNK_SECONDS = 8;

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

async function startListening() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    showStatus('❌ 无法获取麦克风权限：' + e.message);
    return;
  }
  isListening = true;
  const btn = document.getElementById('startBtn');
  btn.textContent = '停止发言';
  btn.classList.add('is-listening');
  showStatus('🎤 已就绪，请开始发言');
  scheduleChunk();
}

function scheduleChunk() {
  if (!isListening) return;
  audioChunks = [];

  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : MediaRecorder.isTypeSupported('audio/webm')
    ? 'audio/webm'
    : '';

  mediaRecorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : {});

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) audioChunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    clearInterval(countdownTimer);
    const blob = new Blob(audioChunks, { type: mimeType || 'audio/webm' });
    console.log('[录音] blob大小:', blob.size, '字节, chunks数:', audioChunks.length);
    if (blob.size > 100) {
      showStatus('⏳ 识别中...');
      await sendChunk(blob, mimeType);
    } else {
      showStatus('⚠️ 未录到音频 (blob=' + blob.size + 'B)，请检查麦克风');
    }
    if (isListening) scheduleChunk();
  };

  mediaRecorder.start();

  // Countdown display
  let remaining = CHUNK_SECONDS;
  showStatus(`🔴 录音中 (${remaining}秒)`);
  countdownTimer = setInterval(() => {
    remaining--;
    if (remaining > 0) showStatus(`🔴 录音中 (${remaining}秒)`);
  }, 1000);

  chunkTimer = setTimeout(() => {
    if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
  }, CHUNK_SECONDS * 1000);
}

async function sendChunk(blob, mimeType) {
  console.log('[Whisper] 发送音频片段，大小:', blob.size, 'bytes，类型:', blob.type);
  const ext  = (mimeType || '').includes('webm') ? '.webm' : '.ogg';
  const form = new FormData();
  form.append('audio', new File([blob], 'chunk' + ext, { type: blob.type }));
  try {
    const res = await fetch('/api/transcribe', { method: 'POST', body: form });
    if (!res.ok) { showStatus('⚠️ 识别失败：' + (await res.text())); return; }
    const { text } = await res.json();
    console.log('[Whisper] 识别结果:', JSON.stringify(text));
    if (text && text.trim()) {
      showStatus('🎤 已就绪，请开始发言');
      translateAndAppend(text.trim());
    } else {
      showStatus('🎤 已就绪，请开始发言');
    }
  } catch (e) {
    showStatus('⚠️ 网络错误：' + e.message);
  }
}

function stopListening() {
  isListening = false;
  clearTimeout(chunkTimer);
  clearInterval(countdownTimer);
  if (mediaRecorder) {
    mediaRecorder.onstop = null;
    try { mediaRecorder.stop(); } catch {}
    mediaRecorder = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  showStatus('');

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

async function translateAndAppend(chineseText) {
  const scrollBox = document.getElementById('translationScroll');
  const content   = document.getElementById('translationContent');

  // Chinese source line
  const srcEl = document.createElement('div');
  srcEl.className = 'source-text';
  srcEl.textContent = chineseText;
  content.appendChild(srcEl);

  // English paragraph (streamed)
  const para = document.createElement('p');
  content.appendChild(para);
  scrollBox.scrollTop = scrollBox.scrollHeight;

  try {
    // 用绝对 URL 避免 Safari 对 localhost 相对路径的解析问题
    const apiBase = window.location.origin;
    const res = await fetch(apiBase + '/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: chineseText }),
    });
    if (!res.ok) {
      para.textContent = '[翻译失败: ' + (await res.text()) + ']';
      para.style.color = '#e53935';
      return;
    }
    // 优先流式读取（Chrome），Safari 不支持时回退到一次性获取
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
