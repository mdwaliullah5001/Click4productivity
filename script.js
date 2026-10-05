/* ==================================================
   FIDIC eLearning — Main Logic
   Requires: data.js (MODULES array)
   ================================================== */

/* ==================================================
   STATE
   ================================================== */
const PROGRESS_KEY = 'fidic_progress_v5';
const slidesCache = {};

const Storage = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch (e) { return fallback; }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); }
    catch (e) { /* ignore */ }
  }
};

let progress = Storage.get(PROGRESS_KEY, {});
let currentModule = null;
let currentIndex = 0;

/* ==================================================
   LOAD SLIDES FROM slides.json
   ================================================== */
async function loadModuleSlides(module) {
  if (slidesCache[module.id]) return slidesCache[module.id];

  try {
    const res = await fetch(module.folder + '/slides.json');
    if (!res.ok) throw new Error('No slides.json');
    const data = await res.json();
    const slides = (data.slides || []).map(f => module.folder + '/' + f);
    slidesCache[module.id] = slides;
    return slides;
  } catch (err) {
    slidesCache[module.id] = [];
    return [];
  }
}

async function preloadAllSlides() {
  let totalSlides = 0;
  for (const m of MODULES) {
    const slides = await loadModuleSlides(m);
    totalSlides += slides.length;
  }
  const el = document.getElementById('statSlides');
  if (el) el.textContent = totalSlides;
  buildPathway();
}

/* ==================================================
   BUILD PATHWAY
   ================================================== */
function buildPathway() {
  try {
    const pathway = document.getElementById('pathway');
    if (!pathway) return;
    pathway.innerHTML = '';

    MODULES.forEach(m => {
      const slides = slidesCache[m.id] || [];
      const hasSlides = slides.length > 0;
      const hasQuiz = m.quiz && m.quiz !== '#';
      const viewed = (progress[m.id] || []).length;
      const total = slides.length;
      const percent = total > 0 ? Math.round((viewed / total) * 100) : 0;

      let metaHTML = '';
      if (hasSlides) {
        metaHTML += `<span class="meta-item slides-clickable" onclick="openViewer(${m.id})">
                       <i class="fas fa-file-lines"></i> ${total} slides
                     </span>`;
        metaHTML += `<span class="meta-item active"><i class="fas fa-circle dot"></i> Active</span>`;
        metaHTML += `<span class="meta-item"><i class="fas fa-clock clock"></i> ${percent}% viewed</span>`;
      } else {
        metaHTML += `<span class="meta-item"><i class="fas fa-clock" style="color:#F59E0B;"></i> Coming soon</span>`;
      }

      const row = document.createElement('div');
      row.className = 'mod-row';
      row.dataset.name = (m.name || '').toLowerCase();
      row.innerHTML = `
        <div class="mod-card">
          <div class="mod-num">${String(m.id).padStart(2, '0')}</div>
          <div class="mod-content">
            <div class="mod-title">${m.name}</div>
            <div class="mod-meta">${metaHTML}</div>
          </div>
          <div class="mod-actions" style="position:relative;">
            <button class="btn-browse" type="button" ${hasSlides ? `onclick="openViewer(${m.id})"` : 'disabled'}>
              ${hasSlides ? 'Browse' : 'Soon'}
            </button>
            ${hasQuiz
              ? `<a class="btn-quiz" href="${m.quiz}" target="_blank"><i class="fas fa-pen-to-square"></i> Quiz</a>`
              : `<button class="btn-quiz disabled" disabled><i class="fas fa-clock"></i> Quiz Soon</button>`}
            <button class="btn-gear" type="button" onclick="toggleMenu(event, ${m.id})">
              <i class="fas fa-cog"></i>
            </button>
            <div class="gear-menu" id="menu-${m.id}" onclick="event.stopPropagation()">
              ${hasSlides
                ? `<button class="menu-item" onclick="openViewer(${m.id})">
                     <i class="fas fa-play"></i> Open Slides
                   </button>`
                : `<span class="menu-item disabled"><i class="fas fa-clock"></i> Slides soon</span>`}
              ${hasQuiz
                ? `<a class="menu-item" href="${m.quiz}" target="_blank">
                     <i class="fas fa-pen-to-square"></i> Take Quiz
                   </a>`
                : `<span class="menu-item disabled"><i class="fas fa-clock"></i> Quiz soon</span>`}
              ${hasSlides && viewed > 0
                ? `<div class="menu-divider"></div>
                   <button class="menu-item" onclick="resetProgress(${m.id})">
                     <i class="fas fa-rotate-left"></i> Reset Progress
                   </button>`
                : ``}
            </div>
          </div>
        </div>
      `;
      pathway.appendChild(row);
    });
  } catch (err) {
    console.error('buildPathway error:', err);
  }
}

/* ==================================================
   GEAR MENU
   ================================================== */
