import { createAuthClient } from '@neondatabase/auth';

const auth = createAuthClient(import.meta.env.VITE_NEON_AUTH_URL);
let sessionToken = null;
let currentUser = null;

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sessionToken, Accept: 'application/json' },
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Service indisponible');
  return data;
}

async function installPublicAccountHeader() {
  if (/^\/admin\/?$/.test(location.pathname)) return;
  const header = document.querySelector('.site-header');
  if (!header || header.querySelector('.public-account-tools')) return;

  const tools = document.createElement('div');
  tools.className = 'public-account-tools';
  tools.innerHTML = '<a class="public-login-link" href="/admin">Connexion</a>';
  header.insertBefore(tools, header.querySelector(".menu-toggle"));

  try {
    const result = await auth.token();
    sessionToken = result?.data?.token || null;
    if (!sessionToken) return;
    const data = await api('/api/admin/private-messages?summary=1');
    currentUser = data.user;
    if (!currentUser?.id) return;
    renderAccountTools(tools, Number(data.unreadCount || 0));
  } catch {
    // Keep the public connection link visible when the account is not active.
  }
}

function renderAccountTools(tools, unreadCount) {
  tools.innerHTML = `
    <span class="public-session-chip" title="Session connectée">
      <span class="public-session-dot" aria-hidden="true"></span>
      <span class="public-session-copy"><strong>${escapeHtml(currentUser.name || 'Mon compte')}</strong></span>
    </span>
    ${['admin', 'admin_delegate', 'editor'].includes(currentUser.role) ? '<a class="public-admin-shortcut" href="/admin" aria-label="Accéder à l’administration" title="Administration"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="m19.4 15 .1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 0 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 1 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a1.7 1.7 0 0 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 1 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V2a1.7 1.7 0 0 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 1 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 0 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9Z"/></svg></a>' : ''}
    <button class="public-notification-button" type="button" aria-label="Ouvrir la messagerie" title="Messagerie interne">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
      <span class="public-notification-count" ${unreadCount ? '' : 'hidden'}>${unreadCount}</span>
    </button>
    <button class="public-logout-button" type="button">Déconnexion</button>
  `;
  tools.querySelector('.public-notification-button').addEventListener('click', openMessaging);
  tools.querySelector('.public-logout-button').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await auth.signOut();
    } finally {
      sessionToken = null;
      currentUser = null;
      location.reload();
    }
  });
}

async function openMessaging() {
  let panel = document.querySelector('#public-messaging-panel');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'public-messaging-panel';
    panel.className = 'public-messaging-panel';
    panel.innerHTML = `
      <div class="public-messaging-head"><div><strong>Messagerie interne</strong><small>Vos échanges privés</small></div><button type="button" class="public-messaging-close" aria-label="Fermer">×</button></div>
      <label class="public-messaging-recipient">Destinataire<select id="public-message-recipient"><option value="">Chargement…</option></select></label>
      <div id="public-message-thread" class="public-message-thread"><p>Choisissez un correspondant pour afficher la conversation.</p></div>
      <form id="public-message-form" class="public-message-form"><textarea name="body" rows="3" maxlength="5000" placeholder="Votre message…" required></textarea><button type="submit">Envoyer</button></form>
      <p id="public-message-status" class="public-message-status" role="status"></p>`;
    document.body.append(panel);
    panel.querySelector('.public-messaging-close').addEventListener('click', () => panel.classList.remove('is-open'));
    panel.querySelector('#public-message-recipient').addEventListener('change', event => loadConversation(event.target.value));
    panel.querySelector('#public-message-form').addEventListener('submit', sendPrivateMessage);
  }
  panel.classList.add('is-open');
  try {
    const data = await api('/api/admin/private-messages');
    const select = panel.querySelector('#public-message-recipient');
    select.innerHTML = '<option value="">Choisir un destinataire</option>' + (data.contacts || []).map(contact =>
      '<option value="' + escapeHtml(contact.id) + '">' + escapeHtml(contact.name || contact.email) + ' — ' + escapeHtml(contact.email) + '</option>'
    ).join('');
    if (data.contacts?.length) {
      const previous = select.value;
      select.value = previous && data.contacts.some(c => c.id === previous) ? previous : data.contacts[0].id;
      await loadConversation(select.value);
    } else {
      panel.querySelector('#public-message-thread').innerHTML = '<p>Aucun autre compte actif disponible pour le moment.</p>';
    }
  } catch (error) {
    panel.querySelector('#public-message-status').textContent = 'Messagerie indisponible : ' + error.message;
  }
}

async function loadConversation(recipientId) {
  if (!recipientId) return;
  const panel = document.querySelector('#public-messaging-panel');
  const thread = panel.querySelector('#public-message-thread');
  thread.innerHTML = '<p>Chargement…</p>';
  try {
    const data = await api('/api/admin/private-messages?with=' + encodeURIComponent(recipientId));
    thread.innerHTML = (data.messages || []).map(message => {
      const mine = message.sender_id === currentUser.id;
      return '<article class="public-message-bubble ' + (mine ? 'mine' : 'theirs') + '"><p>' + escapeHtml(message.body) + '</p><small>' + (mine ? 'Vous' : 'Correspondant') + ' · ' + escapeHtml(new Date(message.created_at).toLocaleString('fr-FR')) + '</small></article>';
    }).join('') || '<p>Pas encore de message. Commencez la conversation.</p>';
    for (const message of data.messages || []) {
      if (message.recipient_id === currentUser.id && !message.read_at) {
        await api('/api/admin/private-messages/' + encodeURIComponent(message.id) + '/read', { method: 'POST' });
      }
    }
    thread.scrollTop = thread.scrollHeight;
    await refreshUnreadCount();
  } catch (error) {
    thread.innerHTML = '<p>Impossible de charger cette conversation : ' + escapeHtml(error.message) + '</p>';
  }
}

async function sendPrivateMessage(event) {
  event.preventDefault();
  const panel = document.querySelector('#public-messaging-panel');
  const select = panel.querySelector('#public-message-recipient');
  const form = event.currentTarget;
  const body = form.elements.body.value.trim();
  if (!select.value || !body) return;
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    await api('/api/admin/private-messages', { method: 'POST', body: JSON.stringify({ recipient_id: select.value, body }) });
    form.reset();
    await loadConversation(select.value);
  } catch (error) {
    panel.querySelector('#public-message-status').textContent = 'Envoi impossible : ' + error.message;
  } finally {
    button.disabled = false;
  }
}

async function refreshUnreadCount() {
  if (!sessionToken) return;
  try {
    const data = await api('/api/admin/private-messages?summary=1');
    const count = Number(data.unreadCount || 0);
    const badge = document.querySelector('.public-notification-count');
    if (badge) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.hidden = count === 0;
    }
  } catch {}
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function watchForPublicHeader() {
  if (/^\/admin\/?$/.test(location.pathname)) return;
  if (document.querySelector('.site-header')) {
    installPublicAccountHeader();
    return;
  }
  const observer = new MutationObserver(() => {
    if (!document.querySelector('.site-header')) return;
    observer.disconnect();
    installPublicAccountHeader();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

watchForPublicHeader();
setInterval(refreshUnreadCount, 30000);
