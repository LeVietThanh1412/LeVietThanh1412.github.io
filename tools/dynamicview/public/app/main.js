import { Stage } from './stage.js';

const byId = (id) => document.getElementById(id);
const standalone = document.documentElement.dataset.runtime === 'static';
const viewport = byId('viewport');
const fileInput = byId('model-file');
const uploadArea = byId('upload');
const follow = byId('follow');
const shareDialog = byId('share-dialog');
const arDialog = byId('ar-dialog');
const arStatus = byId('ar-status');
const quickLook = byId('quick-look');
const modelList = byId('model-list');
const stageMessage = byId('stage-message');
const lightingToggle = byId('lighting-toggle');
const lightingPanel = byId('lighting-panel');
const flightToggle = byId('fly');
const touchPrimary = matchMedia('(pointer: coarse)');
const descriptions = { mesh: 'Lưới 3D', splats: 'Gaussian Splatting', points: 'Đám mây điểm' };
const symbols = { glb: '◇', usdz: '▱', ply: '⁙', splat: '⁙', ksplat: '⁙', spz: '⁙' };
let config;
let snapshot;
let stage;
let desiredId;
let controller;
let uploadInProgress = false;
let objectURL;
let noticeTimer;
let socket;
let reconnectDelay = 500;
let lastList = '';

function notice(message) {
  const element = byId('notice');
  element.textContent = message;
  element.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { element.hidden = true; }, 4500);
}

function stageStatus(message = '') {
  stageMessage.hidden = !message;
  stageMessage.textContent = message;
}

function connection(live, peers) {
  const element = byId('connection');
  element.classList.toggle('live', live);
  const label = live ? `${peers} thiết bị online` : 'Đang kết nối lại';
  if (element.lastElementChild.textContent !== label) element.lastElementChild.textContent = label;
}

function renderNavigation() {
  const mode = stage?.mode ?? 'orbit';
  const flying = !!stage?.flight.active;
  byId('orbit').setAttribute('aria-pressed', mode === 'orbit' && !flying);
  byId('ar').setAttribute('aria-pressed', mode !== 'orbit');
  flightToggle.setAttribute('aria-pressed', flying);
  flightToggle.disabled = !stage?.asset || mode === 'xr';
  viewport.classList.toggle('is-flying', flying);
  byId('flight-reticle').hidden = byId('flight-pad').hidden = !flying;
  byId('spin').disabled = flying;
  byId('spin').setAttribute('aria-pressed', !!stage?.controls.autoRotate);
  byId('view-label').textContent = mode === 'camera' ? 'CAMERA LIVE' : flying ? 'BAY' : 'PERSPECTIVE';
  const touch = touchPrimary.matches;
  byId('view-hint').textContent = flying
    ? (touch ? 'Kéo để nhìn · Giữ các nút để bay'
      : 'Kéo để nhìn · WASD để bay · Q/E xuống/lên · Shift đi chậm')
    : (touch ? 'Kéo để xoay · Hai ngón để dịch hoặc chụm zoom'
      : 'Kéo để xoay · Chuột phải để dịch · Cuộn để zoom');
}

function modeChanged(mode) {
  renderNavigation();
  showLighting(false);
  if (mode === 'xr') controller?.abort();
  if (mode === 'orbit' && snapshot && desiredId !== stage.asset?.id) showModel(desiredId);
}

function formatSize(bytes) {
  const unit = bytes < 1024 * 1024 ? 1024 : 1024 * 1024;
  return `${new Intl.NumberFormat('vi', { maximumFractionDigits: 1 }).format(bytes / unit)} ${unit === 1024 ? 'KiB' : 'MiB'}`;
}

function markSelection() {
  for (const button of modelList.children) {
    button.setAttribute('aria-pressed', button.dataset.id === desiredId);
    const shared = !standalone && button.dataset.id === snapshot?.activeId;
    button.lastElementChild.hidden = !shared;
    button.title = shared ? 'Model máy tính đang chia sẻ' : '';
  }
  byId('shared-indicator').hidden = standalone || !stage?.asset || stage.asset.id !== snapshot?.activeId;
}

