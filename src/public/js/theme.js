/**
 * BEST Freight ERP - Theme Manager
 * Handles dark/light theme switching with persistence
 */

(function() {
  'use strict';

  const THEME_KEY = 'bestfreight-theme';
  const DARK = 'dark';
  const LIGHT = 'light';

  /**
   * Get the user's preferred theme
   * Priority: localStorage > OS preference > default (dark)
   */
  function getPreferredTheme() {
    // Check localStorage first
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === DARK || savedTheme === LIGHT) {
      return savedTheme;
    }

    // Check OS preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return LIGHT;
    }

    // Default to dark theme
    return DARK;
  }

  /**
   * Apply theme to the document
   */
  function applyTheme(theme) {
    // Apply to html element immediately
    document.documentElement.setAttribute('data-theme', theme);
    
    // Apply to body if it exists
    if (document.body) {
      document.body.setAttribute('data-theme', theme);
    }
    
    // Also try to apply to any element with existing data-theme
    document.querySelectorAll('[data-theme]').forEach(el => {
      el.setAttribute('data-theme', theme);
    });
    
    // Update meta theme-color for mobile browsers
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', theme === DARK ? '#0a1628' : '#f8fafc');
    }

    // Update toggle button icons
    updateToggleIcons(theme);
    
    // Force repaint to ensure CSS variables are recalculated
    document.documentElement.style.display = 'none';
    document.documentElement.offsetHeight; // Trigger reflow
    document.documentElement.style.display = '';
  }

  /**
   * Save theme preference to localStorage
   */
  function saveTheme(theme) {
    localStorage.setItem(THEME_KEY, theme);
  }

  /**
   * Toggle between dark and light themes
   */
  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || DARK;
    const newTheme = currentTheme === DARK ? LIGHT : DARK;
    
    console.log('[ThemeManager] Toggling theme:', currentTheme, '->', newTheme);
    
    applyTheme(newTheme);
    saveTheme(newTheme);
    
    // Dispatch custom event for other scripts to listen to
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: newTheme } }));
  }

  /**
   * Update toggle button icons based on current theme
   * Note: With the new CSS-based toggle, this function just ensures proper state
   */
  function updateToggleIcons(theme) {
    // Icons are now controlled by CSS based on data-theme attribute
    // This function is kept for any custom toggle implementations
    const toggleBtns = document.querySelectorAll('.theme-toggle');
    toggleBtns.forEach(btn => {
      btn.setAttribute('aria-pressed', theme === LIGHT ? 'true' : 'false');
    });
  }

  /**
   * Initialize theme toggle buttons
   */
  function initToggleButtons() {
    // Direct binding to toggle buttons - only bind once per button
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      if (!btn.hasAttribute('data-theme-bound')) {
        btn.setAttribute('data-theme-bound', 'true');
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          toggleTheme();
        });
      }
    });
  }

  /**
   * Listen for OS theme changes
   */
  function listenForOSThemeChanges() {
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
      mediaQuery.addEventListener('change', function(e) {
        // Only auto-switch if user hasn't manually set a preference
        if (!localStorage.getItem(THEME_KEY)) {
          applyTheme(e.matches ? LIGHT : DARK);
        }
      });
    }
  }

  /**
   * Initialize the theme system
   */
  function init() {
    // Apply theme immediately to prevent flash (on documentElement)
    const theme = getPreferredTheme();
    applyTheme(theme);

    // Set up toggle buttons when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        // Re-apply theme to body now that it exists
        if (document.body) {
          document.body.setAttribute('data-theme', theme);
        }
        initToggleButtons();
        updateToggleIcons(theme);
      });
    } else {
      // Re-apply theme to body
      if (document.body) {
        document.body.setAttribute('data-theme', theme);
      }
      initToggleButtons();
      updateToggleIcons(theme);
    }

    // Listen for OS theme changes
    listenForOSThemeChanges();
  }

  // Expose functions globally for manual control
  window.ThemeManager = {
    toggle: toggleTheme,
    set: function(theme) {
      if (theme === DARK || theme === LIGHT) {
        applyTheme(theme);
        saveTheme(theme);
      }
    },
    get: function() {
      return document.documentElement.getAttribute('data-theme') || DARK;
    },
    DARK: DARK,
    LIGHT: LIGHT
  };

  // Initialize immediately
  init();
})();
