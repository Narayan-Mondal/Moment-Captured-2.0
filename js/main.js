/**
 * Moment Captured - Fine Art Photography Portfolio
 * Core Interactive & Smooth Canvas Scroll Engine
 */

document.addEventListener('DOMContentLoaded', () => {
  initScrollSequence();
  initNavbarAndDrawer();
  initPricePopup();
  initPortfolioFilter();
  initLightbox();
  initBookingForm();
  initToast();
});

/* ==========================================================================
   1. CINEMATIC CANVAS SCROLL ANIMATION ENGINE
   ========================================================================== */
const TOTAL_FRAMES = 87;
const FRAME_BASE_PATH = 'src/scroll-images/img ('; // e.g. "src/scroll-images/img (1).jpg"
const FRAME_EXTENSION = ').jpg';

function initScrollSequence() {
  const section = document.getElementById('hero') || document.querySelector('.cinematic-scroll-section');
  const canvas = document.getElementById('cinematic-canvas');
  if (!section || !canvas) return;

  const ctx = canvas.getContext('2d');
  const preloader = document.getElementById('sequence-preloader');
  const preloaderFill = document.getElementById('preloader-fill');
  const preloaderPercent = document.getElementById('preloader-percent');
  const scrubLine = document.getElementById('cinematic-scrub-line');

  // Foreground & Storytelling Elements
  const heroStage = document.getElementById('hero-stage-content');
  const siteHeader = document.getElementById('site-header');
  const mainBottomNavbar = document.getElementById('main-bottom-navbar');
  const storySteps = document.querySelectorAll('.cinematic-story-step');
  const step1 = document.getElementById('story-step-1');
  const step2 = document.getElementById('story-step-2');
  const step3 = document.getElementById('story-step-3');
  const step4 = document.getElementById('story-step-4');
  const images = [];
  let loadedCount = 0;
  let targetFrame = 1;
  let currentFrame = 1;
  let isInitialFrameRendered = false;

  // Resize canvas to full viewport with device pixel ratio
  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    drawFrame(Math.round(currentFrame));
  }

  window.addEventListener('resize', resizeCanvas, { passive: true });

  // Draw frame with aspect ratio cover
  function drawFrame(frameIndex) {
    const safeIndex = Math.min(TOTAL_FRAMES, Math.max(1, frameIndex));
    const img = images[safeIndex];
    if (!img || !img.complete || img.naturalWidth === 0) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const imgWidth = img.naturalWidth;
    const imgHeight = img.naturalHeight;

    const canvasRatio = canvasWidth / canvasHeight;
    const imgRatio = imgWidth / imgHeight;

    let renderW, renderH, offsetX, offsetY;

    if (canvasRatio > imgRatio) {
      renderW = canvasWidth;
      renderH = canvasWidth / imgRatio;
      offsetX = 0;
      // Preserve upper third headroom so subject's face is always in prime view
      offsetY = (canvasHeight - renderH) * 0.35;
    } else {
      renderH = canvasHeight;
      renderW = canvasHeight * imgRatio;
      offsetX = (canvasWidth - renderW) / 2;
      offsetY = 0;
    }

    ctx.drawImage(img, offsetX, offsetY, renderW, renderH);
  }

  // Preloading system
  function preloadImages() {
    resizeCanvas();

    // Priority 1: load first image right away
    const firstImg = new Image();
    firstImg.src = encodeURI(`${FRAME_BASE_PATH}1${FRAME_EXTENSION}`);
    firstImg.onload = () => {
      images[1] = firstImg;
      loadedCount++;
      if (!isInitialFrameRendered) {
        drawFrame(1);
        isInitialFrameRendered = true;
      }
      loadRemainingFrames();
    };
    firstImg.onerror = () => {
      firstImg.src = `src/scroll-images/img (1).jpg`;
    };
  }

  function loadRemainingFrames() {
    for (let i = 2; i <= TOTAL_FRAMES; i++) {
      const img = new Image();
      img.src = encodeURI(`${FRAME_BASE_PATH}${i}${FRAME_EXTENSION}`);

      img.onload = () => {
        images[i] = img;
        loadedCount++;
        const percent = Math.round((loadedCount / TOTAL_FRAMES) * 100);
        if (preloaderFill) preloaderFill.style.width = `${percent}%`;
        if (preloaderPercent) preloaderPercent.textContent = `${percent}%`;

        // Once at least 25% loaded or all loaded, allow seamless user experience
        if (loadedCount >= 22 && preloader && !preloader.classList.contains('loaded')) {
          preloader.classList.add('loaded');
        }
      };

      img.onerror = () => {
        // Fallback with URI encoding
        img.src = encodeURI(`src/scroll-images/img (${i}).jpg`);
      };
    }
  }

  // Calculate target frame and synchronize visual layers on scroll
  function updateScrollProgress() {
    const rect = section.getBoundingClientRect();
    const scrollableDistance = section.offsetHeight - window.innerHeight;

    // Check if user is inside the cinematic animation section
    const isInView = rect.top <= 10 && rect.bottom >= window.innerHeight - 10;
    const isScrolled = window.scrollY > 20;

    if (isScrolled) {
      document.body.classList.add('is-scrolled');
    } else {
      document.body.classList.remove('is-scrolled');
    }

    if (scrollableDistance <= 0) return;

    const scrolledAmount = -rect.top;
    let progress = scrolledAmount / scrollableDistance;
    progress = Math.max(0, Math.min(1, progress));

    // Start scroll animation frame scrubbing immediately upon scrolling
    targetFrame = 1 + progress * (TOTAL_FRAMES - 1);

    // =========================================================================
    // DUAL NAVBAR SCROLL CONTROLLER:
    // - Hide upper mini navbar on scroll (scrollY > 15)
    // - NEVER hide second bottom navbar (stays pinned at top: 0)
    // - At scrolling time inside animation: transparent background on its same position
    // - Outside animation: frosted solid dark glassmorphism
    // =========================================================================
    if (siteHeader) {
      siteHeader.classList.toggle('hide-upper-nav', window.scrollY > 15);
    }

    if (mainBottomNavbar) {
      if (isInView) {
        document.body.classList.add('in-cinematic-mode');
        mainBottomNavbar.classList.add('transparent-navbar');
        mainBottomNavbar.classList.remove('scrolled-solid');
      } else {
        document.body.classList.remove('in-cinematic-mode');
        mainBottomNavbar.classList.remove('transparent-navbar');
        if (window.scrollY > 80) {
          mainBottomNavbar.classList.add('scrolled-solid');
        } else {
          mainBottomNavbar.classList.remove('scrolled-solid');
        }
      }
    }

    // =========================================================================
    // STARTING CONTENT (HERO STAGE OVERLAY):
    // Carried at the start in safe bottom zone, smoothly glides up & fades as animation begins
    // =========================================================================
    if (heroStage) {
      if (progress <= 0.12) {
        const heroAlpha = Math.max(0, 1 - (progress / 0.10));
        heroStage.style.opacity = heroAlpha.toFixed(3);
        heroStage.style.transform = 'translateX(-50%)';
        heroStage.style.pointerEvents = progress < 0.03 ? 'auto' : 'none';
        heroStage.style.visibility = heroAlpha > 0.01 ? 'visible' : 'hidden';
      } else {
        heroStage.style.opacity = '0';
        heroStage.style.visibility = 'hidden';
        heroStage.style.pointerEvents = 'none';
      }
    }

    // =========================================================================
    // SIDE STORYTELLING CARDS & CHAPTER NAVIGATION:
    // Carried on the side while the scroll animation acts on the background
    // =========================================================================
    if (isInView) {
      // Step 1: 01 // The Essence (16% to 35% | Frames ~14 to 30) on left side
      if (step1) step1.classList.toggle('active', progress >= 0.16 && progress <= 0.35);

      // Step 2: 02 // The Artistry (37% to 55% | Frames ~32 to 48) on right side
      if (step2) step2.classList.toggle('active', progress >= 0.37 && progress <= 0.55);

      // Step 3: 03 // The Devotion (57% to 75% | Frames ~50 to 65) on left side
      if (step3) step3.classList.toggle('active', progress >= 0.57 && progress <= 0.75);

      // Step 4: 04 // The Legacy (77% to 95% | Frames ~67 to 83) in center with CTAs
      if (step4) step4.classList.toggle('active', progress >= 0.77 && progress <= 0.95);

      // Frame HUD & chapter indicators removed
    } else {
      storySteps.forEach(s => s.classList.remove('active'));
    }

    if (scrubLine) {
      scrubLine.style.width = `${progress * 100}%`;
    }
  }

  // Chapter indicators click handler removed

  // Animation render loop with smooth interpolation (LERP)
  function renderLoop() {
    // Smooth frame lerp for buttery transitions
    currentFrame += (targetFrame - currentFrame) * 0.18;

    const frameToDraw = Math.round(currentFrame);
    drawFrame(frameToDraw);

    requestAnimationFrame(renderLoop);
  }

  window.addEventListener('scroll', updateScrollProgress, { passive: true });

  preloadImages();
  renderLoop();
  updateScrollProgress();
}

