/**
 * Socket.io Chat Handler
 * Handles real-time chat functionality with private messaging
 * Messages are persisted to SQLite database
 * Features: Reply, @mention with notifications, Typing indicators, Reactions, File attachments
 */

const db = require('../config/db');
const NotificationService = require('../services/notificationService');
const path = require('path');
const fs = require('fs');

const onlineUsers = new Map(); // socket.id -> { name, page }
const typingUsers = new Map(); // 'room:username' -> timeout

// Helper: Extract @mentions from text
function extractMentions(text) {
  const mentionRegex = /@(\w+)/g;
  const mentions = [];
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[1]);
  }
  return [...new Set(mentions)]; // unique mentions
}

// Helper: Get all usernames (for mention validation)
function getAllUsernames() {
  return Array.from(onlineUsers.values()).map(u => u.name);
}

// Helper: Get private chat key (sorted alphabetically)
function getPrivateChatKey(user1, user2) {
  return [user1, user2].sort().join(':');
}

// Helper: Get page display name
function getPageDisplayName(page) {
  if (!page || page === '/') return 'Ana Sayfa';
  if (page === '/loads') return 'Ana Sayfa';
  if (page.startsWith('/loads/position/')) {
    // URL: /loads/position/25%2F200-565 -> sadece son rakamı al (565)
    let id = page.split('/').pop();
    // URL decode yap (%2F -> /)
    try { id = decodeURIComponent(id); } catch(e) {}
    // 25/200-565 formatından son kısmı al (- sonrası)
    if (id.includes('-')) {
      id = id.split('-').pop();
    }
    return 'Poz #' + id;
  }
  if (page.startsWith('/loads')) return 'Ana Sayfa';
  if (page.startsWith('/accounting')) return 'Muhasebe';
  if (page.startsWith('/database')) return 'Veritabanı';
  if (page.startsWith('/vehicles')) return 'Sefer Bilgisi';
  if (page.startsWith('/vizebest')) return 'VizeBest';
  if (page.startsWith('/profit')) return 'Profit';
  if (page.startsWith('/logs')) return 'Loglar';
  return page;
}

// Helper: Get all online users (unique by username, show latest page)
function getAllOnlineUsers() {
  // Group by username - keep track of all pages user is on
  const userMap = new Map();
  
  for (const [sid, user] of onlineUsers.entries()) {
    if (!userMap.has(user.name)) {
      userMap.set(user.name, {
        name: user.name,
        pages: [user.page],
        latestPage: user.page
      });
    } else {
      const existing = userMap.get(user.name);
      if (!existing.pages.includes(user.page)) {
        existing.pages.push(user.page);
      }
      existing.latestPage = user.page; // Update to latest
    }
  }
  
  // Return unique users with their current page
  return Array.from(userMap.values()).map(u => ({
    name: u.name,
    page: u.latestPage,
    pageDisplay: getPageDisplayName(u.latestPage),
    pageCount: u.pages.length // How many tabs/pages open
  }));
}

// Helper: Find socket by username
function findSocketByUsername(username) {
  for (const [sid, user] of onlineUsers.entries()) {
    if (user.name === username) return sid;
  }
  return null;
}