function renderLibrary() {
  const { models } = snapshot;
  const list = models.map((model) => model.id).join(',');
  if (list !== lastList) {
    lastList = list;
    byId('library-count').textContent = models.length;
    const items = models.map((model) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'model-button';
      button.dataset.id = model.id;
      const icon = document.createElement('span');
      icon.className = `model-symbol ${model.type}`;
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = symbols[model.type];
      const metadata = document.createElement('span');
      metadata.className = 'model-item';
      const title = document.createElement('strong');
      title.textContent = model.name;
      const description = document.createElement('small');
      description.textContent = `${model.type.toUpperCase()} · ${formatSize(model.size)}`;
      metadata.append(title, description);
      const dot = document.createElement('span');
      dot.className = 'model-dot';
      dot.setAttribute('aria-hidden', 'true');
      button.append(icon, metadata, dot);
      button.addEventListener('click', () => selectModel(model.id));
      return button;
    });
    modelList.replaceChildren(...items);
  }
  markSelection();
}

function update(data) {
  snapshot = data;
  if (!desiredId || config.host || follow.checked) {
    if (desiredId !== data.activeId) showModel(data.activeId);
  }
  renderLibrary();
}

function connect() {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${scheme}//${location.host}/ws`);
  socket.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    reconnectDelay = 500;
    connection(true, data.peers);
    update(data);
  });
  socket.addEventListener('close', () => {
    connection(false);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 8000);
  });
}

async function request(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Máy chủ trả mã ${response.status}.`);
  return body;
}

async function selectModel(id) {
  if (standalone) {
    if (snapshot.activeId === id) showModel(id);
    else update({ ...snapshot, activeId: id });
    return;
  }
  if (!config.host) {
    follow.checked = false;
    showModel(id);
    return;
  }
  if (snapshot.activeId === id) {
    showModel(id);
    return;
  }
  try {
    await request(`/api/active/${id}`, { method: 'PUT' });
    if (socket.readyState !== WebSocket.OPEN) update(await request('/api/library'));
  } catch (error) {
    notice(error.message);
  }
}

function resetQuickLook() {
  if (objectURL) URL.revokeObjectURL(objectURL);
  objectURL = null;
  quickLook.hidden = true;
  quickLook.removeAttribute('href');
  quickLook.removeAttribute('download');
}

function showLighting(open) {
  lightingPanel.hidden = !open;
  lightingToggle.setAttribute('aria-expanded', open);
}

async function showModel(id) {
  desiredId = id;
  markSelection();
  if (!stage || stage.mode === 'xr') return;
  const model = snapshot.models.find((entry) => entry.id === id);
  if (!model || (controller?.id === id && !controller.signal.aborted)) return;
  controller?.abort();
  controller = null;
  if (stage.asset?.id === id) {
    stageStatus();
    return;
  }
  const current = new AbortController();
  current.id = id;
  controller = current;
  stageStatus(`Đang tải ${model.name}…`);
  try {
    const asset = await stage.show(model, current.signal);
    if (current.signal.aborted) return;
    resetQuickLook();
    byId('flip').setAttribute('aria-pressed', 'false');
    lightingToggle.hidden = asset.kind !== 'mesh';
    if (lightingToggle.hidden) showLighting(false);
    renderNavigation();
    byId('kind').textContent = descriptions[asset.kind];
    byId('model-name').textContent = model.name;
    byId('model-name').title = model.name;
    byId('model-info').textContent = `${model.type.toUpperCase()} · ${formatSize(model.size)}`;
    const download = byId('download');
    download.href = model.url;
    download.download = model.sample ? `${model.name}.${model.type}` : model.name;
    download.hidden = false;
    stageStatus();
    markSelection();
    if (arDialog.open) refreshAR();
  } catch (error) {
    if (!current.signal.aborted) stageStatus(`Không mở được ${model.name}. ${error.message}`);
  } finally {
    if (controller === current) controller = null;
  }
}

function uploadFile(file) {
  if (!file || uploadInProgress || !config?.host) return;
  const extension = file.name.split('.').pop().toLowerCase();
  if (!Object.hasOwn(symbols, extension)) return notice('Chọn tệp PLY, GLB, USDZ, SPLAT, KSPLAT hoặc SPZ.');
  if (file.size < 4) return notice('Tệp rỗng hoặc không có dữ liệu hợp lệ.');
  if (standalone) {
    const data = extension === 'usdz' ? new Blob([file], { type: 'model/vnd.usdz+zip' }) : file;
    const model = {
      id: 'local-' + snapshot.models.length, name: file.name, type: extension, size: file.size,
      url: URL.createObjectURL(data)
    };
    update({ models: [...snapshot.models, model], activeId: model.id });
    fileInput.value = '';
    return;
  }
  if (file.size > config.maxBytes) return notice('Dung lượng tối đa cho mỗi tệp là 1 GiB.');
  const progress = byId('progress');
  const transfer = new XMLHttpRequest();
  uploadInProgress = true;
  fileInput.disabled = true;
  progress.value = 0;
  progress.hidden = false;
  transfer.open('POST', '/api/models');
  transfer.responseType = 'json';
  transfer.setRequestHeader('Content-Type', 'application/octet-stream');
  transfer.setRequestHeader('X-Model-Name', encodeURIComponent(file.name));
  transfer.upload.addEventListener('progress', (event) => {
    if (event.lengthComputable) progress.value = event.loaded / event.total;
  });
  transfer.addEventListener('load', () => {
    if (transfer.status === 201) selectModel(transfer.response.id);
    else notice(transfer.response?.error || 'Không tải lên được tệp.');
  });
  transfer.addEventListener('error', () => notice('Kết nối bị gián đoạn khi tải tệp.'));
  transfer.addEventListener('loadend', () => {
    uploadInProgress = false;
    fileInput.disabled = false;
    progress.hidden = true;
    fileInput.value = '';
  });
  transfer.send(file);
}

function pairingAddresses() {
  const hostname = config.lan.includes(location.hostname) ? location.hostname : config.lan[0] || location.hostname;
  const address = hostname.includes(':') && !hostname.startsWith('[') ? `[${hostname}]` : hostname;
  return {
    http: `http://${address}:${config.port}`,
    https: config.tlsPort ? `https://${address}:${config.tlsPort}` : null
  };
}