function toggleMenu(e, id) {
  e.preventDefault();
  e.stopPropagation();
  const menu = document.getElementById('menu-' + id);
  const isOpen = menu.classList.contains('active');
  document.querySelectorAll('.gear-menu').forEach(m => {
    if (m.id !== 'menu-' + id) m.classList.remove('active');
  });
  if (isOpen) menu.classList.remove('active');
  else menu.classList.add('active');
}

document.addEventListener('click', (e) => {
  if (e.target.closest('.gear-menu')) return;
  if (e.target.closest('.btn-gear')) return;
  document.querySelectorAll('.gear-menu').forEach(m => m.classList.remove('active'));
});

/* ==================================================
   SLIDE VIEWER
   ================================================== */
async function openViewer(id) {
  const m = MODULES.find(x => x.id === id);
  if (!m) return;

  const modal = document.getElementById('modal');
  const title = document.getElementById('modalTitle');
  const counter = document.getElementById('modalCounter');

  title.textContent = 'Loading Module ' + m.id + '...';
  counter.textContent = '...';
  modal.classList.add('active');

  const slides = await loadModuleSlides(m);
  if (slides.length === 0) {
    alert('Slides are not yet uploaded for this module.');
    modal.classList.remove('active');
    return;
  }

  currentModule = { ...m, slides };
  currentIndex = 0;
  title.textContent = `Module ${m.id}: ${m.name}`;
  updateViewer();
}

function closeViewer() {
  document.getElementById('modal').classList.remove('active');
  currentModule = null;
  currentIndex = 0;
  if (document.fullscreenElement) document.exitFullscreen?.();
}

function updateViewer() {
  if (!currentModule) return;
  const total = currentModule.slides.length;
  const img = document.getElementById('modalImg');
  img.onerror = function () {
    this.onerror = null;
    this.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500">
        <rect width="800" height="500" fill="#EFF6FF"/>
        <text x="400" y="240" text-anchor="middle" font-family="Arial" font-size="26" fill="#94A3B8">Slide not found</text>
        <text x="400" y="280" text-anchor="middle" font-family="Arial" font-size="14" fill="#CBD5E1">${currentModule.slides[currentIndex]}</text>
      </svg>`
    );
  };
  img.src = currentModule.slides[currentIndex];
  const txt = `${currentIndex + 1} / ${total}`;
  document.getElementById('modalCounter').textContent = txt;
  document.getElementById('modalCounter2').textContent = txt;
  document.getElementById('prevBtn').disabled = currentIndex === 0;
  document.getElementById('nextBtn').disabled = currentIndex === total - 1;
  markViewed(currentModule.id, currentIndex);
}

function nextSlide() {
  if (currentModule && currentIndex < currentModule.slides.length - 1) {
    currentIndex++;
    updateViewer();
  }
}

function prevSlide() {
  if (currentModule && currentIndex > 0) {
    currentIndex--;
    updateViewer();
  }
}

/* ==================================================
   PROGRESS
   ================================================== */
function markViewed(moduleId, slideIndex) {
  if (!progress[moduleId]) progress[moduleId] = [];
  if (!progress[moduleId].includes(slideIndex)) {
    progress[moduleId].push(slideIndex);
    Storage.set(PROGRESS_KEY, progress);
    buildPathway();
  }
}

function resetProgress(moduleId) {
  if (confirm('Reset progress for this module?')) {
    delete progress[moduleId];
    Storage.set(PROGRESS_KEY, progress);
    buildPathway();
  }
}

/* ==================================================
   FULLSCREEN
   ================================================== */
function toggleFullscreen() {
  const modal = document.getElementById('modal');
  if (!document.fullscreenElement) {
    (modal.requestFullscreen || modal.webkitRequestFullscreen || modal.msRequestFullscreen)?.call(modal);
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen)?.call(document);
  }
}

['fullscreenchange', 'webkitfullscreenchange', 'msfullscreenchange'].forEach(evt =>
  document.addEventListener(evt, updateFsBtn)
);

function updateFsBtn() {
  const btn = document.getElementById('fsBtn');
  if (!btn) return;
  btn.innerHTML = document.fullscreenElement
    ? '<i class="fas fa-compress"></i> Exit'
    : '<i class="fas fa-expand"></i> Fullscreen';
}

/* ==================================================
   KEYBOARD SHORTCUTS
   ================================================== */
document.addEventListener('keydown', e => {
  if (!document.getElementById('modal').classList.contains('active')) return;
  if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); nextSlide(); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); prevSlide(); }
  if (e.key === 'Escape') closeViewer();
  if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFullscreen(); }
});

document.getElementById('modal')?.addEventListener('click', e => {
  if (e.target.id === 'modal') closeViewer();
});

/* ==================================================
   START
   ================================================== */
async function start() {
  buildPathway();
  await preloadAllSlides();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}