// Adds a hamburger toggle to .navbar on mobile (≤600px). Injects its own CSS.
// Requires Font Awesome on the page (used by .fa-bars icon).

(function () {
  'use strict';

  // Inject styles once
  if (!document.getElementById('nav-mobile-style')) {
    const css = `
      .nav-toggle{display:none;background:none;border:none;font-size:20px;cursor:pointer;color:#0d1b4b;padding:6px 11px;border-radius:7px;margin-left:auto}
      .nav-toggle:hover{background:#f4f5f7}
      .nav-toggle:focus{outline:2px solid #1a56db;outline-offset:2px}
      @media(max-width:600px){
        .nav-toggle{display:inline-flex;align-items:center;justify-content:center}
        .navbar .container{position:relative}
        .nav-menu{display:none!important;position:absolute;top:100%;left:0;right:0;background:#fff;flex-direction:column;align-items:stretch;padding:8px 16px 14px;border-bottom:1px solid #e5e7eb;box-shadow:0 8px 24px rgba(0,0,0,.08);z-index:99;gap:0}
        .navbar.nav-open .nav-menu{display:flex!important}
        .nav-menu .nav-link{display:block!important;padding:12px 6px;border-radius:0;border-bottom:1px solid #f1f5f9;font-size:15px}
        .nav-menu .nav-link:last-of-type{border-bottom:none}
        .nav-menu .nav-auth{margin-top:10px}
        .nav-menu .nav-btn{display:block;text-align:center;padding:11px;width:100%}
      }
    `;
    const style = document.createElement('style');
    style.id = 'nav-mobile-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function attach() {
    const navbars = document.querySelectorAll('.navbar');
    navbars.forEach((navbar) => {
      const container = navbar.querySelector('.container') || navbar;
      if (container.querySelector('.nav-toggle')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nav-toggle';
      btn.setAttribute('aria-label', 'Mở menu');
      btn.innerHTML = '<i class="fa-solid fa-bars"></i>';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        navbar.classList.toggle('nav-open');
      });
      container.appendChild(btn);
    });
    // Close when clicking outside any navbar
    document.addEventListener('click', (e) => {
      document.querySelectorAll('.navbar.nav-open').forEach((nb) => {
        if (!nb.contains(e.target)) nb.classList.remove('nav-open');
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
})();