// Database helpers
function saveMessage(sender, text, time, replyTo = null, attachment = null) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO chat_messages (sender, text, time, reply_to_id, attachment_url, attachment_type, attachment_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [sender, text, time, replyTo, attachment?.url || null, attachment?.type || null, attachment?.name || null],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

function getMessages(limit = 200) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT m.id, m.sender, m.text, m.time, m.reply_to_id, m.attachment_url, m.attachment_type, m.attachment_name,
              r.sender as reply_sender, r.text as reply_text
       FROM chat_messages m
       LEFT JOIN chat_messages r ON m.reply_to_id = r.id
       ORDER BY m.id DESC LIMIT ?`,
      [limit],
      (err, rows) => {
        if (err) reject(err);
        else {
          const messages = (rows || []).reverse().map(row => ({
            id: row.id,
            sender: row.sender,
            text: row.text,
            time: row.time,
            attachment: row.attachment_url ? {
              url: row.attachment_url,
              type: row.attachment_type,
              name: row.attachment_name
            } : null,
            replyTo: row.reply_to_id ? {
              id: row.reply_to_id,
              sender: row.reply_sender,
              text: row.reply_text
            } : null
          }));
          resolve(messages);
        }
      }
    );
  });
}

function savePrivateMessage(chatKey, sender, recipient, text, time, replyTo = null, attachment = null) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO chat_private_messages (chat_key, sender, recipient, text, time, reply_to_id, attachment_url, attachment_type, attachment_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [chatKey, sender, recipient, text, time, replyTo, attachment?.url || null, attachment?.type || null, attachment?.name || null],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

function getPrivateMessages(chatKey, limit = 200) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT m.id, m.sender, m.recipient as "to", m.text, m.time, m.reply_to_id, m.attachment_url, m.attachment_type, m.attachment_name,
              r.sender as reply_sender, r.text as reply_text
       FROM chat_private_messages m
       LEFT JOIN chat_private_messages r ON m.reply_to_id = r.id
       WHERE m.chat_key = ?
       ORDER BY m.id DESC LIMIT ?`,
      [chatKey, limit],
      (err, rows) => {
        if (err) reject(err);
        else {
          const messages = (rows || []).reverse().map(row => ({
            id: row.id,
            sender: row.sender,
            to: row.to,
            text: row.text,
            time: row.time,
            isPrivate: true,
            attachment: row.attachment_url ? {
              url: row.attachment_url,
              type: row.attachment_type,
              name: row.attachment_name
            } : null,
            replyTo: row.reply_to_id ? {
              id: row.reply_to_id,
              sender: row.reply_sender,
              text: row.reply_text
            } : null
          }));
          resolve(messages);
        }
      }
    );
  });
}

// Reaction helpers
function addReaction(messageId, messageType, userName, emoji) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT OR IGNORE INTO chat_reactions (message_id, message_type, user_name, emoji) VALUES (?, ?, ?, ?)',
      [messageId, messageType, userName, emoji],
      function(err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      }
    );
  });
}

function removeReaction(messageId, messageType, userName, emoji) {
  return new Promise((resolve, reject) => {
    db.run(
      'DELETE FROM chat_reactions WHERE message_id = ? AND message_type = ? AND user_name = ? AND emoji = ?',
      [messageId, messageType, userName, emoji],
      function(err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      }
    );
  });
}

function getReactions(messageId, messageType) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT emoji, user_name FROM chat_reactions WHERE message_id = ? AND message_type = ?',
      [messageId, messageType],
      (err, rows) => {
        if (err) reject(err);
        else {
          // Group by emoji
          const grouped = {};
          (rows || []).forEach(r => {
            if (!grouped[r.emoji]) grouped[r.emoji] = [];
            grouped[r.emoji].push(r.user_name);
          });
          resolve(grouped);
        }
      }
    );
  });
}

function getReactionsForMessages(messageIds, messageType) {
  if (!messageIds.length) return Promise.resolve({});
  return new Promise((resolve, reject) => {
    const placeholders = messageIds.map(() => '?').join(',');
    db.all(
      `SELECT message_id, emoji, user_name FROM chat_reactions WHERE message_id IN (${placeholders}) AND message_type = ?`,
      [...messageIds, messageType],
      (err, rows) => {
        if (err) reject(err);
        else {
          const result = {};
          (rows || []).forEach(r => {
            if (!result[r.message_id]) result[r.message_id] = {};
            if (!result[r.message_id][r.emoji]) result[r.message_id][r.emoji] = [];
            result[r.message_id][r.emoji].push(r.user_name);
          });
          resolve(result);
        }
      }
    );
  });
}

/**
 * Initialize chat handler with Socket.io instance
 * @param {Server} io - Socket.io server instance
 */