async function drawQR(text) {
  const { default: qrcode } = await import('qrcode-generator');
  const code = qrcode(0, 'M');
  code.addData(text);
  code.make();
  const canvas = byId('qr');
  const modules = code.getModuleCount();
  const cell = 4;
  canvas.width = canvas.height = (modules + 8) * cell;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#382a51';
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (code.isDark(row, col)) context.fillRect((col + 4) * cell, (row + 4) * cell, cell, cell);
    }
  }
}

async function openShare() {
  if (!config) return notice('Viewer đang đọc cấu hình mạng.');
  const { http, https } = pairingAddresses();
  const url = https && (!config.localCA || location.protocol === 'https:') ? https : http;
  const pair = byId('pair-url');
  pair.href = url;
  pair.textContent = url;
  const secure = byId('ar-pair-url');
  secure.hidden = !https || url === https;
  if (https) {
    secure.href = https;
    secure.textContent = https;
  }
  byId('pair-note').textContent = !config.lan.length
    ? 'Chưa tìm thấy địa chỉ IPv4 nội bộ của máy tính.'
    : https ? 'Dùng địa chỉ HTTPS để bật chế độ camera.' : 'HTTP dùng được cho 3D. WebXR và camera cần bật HTTPS.';
  const ca = byId('ca-link');
  ca.hidden = !config.localCA;
  byId('ca-note').hidden = !config.localCA;
  byId('copy').textContent = 'Sao chép liên kết';
  await drawQR(url);
  shareDialog.showModal();
}