/* ==========================================================================
   2. NAVBAR, MOBILE DRAWER & ACTIVE LINK TRACKING
   ========================================================================== */
function initNavbarAndDrawer() {
  const hamburger = document.getElementById('hamburger-btn');
  const mobileDrawer = document.getElementById('mobile-drawer');
  const drawerOverlay = document.getElementById('drawer-overlay');
  const mobileLinks = document.querySelectorAll('.mobile-nav-link');
  const navLinks = document.querySelectorAll('.nav-link');
  const sections = document.querySelectorAll('section[id]');

  function toggleDrawer() {
    const isOpen = mobileDrawer.classList.contains('open');
    if (isOpen) {
      mobileDrawer.classList.remove('open');
      drawerOverlay.classList.remove('open');
      hamburger.classList.remove('open');
      document.body.style.overflow = '';
    } else {
      mobileDrawer.classList.add('open');
      drawerOverlay.classList.add('open');
      hamburger.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
  }

  if (hamburger) hamburger.addEventListener('click', toggleDrawer);
  if (drawerOverlay) drawerOverlay.addEventListener('click', toggleDrawer);

  mobileLinks.forEach(link => {
    link.addEventListener('click', () => {
      toggleDrawer();
    });
  });

  // Track active section on scroll
  window.addEventListener('scroll', () => {
    let current = '';
    const scrollPos = window.scrollY + 200;

    sections.forEach(section => {
      const top = section.offsetTop;
      const height = section.offsetHeight;
      if (scrollPos >= top && scrollPos < top + height) {
        current = section.getAttribute('id');
      }
    });

    navLinks.forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('href') === `#${current}`) {
        link.classList.add('active');
      }
    });
  }, { passive: true });
}