function initChatHandler(io) {
  io.on('connection', (socket) => {
    console.log('[Chat] User connected:', socket.id);

    // User joins chat
    socket.on('join', async (data) => {
      const { name, page } = data || {};
      onlineUsers.set(socket.id, { name: name || 'Guest', page: page || '/' });
      
      // Send chat history from database
      try {
        const messages = await getMessages(200);
        // Get reactions for all messages
        const messageIds = messages.map(m => m.id);
        const reactions = await getReactionsForMessages(messageIds, 'public');
        messages.forEach(m => { m.reactions = reactions[m.id] || {}; });
        socket.emit('chatHistory', messages);
      } catch (err) {
        console.error('[Chat] Error loading messages:', err);
        socket.emit('chatHistory', []);
      }
      
      // Broadcast online users to everyone
      io.emit('onlineUsers', getAllOnlineUsers());
      
      console.log('[Chat] User joined:', name);
    });

    // Register user (from navbar - lightweight, no chat history)
    socket.on('register', (data) => {
      const { name, page } = data || {};
      onlineUsers.set(socket.id, { name: name || 'Guest', page: page || '/' });
      
      // Join user's personal notification room
      if (name) {
        socket.join(`user:${name}`);
        console.log(`[Notification] User ${name} joined notification room`);
      }
      
      // Broadcast online users to everyone immediately
      io.emit('onlineUsers', getAllOnlineUsers());
    });

    // Join user notification room (from navbar notification system)
    socket.on('joinUserRoom', (username) => {
      if (username) {
        socket.join(`user:${username}`);
        console.log(`[Notification] User ${username} joined notification room via joinUserRoom`);
      }
    });

    // Get current online users (on-demand request)
    socket.on('getOnlineUsers', () => {
      socket.emit('onlineUsers', getAllOnlineUsers());
    });

    // User changes page
    socket.on('pageChange', (page) => {
      const user = onlineUsers.get(socket.id);
      if (user) {
        user.page = page || '/';
        onlineUsers.set(socket.id, user);
        io.emit('onlineUsers', getAllOnlineUsers());
      }
    });

    // Typing indicator
    socket.on('typing', (data) => {
      const user = onlineUsers.get(socket.id);
      if (!user) return;
      
      const room = data?.to || 'main'; // 'main' for public chat, username for private
      const key = `${room}:${user.name}`;
      
      // Clear existing timeout
      if (typingUsers.has(key)) {
        clearTimeout(typingUsers.get(key));
      }
      
      // Broadcast typing event
      if (room === 'main') {
        socket.broadcast.emit('userTyping', { user: user.name, room: 'main' });
      } else {
        // Private chat - send only to recipient
        const recipientSocket = findSocketByUsername(room);
        if (recipientSocket) {
          io.to(recipientSocket).emit('userTyping', { user: user.name, room: room });
        }
      }
      
      // Auto-clear after 3 seconds
      typingUsers.set(key, setTimeout(() => {
        typingUsers.delete(key);
        if (room === 'main') {
          socket.broadcast.emit('userStoppedTyping', { user: user.name, room: 'main' });
        } else {
          const recipientSocket = findSocketByUsername(room);
          if (recipientSocket) {
            io.to(recipientSocket).emit('userStoppedTyping', { user: user.name, room: room });
          }
        }
      }, 3000));
    });
    
    // Stop typing
    socket.on('stopTyping', (data) => {
      const user = onlineUsers.get(socket.id);
      if (!user) return;
      
      const room = data?.to || 'main';
      const key = `${room}:${user.name}`;
      
      if (typingUsers.has(key)) {
        clearTimeout(typingUsers.get(key));
        typingUsers.delete(key);
      }
      
      if (room === 'main') {
        socket.broadcast.emit('userStoppedTyping', { user: user.name, room: 'main' });
      } else {
        const recipientSocket = findSocketByUsername(room);
        if (recipientSocket) {
          io.to(recipientSocket).emit('userStoppedTyping', { user: user.name, room: room });
        }
      }
    });

    // Chat message - broadcast to everyone
    socket.on('chatMessage', async (message) => {
      const user = onlineUsers.get(socket.id);
      if (!user) return;
      
      // Clear typing indicator
      const key = `main:${user.name}`;
      if (typingUsers.has(key)) {
        clearTimeout(typingUsers.get(key));
        typingUsers.delete(key);
        socket.broadcast.emit('userStoppedTyping', { user: user.name, room: 'main' });
      }
      
      // Handle both string and object message format (for reply support)
      let text, replyToId = null, attachment = null;
      if (typeof message === 'object') {
        text = message.text;
        replyToId = message.replyTo || null;
        attachment = message.attachment || null;
      } else {
        text = message;
      }
      
      const timestamp = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      
      // Save to database
      let messageId;
      try {
        messageId = await saveMessage(user.name, text, timestamp, replyToId, attachment);
      } catch (err) {
        console.error('[Chat] Error saving message:', err);
      }
      
      // Get reply info if exists
      let replyData = null;
      if (replyToId) {
        try {
          const replyRow = await new Promise((resolve, reject) => {
            db.get('SELECT id, sender, text FROM chat_messages WHERE id = ?', [replyToId], (err, row) => {
              if (err) reject(err);
              else resolve(row);
            });
          });
          if (replyRow) {
            replyData = { id: replyRow.id, sender: replyRow.sender, text: replyRow.text };
          }
        } catch (e) {}
      }
      
      const msgData = { 
        id: messageId,
        sender: user.name, 
        text: text, 
        time: timestamp,
        attachment: attachment,
        reactions: {},
        replyTo: replyData
      };
      
      // Broadcast to everyone
      io.emit('chatMessage', msgData);
      
      // Handle @mentions - send notifications
      const mentions = extractMentions(text);
      const onlineUsernames = getAllUsernames();
      
      for (const mentionedUser of mentions) {
        // Check if mentioned user exists (case-insensitive match)
        const matchedUser = onlineUsernames.find(u => u.toLowerCase() === mentionedUser.toLowerCase());
        if (matchedUser && matchedUser !== user.name) {
          // Send notification for mention
          NotificationService.notifyChatMention(matchedUser, user.name, text)
            .catch(err => console.error('[Chat] Mention notification error:', err));
        }
      }
    });

    // Add reaction to message
    socket.on('addReaction', async (data) => {
      const user = onlineUsers.get(socket.id);
      if (!user) return;
      
      const { messageId, emoji, isPrivate, chatWith } = data;
      if (!messageId || !emoji) return;
      
      const messageType = isPrivate ? 'private' : 'public';
      
      try {
        const added = await addReaction(messageId, messageType, user.name, emoji);
        if (added) {
          const reactions = await getReactions(messageId, messageType);
          
          if (isPrivate && chatWith) {
            // Send to both sender and recipient
            const recipientSocket = findSocketByUsername(chatWith);
            if (recipientSocket) {
              io.to(recipientSocket).emit('reactionUpdated', { messageId, reactions, isPrivate: true });
            }
            socket.emit('reactionUpdated', { messageId, reactions, isPrivate: true });
          } else {
            io.emit('reactionUpdated', { messageId, reactions, isPrivate: false });
          }
        }
      } catch (err) {
        console.error('[Chat] Error adding reaction:', err);
      }
    });
    
    // Remove reaction from message
    socket.on('removeReaction', async (data) => {
      const user = onlineUsers.get(socket.id);
      if (!user) return;
      
      const { messageId, emoji, isPrivate, chatWith } = data;
      if (!messageId || !emoji) return;
      
      const messageType = isPrivate ? 'private' : 'public';
      
      try {
        const removed = await removeReaction(messageId, messageType, user.name, emoji);
        if (removed) {
          const reactions = await getReactions(messageId, messageType);
          
          if (isPrivate && chatWith) {
            const recipientSocket = findSocketByUsername(chatWith);
            if (recipientSocket) {
              io.to(recipientSocket).emit('reactionUpdated', { messageId, reactions, isPrivate: true });
            }
            socket.emit('reactionUpdated', { messageId, reactions, isPrivate: true });
          } else {
            io.emit('reactionUpdated', { messageId, reactions, isPrivate: false });
          }
        }
      } catch (err) {
        console.error('[Chat] Error removing reaction:', err);
      }
    });

    // Private message
    socket.on('privateMessage', async (data) => {
      const { to, text, replyTo, attachment } = data || {};
      const sender = onlineUsers.get(socket.id);
      if (!sender || !to || (!text && !attachment)) return;
      
      // Clear typing indicator
      const key = `${to}:${sender.name}`;
      if (typingUsers.has(key)) {
        clearTimeout(typingUsers.get(key));
        typingUsers.delete(key);
        const recipientSocket = findSocketByUsername(to);
        if (recipientSocket) {
          io.to(recipientSocket).emit('userStoppedTyping', { user: sender.name, room: to });
        }
      }
      
      const timestamp = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      const chatKey = getPrivateChatKey(sender.name, to);
      
      // Save to database
      let messageId;
      try {
        messageId = await savePrivateMessage(chatKey, sender.name, to, text || '', timestamp, replyTo || null, attachment);
      } catch (err) {
        console.error('[Chat] Error saving private message:', err);
      }
      
      // Get reply info if exists
      let replyData = null;
      if (replyTo) {
        try {
          const replyRow = await new Promise((resolve, reject) => {
            db.get('SELECT id, sender, text FROM chat_private_messages WHERE id = ?', [replyTo], (err, row) => {
              if (err) reject(err);
              else resolve(row);
            });
          });
          if (replyRow) {
            replyData = { id: replyRow.id, sender: replyRow.sender, text: replyRow.text };
          }
        } catch (e) {}
      }
      
      const msgData = { 
        id: messageId,
        sender: sender.name, 
        to, 
        text: text || '', 
        time: timestamp, 
        isPrivate: true,
        attachment: attachment,
        reactions: {},
        replyTo: replyData
      };
      
      // Send to recipient
      const recipientSocket = findSocketByUsername(to);
      if (recipientSocket) {
        io.to(recipientSocket).emit('privateMessage', msgData);
      }
      
      // Always send notification for private messages (recipient might not have chat open)
      NotificationService.notifyChatMessage(to, sender.name, text)
        .catch(err => console.error('[Chat] Notification error:', err));
      
      // Also send back to sender
      socket.emit('privateMessage', msgData);
      
      console.log('[Chat] Private message from', sender.name, 'to', to);
    });

    // Get chat history (for main room)
    socket.on('getChatHistory', async () => {
      try {
        const messages = await getMessages(200);
        socket.emit('chatHistory', messages);
      } catch (err) {
        console.error('[Chat] Error loading messages:', err);
        socket.emit('chatHistory', []);
      }
    });

    // Get private chat history
    socket.on('getPrivateHistory', async (otherUser) => {
      const user = onlineUsers.get(socket.id);
      if (!user || !otherUser) return;
      
      const chatKey = getPrivateChatKey(user.name, otherUser);
      try {
        const messages = await getPrivateMessages(chatKey, 200);
        // Get reactions for all messages
        const messageIds = messages.map(m => m.id);
        const reactions = await getReactionsForMessages(messageIds, 'private');
        messages.forEach(m => { m.reactions = reactions[m.id] || {}; });
        socket.emit('privateHistory', { with: otherUser, messages });
      } catch (err) {
        console.error('[Chat] Error loading private messages:', err);
        socket.emit('privateHistory', { with: otherUser, messages: [] });
      }
    });

    // User disconnects
    socket.on('disconnect', () => {
      const user = onlineUsers.get(socket.id);
      if (user) {
        console.log('[Chat] User disconnected:', user.name);
      }
      onlineUsers.delete(socket.id);
      io.emit('onlineUsers', getAllOnlineUsers());
    });
    
    // ========================================
    // Driver Messages - Operator Panel Support
    // ========================================
    
    // Operator joins driver messages list page
    socket.on('joinDriverMessagesPanel', (data) => {
      const { username } = data || {};
      socket.join('driver_messages_panel');
      console.log(`[DriverMessages] ${username || 'Operator'} joined driver messages panel`);
    });
    
    // Operator opens chat with specific driver
    socket.on('joinDriverChat', (data) => {
      const { driverId, username } = data || {};
      if (driverId) {
        socket.join(`driver_chat_${driverId}`);
        console.log(`[DriverMessages] ${username || 'Operator'} joined chat with driver ${driverId}`);
      }
    });
    
    // Operator leaves driver chat
    socket.on('leaveDriverChat', (data) => {
      const { driverId } = data || {};
      if (driverId) {
        socket.leave(`driver_chat_${driverId}`);
      }
    });
    
    // Operator leaves driver messages panel
    socket.on('leaveDriverMessagesPanel', () => {
      socket.leave('driver_messages_panel');
    });
  });
  
  // Store io instance for external access
  initChatHandler.io = io;
}

