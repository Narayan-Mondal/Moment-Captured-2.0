/**
 * Moment Captured - Studio Media Manager Controller
 * Handles Cloudinary media upload, orientation detection & gallery sync
 */

document.addEventListener('DOMContentLoaded', () => {
  initAdminAuth();
  initCloudinaryConfig();
  initMediaUploader();
  initStoriesManager();
});

// Base URL configuration (supports running on port 3000, Live Server on 5500, or file://)
const API_BASE = (window.location.protocol === 'file:' || (window.location.port && window.location.port !== '3000'))
  ? 'http://localhost:3000'
  : '';

// Security: Retrieve session token from private storage
function getAuthHeaders() {
  const token = sessionStorage.getItem('mc_admin_token') || '';
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function handleAuthFailure() {
  sessionStorage.removeItem('mc_admin_token');
  AdminState.isAuth = false;
  const modal = document.getElementById('admin-auth-modal');
  if (modal) modal.classList.remove('auth-granted');
  showToast('Session expired. Please re-authenticate.', 'error');
}

/* ==========================================================================
   1. ADMIN AUTHENTICATION
   ========================================================================== */
function initAdminAuth() {
  const modal = document.getElementById('admin-auth-modal');
  const form = document.getElementById('admin-login-form');
  const input = document.getElementById('admin-password-input');
  const errorMsg = document.getElementById('auth-error-msg');
  const toggleBtn = document.getElementById('toggle-pw-btn');
  const logoutBtn = document.getElementById('admin-logout-btn');

  // If opened directly via file://, notify user to visit http://localhost:3000/admin
  if (window.location.protocol === 'file:') {
    const hintElem = document.querySelector('.auth-hint');
    if (hintElem) {
      hintElem.innerHTML = `
        <div style="margin-top:14px;padding:12px;border:1px solid rgba(212,175,55,0.5);border-radius:6px;background:rgba(212,175,55,0.08);font-size:0.82rem;color:#ffffff;line-height:1.5;">
          ⚠️ <strong>Local File Notice:</strong> Browser security restricts network APIs on <code>file:///</code>.<br>
          Please open: <a href="http://localhost:3000/admin" style="color:var(--admin-accent);text-decoration:underline;font-weight:700;">http://localhost:3000/admin</a>
        </div>
      `;
    }
  }

  // Check saved session
  const savedToken = sessionStorage.getItem('mc_admin_token');
  if (savedToken) {
    AdminState.isAuth = true;
    modal.classList.add('auth-granted');
  }

  // Toggle Password Visibility
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const isPw = input.type === 'password';
      input.type = isPw ? 'text' : 'password';
      toggleBtn.style.color = isPw ? 'var(--admin-accent)' : 'var(--text-muted)';
    });
  }

  // Handle Login
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = input.value.trim();
      if (!password) return;

      errorMsg.textContent = '';

      try {
        // Try configured API_BASE
        let res = null;
        try {
          res = await fetch(`${API_BASE}/api/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
          });
        } catch (fetchErr) {
          // If localhost failed, try 127.0.0.1 fallback
          if (API_BASE.includes('localhost')) {
            res = await fetch(`http://127.0.0.1:3000/api/admin/login`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ password })
            });
          } else {
            throw fetchErr;
          }
        }

        if (res && res.ok) {
          const data = await res.json();
          sessionStorage.setItem('mc_admin_token', data.token);
          AdminState.isAuth = true;
          modal.classList.add('auth-granted');
          showToast('Access Granted. Studio control active.', 'success');
          loadStories();
          return;
        } else if (res) {
          const errData = await res.json().catch(() => ({}));
          errorMsg.textContent = errData.message || 'Invalid administrator password.';
        }
      } catch (err) {
        if (window.location.protocol === 'file:') {
          errorMsg.innerHTML = 'Browser security blocks API calls on <code>file:///</code>.<br>Please open <a href="http://localhost:3000/admin" style="color:#d4af37;text-decoration:underline;font-weight:700;">http://localhost:3000/admin</a>';
        } else {
          errorMsg.textContent = `Unable to connect to server (${err.message || 'NetworkError'}). Please ensure server is running (npm start) on port 3000.`;
        }
      }

      input.classList.add('shake');
      setTimeout(() => input.classList.remove('shake'), 400);
    });
  }

  // Handle Logout
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      sessionStorage.removeItem('mc_admin_token');
      AdminState.isAuth = false;
      modal.classList.remove('auth-granted');
      input.value = '';
      showToast('Signed out of Studio Portal', 'info');
    });
  }
}