let arRefresh = 0;
async function refreshAR() {
  const refresh = ++arRefresh;
  const asset = stage?.asset;
  const help = byId('ar-help');
  const camera = byId('camera');
  const webxr = byId('webxr');
  const prepare = byId('prepare-usdz');
  const secure = byId('secure-link');
  const quick = quickLook.relList.supports('ar');
  camera.hidden = webxr.hidden = prepare.hidden = secure.hidden = quickLook.hidden = true;
  if (!asset) {
    help.textContent = 'Mở một model trước khi bật camera.';
    return;
  }
  if (quick && asset.type === 'usdz') {
    if (asset.usdzBlob && !objectURL) objectURL = URL.createObjectURL(asset.usdzBlob);
    quickLook.href = objectURL || asset.url;
    if (quickLook.href.startsWith('blob:')) {
      quickLook.download = asset.sample ? 'orbit.usdz' : asset.name;
    }
  }
  quickLook.hidden = !quick || !quickLook.hasAttribute('href');
  prepare.hidden = !quick || !asset.exportable || !quickLook.hidden;
  camera.hidden = !navigator.mediaDevices?.getUserMedia;
  const https = standalone ? null : pairingAddresses().https;
  if (!isSecureContext) {
    if (https) {
      secure.href = https;
      secure.hidden = false;
    }
    help.textContent = quick && !quickLook.hidden
      ? 'USDZ mở được bằng Quick Look. Chế độ chồng camera cần HTTPS.'
      : 'WebXR và chế độ chồng camera cần mở trang bằng HTTPS.';
    if (config.localCA) arStatus.textContent = 'Cài chứng chỉ trong mục Kết nối điện thoại trước khi mở HTTPS.';
    if (!https && !standalone) arStatus.textContent = 'Máy tính chưa bật HTTPS. Xem cách bật trong README.';
    return;
  }
  help.textContent = quick
    ? 'Quick Look đặt model dạng lưới vào không gian. Chồng camera cho phép xoay và zoom mọi model bằng tay.'
    : 'Chồng camera hiển thị model trên camera trực tiếp và dùng thao tác kéo, chụm để chỉnh góc nhìn.';
  const supported = await navigator.xr?.isSessionSupported('immersive-ar').catch(() => false);
  if (refresh !== arRefresh || !arDialog.open || !supported) return;
  webxr.hidden = false;
  help.textContent = asset.kind === 'mesh'
    ? 'Đặt model lên sàn hoặc mặt bàn để thấy bóng. WebXR dùng ánh sáng ngoài đời khi thiết bị hỗ trợ.'
    : 'WebXR nhận diện bề mặt để đặt model. Bạn cũng có thể xoay model trên nền camera.';
}

async function launchAR(kind) {
  const camera = byId('camera');
  const webxr = byId('webxr');
  camera.disabled = webxr.disabled = true;
  arStatus.textContent = 'Đang mở camera…';
  try {
    await (kind === 'xr' ? stage.startXR() : stage.startCamera());
    if (arDialog.open) arDialog.close();
  } catch (error) {
    arStatus.textContent = error.name === 'NotAllowedError'
      ? 'Quyền camera bị từ chối. Hãy kiểm tra quyền truy cập của trình duyệt.'
      : `Không bật được camera. ${error.message}`;
  } finally {
    camera.disabled = webxr.disabled = false;
  }
}

async function prepareUSDZ() {
  const asset = stage.asset;
  const button = byId('prepare-usdz');
  button.disabled = true;
  arStatus.textContent = 'Đang tạo bản USDZ…';
  try {
    const url = await stage.makeQuickLook();
    if (stage.asset !== asset) {
      URL.revokeObjectURL(url);
      return;
    }
    objectURL = url;
    quickLook.href = url;
    quickLook.download = 'model.usdz';
    quickLook.hidden = false;
    button.hidden = true;
    arStatus.textContent = 'Bản Quick Look đã sẵn sàng.';
  } catch (error) {
    arStatus.textContent = `Không tạo được bản USDZ. ${error.message}`;
  } finally {
    button.disabled = false;
  }
}

