// Live Chat Client - Single Room with Private Message Tabs
// Features: Reply, @mention with autocomplete, Typing indicator, Reactions, File attachments
(function() {
  'use strict';

  // Don't run on login page
  if (window.location.pathname === '/login') return;

  const socket = io();

  // Get user info from body data attributes
  const username = document.body.dataset.username || 'Guest';
  const currentPage = document.body.dataset.currentPage || '/';

  // DOM Elements
  const chatBubble = document.getElementById('chat-bubble');
  const chatWindow = document.getElementById('chat-window');
  const chatClose = document.getElementById('chat-close');
  const chatInput = document.getElementById('chat-input');
  const chatSend = document.getElementById('chat-send');
  const chatMessages = document.getElementById('chat-messages');
  const onlineUsersEl = document.getElementById('online-users');
  const onlineCountEl = document.getElementById('chat-online-count');
  const unreadBadge = document.getElementById('chat-unread-badge');
  const chatTabsEl = document.getElementById('chat-tabs');

  let isWindowOpen = false;
  let unreadCount = 0;
  let activeTab = 'main'; // 'main' or username for private chat
  let privateTabs = new Map(); // username -> { unread: 0, messages: [] }
  let mainMessages = []; // Cache for main chat messages
  let allUsers = []; // All online users
  
  // Reply state
  let replyingTo = null; // { id, sender, text }
  
  // Mention autocomplete state
  let mentionState = {
    active: false,
    startIndex: 0,
    query: ''
  };
  
  // Typing indicator state
  let typingUsers = new Map(); // room -> Set of usernames
  let typingTimeout = null;
  let isTyping = false;
  
  // Available reaction emojis
  const reactionEmojis = ['👍', '❤️', '😂', '😮', '😢', '👏'];

  // Request notification permission on load
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // Play notification sound
  function playNotificationSound() {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) {
      console.log('[Chat] Could not play sound:', e);
    }
  }

  // Show desktop notification
  function showNotification(title, body, onClick) {
    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification(title, {
        body: body,
        icon: '/img/logo.png',
        tag: 'chat-notification-' + Date.now(),
        requireInteraction: false
      });
      
      notification.onclick = function() {
        window.focus();
        if (onClick) onClick();
        notification.close();
      };
      
      setTimeout(() => notification.close(), 5000);
    }
  }

  // Open chat window
  function openChatWindow() {
    if (!isWindowOpen) {
      isWindowOpen = true;
      chatWindow.style.display = 'flex';
      chatBubble.classList.add('active');
      scrollToBottom();
      // Request fresh online users list
      socket.emit('getOnlineUsers');
    }
  }

  // Toggle chat window
  function toggleChatWindow() {
    isWindowOpen = !isWindowOpen;
    chatWindow.style.display = isWindowOpen ? 'flex' : 'none';
    chatBubble.classList.toggle('active', isWindowOpen);
    
    if (isWindowOpen) {
      // Clear unread for active tab
      if (activeTab === 'main') {
        unreadCount = 0;
      } else {
        const tab = privateTabs.get(activeTab);
        if (tab) tab.unread = 0;
      }
      updateUnreadBadge();
      updateTabsUI();
      chatInput.focus();
      scrollToBottom();
      // Request fresh online users list
      socket.emit('getOnlineUsers');
    }
  }

  // Update unread badge (total from all tabs)
  function updateUnreadBadge() {
    let total = unreadCount; // main chat unread
    privateTabs.forEach(tab => total += tab.unread);
    
    if (total > 0) {
      unreadBadge.textContent = total > 99 ? '99+' : total;
      unreadBadge.style.display = 'flex';
    } else {
      unreadBadge.style.display = 'none';
    }
  }

  // Scroll messages to bottom
  function scrollToBottom() {
    if (chatMessages) {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  // Send message
  function sendMessage() {
    const text = chatInput.value.trim();
    
    // If there's a pending file, upload and send it
    if (pendingFile) {
      stopTyping();
      uploadAndSendFile(pendingFile);
      return;
    }
    
    if (!text) return;
    
    // Stop typing indicator
    stopTyping();
    
    if (activeTab === 'main') {
      // Send with reply info if replying
      socket.emit('chatMessage', replyingTo ? { text, replyTo: replyingTo.id } : text);
    } else {
      socket.emit('privateMessage', { 
        to: activeTab, 
        text,
        replyTo: replyingTo ? replyingTo.id : null
      });
    }
    
    chatInput.value = '';
    cancelReply();
    hideMentionPopup();
  }
  
  // === TYPING INDICATOR FUNCTIONS ===
  
  function startTyping() {
    if (!isTyping) {
      isTyping = true;
      socket.emit('typing', { to: activeTab === 'main' ? null : activeTab });
    }
    
    // Reset timeout
    if (typingTimeout) clearTimeout(typingTimeout);
    typingTimeout = setTimeout(stopTyping, 2000);
  }
  
  function stopTyping() {
    if (isTyping) {
      isTyping = false;
      socket.emit('stopTyping', { to: activeTab === 'main' ? null : activeTab });
    }
    if (typingTimeout) {
      clearTimeout(typingTimeout);
      typingTimeout = null;
    }
  }
  
  function updateTypingIndicator() {
    const room = activeTab === 'main' ? 'main' : activeTab;
    const users = typingUsers.get(room);
    
    let indicator = document.getElementById('chat-typing-indicator');
    
    if (!users || users.size === 0) {
      if (indicator) indicator.remove();
      return;
    }
    
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'chat-typing-indicator';
      indicator.className = 'chat-typing-indicator';
      const inputArea = document.querySelector('.chat-input-area');
      if (inputArea) {
        inputArea.insertBefore(indicator, inputArea.firstChild);
      }
    }
    
    const names = Array.from(users);
    let text;
    if (names.length === 1) {
      text = `${names[0]} yazıyor...`;
    } else if (names.length === 2) {
      text = `${names[0]} ve ${names[1]} yazıyor...`;
    } else {
      text = `${names.length} kişi yazıyor...`;
    }
    
    indicator.innerHTML = `
      <div class="typing-dots">
        <span></span><span></span><span></span>
      </div>
      <span class="typing-text">${text}</span>
    `;
  }
  
  // === REPLY FUNCTIONS ===
  
  // Start replying to a message
  function startReply(msg) {
    replyingTo = {
      id: msg.id,
      sender: msg.sender,
      text: msg.text
    };
    updateReplyUI();
    chatInput.focus();
  }
  
  // Cancel reply
  function cancelReply() {
    replyingTo = null;
    updateReplyUI();
  }
  
  // Update reply preview UI
  function updateReplyUI() {
    let replyPreview = document.getElementById('chat-reply-preview');
    
    if (replyingTo) {
      if (!replyPreview) {
        replyPreview = document.createElement('div');
        replyPreview.id = 'chat-reply-preview';
        replyPreview.className = 'chat-reply-preview';
        const inputArea = document.querySelector('.chat-input-area');
        inputArea.insertBefore(replyPreview, inputArea.firstChild);
      }
      
      const truncatedText = replyingTo.text.length > 50 
        ? replyingTo.text.substring(0, 50) + '...' 
        : replyingTo.text;
      
      replyPreview.innerHTML = `
        <div class="reply-preview-content">
          <span class="reply-preview-icon">↩️</span>
          <div class="reply-preview-text">
            <span class="reply-preview-sender">${escapeHtml(replyingTo.sender)}</span>
            <span class="reply-preview-message">${escapeHtml(truncatedText)}</span>
          </div>
          <button class="reply-preview-cancel" title="İptal">×</button>
        </div>
      `;
      
      replyPreview.querySelector('.reply-preview-cancel').addEventListener('click', cancelReply);
    } else if (replyPreview) {
      replyPreview.remove();
    }
  }
  
  // === MENTION FUNCTIONS ===
  
  // Show mention autocomplete popup
  function showMentionPopup(query) {
    let popup = document.getElementById('chat-mention-popup');
    
    // Filter users matching query (exclude self)
    const matchedUsers = allUsers.filter(u => 
      u.name !== username && 
      u.name.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 5);
    
    if (matchedUsers.length === 0) {
      hideMentionPopup();
      return;
    }
    
    if (!popup) {
      popup = document.createElement('div');
      popup.id = 'chat-mention-popup';
      popup.className = 'chat-mention-popup';
      document.querySelector('.chat-input-area').appendChild(popup);
    }
    
    popup.innerHTML = matchedUsers.map((user, idx) => `
      <div class="mention-option ${idx === 0 ? 'selected' : ''}" data-username="${escapeHtml(user.name)}">
        <span class="mention-status"></span>
        <span class="mention-name">@${escapeHtml(user.name)}</span>
        <span class="mention-page">${escapeHtml(user.pageDisplay || '')}</span>
      </div>
    `).join('');
    
    popup.style.display = 'block';
    
    // Add click handlers
    popup.querySelectorAll('.mention-option').forEach(opt => {
      opt.addEventListener('click', () => {
        insertMention(opt.dataset.username);
      });
    });
  }
  
  // Hide mention popup
  function hideMentionPopup() {
    const popup = document.getElementById('chat-mention-popup');
    if (popup) popup.style.display = 'none';
    mentionState.active = false;
  }
  
  // Insert mention into input
  function insertMention(userName) {
    const value = chatInput.value;
    const beforeMention = value.substring(0, mentionState.startIndex);
    const afterMention = value.substring(chatInput.selectionStart);
    
    chatInput.value = beforeMention + '@' + userName + ' ' + afterMention;
    chatInput.focus();
    
    // Set cursor position after mention
    const newPos = mentionState.startIndex + userName.length + 2;
    chatInput.setSelectionRange(newPos, newPos);
    
    hideMentionPopup();
  }
  
  // Handle mention keyboard navigation
  function handleMentionKeydown(e) {
    const popup = document.getElementById('chat-mention-popup');
    if (!popup || popup.style.display === 'none') return false;
    
    const options = popup.querySelectorAll('.mention-option');
    const selectedIdx = Array.from(options).findIndex(o => o.classList.contains('selected'));
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      options[selectedIdx]?.classList.remove('selected');
      options[(selectedIdx + 1) % options.length]?.classList.add('selected');
      return true;
    }
    
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      options[selectedIdx]?.classList.remove('selected');
      options[(selectedIdx - 1 + options.length) % options.length]?.classList.add('selected');
      return true;
    }
    
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const selected = popup.querySelector('.mention-option.selected');
      if (selected) {
        insertMention(selected.dataset.username);
      }
      return true;
    }
    
    if (e.key === 'Escape') {
      hideMentionPopup();
      return true;
    }
    
    return false;
  }
  
  // Check for @ mentions while typing
  function checkForMention() {
    const value = chatInput.value;
    const cursorPos = chatInput.selectionStart;
    
    // Find @ before cursor
    let atIndex = -1;
    for (let i = cursorPos - 1; i >= 0; i--) {
      if (value[i] === '@') {
        atIndex = i;
        break;
      }
      if (value[i] === ' ' || value[i] === '\n') break;
    }
    
    if (atIndex >= 0) {
      const query = value.substring(atIndex + 1, cursorPos);
      if (query.length >= 0 && !query.includes(' ')) {
        mentionState.active = true;
        mentionState.startIndex = atIndex;
        mentionState.query = query;
        showMentionPopup(query);
        return;
      }
    }
    
    hideMentionPopup();
  }

  // Render tabs UI
  function updateTabsUI() {
    if (!chatTabsEl) return;
    
    // Clear all except main tab
    const mainTab = chatTabsEl.querySelector('[data-tab="main"]');
    chatTabsEl.innerHTML = '';
    
    // Re-add main tab
    const mainTabEl = document.createElement('div');
    mainTabEl.className = 'chat-tab' + (activeTab === 'main' ? ' active' : '');
    mainTabEl.dataset.tab = 'main';
    mainTabEl.innerHTML = `
      <span class="chat-tab-icon">💬</span>
      <span class="chat-tab-name">Genel</span>
      ${unreadCount > 0 && activeTab !== 'main' ? `<span class="chat-tab-badge">${unreadCount}</span>` : ''}
    `;
    mainTabEl.addEventListener('click', () => switchToTab('main'));
    chatTabsEl.appendChild(mainTabEl);
    
    // Add private chat tabs
    privateTabs.forEach((tabData, userName) => {
      const tabEl = document.createElement('div');
      tabEl.className = 'chat-tab chat-tab-private' + (activeTab === userName ? ' active' : '');
      tabEl.dataset.tab = userName;
      tabEl.innerHTML = `
        <span class="chat-tab-icon">🔒</span>
        <span class="chat-tab-name">${escapeHtml(userName)}</span>
        ${tabData.unread > 0 && activeTab !== userName ? `<span class="chat-tab-badge">${tabData.unread}</span>` : ''}
        <button class="chat-tab-close" title="Kapat">×</button>
      `;
      
      // Click tab to switch
      tabEl.addEventListener('click', (e) => {
        if (!e.target.classList.contains('chat-tab-close')) {
          switchToTab(userName);
        }
      });
      
      // Close button
      const closeBtn = tabEl.querySelector('.chat-tab-close');
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closePrivateTab(userName);
      });
      
      chatTabsEl.appendChild(tabEl);
    });
  }

  // Switch to a tab
  function switchToTab(tabName) {
    activeTab = tabName;
    
    // Clear unread for this tab
    if (tabName === 'main') {
      unreadCount = 0;
    } else {
      const tab = privateTabs.get(tabName);
      if (tab) tab.unread = 0;
    }
    
    updateTabsUI();
    updateUnreadBadge();
    loadActiveTabMessages();
    
    // Update input placeholder
    if (chatInput) {
      chatInput.placeholder = tabName === 'main' ? 'Mesaj yazın...' : `${tabName}'e özel mesaj...`;
    }
  }

  // Open or create private tab
  function openPrivateTab(userName, switchTo = true) {
    if (!privateTabs.has(userName)) {
      privateTabs.set(userName, { unread: 0, messages: [] });
      // Request history from server
      socket.emit('getPrivateHistory', userName);
    }
    
    if (switchTo) {
      switchToTab(userName);
      openChatWindow();
    }
    
    updateTabsUI();
  }

  // Close private tab
  function closePrivateTab(userName) {
    privateTabs.delete(userName);
    
    // If we were on this tab, switch to main
    if (activeTab === userName) {
      switchToTab('main');
    } else {
      updateTabsUI();
    }
    updateUnreadBadge();
  }

  // Load messages for active tab
  function loadActiveTabMessages() {
    if (!chatMessages) return;
    
    chatMessages.innerHTML = '';
    
    let messages = [];
    if (activeTab === 'main') {
      messages = mainMessages;
    } else {
      const tab = privateTabs.get(activeTab);
      messages = tab ? tab.messages : [];
    }
    
    if (messages.length === 0) {
      chatMessages.innerHTML = `
        <div class="chat-welcome-message">
          <p>👋 ${activeTab === 'main' ? 'Henüz mesaj yok. İlk mesajı siz yazın!' : 'Özel sohbete başlayın!'}</p>
        </div>
      `;
      return;
    }
    
    messages.forEach(msg => addMessageToUI(msg));
    scrollToBottom();
  }

  // Add message to UI (doesn't store, just renders)
  function addMessageToUI(data) {
    const welcome = chatMessages.querySelector('.chat-welcome-message');
    if (welcome) welcome.remove();

    const isOwnMessage = data.sender === username;
    const messageEl = document.createElement('div');
    messageEl.className = 'chat-message ' + (isOwnMessage ? 'chat-message-own' : 'chat-message-other');
    if (data.isPrivate) messageEl.classList.add('chat-message-private');
    messageEl.dataset.messageId = data.id;
    
    // Build reply quote if exists
    let replyHtml = '';
    if (data.replyTo) {
      const replyText = data.replyTo.text.length > 40 
        ? data.replyTo.text.substring(0, 40) + '...' 
        : data.replyTo.text;
      replyHtml = `
        <div class="chat-message-reply-quote">
          <span class="reply-quote-sender">${escapeHtml(data.replyTo.sender)}</span>
          <span class="reply-quote-text">${escapeHtml(replyText)}</span>
        </div>
      `;
    }
    
    // Build attachment HTML if exists
    let attachmentHtml = '';
    if (data.attachment) {
      if (data.attachment.type && data.attachment.type.startsWith('image/')) {
        attachmentHtml = `
          <div class="chat-message-attachment chat-attachment-image">
            <img src="${escapeHtml(data.attachment.url)}" alt="${escapeHtml(data.attachment.name || 'Resim')}" 
                 onclick="window.open('${escapeHtml(data.attachment.url)}', '_blank')">
          </div>
        `;
      } else {
        const fileName = data.attachment.name || 'Dosya';
        attachmentHtml = `
          <div class="chat-message-attachment chat-attachment-file">
            <a href="${escapeHtml(data.attachment.url)}" target="_blank" download="${escapeHtml(fileName)}">
              <span class="attachment-icon">📎</span>
              <span class="attachment-name">${escapeHtml(fileName)}</span>
            </a>
          </div>
        `;
      }
    }
    
    // Build reactions HTML
    let reactionsHtml = buildReactionsHtml(data);
    
    // Format text with @mentions highlighted
    const formattedText = data.text ? formatMentions(data.text) : '';
    
    messageEl.innerHTML = `
      <div class="chat-message-header">
        <span class="chat-message-sender">${escapeHtml(data.sender)}</span>
        <span class="chat-message-time">${data.time}</span>
      </div>
      ${replyHtml}
      ${formattedText ? `<div class="chat-message-text">${formattedText}</div>` : ''}
      ${attachmentHtml}
      ${reactionsHtml}
      <div class="chat-message-actions">
        <button class="chat-message-reply-btn" title="Yanıtla">↩️</button>
        <button class="chat-message-react-btn" title="Tepki ekle">😀</button>
      </div>
    `;
    
    // Add reply button handler
    const replyBtn = messageEl.querySelector('.chat-message-reply-btn');
    replyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      startReply(data);
    });
    
    // Add reaction button handler
    const reactBtn = messageEl.querySelector('.chat-message-react-btn');
    reactBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showReactionPicker(messageEl, data);
    });
    
    // Add click handlers for existing reactions
    messageEl.querySelectorAll('.reaction-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleReaction(data, item.dataset.emoji);
      });
    });
    
    chatMessages.appendChild(messageEl);
  }
  
  // Build reactions HTML
  function buildReactionsHtml(data) {
    if (!data.reactions || Object.keys(data.reactions).length === 0) {
      return '<div class="chat-message-reactions"></div>';
    }
    
    let html = '<div class="chat-message-reactions">';
    for (const [emoji, users] of Object.entries(data.reactions)) {
      const hasOwn = users.includes(username);
      const title = users.join(', ');
      html += `
        <span class="reaction-item ${hasOwn ? 'reaction-own' : ''}" 
              data-emoji="${emoji}" title="${escapeHtml(title)}">
          ${emoji} <span class="reaction-count">${users.length}</span>
        </span>
      `;
    }
    html += '</div>';
    return html;
  }
  
  // Show reaction picker popup
  function showReactionPicker(messageEl, data) {
    // Remove existing picker
    const existing = document.querySelector('.reaction-picker');
    if (existing) existing.remove();
    
    const picker = document.createElement('div');
    picker.className = 'reaction-picker';
    picker.innerHTML = reactionEmojis.map(emoji => 
      `<span class="reaction-picker-emoji" data-emoji="${emoji}">${emoji}</span>`
    ).join('');
    
    // Position near the message
    const rect = messageEl.getBoundingClientRect();
    picker.style.position = 'fixed';
    picker.style.bottom = (window.innerHeight - rect.top + 5) + 'px';
    picker.style.right = '40px';
    
    // Add click handlers
    picker.querySelectorAll('.reaction-picker-emoji').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleReaction(data, el.dataset.emoji);
        picker.remove();
      });
    });
    
    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', function closeHandler() {
        picker.remove();
        document.removeEventListener('click', closeHandler);
      }, { once: true });
    }, 10);
    
    document.body.appendChild(picker);
  }
  
  // Toggle reaction on a message
  function toggleReaction(data, emoji) {
    const hasReacted = data.reactions && data.reactions[emoji] && data.reactions[emoji].includes(username);
    
    const payload = {
      messageId: data.id,
      emoji: emoji,
      isPrivate: data.isPrivate || false,
      chatWith: data.isPrivate ? (data.sender === username ? data.to : data.sender) : null
    };
    
    if (hasReacted) {
      socket.emit('removeReaction', payload);
    } else {
      socket.emit('addReaction', payload);
    }
  }
  
  // Update reactions in UI when server broadcasts update
  function updateMessageReactions(messageId, reactions, isPrivate) {
    // Update in memory
    let messages = isPrivate ? null : mainMessages;
    if (isPrivate && activeTab !== 'main') {
      const tab = privateTabs.get(activeTab);
      if (tab) messages = tab.messages;
    }
    
    if (messages) {
      const msg = messages.find(m => m.id === messageId);
      if (msg) {
        msg.reactions = reactions;
      }
    }
    
    // Update in DOM
    const messageEl = chatMessages.querySelector(`[data-message-id="${messageId}"]`);
    if (messageEl) {
      const reactionsContainer = messageEl.querySelector('.chat-message-reactions');
      if (reactionsContainer) {
        // Rebuild reactions HTML
        let html = '';
        for (const [emoji, users] of Object.entries(reactions)) {
          const hasOwn = users.includes(username);
          const title = users.join(', ');
          html += `
            <span class="reaction-item ${hasOwn ? 'reaction-own' : ''}" 
                  data-emoji="${emoji}" title="${escapeHtml(title)}">
              ${emoji} <span class="reaction-count">${users.length}</span>
            </span>
          `;
        }
        reactionsContainer.innerHTML = html;
        
        // Re-add click handlers
        reactionsContainer.querySelectorAll('.reaction-item').forEach(item => {
          item.addEventListener('click', (e) => {
            e.stopPropagation();
            const msg = messages?.find(m => m.id === messageId);
            if (msg) toggleReaction(msg, item.dataset.emoji);
          });
        });
      }
    }
  }
  
  // Format @mentions in text
  function formatMentions(text) {
    const escaped = escapeHtml(text);
    // Highlight @mentions
    return escaped.replace(/@(\w+)/g, (match, name) => {
      const isSelf = name.toLowerCase() === username.toLowerCase();
      return `<span class="chat-mention ${isSelf ? 'chat-mention-self' : ''}">${match}</span>`;
    });
  }

  // Update online users list
  function updateOnlineUsers(users) {
    // Re-query elements in case they weren't ready at page load
    const chatOnlineCount = document.getElementById('chat-online-count');
    const chatOnlineUsers = document.getElementById('online-users');
    
    if (!chatOnlineUsers) return;
    
    allUsers = users || [];
    chatOnlineUsers.innerHTML = '';
    
    if (allUsers.length === 0) {
      chatOnlineUsers.innerHTML = '<div class="chat-no-users">Kimse çevrimiçi değil</div>';
      if (chatOnlineCount) chatOnlineCount.textContent = '0';
      return;
    }

    if (chatOnlineCount) {
      chatOnlineCount.textContent = allUsers.length;
    }

    allUsers.forEach(user => {
      const userEl = document.createElement('div');
      userEl.className = 'chat-user-item';
      if (user.name !== username) {
        userEl.classList.add('chat-user-clickable');
      }
      
      const isCurrentUser = user.name === username;
      
      userEl.innerHTML = `
        <div class="chat-user-status"></div>
        <div class="chat-user-info">
          <span class="chat-user-name">${escapeHtml(user.name)}${isCurrentUser ? ' (sen)' : ''}</span>
          <span class="chat-user-page">${escapeHtml(user.pageDisplay || '')}</span>
        </div>
        ${!isCurrentUser ? '<span class="chat-user-dm-icon" title="Özel mesaj">💬</span>' : ''}
      `;
      
      // Click to start private chat
      if (!isCurrentUser) {
        userEl.addEventListener('click', () => openPrivateTab(user.name, true));
      }
      
      chatOnlineUsers.appendChild(userEl);
    });
  }

  // Escape HTML to prevent XSS
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Event Listeners
  if (chatBubble) {
    chatBubble.addEventListener('click', toggleChatWindow);
  }

  if (chatClose) {
    chatClose.addEventListener('click', toggleChatWindow);
  }

  if (chatSend) {
    chatSend.addEventListener('click', sendMessage);
  }

  if (chatInput) {
    chatInput.addEventListener('keydown', function(e) {
      // Handle mention navigation first
      if (handleMentionKeydown(e)) return;
      
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
      
      // Escape to cancel reply
      if (e.key === 'Escape' && replyingTo) {
        cancelReply();
      }
    });
    
    // Check for @ mentions while typing and trigger typing indicator
    chatInput.addEventListener('input', function() {
      checkForMention();
      startTyping();
    });
  }
  
  // === FILE UPLOAD FUNCTIONS ===
  
  function initFileUpload() {
    const inputArea = document.querySelector('.chat-input-area');
    if (!inputArea) return;
    
    // Check if file button already exists
    if (document.getElementById('chat-file-btn')) return;
    
    // Create file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'chat-file-input';
    fileInput.accept = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt';
    fileInput.style.display = 'none';
    
    // Create file button
    const fileBtn = document.createElement('button');
    fileBtn.id = 'chat-file-btn';
    fileBtn.className = 'chat-file-btn';
    fileBtn.innerHTML = '📎';
    fileBtn.title = 'Dosya ekle';
    fileBtn.type = 'button';
    
    fileBtn.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('Dosya boyutu 5MB\'dan küçük olmalıdır.');
        fileInput.value = '';
        return;
      }
      
      // Show file preview instead of sending immediately
      showFilePreview(file);
    });
    
    // Insert before send button
    const sendBtn = document.getElementById('chat-send');
    if (sendBtn) {
      inputArea.insertBefore(fileBtn, sendBtn);
    }
    inputArea.appendChild(fileInput);
  }
  
  // Pending file for sending
  let pendingFile = null;
  
  function showFilePreview(file) {
    pendingFile = file;
    
    let preview = document.getElementById('chat-file-preview');
    if (!preview) {
      preview = document.createElement('div');
      preview.id = 'chat-file-preview';
      preview.className = 'chat-file-preview';
      const inputArea = document.querySelector('.chat-input-area');
      if (inputArea) {
        inputArea.insertBefore(preview, inputArea.firstChild);
      }
    }
    
    const isImage = file.type.startsWith('image/');
    
    if (isImage) {
      const reader = new FileReader();
      reader.onload = (e) => {
        preview.innerHTML = `
          <div class="file-preview-content">
            <img src="${e.target.result}" alt="${escapeHtml(file.name)}" class="file-preview-image">
            <div class="file-preview-info">
              <span class="file-preview-name">${escapeHtml(file.name)}</span>
              <span class="file-preview-size">${formatFileSize(file.size)}</span>
            </div>
            <button class="file-preview-cancel" title="İptal">×</button>
          </div>
        `;
        preview.querySelector('.file-preview-cancel').addEventListener('click', cancelFilePreview);
      };
      reader.readAsDataURL(file);
    } else {
      preview.innerHTML = `
        <div class="file-preview-content">
          <span class="file-preview-icon">📎</span>
          <div class="file-preview-info">
            <span class="file-preview-name">${escapeHtml(file.name)}</span>
            <span class="file-preview-size">${formatFileSize(file.size)}</span>
          </div>
          <button class="file-preview-cancel" title="İptal">×</button>
        </div>
      `;
      preview.querySelector('.file-preview-cancel').addEventListener('click', cancelFilePreview);
    }
  }
  
  function cancelFilePreview() {
    pendingFile = null;
    const preview = document.getElementById('chat-file-preview');
    if (preview) preview.remove();
    const fileInput = document.getElementById('chat-file-input');
    if (fileInput) fileInput.value = '';
  }
  
  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
  
  async function uploadAndSendFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    // Show uploading indicator
    const fileBtn = document.getElementById('chat-file-btn');
    if (fileBtn) {
      fileBtn.innerHTML = '⏳';
      fileBtn.disabled = true;
    }
    
    try {
      const response = await fetch('/api/upload/chat', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error('Upload failed');
      }
      
      const result = await response.json();
      
      // Send message with attachment
      const attachment = {
        url: result.url,
        type: file.type,
        name: file.name
      };
      
      if (activeTab === 'main') {
        socket.emit('chatMessage', { 
          text: chatInput.value.trim(), 
          replyTo: replyingTo ? replyingTo.id : null,
          attachment: attachment
        });
      } else {
        socket.emit('privateMessage', { 
          to: activeTab, 
          text: chatInput.value.trim(),
          replyTo: replyingTo ? replyingTo.id : null,
          attachment: attachment
        });
      }
      
      chatInput.value = '';
      cancelReply();
      cancelFilePreview();
      
    } catch (err) {
      console.error('[Chat] File upload error:', err);
      alert('Dosya yüklenirken hata oluştu.');
    } finally {
      if (fileBtn) {
        fileBtn.innerHTML = '📎';
        fileBtn.disabled = false;
      }
    }
  }

  // Socket Events
  socket.on('connect', function() {
    console.log('[Chat] Connected to server');
    socket.emit('join', { name: username, page: currentPage });
    // Request online users immediately after joining
    socket.emit('getOnlineUsers');
  });

  socket.on('chatHistory', function(messages) {
    console.log('[Chat] Received chat history:', messages.length, 'messages');
    mainMessages = messages || [];
    if (activeTab === 'main') {
      loadActiveTabMessages();
    }
  });

  socket.on('chatMessage', function(data) {
    const isOwnMessage = data.sender === username;
    
    // Store in main messages
    mainMessages.push(data);
    if (mainMessages.length > 200) mainMessages.shift();
    
    // If we're viewing main chat, show it
    if (activeTab === 'main') {
      addMessageToUI(data);
      scrollToBottom();
    }
    
    // Play sound and show notification for messages (except own)
    if (!isOwnMessage) {
      playNotificationSound();
      
      // Increment unread if not viewing main or window closed
      if (activeTab !== 'main' || !isWindowOpen) {
        unreadCount++;
        updateUnreadBadge();
        updateTabsUI();
      }
      
      // Show desktop notification if window is closed or page is hidden
      if (!isWindowOpen || document.hidden) {
        showNotification(
          '💬 ' + data.sender,
          data.text,
          function() {
            openChatWindow();
            switchToTab('main');
          }
        );
      }
    }
  });

  socket.on('onlineUsers', function(users) {
    updateOnlineUsers(users);
  });

  socket.on('privateMessage', function(data) {
    const isOwnMessage = data.sender === username;
    const otherUser = isOwnMessage ? data.to : data.sender;
    
    // Ensure tab exists
    if (!privateTabs.has(otherUser)) {
      privateTabs.set(otherUser, { unread: 0, messages: [] });
    }
    
    const tab = privateTabs.get(otherUser);
    tab.messages.push(data);
    if (tab.messages.length > 200) tab.messages.shift();
    
    // If viewing this private chat, show it
    if (activeTab === otherUser) {
      addMessageToUI(data);
      scrollToBottom();
    }
    
    // Play sound and show notification for received messages
    if (!isOwnMessage) {
      playNotificationSound();
      
      // Increment unread if not viewing this tab or window closed
      if (activeTab !== otherUser || !isWindowOpen) {
        tab.unread++;
        updateUnreadBadge();
        updateTabsUI();
      }
      
      // Show desktop notification
      showNotification(
        '🔒 ' + data.sender,
        data.text,
        function() {
          openChatWindow();
          openPrivateTab(data.sender, true);
        }
      );
    }
    
    updateTabsUI();
  });

  socket.on('privateHistory', function(data) {
    if (privateTabs.has(data.with)) {
      const tab = privateTabs.get(data.with);
      tab.messages = data.messages || [];
      if (activeTab === data.with) {
        loadActiveTabMessages();
      }
    }
  });
  
  // Typing indicators
  socket.on('userTyping', function(data) {
    const room = data.room === 'main' ? 'main' : data.user;
    if (!typingUsers.has(room)) {
      typingUsers.set(room, new Set());
    }
    typingUsers.get(room).add(data.user);
    updateTypingIndicator();
  });
  
  socket.on('userStoppedTyping', function(data) {
    const room = data.room === 'main' ? 'main' : data.user;
    if (typingUsers.has(room)) {
      typingUsers.get(room).delete(data.user);
      if (typingUsers.get(room).size === 0) {
        typingUsers.delete(room);
      }
    }
    updateTypingIndicator();
  });
  
  // Reaction updates
  socket.on('reactionUpdated', function(data) {
    updateMessageReactions(data.messageId, data.reactions, data.isPrivate);
  });

  socket.on('disconnect', function() {
    console.log('[Chat] Disconnected from server');
  });

  // Handle page visibility change
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
      socket.emit('pageChange', currentPage);
    }
  });

  // Initialize tabs UI
  updateTabsUI();
  
  // Initialize file upload after a short delay to ensure DOM is ready
  setTimeout(initFileUpload, 500);
  
  // Expose socket globally for other scripts (like adminBroadcast.js)
  window.chatSocket = socket;

})();
