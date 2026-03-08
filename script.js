// ===== PDF.js worker setup =====
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ===== COMPRESSION SETTINGS per level =====
// scale   = render resolution (lower = smaller file, lower quality)
// quality = JPEG quality 0.0–1.0 (lower = smaller file)
const LEVELS = {
  low:    { scale: 1.5,  quality: 0.85 },  // ~20–40% reduction, good quality
  medium: { scale: 1.2,  quality: 0.70 },  // ~50–70% reduction, decent quality
  high:   { scale: 0.9,  quality: 0.45 },  // ~70–90% reduction, lower quality
};

// ===== STATE =====
let selectedFile = null;

// ===== ELEMENTS =====
const dropZone     = document.getElementById('dropZone');
const upload       = document.getElementById('upload');
const fileInfo     = document.getElementById('fileInfo');
const fileName     = document.getElementById('fileName');
const fileSize     = document.getElementById('fileSize');
const clearBtn     = document.getElementById('clearBtn');
const options      = document.getElementById('options');
const compressBtn  = document.getElementById('compressBtn');
const progressWrap = document.getElementById('progressWrap');
const progressFill = document.getElementById('progressFill');
const progressLabel= document.getElementById('progressLabel');
const resultBox    = document.getElementById('resultBox');
const origSize     = document.getElementById('origSize');
const newSize      = document.getElementById('newSize');
const savedPct     = document.getElementById('savedPct');
const downloadLink = document.getElementById('downloadLink');
const btnText      = document.getElementById('btnText');

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

// ===== MAIN COMPRESS =====
async function compressPDF() {
  if (!selectedFile) return;

  const level = document.querySelector('input[name="level"]:checked').value;
  const { scale, quality } = LEVELS[level];

  compressBtn.disabled       = true;
  btnText.textContent        = 'Compressing...';
  progressWrap.style.display = 'block';
  resultBox.style.display    = 'none';
  setProgress(5, 'Loading PDF...');

  try {
    const arrayBuffer   = await selectedFile.arrayBuffer();
    const originalBytes = arrayBuffer.byteLength;

    // Step 1: Load with PDF.js to render pages
    const pdfJsDoc   = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdfJsDoc.numPages;

    setProgress(10, 'Loaded ' + totalPages + ' page' + (totalPages > 1 ? 's' : '') + '...');

    // Step 2: Create a fresh pdf-lib document
    const newPdf = await PDFLib.PDFDocument.create();

    // Step 3: Render each page to canvas -> JPEG -> embed in new PDF
    for (let i = 1; i <= totalPages; i++) {
      const page     = await pdfJsDoc.getPage(i);
      const viewport = page.getViewport({ scale });

      const canvas   = document.createElement('canvas');
      canvas.width   = Math.floor(viewport.width);
      canvas.height  = Math.floor(viewport.height);
      const ctx      = canvas.getContext('2d');

      // White background (handles transparent PDFs)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Render PDF page onto canvas
      await page.render({ canvasContext: ctx, viewport }).promise;

      // Canvas -> JPEG bytes
      const jpegDataUrl = canvas.toDataURL('image/jpeg', quality);
      const jpegBytes   = dataURLtoBytes(jpegDataUrl);

      // Embed JPEG into new PDF page
      const jpegImage = await newPdf.embedJpg(jpegBytes);
      const newPage   = newPdf.addPage([canvas.width, canvas.height]);
      newPage.drawImage(jpegImage, {
        x: 0, y: 0,
        width:  canvas.width,
        height: canvas.height,
      });

      const pct = 10 + Math.round((i / totalPages) * 82);
      setProgress(pct, 'Compressing page ' + i + ' of ' + totalPages + '...');
    }

    setProgress(94, 'Saving compressed PDF...');

    // Step 4: Save the new compressed PDF
    const compressedBytes = await newPdf.save({ useObjectStreams: true });
    const compressedSize  = compressedBytes.byteLength;

    setProgress(100, 'Done!');
    await delay(300);

    // Step 5: Show results
    const savedPercent = ((originalBytes - compressedSize) / originalBytes) * 100;

    origSize.textContent = formatBytes(originalBytes);
    newSize.textContent  = formatBytes(compressedSize);
    savedPct.textContent = savedPercent > 0 ? '-' + savedPercent.toFixed(1) + '%' : 'Minimal';
    savedPct.style.color = savedPercent > 30 ? 'var(--green)' : 'var(--accent)';

    const blob = new Blob([compressedBytes], { type: 'application/pdf' });
    downloadLink.href     = URL.createObjectURL(blob);
    downloadLink.download = 'compressed_' + selectedFile.name;

    progressWrap.style.display = 'none';
    resultBox.style.display    = 'block';

  } catch (err) {
    console.error(err);
    progressWrap.style.display = 'none';
    showToast('Error: ' + (err.message || 'Could not compress this PDF.'));
  }

  compressBtn.disabled = false;
  btnText.textContent  = 'Compress PDF';
}

// ===== HELPERS =====

function dataURLtoBytes(dataURL) {
  const base64 = dataURL.split(',')[1];
  const binary  = atob(base64);
  const bytes   = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

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
  progressLabel.textContent = label || 'Compressing...';
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
      'background:#1a1a1a', 'border:1px solid #444', 'color:#f0ede8',
      'padding:14px 24px', 'border-radius:10px', 'font-size:0.9rem',
      "font-family:'Syne',sans-serif", 'z-index:9999',
      'box-shadow:0 8px 32px rgba(0,0,0,0.5)'
    ].join(';');
    document.body.appendChild(toast);
  }
  toast.textContent   = msg;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 4000);
}