/* ==========================================================================
   2. CLOUDINARY ENVIRONMENT & STATUS
   ========================================================================== */
async function initCloudinaryConfig() {
  const statusPill = document.getElementById('cloudinary-status-pill');
  const statusText = document.getElementById('cloudinary-status-text');
  const bannerTitle = document.getElementById('cloudinary-banner-title');
  const bannerDesc = document.getElementById('cloudinary-banner-desc');
  const openModalBtn = document.getElementById('open-config-modal-btn');
  const closeModalBtn = document.getElementById('close-config-modal-btn');
  const cancelModalBtn = document.getElementById('btn-cancel-config');
  const modal = document.getElementById('cloudinary-config-modal');
  const form = document.getElementById('cloudinary-setup-form');

  // Input Fields
  const inputCloud = document.getElementById('cfg-cloud-name');
  const inputPreset = document.getElementById('cfg-upload-preset');
  const inputKey = document.getElementById('cfg-api-key');

  // Fetch status from server
  async function checkStatus() {
    try {
      const res = await fetch(`${API_BASE}/api/config`);
      if (res.ok) {
        const data = await res.json();
        AdminState.cloudConfig = data;

        // Also check if user set client-side preset in localStorage
        const localCloud = localStorage.getItem('mc_cloudinary_name');
        const localPreset = localStorage.getItem('mc_cloudinary_preset');
        if (localCloud) AdminState.cloudConfig.cloudName = localCloud;
        if (localPreset) AdminState.cloudConfig.uploadPreset = localPreset;

        updateStatusUI();
        return;
      }
    } catch (e) {
      console.log('[Config Check] Server API not responding, checking localStorage');
    }

    // LocalStorage Fallback
    const localCloud = localStorage.getItem('mc_cloudinary_name');
    const localPreset = localStorage.getItem('mc_cloudinary_preset');
    AdminState.cloudConfig = {
      cloudName: localCloud || '',
      uploadPreset: localPreset || '',
      isCloudinaryConfigured: Boolean(localCloud)
    };
    updateStatusUI();
  }

  function updateStatusUI() {
    const { cloudName, isCloudinaryConfigured, isCloudinaryConnected, connectionError } = AdminState.cloudConfig;

    if (isCloudinaryConnected) {
      statusPill.className = 'status-pill connected';
      statusText.textContent = `Cloudinary: Connected (${cloudName})`;
      bannerTitle.textContent = 'Cloudinary Service Connected';
      bannerDesc.textContent = `Direct media upload pipeline is ready via cloud "${cloudName}". Photos will automatically be processed with WebP/AVIF delivery.`;
    } else if (connectionError) {
      statusPill.className = 'status-pill disconnected';
      statusText.textContent = `Cloudinary: ${connectionError}`;
      bannerTitle.textContent = 'Cloudinary Authentication Issue';
      bannerDesc.innerHTML = `Cloudinary reported: <strong>${connectionError}</strong>. Check that your <code>CLOUDINARY_API_KEY</code> and <code>CLOUDINARY_API_SECRET</code> in <code>.env</code> match your Cloudinary Dashboard.`;
    } else if (isCloudinaryConfigured) {
      statusPill.className = 'status-pill';
      statusText.textContent = `Cloudinary: Configured (${cloudName})`;
      bannerTitle.textContent = 'Cloudinary Configured';
      bannerDesc.textContent = `Credentials set for cloud "${cloudName}".`;
    } else {
      statusPill.className = 'status-pill disconnected';
      statusText.textContent = 'Cloudinary: Not Configured';
      bannerTitle.textContent = 'Cloudinary Setup Needed';
      bannerDesc.innerHTML = 'Add your Cloudinary credentials to your <code>.env</code> file.';
    }
  }

  // Modal open/close
  if (openModalBtn) openModalBtn.addEventListener('click', () => modal.classList.add('active'));
  if (closeModalBtn) closeModalBtn.addEventListener('click', () => modal.classList.remove('active'));
  if (cancelModalBtn) cancelModalBtn.addEventListener('click', () => modal.classList.remove('active'));

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const cName = inputCloud.value.trim();
      const cPreset = inputPreset.value.trim();

      if (cName) localStorage.setItem('mc_cloudinary_name', cName);
      if (cPreset) localStorage.setItem('mc_cloudinary_preset', cPreset);

      AdminState.cloudConfig.cloudName = cName;
      AdminState.cloudConfig.uploadPreset = cPreset;
      AdminState.cloudConfig.isCloudinaryConfigured = Boolean(cName);

      updateStatusUI();
      modal.classList.remove('active');
      showToast('Cloudinary client configuration saved!', 'success');
    });
  }

  checkStatus();
}