// Export functions for external use (like clearing chat from admin)
initChatHandler.clearAllMessages = function() {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM chat_messages', [], (err) => {
      if (err) return reject(err);
      db.run('DELETE FROM chat_private_messages', [], (err2) => {
        if (err2) return reject(err2);
        resolve({ success: true });
      });
    });
  });
};

// Export online users for admin panel - uses the module-level onlineUsers Map
initChatHandler.getOnlineUsers = function() {
  // Group by username - keep track of all pages user is on
  const userMap = new Map();
  
  for (const [sid, user] of onlineUsers.entries()) {
    if (!userMap.has(user.name)) {
      userMap.set(user.name, {
        name: user.name,
        pages: [user.page],
        latestPage: user.page
      });
    } else {
      const existing = userMap.get(user.name);
      if (!existing.pages.includes(user.page)) {
        existing.pages.push(user.page);
      }
      existing.latestPage = user.page;
    }
  }
  
  return Array.from(userMap.values()).map(u => ({
    name: u.name,
    page: u.latestPage,
    pageDisplay: getPageDisplayName(u.latestPage),
    pageCount: u.pages.length
  }));
};

initChatHandler.getMessageCount = function() {
  try {
    const general = db.prepare('SELECT COUNT(*) as count FROM chat_messages').get();
    const priv = db.prepare('SELECT COUNT(*) as count FROM chat_private_messages').get();
    return Promise.resolve({
      general: general?.count || 0,
      private: priv?.count || 0
    });
  } catch (err) {
    return Promise.reject(err);
  }
};

module.exports = initChatHandler;
