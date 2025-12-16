/**
 * Admin Broadcast Notification Client
 * Listens for admin_notification events and shows full-screen overlay
 * This runs on ALL pages (including admin panel)
 */
(function() {
  'use strict';

  // Don't run on login page
  if (window.location.pathname === '/login') return;

  // Wait for socket.io to be available
  if (typeof io === 'undefined') {
    console.warn('[AdminNotification] Socket.io not available');
    return;
  }

  function initAdminBroadcast(socket) {
    var notificationQueue = [];
    var isShowingNotification = false;
    var queuedNotificationIds = new Set();
    var LAST_SEEN_STORAGE_KEY = 'adminBroadcastLastSeenId';
    var BROADCAST_FETCH_LIMIT = 10;
    var BROADCAST_ENDPOINT = '/notifications/admin-broadcasts';
    var lastSeenId = readLastSeenId();

    function readLastSeenId() {
      if (typeof localStorage === 'undefined') return 0;
      try {
        var stored = localStorage.getItem(LAST_SEEN_STORAGE_KEY);
        var parsed = parseInt(stored, 10);
        return Number.isFinite(parsed) ? parsed : 0;
      } catch (err) {
        console.warn('[AdminNotification] Unable to read last seen id', err);
        return 0;
      }
    }

    function writeLastSeenId(id) {
      if (typeof localStorage === 'undefined') return;
      try {
        localStorage.setItem(LAST_SEEN_STORAGE_KEY, String(id));
      } catch (err) {
        console.warn('[AdminNotification] Unable to persist last seen id', err);
      }
    }

    function parseNotificationId(value) {
      var id = parseInt(value, 10);
      return Number.isFinite(id) ? id : null;
    }

    function markNotificationSeen(data) {
      var id = parseNotificationId(data && data.id);
      if (id !== null && id > lastSeenId) {
        lastSeenId = id;
        writeLastSeenId(id);
      }
    }

    function queueNotification(data) {
      if (!data) return;
      var id = parseNotificationId(data.id);
      if (id !== null) {
        if (id <= lastSeenId) return;
        if (queuedNotificationIds.has(id)) return;
        queuedNotificationIds.add(id);
      }
      notificationQueue.push(data);
      processQueue();
    }

    // Inject styles
    function injectStyles() {
      if (document.getElementById('admin-broadcast-styles')) return;
      
      var styles = document.createElement('style');
      styles.id = 'admin-broadcast-styles';
      styles.textContent = '\
        .admin-broadcast-overlay {\
          position: fixed;\
          top: 0;\
          left: 0;\
          width: 100vw;\
          height: 100vh;\
          background: rgba(0, 0, 0, 0.9);\
          backdrop-filter: blur(10px);\
          -webkit-backdrop-filter: blur(10px);\
          display: flex;\
          justify-content: center;\
          align-items: center;\
          z-index: 999999;\
          animation: adminBroadcastFadeIn 0.3s ease;\
          padding: 20px;\
          box-sizing: border-box;\
        }\
        \
        @keyframes adminBroadcastFadeIn {\
          from { opacity: 0; }\
          to { opacity: 1; }\
        }\
        \
        @keyframes adminBroadcastSlideIn {\
          from { transform: translateY(-40px) scale(0.9); opacity: 0; }\
          to { transform: translateY(0) scale(1); opacity: 1; }\
        }\
        \
        @keyframes adminBroadcastPulse {\
          0%, 100% { box-shadow: 0 0 60px rgba(99, 102, 241, 0.3); }\
          50% { box-shadow: 0 0 80px rgba(99, 102, 241, 0.5); }\
        }\
        \
        .admin-broadcast-modal {\
          background: linear-gradient(145deg, #1e293b 0%, #0f172a 100%);\
          border: 2px solid rgba(99, 102, 241, 0.4);\
          border-radius: 20px;\
          padding: 36px 40px;\
          max-width: 560px;\
          width: 100%;\
          box-shadow: 0 30px 100px rgba(0, 0, 0, 0.7);\
          animation: adminBroadcastSlideIn 0.4s ease, adminBroadcastPulse 3s ease-in-out infinite;\
          position: relative;\
        }\
        \
        .admin-broadcast-header {\
          display: flex;\
          align-items: center;\
          gap: 14px;\
          margin-bottom: 20px;\
        }\
        \
        .admin-broadcast-icon {\
          font-size: 42px;\
          line-height: 1;\
        }\
        \
        .admin-broadcast-badge {\
          padding: 8px 16px;\
          border-radius: 24px;\
          font-size: 13px;\
          font-weight: 700;\
          text-transform: uppercase;\
          letter-spacing: 0.8px;\
        }\
        \
        .admin-broadcast-badge.info {\
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.25), rgba(37, 99, 235, 0.15));\
          color: #60a5fa;\
          border: 1px solid rgba(59, 130, 246, 0.4);\
        }\
        \
        .admin-broadcast-badge.warning {\
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(217, 119, 6, 0.15));\
          color: #fbbf24;\
          border: 1px solid rgba(245, 158, 11, 0.4);\
        }\
        \
        .admin-broadcast-badge.urgent {\
          background: linear-gradient(135deg, rgba(239, 68, 68, 0.25), rgba(220, 38, 38, 0.15));\
          color: #f87171;\
          border: 1px solid rgba(239, 68, 68, 0.4);\
          animation: urgentBadgePulse 1s infinite;\
        }\
        \
        .admin-broadcast-badge.reminder {\
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.25), rgba(124, 58, 237, 0.15));\
          color: #a78bfa;\
          border: 1px solid rgba(139, 92, 246, 0.4);\
        }\
        \
        @keyframes urgentBadgePulse {\
          0%, 100% { opacity: 1; transform: scale(1); }\
          50% { opacity: 0.8; transform: scale(1.05); }\
        }\
        \
        .admin-broadcast-close {\
          position: absolute;\
          top: 16px;\
          right: 16px;\
          background: rgba(255, 255, 255, 0.08);\
          border: 1px solid rgba(255, 255, 255, 0.1);\
          color: #94a3b8;\
          width: 40px;\
          height: 40px;\
          border-radius: 10px;\
          font-size: 26px;\
          cursor: pointer;\
          display: flex;\
          align-items: center;\
          justify-content: center;\
          transition: all 0.2s;\
          line-height: 1;\
        }\
        \
        .admin-broadcast-close:hover {\
          background: rgba(239, 68, 68, 0.2);\
          border-color: rgba(239, 68, 68, 0.4);\
          color: #f87171;\
          transform: rotate(90deg);\
        }\
        \
        .admin-broadcast-title {\
          color: #f8fafc;\
          font-size: 26px;\
          font-weight: 700;\
          margin: 0 0 16px 0;\
          line-height: 1.3;\
        }\
        \
        .admin-broadcast-body {\
          color: #cbd5e1;\
          font-size: 17px;\
          line-height: 1.7;\
          margin-bottom: 24px;\
          white-space: pre-wrap;\
          word-break: break-word;\
        }\
        \
        .admin-broadcast-position {\
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.1));\
          border: 1px solid rgba(99, 102, 241, 0.35);\
          border-radius: 12px;\
          padding: 16px 20px;\
          margin-bottom: 24px;\
          display: flex;\
          align-items: center;\
          gap: 12px;\
        }\
        \
        .admin-broadcast-position-label {\
          color: #a5b4fc;\
          font-size: 14px;\
          font-weight: 500;\
        }\
        \
        .admin-broadcast-position-link {\
          color: #818cf8;\
          font-weight: 700;\
          text-decoration: none;\
          font-size: 18px;\
          transition: all 0.2s;\
        }\
        \
        .admin-broadcast-position-link:hover {\
          color: #a5b4fc;\
          text-decoration: underline;\
        }\
        \
        .admin-broadcast-footer {\
          display: flex;\
          align-items: center;\
          justify-content: space-between;\
          gap: 16px;\
          padding-top: 20px;\
          border-top: 1px solid rgba(255, 255, 255, 0.08);\
          flex-wrap: wrap;\
        }\
        \
        .admin-broadcast-meta {\
          color: #64748b;\
          font-size: 13px;\
        }\
        \
        .admin-broadcast-btn {\
          padding: 14px 28px;\
          background: linear-gradient(135deg, #6366f1, #8b5cf6);\
          color: white;\
          border: none;\
          border-radius: 10px;\
          font-size: 15px;\
          font-weight: 600;\
          cursor: pointer;\
          text-decoration: none;\
          transition: all 0.25s;\
          display: inline-flex;\
          align-items: center;\
          gap: 8px;\
        }\
        \
        .admin-broadcast-btn:hover {\
          transform: translateY(-3px);\
          box-shadow: 0 12px 30px rgba(99, 102, 241, 0.5);\
        }\
        \
        .admin-broadcast-btn.secondary {\
          background: rgba(255, 255, 255, 0.1);\
          border: 1px solid rgba(255, 255, 255, 0.2);\
        }\
        \
        .admin-broadcast-btn.secondary:hover {\
          background: rgba(255, 255, 255, 0.15);\
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);\
        }\
        \
        @media (max-width: 600px) {\
          .admin-broadcast-modal {\
            padding: 28px 24px;\
            border-radius: 16px;\
          }\
          \
          .admin-broadcast-title {\
            font-size: 22px;\
          }\
          \
          .admin-broadcast-body {\
            font-size: 15px;\
          }\
          \
          .admin-broadcast-footer {\
            flex-direction: column;\
            align-items: stretch;\
            text-align: center;\
          }\
          \
          .admin-broadcast-btn {\
            justify-content: center;\
          }\
        }\
        \
        /* Light theme support */\
        [data-theme=\"light\"] .admin-broadcast-overlay {\
          background: rgba(100, 116, 139, 0.85);\
        }\
        \
        [data-theme=\"light\"] .admin-broadcast-modal {\
          background: linear-gradient(145deg, #ffffff 0%, #f8fafc 100%);\
          border-color: rgba(99, 102, 241, 0.3);\
          box-shadow: 0 30px 100px rgba(0, 0, 0, 0.25);\
        }\
        \
        [data-theme=\"light\"] .admin-broadcast-close {\
          background: rgba(0, 0, 0, 0.05);\
          border-color: rgba(0, 0, 0, 0.1);\
          color: #64748b;\
        }\
        \
        [data-theme=\"light\"] .admin-broadcast-close:hover {\
          background: rgba(239, 68, 68, 0.1);\
          border-color: rgba(239, 68, 68, 0.3);\
          color: #ef4444;\
        }\
        \
        [data-theme=\"light\"] .admin-broadcast-title {\
          color: #1e293b;\
        }\
        \
        [data-theme=\"light\"] .admin-broadcast-body {\
          color: #475569;\
        }\
        \
        [data-theme=\"light\"] .admin-broadcast-position {\
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.05));\
          border-color: rgba(99, 102, 241, 0.25);\
        }\
        \
        [data-theme=\"light\"] .admin-broadcast-position-label {\
          color: #6366f1;\
        }\
        \
        [data-theme=\"light\"] .admin-broadcast-position-link {\
          color: #4f46e5;\
        }\
        \
        [data-theme=\"light\"] .admin-broadcast-footer {\
          border-color: rgba(0, 0, 0, 0.08);\
        }\
        \
        [data-theme=\"light\"] .admin-broadcast-meta {\
          color: #94a3b8;\
        }\
        \
        [data-theme=\"light\"] .admin-broadcast-btn.secondary {\
          background: #f1f5f9;\
          border-color: #e2e8f0;\
          color: #475569;\
        }\
        \
        [data-theme=\"light\"] .admin-broadcast-btn.secondary:hover {\
          background: #e2e8f0;\
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);\
        }\
        \
        [data-theme=\"light\"] .admin-broadcast-badge.info {\
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(37, 99, 235, 0.08));\
          color: #2563eb;\
        }\
        \
        [data-theme=\"light\"] .admin-broadcast-badge.warning {\
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(217, 119, 6, 0.08));\
          color: #d97706;\
        }\
        \
        [data-theme=\"light\"] .admin-broadcast-badge.urgent {\
          background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(220, 38, 38, 0.08));\
          color: #dc2626;\
        }\
        \
        [data-theme=\"light\"] .admin-broadcast-badge.reminder {\
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(124, 58, 237, 0.08));\
          color: #7c3aed;\
        }\
      ';
      document.head.appendChild(styles);
    }

    // Get icon for notification type
    function getIcon(type) {
      switch(type) {
        case 'warning': return '⚠️';
        case 'urgent': return '🚨';
        case 'reminder': return '📋';
        default: return '📢';
      }
    }

    // Get label for notification type
    function getLabel(type) {
      switch(type) {
        case 'warning': return 'Uyarı';
        case 'urgent': return 'ACİL';
        case 'reminder': return 'Hatırlatma';
        default: return 'Duyuru';
      }
    }

    // Escape HTML to prevent XSS
    function escapeHtml(text) {
      if (!text) return '';
      var div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Convert URLs in text to clickable links while escaping HTML
    function linkifyText(text) {
      if (!text) return '';
      
      // First escape HTML
      var escaped = escapeHtml(text);
      
      // Regex patterns for different URL formats:
      // 1. http/https URLs
      // 2. www. URLs
      // 3. domain.com (with common TLDs)
      var urlRegex = /(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}[^\s<>"]*)/g;
      var matches = escaped.match(urlRegex);
      
      if (!matches) return escaped;
      
      var result = escaped;
      var processedUrls = {}; // Track processed URLs to avoid duplicate replacements
      
      matches.forEach(function(url) {
        if (processedUrls[url]) return;
        processedUrls[url] = true;
        
        // Determine the href based on the URL format
        var href = url;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          // Add https:// for URLs without protocol
          href = 'https://' + url;
        }
        
        // Create link with proper escaping
        var link = '<a href="' + href + '" target="_blank" style="color: #3b82f6; text-decoration: underline; cursor: pointer;">' + url + '</a>';
        
        // Escape special regex characters
        var escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp(escapedUrl, 'g'), link);
      });
      
      return result;
    }

    // Play notification sound
    function playSound() {
      try {
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Play two tones for attention
        [0, 0.15].forEach(function(delay, i) {
          var osc = ctx.createOscillator();
          var gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = i === 0 ? 880 : 1100;
          osc.type = 'sine';
          gain.gain.setValueAtTime(0.3, ctx.currentTime + delay);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.25);
          osc.start(ctx.currentTime + delay);
          osc.stop(ctx.currentTime + delay + 0.25);
        });
      } catch (e) {
        console.log('[AdminNotification] Sound error:', e);
      }
    }

    // Process notification queue
    function processQueue() {
      if (notificationQueue.length > 0 && !isShowingNotification) {
        isShowingNotification = true;
        var data = notificationQueue.shift();
        showNotification(data);
      }
    }

    // Show notification overlay
    function showNotification(data) {
      injectStyles();
      
      var type = data.notification_type || 'info';
      var overlay = document.createElement('div');
      overlay.className = 'admin-broadcast-overlay';
      
      var positionHtml = '';
      if (data.position_code) {
        positionHtml = '<div class="admin-broadcast-position">' +
          '<span class="admin-broadcast-position-label">📋 İlgili Pozisyon:</span>' +
          '<a href="/loads/position/' + encodeURIComponent(data.position_code) + '" class="admin-broadcast-position-link">' +
          escapeHtml(data.position_code) +
          '</a></div>';
      }
      
      var imageHtml = '';
      if (data.image_path) {
        imageHtml = '<div class="admin-broadcast-image" style="margin: 20px 0; text-align: center;">' +
          '<img src="' + data.image_path + '" alt="Bildirim Görseli" style="max-width: 100%; max-height: 400px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);" />' +
          '</div>';
      }
      
      var buttonHtml = data.position_code 
        ? '<a href="/loads/position/' + encodeURIComponent(data.position_code) + '" class="admin-broadcast-btn">Pozisyona Git →</a>'
        : '<button class="admin-broadcast-btn secondary">Tamam</button>';
      
      var metaHtml = '';
      if (data.created_by) metaHtml += 'Gönderen: <strong>' + escapeHtml(data.created_by) + '</strong>';
      if (data.created_at) metaHtml += ' • ' + new Date(data.created_at).toLocaleString('tr-TR');
      
      overlay.innerHTML = '<div class="admin-broadcast-modal">' +
        '<button class="admin-broadcast-close" title="Kapat">&times;</button>' +
        '<div class="admin-broadcast-header">' +
        '<span class="admin-broadcast-icon">' + getIcon(type) + '</span>' +
        '<span class="admin-broadcast-badge ' + type + '">' + getLabel(type) + '</span>' +
        '</div>' +
        (data.title ? '<h1 class="admin-broadcast-title">' + linkifyText(data.title) + '</h1>' : '') +
        '<div class="admin-broadcast-body">' + linkifyText(data.message) + '</div>' +
        imageHtml +
        positionHtml +
        '<div class="admin-broadcast-footer">' +
        '<span class="admin-broadcast-meta">' + metaHtml + '</span>' +
        buttonHtml +
        '</div></div>';
      
      document.body.appendChild(overlay);
      playSound();
      
      // Close handlers
      var closeBtn = overlay.querySelector('.admin-broadcast-close');
      var actionBtn = overlay.querySelector('.admin-broadcast-btn');
      
      function closeOverlay() {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.25s ease';
        setTimeout(function() {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          isShowingNotification = false;
          markNotificationSeen(data);
          processQueue();
        }, 250);
      }
      
      closeBtn.addEventListener('click', closeOverlay);
      
      if (actionBtn && actionBtn.classList.contains('secondary')) {
        actionBtn.addEventListener('click', closeOverlay);
      }
      
      // Close on ESC
      function handleEscape(e) {
        if (e.key === 'Escape') {
          closeOverlay();
          document.removeEventListener('keydown', handleEscape);
        }
      }
      document.addEventListener('keydown', handleEscape);
      
      // Close on background click
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
          closeOverlay();
        }
      });
    }

    // Listen for admin broadcast notifications
    socket.on('admin_notification', function(data) {
      console.log('[AdminNotification] Received broadcast:', data);
      queueNotification(data);
    });

    function fetchStoredNotifications() {
      if (typeof fetch !== 'function') return;
      var endpoint = BROADCAST_ENDPOINT + '?limit=' + BROADCAST_FETCH_LIMIT;
      fetch(endpoint, { credentials: 'include' })
        .then(function(response) {
          if (!response.ok) {
            throw new Error('HTTP ' + response.status);
          }
          return response.json();
        })
        .then(function(payload) {
          if (!payload || !payload.success) {
            throw new Error('Broadcast API error');
          }
          var notifications = Array.isArray(payload.notifications) ? payload.notifications.slice() : [];
          notifications.sort(function(a, b) {
            var aId = parseNotificationId(a && a.id);
            var bId = parseNotificationId(b && b.id);
            if (aId === null && bId === null) return 0;
            if (aId === null) return 1;
            if (bId === null) return -1;
            return aId - bId;
          });
          notifications.forEach(function(notification) {
            queueNotification(notification);
          });
        })
        .catch(function(err) {
          console.warn('[AdminNotification] Failed to fetch stored broadcasts:', err);
        });
    }

    fetchStoredNotifications();

    console.log('[AdminNotification] Listener initialized on socket');
  }

  // Use existing socket from chat.js if available, otherwise create new connection
  var socket = window.chatSocket;
  
  // If chat.js hasn't initialized yet, wait a bit and try again
  if (!socket) {
    setTimeout(function() {
      socket = window.chatSocket || io();
      window.chatSocket = socket;
      initAdminBroadcast(socket);
    }, 300);
  } else {
    initAdminBroadcast(socket);
  }

})();