/* ==========================================================================
   3. MEDIA UPLOADER & AUTO-ORIENTATION ENGINE
   ========================================================================== */
function initMediaUploader() {
  const dropzone = document.getElementById('upload-dropzone');
  const fileInput = document.getElementById('media-file-input');
  const previewWrap = document.getElementById('dropzone-preview-wrap');
  const previewImg = document.getElementById('preview-image-elem');
  const promptWrap = document.getElementById('dropzone-prompt');
  const cancelPreviewBtn = document.getElementById('btn-cancel-preview');
  const directUrlInput = document.getElementById('direct-url-input');
  const altInput = document.getElementById('image-alt-input');
  const submitBtn = document.getElementById('submit-upload-btn');

  // Orientation Buttons
  const btnLandscape = document.getElementById('btn-orient-landscape');
  const btnPortrait = document.getElementById('btn-orient-portrait');
  const orientHint = document.getElementById('auto-orientation-hint');

  // Progress Bar
  const progressWrap = document.getElementById('upload-progress-bar-wrap');
  const progressFill = document.getElementById('upload-progress-fill');
  const progressPct = document.getElementById('upload-progress-pct');
  const progressStatus = document.getElementById('upload-progress-status');

  // Drag & Drop events
  ['dragenter', 'dragover'].forEach(event => {
    dropzone.addEventListener(event, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(event => {
    dropzone.addEventListener(event, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelected(files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      handleFileSelected(fileInput.files[0]);
    }
  });

  if (cancelPreviewBtn) {
    cancelPreviewBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      resetUploader();
    });
  }

  // Orientation toggle manual override
  function setOrientation(orientation, isManual = true) {
    AdminState.selectedOrientation = orientation;
    if (orientation === 'landscape') {
      btnLandscape.classList.add('active');
      btnPortrait.classList.remove('active');
    } else {
      btnPortrait.classList.add('active');
      btnLandscape.classList.remove('active');
    }

    if (isManual && orientHint) {
      orientHint.textContent = '(Manual Override)';
    }
  }

  btnLandscape.addEventListener('click', () => setOrientation('landscape', true));
  btnPortrait.addEventListener('click', () => setOrientation('portrait', true));

  // Process selected file & inspect natural dimensions
  function handleFileSelected(file) {
    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file (WEBP, JPG, PNG).', 'error');
      return;
    }

    AdminState.selectedFile = file;
    const reader = new FileReader();

    reader.onload = (e) => {
      const dataUrl = e.target.result;
      previewImg.src = dataUrl;
      promptWrap.classList.add('hidden');
      previewWrap.classList.remove('hidden');
      submitBtn.removeAttribute('disabled');

      // Detect natural orientation
      const tempImg = new Image();
      tempImg.onload = () => {
        const w = tempImg.naturalWidth;
        const h = tempImg.naturalHeight;
        const autoOrient = w >= h ? 'landscape' : 'portrait';
        setOrientation(autoOrient, false);
        if (orientHint) {
          orientHint.textContent = `(Auto-detected: ${w}×${h}px)`;
        }
      };
      tempImg.src = dataUrl;
    };

    reader.readAsDataURL(file);
  }

  // Direct URL change listener
  directUrlInput.addEventListener('input', () => {
    const url = directUrlInput.value.trim();
    if (url.startsWith('http://') || url.startsWith('https://')) {
      submitBtn.removeAttribute('disabled');
    } else if (!AdminState.selectedFile) {
      submitBtn.setAttribute('disabled', 'true');
    }
  });

  function resetUploader() {
    AdminState.selectedFile = null;
    fileInput.value = '';
    previewImg.src = '';
    previewWrap.classList.add('hidden');
    promptWrap.classList.remove('hidden');
    directUrlInput.value = '';
    if (!directUrlInput.value.trim()) {
      submitBtn.setAttribute('disabled', 'true');
    }
    progressWrap.classList.add('hidden');
    if (orientHint) orientHint.textContent = '(Auto-detected)';
  }

  // Upload Submission Handler
  submitBtn.addEventListener('click', async () => {
    const file = AdminState.selectedFile;
    const directUrl = directUrlInput.value.trim();
    const orientation = AdminState.selectedOrientation;
    const alt = altInput.value.trim() || 'Moment Captured Story';

    if (!file && !directUrl) {
      showToast('Please select an image file or enter an image URL.', 'error');
      return;
    }

    submitBtn.setAttribute('disabled', 'true');
    progressWrap.classList.remove('hidden');
    updateProgress(15, 'Preparing media...');

    try {
      let finalImageUrl = '';
      let finalPublicId = '';

      // Case 1: Direct URL provided
      if (directUrl) {
        updateProgress(60, 'Validating URL...');
        finalImageUrl = directUrl;
      }
      // Case 2: File upload
      else if (file) {
        updateProgress(30, 'Uploading to Cloudinary...');

        // Try server upload API first
        let uploadSuccess = false;
        try {
          const formData = new FormData();
          formData.append('media', file);

          const res = await fetch(`${API_BASE}/api/upload`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: formData
          });

          if (res.status === 401) {
            handleAuthFailure();
            return;
          }

          if (res.ok) {
            const data = await res.json();
            if (data.success && data.url) {
              finalImageUrl = data.url;
              finalPublicId = data.public_id || '';
              uploadSuccess = true;
            }
          } else {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.message || `Server upload error (${res.status})`);
          }
        } catch (e) {
          console.warn('[Server Upload API]', e.message);
          throw e; // propagate clear error to user toast
        }

        // Direct Client-Side Cloudinary Upload fallback (using Cloud Name + Upload Preset)
        if (!uploadSuccess) {
          const cloudName = AdminState.cloudConfig.cloudName;
          const uploadPreset = AdminState.cloudConfig.uploadPreset;

          if (cloudName && uploadPreset) {
            updateProgress(50, 'Uploading via Cloudinary preset...');
            const cloudFormData = new FormData();
            cloudFormData.append('file', file);
            cloudFormData.append('upload_preset', uploadPreset);
            cloudFormData.append('folder', 'moment-captured/stories');

            const cloudRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
              method: 'POST',
              body: cloudFormData
            });

            if (cloudRes.ok) {
              const cloudData = await cloudRes.json();
              finalImageUrl = cloudData.secure_url;
              finalPublicId = cloudData.public_id;
              uploadSuccess = true;
            } else {
              const errData = await cloudRes.json();
              throw new Error(errData.error?.message || 'Cloudinary client upload failed');
            }
          } else {
            // Local fallback (save Base64 URL locally for instant testing if Cloudinary is not yet configured)
            updateProgress(70, 'Saving media locally...');
            finalImageUrl = previewImg.src;
            uploadSuccess = true;
            showToast('Saved locally. To store in Cloudinary CDN, add your Cloud Name in .env.', 'info');
          }
        }
      }

      if (!finalImageUrl) {
        throw new Error('Unable to obtain image URL after upload.');
      }

      updateProgress(85, 'Synchronizing with Stories gallery...');

      // Save story to gallery database
      const storyPayload = {
        imageUrl: finalImageUrl,
        webpUrl: finalImageUrl,
        orientation: orientation,
        alt: alt,
        public_id: finalPublicId
      };

      let savedToServer = false;
      try {
        const saveRes = await fetch(`${API_BASE}/api/stories`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders()
          },
          body: JSON.stringify(storyPayload)
        });

        if (saveRes.status === 401) {
          handleAuthFailure();
          return;
        }

        if (saveRes.ok) {
          savedToServer = true;
        }
      } catch (e) {
        console.log('[Save API] Server unavailable, saving to localStorage');
      }

      // Always sync to localStorage as well so it's guaranteed persistent
      saveStoryLocally(storyPayload);

      updateProgress(100, 'Published successfully!');
      showToast(`Frame successfully added to Stories (${orientation})!`, 'success');
      
      resetUploader();
      loadStories();

    } catch (err) {
      console.error('[Upload Error]', err);
      showToast(`Upload failed: ${err.message}`, 'error');
      submitBtn.removeAttribute('disabled');
      progressWrap.classList.add('hidden');
    }
  });

  function updateProgress(pct, status) {
    progressFill.style.width = `${pct}%`;
    progressPct.textContent = `${pct}%`;
    if (status) progressStatus.textContent = status;
  }
}

