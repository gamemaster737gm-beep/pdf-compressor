// ===================================================
//   PASTE YOUR ILOVEPDF API KEY BELOW (PUBLIC KEY)
// ===================================================
const ILOVEPDF_PUBLIC_KEY = 'project_public_0837c4b33826cbd0a7a68ff42dcde6be_8EjMK1d4e2440272e4584fce395faaca1254d';
// ===================================================

// ===== STATE =====
let selectedFile = null;

// ===== ELEMENTS =====
const dropZone      = document.getElementById('dropZone');
const upload        = document.getElementById('upload');
const fileInfo      = document.getElementById('fileInfo');
const fileName      = document.getElementById('fileName');
const fileSize      = document.getElementById('fileSize');
const clearBtn      = document.getElementById('clearBtn');
const options       = document.getElementById('options');
const compressBtn   = document.getElementById('compressBtn');
const progressWrap  = document.getElementById('progressWrap');
const progressFill  = document.getElementById('progressFill');
const progressLabel = document.getElementById('progressLabel');
const resultBox     = document.getElementById('resultBox');
const origSize      = document.getElementById('origSize');
const newSize       = document.getElementById('newSize');
const savedPct      = document.getElementById('savedPct');
const downloadLink  = document.getElementById('downloadLink');
const btnText       = document.getElementById('btnText');

// ===== DRAG & DROP =====
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.type === 'application/pdf') {
    handleFile(file);
  } else {
    showToast('Please drop a valid PDF file.');
  }
});
dropZone.addEventListener('click', () => upload.click());
upload.addEventListener('change', () => {
  if (upload.files[0]) handleFile(upload.files[0]);
});

// ===== HANDLE FILE =====
function handleFile(file) {
  selectedFile = file;
  fileName.textContent = truncate(file.name, 36);
  fileSize.textContent = formatBytes(file.size);

  dropZone.style.display     = 'none';
  fileInfo.style.display     = 'flex';
  options.style.display      = 'block';
  compressBtn.style.display  = 'block';
  resultBox.style.display    = 'none';
  progressWrap.style.display = 'none';
}

// ===== CLEAR =====
clearBtn.addEventListener('click', resetAll);

function resetAll() {
  selectedFile = null;
  upload.value = '';
  dropZone.style.display     = 'block';
  fileInfo.style.display     = 'none';
  options.style.display      = 'none';
  compressBtn.style.display  = 'none';
  progressWrap.style.display = 'none';
  resultBox.style.display    = 'none';
  progressFill.style.width   = '0%';
}

// ===== COMPRESSION QUALITY MAP =====
const QUALITY_MAP = {
  low:    'recommended',  // best quality, moderate compression
  medium: 'extreme',      // balanced
  high:   'extreme',      // smallest file
};

// ===== MAIN COMPRESS (ilovepdf API) =====
async function compressPDF() {
  if (!selectedFile) return;

  if (ILOVEPDF_PUBLIC_KEY === 'YOUR_PUBLIC_KEY_HERE') {
    showToast('Please add your ilovepdf API key in script.js first.');
    return;
  }

  const level = document.querySelector('input[name="level"]:checked').value;

  compressBtn.disabled       = true;
  btnText.textContent        = 'Compressing...';
  progressWrap.style.display = 'block';
  resultBox.style.display    = 'none';

  try {
    // ── STEP 1: Authenticate → get token + worker server ──
    setProgress(8, 'Authenticating...');
    const authRes = await fetch(
      `https://api.ilovepdf.com/v1/auth`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_key: ILOVEPDF_PUBLIC_KEY }),
      }
    );
    if (!authRes.ok) throw new Error('Authentication failed. Check your API key.');
    const { token } = await authRes.json();

    // ── STEP 2: Start a compress task ──
    setProgress(18, 'Starting task...');
    const startRes = await fetch(
      `https://api.ilovepdf.com/v1/start/compress`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (!startRes.ok) throw new Error('Failed to start compression task.');
    const { server, task } = await startRes.json();

    // ── STEP 3: Upload the PDF file ──
    setProgress(32, 'Uploading PDF...');
    const formData = new FormData();
    formData.append('task', task);
    formData.append('file', selectedFile, selectedFile.name);

    const uploadRes = await fetch(
      `https://${server}/v1/upload`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      }
    );
    if (!uploadRes.ok) throw new Error('File upload failed.');
    const { server_filename } = await uploadRes.json();

    // ── STEP 4: Run compression ──
    setProgress(55, 'Compressing on server...');
    const processRes = await fetch(
      `https://${server}/v1/process`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task,
          tool: 'compress',
          files: [{ server_filename, filename: selectedFile.name }],
          compression_level: QUALITY_MAP[level],
        }),
      }
    );
    if (!processRes.ok) throw new Error('Compression processing failed.');

    // ── STEP 5: Download the compressed file ──
    setProgress(78, 'Downloading result...');
    const downloadRes = await fetch(
      `https://${server}/v1/download/${task}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (!downloadRes.ok) throw new Error('Failed to download compressed file.');

    const compressedBlob = await downloadRes.blob();
    const compressedSize = compressedBlob.size;
    const originalSize   = selectedFile.size;

    setProgress(100, 'Done!');
    await delay(300);

    // ── STEP 6: Show results ──
    const savedPercent = ((originalSize - compressedSize) / originalSize) * 100;

    origSize.textContent = formatBytes(originalSize);
    newSize.textContent  = formatBytes(compressedSize);
    savedPct.textContent = savedPercent > 0
      ? '-' + savedPercent.toFixed(1) + '%'
      : 'Minimal';
    savedPct.style.color = savedPercent > 30 ? 'var(--green)' : 'var(--accent)';

    downloadLink.href     = URL.createObjectURL(compressedBlob);
    downloadLink.download = 'compressed_' + selectedFile.name;

    progressWrap.style.display = 'none';
    resultBox.style.display    = 'block';

  } catch (err) {
    console.error(err);
    progressWrap.style.display = 'none';
    showToast('Error: ' + (err.message || 'Something went wrong.'));
  }

  compressBtn.disabled = false;
  btnText.textContent  = 'Compress PDF';
}

// ===== HELPERS =====
function formatBytes(bytes) {
  if (bytes < 1024)        return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function setProgress(pct, label) {
  progressFill.style.width  = pct + '%';
  progressLabel.textContent = label || 'Processing...';
}

function truncate(str, n) {
  return str.length > n ? str.slice(0, n - 3) + '...' : str;
}

function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = [
      'position:fixed', 'bottom:32px', 'left:50%', 'transform:translateX(-50%)',
      'background:#1a1a1a', 'border:1px solid #ff4444', 'color:#f0ede8',
      'padding:14px 24px', 'border-radius:10px', 'font-size:0.9rem',
      "font-family:'Syne',sans-serif", 'z-index:9999',
      'box-shadow:0 8px 32px rgba(0,0,0,0.6)', 'text-align:center',
      'max-width:340px'
    ].join(';');
    document.body.appendChild(toast);
  }
  toast.textContent   = msg;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 5000);
}