/* ==========================================================================
   3. PORTFOLIO FILTER SYSTEM
   ========================================================================== */
function initPortfolioFilter() {
  const filterBtns = document.querySelectorAll('.filter-btn');
  const portfolioItems = document.querySelectorAll('.portfolio-item');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filter = btn.getAttribute('data-filter');

      portfolioItems.forEach(item => {
        const category = item.getAttribute('data-category');
        if (filter === 'all' || category === filter) {
          item.style.display = 'block';
          setTimeout(() => {
            item.style.opacity = '1';
            item.style.transform = 'translateY(0) scale(1)';
          }, 30);
        } else {
          item.style.opacity = '0';
          item.style.transform = 'translateY(20px) scale(0.95)';
          setTimeout(() => {
            item.style.display = 'none';
          }, 300);
        }
      });
    });
  });
}

/* ==========================================================================
   4. LIGHTBOX MODAL
   ========================================================================== */
function initLightbox() {
  const modal = document.getElementById('lightbox-modal');
  const modalImg = document.getElementById('lightbox-img');
  const modalCaption = document.getElementById('lightbox-caption');
  const closeBtn = document.getElementById('lightbox-close');
  const items = document.querySelectorAll('.portfolio-item');

  if (!modal || !modalImg) return;

  items.forEach(item => {
    item.addEventListener('click', () => {
      const img = item.querySelector('.portfolio-img');
      const title = item.querySelector('.portfolio-item-title')?.textContent || '';
      const category = item.querySelector('.portfolio-item-category')?.textContent || '';

      if (img) {
        modalImg.src = img.src;
        if (modalCaption) {
          modalCaption.textContent = `${category} — ${title}`;
        }
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
      }
    });
  });

  function closeModal() {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }

  if (closeBtn) closeBtn.addEventListener('click', closeModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      closeModal();
    }
  });
}