/* ==========================================================================
   4. STORIES GALLERY MANAGER (LIVE LIST & DELETE)
   ========================================================================== */
function initStoriesManager() {
  const refreshBtn = document.getElementById('btn-refresh-gallery');
  const filterTabs = document.querySelectorAll('.gallery-filter-tab');

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadStories();
      showToast('Gallery synchronized', 'info');
    });
  }

  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderStories(tab.getAttribute('data-filter'));
    });
  });

  loadStories();
}

async function loadStories() {
  const container = document.getElementById('admin-stories-container');
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE}/api/stories`);
    if (res.ok) {
      const data = await res.json();
      if (data.stories && Array.isArray(data.stories)) {
        AdminState.stories = data.stories;
        renderStories();
        return;
      }
    }
  } catch (e) {
    console.log('[Stories API] Server not responding, reading local stories');
  }

  // Local storage fallback
  const localStories = localStorage.getItem('mc_custom_stories');
  if (localStories) {
    try {
      AdminState.stories = JSON.parse(localStories);
      renderStories();
      return;
    } catch (e) {}
  }

  // Default initial 12 stories if completely empty
  AdminState.stories = [
    { id: 'story-1', imageUrl: 'src/scroll-images/img (8).jpg', orientation: 'landscape', alt: 'The Sacred Promise', createdAt: Date.now() },
    { id: 'story-2', imageUrl: 'src/scroll-images/img (22).jpg', orientation: 'portrait', alt: 'Grace in Solitude', createdAt: Date.now() },
    { id: 'story-3', imageUrl: 'src/scroll-images/img (35).jpg', orientation: 'landscape', alt: 'Echoes of Twilight', createdAt: Date.now() },
    { id: 'story-4', imageUrl: 'src/scroll-images/img (45).jpg', orientation: 'portrait', alt: 'Soulful Intimacy', createdAt: Date.now() },
    { id: 'story-5', imageUrl: 'src/scroll-images/img (65).jpg', orientation: 'landscape', alt: 'Euphoric Revelry', createdAt: Date.now() },
    { id: 'story-6', imageUrl: 'src/scroll-images/img (78).jpg', orientation: 'portrait', alt: 'Timeless Allure', createdAt: Date.now() },
    { id: 'story-7', imageUrl: 'src/scroll-images/img (12).jpg', orientation: 'landscape', alt: 'Golden Reverie', createdAt: Date.now() },
    { id: 'story-8', imageUrl: 'src/scroll-images/img (28).jpg', orientation: 'portrait', alt: 'Unspoken Poetry', createdAt: Date.now() },
    { id: 'story-9', imageUrl: 'src/scroll-images/img (50).jpg', orientation: 'landscape', alt: 'Poetry of Shadows', createdAt: Date.now() },
    { id: 'story-10', imageUrl: 'src/scroll-images/img (60).jpg', orientation: 'portrait', alt: 'Vows in Crimson', createdAt: Date.now() },
    { id: 'story-11', imageUrl: 'src/scroll-images/img (70).jpg', orientation: 'landscape', alt: 'Starlit Chronicle', createdAt: Date.now() },
    { id: 'story-12', imageUrl: 'src/scroll-images/img (84).jpg', orientation: 'portrait', alt: 'The Grand Heritage', createdAt: Date.now() }
  ];

  renderStories();
}

function renderStories(filter = 'all') {
  const container = document.getElementById('admin-stories-container');
  const countBadge = document.getElementById('stories-count-badge');
  if (!container) return;

  const filtered = AdminState.stories.filter(item => {
    if (filter === 'all') return true;
    return item.orientation === filter;
  });

  if (countBadge) {
    countBadge.textContent = `${AdminState.stories.length} Frames`;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 12px; color: var(--admin-border-gold);"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        <p>No ${filter !== 'all' ? filter : ''} stories found in gallery.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(story => {
    const dateStr = story.createdAt ? new Date(story.createdAt).toLocaleDateString() : 'Curated';
    const isCloudinary = (story.imageUrl || '').includes('cloudinary.com');

    return `
      <div class="admin-story-card format-${story.orientation}" data-id="${story.id}">
        <div class="admin-card-thumb-wrap">
          <img src="${story.imageUrl}" alt="${story.alt || 'Story'}" loading="lazy" onerror="this.src='src/scroll-images/img (1).jpg'">
          <span class="admin-badge-orient">${story.orientation}</span>
          <button type="button" class="btn-delete-story" data-id="${story.id}" title="Remove from gallery" aria-label="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
        </div>
        <div class="admin-card-details">
          <span class="admin-card-id" title="${story.alt || story.id}">${isCloudinary ? '☁️ Cloudinary' : '📁 Local / URL'}</span>
          <span class="admin-card-date">${dateStr}</span>
        </div>
      </div>
    `;
  }).join('');

  // Attach delete handlers
  container.querySelectorAll('.btn-delete-story').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      confirmDeleteStory(id);
    });
  });
}

async function confirmDeleteStory(id) {
  if (!confirm('Are you sure you want to remove this frame from the live Stories gallery?')) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/stories/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (res.status === 401) {
      handleAuthFailure();
      return;
    }

    if (res.ok) {
      showToast('Frame removed from gallery', 'success');
    }
  } catch (e) {
    console.log('[Delete API] Local deletion fallback');
  }

  // Remove from local memory & localStorage
  AdminState.stories = AdminState.stories.filter(s => s.id !== id);
  localStorage.setItem('mc_custom_stories', JSON.stringify(AdminState.stories));
  renderStories();
  showToast('Frame removed', 'info');
}

function saveStoryLocally(story) {
  let localList = [];
  try {
    const saved = localStorage.getItem('mc_custom_stories');
    if (saved) localList = JSON.parse(saved);
  } catch (e) {}

  localList.unshift({
    id: 'story-' + Date.now(),
    ...story,
    createdAt: Date.now()
  });

  localStorage.setItem('mc_custom_stories', JSON.stringify(localList));
}

/* ==========================================================================
   5. TOAST NOTIFICATION UTILITY
   ========================================================================== */
function showToast(message, type = 'info') {
  const box = document.getElementById('admin-toast-box');
  if (!box) return;

  const toast = document.createElement('div');
  toast.className = `admin-toast ${type}`;
  toast.innerHTML = `
    <span>${message}</span>
  `;

  box.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
