// ===== STATE =====
let selectedFile = null;

// ===== ELEMENTS =====
const dropZone    = document.getElementById('dropZone');
const upload      = document.getElementById('upload');
const fileInfo    = document.getElementById('fileInfo');
const fileName    = document.getElementById('fileName');
const fileSize    = document.getElementById('fileSize');
const clearBtn    = document.getElementById('clearBtn');
const options     = document.getElementById('options');
const compressBtn = document.getElementById('compressBtn');
const progressWrap= document.getElementById('progressWrap');
const progressFill= document.getElementById('progressFill');
const progressLabel= document.getElementById('progressLabel');
const resultBox   = document.getElementById('resultBox');
const origSize    = document.getElementById('origSize');
const newSize     = document.getElementById('newSize');
const savedPct    = document.getElementById('savedPct');
const downloadLink= document.getElementById('downloadLink');
const btnText     = document.getElementById('btnText');

// ===== DRAG & DROP =====
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.type === 'application/pdf') {
    handleFile(file);
  } else {
    alert('Please drop a valid PDF file.');
  }
});

dropZone.addEventListener('click', () => upload.click());

upload.addEventListener('change', () => {
  if (upload.files[0]) handleFile(upload.files[0]);
});

// ===== HANDLE FILE =====
function handleFile(file) {
  selectedFile = file;
  fileName.textContent = file.name;
  fileSize.textContent = formatBytes(file.size);

  dropZone.style.display    = 'none';
  fileInfo.style.display    = 'flex';
  options.style.display     = 'block';
  compressBtn.style.display = 'block';
  resultBox.style.display   = 'none';
  progressWrap.style.display= 'none';
}

// ===== CLEAR =====
clearBtn.addEventListener('click', resetAll);

function resetAll() {
  selectedFile = null;
  upload.value = '';

  dropZone.style.display    = 'block';
  fileInfo.style.display    = 'none';
  options.style.display     = 'none';
  compressBtn.style.display = 'none';
  progressWrap.style.display= 'none';
  resultBox.style.display   = 'none';
  progressFill.style.width  = '0%';
}

// ===== COMPRESS =====
async function compressPDF() {
  if (!selectedFile) return;

  const level = document.querySelector('input[name="level"]:checked').value;

  // Show progress
  compressBtn.disabled = true;
  btnText.textContent = '⏳ Compressing...';
  progressWrap.style.display = 'block';
  resultBox.style.display    = 'none';

  animateProgress(10, 40, 600);

  try {
    const arrayBuffer = await selectedFile.arrayBuffer();
    const originalSize = arrayBuffer.byteLength;

    animateProgress(40, 70, 500);

    // Load PDF
    const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer, {
      ignoreEncryption: true,
    });

    animateProgress(70, 90, 400);

    // Compress options
    const saveOptions = {
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: level === 'high' ? 5 : level === 'medium' ? 15 : 30,
    };

    // Apply level-based optimisation
    if (level === 'high' || level === 'medium') {
      // Remove metadata to reduce size
      pdfDoc.setTitle('');
      pdfDoc.setAuthor('');
      pdfDoc.setSubject('');
      pdfDoc.setKeywords([]);
      pdfDoc.setProducer('');
      pdfDoc.setCreator('');
    }

    const compressedBytes = await pdfDoc.save(saveOptions);
    const compressedSize  = compressedBytes.byteLength;

    // Simulate extra reduction visually for high level
    // (pdf-lib reduces what it can; we show an honest result)
    animateProgress(90, 100, 300);

    await delay(350);

    // Result
    const saved = ((originalSize - compressedSize) / originalSize) * 100;

    origSize.textContent = formatBytes(originalSize);
    newSize.textContent  = formatBytes(compressedSize);
    savedPct.textContent = saved > 0 ? `-${saved.toFixed(1)}%` : '~0%';

    // Create download
    const blob = new Blob([compressedBytes], { type: 'application/pdf' });
    downloadLink.href     = URL.createObjectURL(blob);
    downloadLink.download = 'compressed_' + selectedFile.name;

    progressWrap.style.display = 'none';
    resultBox.style.display    = 'block';

  } catch (err) {
    console.error(err);
    alert('Something went wrong while compressing. The PDF may be encrypted or corrupted.');
    progressWrap.style.display = 'none';
  }

  compressBtn.disabled = false;
  btnText.textContent  = '⚡ Compress PDF';
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

function animateProgress(from, to, duration) {
  const start = performance.now();
  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const val = from + (to - from) * easeOut(t);
    progressFill.style.width = val + '%';
    progressLabel.textContent = val < 100 ? 'Compressing...' : 'Done!';
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function easeOut(t) {
  return 1 - Math.pow(1 - t, 3);
}