/* ==========================================================================
   5. BOOKING FORM & DIRECT WHATSAPP / EMAIL DISPATCH
   ========================================================================== */
function initBookingForm() {
  const form = document.getElementById('booking-inquiry-form');
  const btnWhatsApp = document.getElementById('btn-send-whatsapp');
  const btnEmail = document.getElementById('btn-send-email');

  function collectFormData() {
    const name = document.getElementById('form-name')?.value.trim() || 'Client';
    const phone = document.getElementById('form-phone')?.value.trim() || '';
    const email = document.getElementById('form-email')?.value.trim() || '';
    const service = document.getElementById('form-service')?.value || 'Photography Consultation';
    const date = document.getElementById('form-date')?.value || 'To be decided';
    const location = document.getElementById('form-location')?.value.trim() || 'Unspecified';
    const notes = document.getElementById('form-notes')?.value.trim() || '';

    return { name, phone, email, service, date, location, notes };
  }

  if (btnWhatsApp) {
    btnWhatsApp.addEventListener('click', (e) => {
      e.preventDefault();
      const data = collectFormData();
      if (!data.phone && !data.name) {
        showToast('Please enter your name and contact number.');
        return;
      }

      const message = `Hello Moment Captured Team! 📷✨%0A%0AI would like to inquire about booking a photography session:%0A` +
        `• *Name*: ${encodeURIComponent(data.name)}%0A` +
        `• *Phone*: ${encodeURIComponent(data.phone)}%0A` +
        `• *Email*: ${encodeURIComponent(data.email)}%0A` +
        `• *Service*: ${encodeURIComponent(data.service)}%0A` +
        `• *Estimated Date*: ${encodeURIComponent(data.date)}%0A` +
        `• *Location*: ${encodeURIComponent(data.location)}%0A` +
        (data.notes ? `• *Vision/Details*: ${encodeURIComponent(data.notes)}%0A` : '') +
        `%0ALooking forward to creating timeless memories with you!`;

      const waUrl = `https://wa.me/919475665668?text=${message}`;
      window.open(waUrl, '_blank');
      showToast('Opening WhatsApp with your booking details...');
    });
  }

  if (btnEmail) {
    btnEmail.addEventListener('click', (e) => {
      e.preventDefault();
      const data = collectFormData();

      const subject = encodeURIComponent(`Booking Inquiry: ${data.service} - ${data.name}`);
      const body = encodeURIComponent(
        `Dear Moment Captured Team,\n\n` +
        `I would love to check your availability for a photography session:\n\n` +
        `Name: ${data.name}\n` +
        `Phone: ${data.phone}\n` +
        `Email: ${data.email}\n` +
        `Service Requested: ${data.service}\n` +
        `Preferred Date: ${data.date}\n` +
        `Event Location: ${data.location}\n` +
        `Notes/Vision: ${data.notes}\n\n` +
        `Warm regards,\n${data.name}`
      );

      // Support primary email momentcapturedteam@gmail.com
      const mailtoUrl = `mailto:momentcapturedteam@gmail.com?subject=${subject}&body=${body}`;
      window.location.href = mailtoUrl;
      showToast('Opening your mail client...');
    });
  }

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (btnWhatsApp) btnWhatsApp.click();
    });
  }
}