fileInput.addEventListener('change', () => uploadFile(fileInput.files[0]));
uploadArea.addEventListener('dragover', (event) => {
  event.preventDefault();
  uploadArea.classList.add('dragover');
});
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
uploadArea.addEventListener('drop', (event) => {
  event.preventDefault();
  uploadArea.classList.remove('dragover');
  uploadFile(event.dataTransfer.files[0]);
});
follow.addEventListener('change', () => {
  if (follow.checked && snapshot) showModel(snapshot.activeId);
});
byId('share').addEventListener('click', openShare);
byId('copy').addEventListener('click', async () => {
  const pair = byId('pair-url');
  try {
    if (navigator.clipboard) await navigator.clipboard.writeText(pair.href);
    else {
      const range = document.createRange();
      range.selectNodeContents(pair);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      if (!document.execCommand('copy')) throw new Error();
      selection.removeAllRanges();
    }
    byId('copy').textContent = 'Đã sao chép';
  } catch {
    byId('pair-note').textContent = 'Nhấn giữ vào liên kết để sao chép.';
  }
});
byId('ar').addEventListener('click', () => {
  if (!config || !stage?.asset) return notice('Mở model trước khi bật camera.');
  if (controller) return notice('Đợi model tải xong rồi mở camera.');
  arStatus.textContent = '';
  arDialog.showModal();
  refreshAR();
});
byId('orbit').addEventListener('click', () => {
  if (!stage) return;
  stage.stopCamera();
  stage.setFlight(false);
  renderNavigation();
});
flightToggle.addEventListener('click', () => {
  stage.stopCamera();
  stage.setFlight(!stage.flight.active);
  renderNavigation();
});
byId('flight-slow').addEventListener('click', (event) => {
  stage.flight.slow = !stage.flight.slow;
  event.currentTarget.setAttribute('aria-pressed', stage.flight.slow);
});
viewport.addEventListener('keydown', (event) => {
  if (event.code !== 'Escape' || !stage?.flight.active || event.target !== stage.renderer.domElement) return;
  stage.setFlight(false);
  renderNavigation();
  if (!document.fullscreenElement && !viewport.classList.contains('canvas-full')) flightToggle.focus();
});
touchPrimary.addEventListener('change', renderNavigation);
byId('camera').addEventListener('click', () => {
  if (stage.mode === 'camera') arDialog.close();
  else launchAR('camera');
});
byId('webxr').addEventListener('click', () => launchAR('xr'));
byId('prepare-usdz').addEventListener('click', prepareUSDZ);
byId('reset').addEventListener('click', () => stage?.reset());
byId('flip').addEventListener('click', () => {
  if (!stage?.asset) return;
  stage.rotate();
  if (objectURL) resetQuickLook();
  byId('flip').setAttribute('aria-pressed', stage.flip);
});
byId('spin').addEventListener('click', () => {
  if (!stage) return;
  stage.controls.autoRotate = !stage.controls.autoRotate;
  byId('spin').setAttribute('aria-pressed', stage.controls.autoRotate);
});
lightingToggle.addEventListener('click', () => showLighting(lightingPanel.hidden));
lightingPanel.addEventListener('input', () => {
  stage.setStudioLight(byId('light-angle').valueAsNumber, byId('light-level').valueAsNumber, byId('light-shadow').checked);
});
lightingPanel.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  showLighting(false);
  lightingToggle.focus();
});
byId('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (viewport.requestFullscreen) await viewport.requestFullscreen();
    else viewport.classList.toggle('canvas-full');
  } catch {
    viewport.classList.toggle('canvas-full');
  }
});
byId('smaller').addEventListener('click', () => { if (stage?.anchor.visible) stage.resizeInAR(0.8); });
byId('larger').addEventListener('click', () => { if (stage?.anchor.visible) stage.resizeInAR(1.25); });
byId('exit-ar').addEventListener('click', () => stage?.xrSession?.end());
byId('xr-overlay').addEventListener('beforexrselect', (event) => {
  if (event.target.closest?.('button')) event.preventDefault();
});
window.addEventListener('pagehide', () => stage?.stopCamera());

try {
  stage = new Stage(viewport, byId('video'), byId('xr-overlay'), modeChanged, (hint) => {
    const element = byId('xr-hint');
    if (element.textContent !== hint) element.textContent = hint;
  });
  renderNavigation();
} catch (error) {
  console.error(error);
  byId('model-name').textContent = 'WebGL 2 không khả dụng';
  stageStatus('Hãy mở viewer bằng trình duyệt có hỗ trợ WebGL 2.');
}

try {
  if (standalone) {
    byId('share').hidden = true;
    byId('connection').lastElementChild.textContent = 'Mở file tại thiết bị';
    document.querySelector('.library-heading p').textContent = 'Tệp mở tại thiết bị';
    const library = await request('./library.json');
    config = { host: true };
    update(library);
  } else {
    config = await request('/api/config');
    byId('follow-wrap').hidden = config.host;
    update(await request('/api/library'));
    connect();
  }
  uploadArea.hidden = fileInput.hidden = !config.host;
} catch (error) {
  notice(`Không mở được thư viện. ${error.message}`);
}
