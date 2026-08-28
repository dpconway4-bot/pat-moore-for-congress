(function () {
  'use strict';

  /* ---------- Theme toggle ---------- */
  var toggle = document.querySelector('[data-theme-toggle]');
  var root = document.documentElement;
  var theme = matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
  root.setAttribute('data-theme', theme);

  function paintToggleIcon() {
    if (!toggle) return;
    toggle.setAttribute('aria-label', 'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' mode');
    toggle.innerHTML =
      theme === 'dark'
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  }
  paintToggleIcon();

  if (toggle) {
    toggle.addEventListener('click', function () {
      theme = theme === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', theme);
      paintToggleIcon();
    });
  }

  /* ---------- Sticky header hide/show ---------- */
  var header = document.getElementById('site-header');
  var lastY = window.scrollY;
  window.addEventListener(
    'scroll',
    function () {
      var y = window.scrollY;
      if (!header) return;
      if (y > 80 && y > lastY) {
        header.classList.add('site-header--hidden');
      } else {
        header.classList.remove('site-header--hidden');
      }
      header.classList.toggle('site-header--scrolled', y > 8);
      lastY = y;
    },
    { passive: true }
  );

  /* ---------- Mobile nav ---------- */
  var navToggle = document.getElementById('nav-toggle');
  var mobileNav = document.getElementById('mobile-nav');
  if (navToggle && mobileNav) {
    navToggle.addEventListener('click', function () {
      var isOpen = mobileNav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });
    mobileNav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        mobileNav.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ---------- Scroll reveal ---------- */
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    revealEls.forEach(function (el) {
      io.observe(el);
    });
  } else {
    revealEls.forEach(function (el) {
      el.classList.add('is-visible');
    });
  }

  /* ---------- Donate: custom amount -> ActBlue ---------- */
  var ACTBLUE_FORM_URL = 'https://secure.actblue.com/donate/patmooreforcongress';
  var modal = document.getElementById('donate-modal');
  var modalClose = document.getElementById('modal-close');
  var modalOk = document.getElementById('modal-ok');

  function openModal() {
    if (!modal) return;
    modal.classList.add('is-open');
    modal.querySelector('.modal-card').focus();
  }
  function closeModal() {
    if (!modal) return;
    modal.classList.remove('is-open');
  }

  var donateCustomInput = document.getElementById('donate-custom-input');
  var donateCustomBtn = document.getElementById('donate-custom-btn');
  if (donateCustomBtn) {
    donateCustomBtn.addEventListener('click', function () {
      var raw = donateCustomInput ? donateCustomInput.value.trim().replace(/[^0-9.]/g, '') : '';
      var amount = parseFloat(raw);
      if (!raw || isNaN(amount) || amount <= 0) {
        openModal();
        return;
      }
      var url = ACTBLUE_FORM_URL + '?amount=' + encodeURIComponent(amount);
      window.open(url, '_blank', 'noopener');
    });
  }

  if (modalClose) modalClose.addEventListener('click', closeModal);
  if (modalOk) modalOk.addEventListener('click', closeModal);
  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal();
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });

  /* ---------- Share / copy link ---------- */
  function shareOrCopy() {
    var url = window.location.href;
    if (navigator.share) {
      navigator.share({
        title: 'Pat Moore for Congress',
        text: 'This is home. Pat Moore is running for Congress in Louisiana\'s 5th District. Join the movement.',
        url: url,
      }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).catch(function () {});
    }
  }
  var shareHero = document.getElementById('share-btn-hero');
  if (shareHero) shareHero.addEventListener('click', shareOrCopy);

  var copyBtn = document.getElementById('share-btn-copy');
  if (copyBtn) {
    copyBtn.addEventListener('click', function (e) {
      e.preventDefault();
      shareOrCopy();
    });
  }
})();