/* ==========================================================================
   6. TOAST NOTIFICATION
   ========================================================================== */
function showToast(message) {
  let toast = document.getElementById('toast-notice');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-notice';
    toast.className = 'toast-notice';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}
function initToast() {
  // ready
}


/* ==========================================================================
   GET PRICE DETAILS POPUP ENGINE
   - Auto-opens after a few seconds (5s)
   - Auto-opens when cursor stops hovering / idle (7s of inactivity)
   - Opens on exit-intent
   - Opens on "Get Price" button clicks
   - 3-Stage Workflow: Offer -> Form -> Success Confirmation
   ========================================================================== */
function initPricePopup() {
  const modal = document.getElementById('price-popup-modal');
  const backdrop = document.getElementById('price-popup-backdrop');
  const closeBtn = document.getElementById('price-popup-close-btn');
  const openButtons = document.querySelectorAll('.open-price-popup-btn, #nav-get-price-btn, #drawer-get-price-btn');

  // Stages
  const stageOffer = document.getElementById('popup-stage-offer');
  const stageForm = document.getElementById('popup-stage-form');
  const stageSuccess = document.getElementById('popup-stage-success');

  // Stage Switchers
  const gotoFormBtn = document.getElementById('popup-goto-form-btn');
  const knowledgeBtn = document.getElementById('popup-goto-portfolio-btn');
  const backBtn = document.getElementById('popup-back-btn');
  const doneBtn = document.getElementById('popup-success-done-btn');
  const form = document.getElementById('price-inquiry-form');
  const successUserName = document.getElementById('success-user-name');
  const whatsappDirectLink = document.getElementById('popup-whatsapp-direct-link');

  if (!modal) return;

  // Set min date to today for date picker
  const dateInput = document.getElementById('price-date');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.min = today;
  }

  let isPopupOpen = false;
  let hasAutoPopped = false;
  let idleTimer = null;
  const AUTO_POP_DELAY = 4500; // ~4.5 seconds after page open
  const IDLE_DELAY = 6000;     // 6 seconds when cursor stops hovering / idle

  function showStage(stageToShow) {
    [stageOffer, stageForm, stageSuccess].forEach(stage => {
      if (stage) stage.classList.add('popup-stage-hidden');
    });
    if (stageToShow) stageToShow.classList.remove('popup-stage-hidden');
  }

  function openPopup(targetStage = stageOffer) {
    if (isPopupOpen) return;
    isPopupOpen = true;
    showStage(targetStage);
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closePopup() {
    if (!isPopupOpen) return;
    isPopupOpen = false;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  // Trigger 1: Open after few seconds when user opens the page
  setTimeout(() => {
    if (!hasAutoPopped && !isPopupOpen && !sessionStorage.getItem('pricePopupSubmitted')) {
      hasAutoPopped = true;
      openPopup(stageOffer);
    }
  }, AUTO_POP_DELAY);

  // Trigger 2: Open after time when cursor stops hovering (idle timer)
  function resetIdleHoverTimer() {
    if (isPopupOpen || hasAutoPopped) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!isPopupOpen && !hasAutoPopped && !sessionStorage.getItem('pricePopupSubmitted')) {
        hasAutoPopped = true;
        openPopup(stageOffer);
      }
    }, IDLE_DELAY);
  }

  window.addEventListener('mousemove', resetIdleHoverTimer, { passive: true });
  window.addEventListener('scroll', resetIdleHoverTimer, { passive: true });
  window.addEventListener('keydown', resetIdleHoverTimer, { passive: true });

  // Trigger 3: Exit-intent when cursor moves to the top edge
  document.addEventListener('mouseleave', (e) => {
    if (e.clientY <= 10 && !isPopupOpen && !hasAutoPopped && !sessionStorage.getItem('pricePopupSubmitted')) {
      hasAutoPopped = true;
      openPopup(stageOffer);
    }
  });

  // Manual Trigger: Buttons with "Get Price"
  openButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetStage = btn.getAttribute('data-target-stage') === 'form' ? stageForm : stageOffer;
      openPopup(targetStage);
    });
  });

  // Close triggers
  if (closeBtn) closeBtn.addEventListener('click', closePopup);
  if (backdrop) backdrop.addEventListener('click', closePopup);
  if (doneBtn) doneBtn.addEventListener('click', closePopup);
  if (knowledgeBtn) {
    knowledgeBtn.addEventListener('click', () => {
      closePopup();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isPopupOpen) {
      closePopup();
    }
  });

  // Switch to Form stage
  if (gotoFormBtn) {
    gotoFormBtn.addEventListener('click', () => {
      showStage(stageForm);
      const nameInput = document.getElementById('price-name');
      if (nameInput) setTimeout(() => nameInput.focus(), 150);
    });
  }

  // Back to Offer stage
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      showStage(stageOffer);
    });
  }

  // Form submission handler
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const nameInput = document.getElementById('price-name');
      const dateInput = document.getElementById('price-date');
      const whatsappInput = document.getElementById('price-whatsapp');
      const emailInput = document.getElementById('price-gmail');

      const nameVal = nameInput ? nameInput.value.trim() : '';
      const dateVal = dateInput ? dateInput.value.trim() : '';
      const whatsappVal = whatsappInput ? whatsappInput.value.trim() : '';
      const emailVal = emailInput ? emailInput.value.trim() : '';

      // Validation
      let isValid = true;

      const nameErr = document.getElementById('price-name-error');
      const dateErr = document.getElementById('price-date-error');
      const whatsappErr = document.getElementById('price-whatsapp-error');
      const emailErr = document.getElementById('price-gmail-error');

      if (nameErr) nameErr.textContent = '';
      if (dateErr) dateErr.textContent = '';
      if (whatsappErr) whatsappErr.textContent = '';
      if (emailErr) emailErr.textContent = '';

      if (!nameVal || nameVal.length < 2) {
        if (nameErr) nameErr.textContent = 'Please enter your name.';
        isValid = false;
      }

      if (!dateVal) {
        if (dateErr) dateErr.textContent = 'Please select your event date.';
        isValid = false;
      }

      const cleanPhone = whatsappVal.replace(/\D/g, '');
      if (!cleanPhone || cleanPhone.length < 10) {
        if (whatsappErr) whatsappErr.textContent = 'Please enter a valid 10-digit WhatsApp number.';
        isValid = false;
      }

      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailVal || !emailPattern.test(emailVal)) {
        if (emailErr) emailErr.textContent = 'Please enter a valid email address.';
        isValid = false;
      }

      if (!isValid) return;

      // Submission Success
      const submitBtn = document.getElementById('popup-submit-btn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Submitting Details...</span>';
      }

      setTimeout(() => {
        if (successUserName) {
          successUserName.textContent = nameVal;
        }

        // Prepare pre-filled WhatsApp link for direct fast chat
        if (whatsappDirectLink) {
          const waMessage = encodeURIComponent(
            `Hello Moment Captured Team! My name is ${nameVal}. I am planning an event on ${dateVal}. Please share your pricing packages & availability. (WhatsApp: ${whatsappVal}, Email: ${emailVal})`
          );
          whatsappDirectLink.href = `https://wa.me/919475665668?text=${waMessage}`;
        }

        // Show Success Popup stage
        showStage(stageSuccess);

        // Reset submit button state
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span>SUBMIT DETAILS</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
        }

        form.reset();
        sessionStorage.setItem('pricePopupSubmitted', 'true');
      }, 700);
    });
  }
}
