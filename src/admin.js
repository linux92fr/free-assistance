import { newsletterPage } from './newsletter-admin.js';
function renderArticleMarkup(source) {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
  const inline = value => escape(value)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
  const blocks = String(source || '').trim().split(/\n\s*\n/).filter(Boolean);
  return blocks.map(block => {
    const lines = block.split('\n').map(line => line.trim()).filter(Boolean);
    if (lines.every(line => /^[-*]\s+/.test(line))) return '<ul>' + lines.map(line => '<li>' + inline(line.replace(/^[-*]\s+/, '')) + '</li>').join('') + '</ul>';
    if (lines.every(line => /^\d+[.)]\s+/.test(line))) return '<ol>' + lines.map(line => '<li>' + inline(line.replace(/^\d+[.)]\s+/, '')) + '</li>').join('') + '</ol>';
    if (lines.every(line => /^>\s?/.test(line))) return '<blockquote>' + lines.map(line => inline(line.replace(/^>\s?/, ''))).join('<br>') + '</blockquote>';
    if (lines.length === 1 && /^###\s+/.test(lines[0])) return '<h3>' + inline(lines[0].replace(/^###\s+/, '')) + '</h3>';
    if (lines.length === 1 && /^##\s+/.test(lines[0])) return '<h2>' + inline(lines[0].replace(/^##\s+/, '')) + '</h2>';
    if (lines.length === 1 && /^#\s+/.test(lines[0])) return '<h2>' + inline(lines[0].replace(/^#\s+/, '')) + '</h2>';
    return '<p>' + lines.map(inline).join('<br>') + '</p>';
  }).join('');
}

import { createAuthClient } from '@neondatabase/auth';

const auth = createAuthClient(import.meta.env.VITE_NEON_AUTH_URL);
const root = document.querySelector('#app');
let mediaReturn = null;
let currentAdmin = null;
const roleLabels = { admin: 'Super administrateur', admin_delegate: 'Administrateur délégué', editor: 'Rédacteur', employee: 'Salarié / adhérent' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function token() {
  const result = await auth.token();
  if (result?.error) throw new Error(result.error.message || 'Session expirée');
  return result?.data?.token || null;
}
async function call(path, options = {}) {
  const jwt = await token();
  if (!jwt) throw new Error('Session expirée');
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}
function frame(content) {
  const account = currentAdmin ? '<span class="admin-session" style="display:inline-flex;align-items:center;gap:.45rem;padding:.45rem .7rem;border:1px solid #d9dee7;border-radius:999px;font-size:.82rem;color:#263244"><span aria-hidden="true" style="width:8px;height:8px;border-radius:50%;background:#16834a;display:inline-block"></span><span>Connecté : <strong>' + esc(currentAdmin.name || 'Mon compte') + '</strong></span></span>' : '';
  root.innerHTML = '<div class="admin-shell"><header class="admin-header"><a class="admin-brand" href="/"><strong>FO</strong> FOCOM · Free Distribution</a><div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap;justify-content:flex-end">' + account + '<a href="/">← Voir le site</a></div></header><main class="admin-main">' + content + '</main></div>';
}
function login(message = '') {
  currentAdmin = null;
  frame('<section class="admin-panel admin-login"><span class="eyebrow">Espace sécurisé</span><h1>Administration</h1><p>Connectez-vous avec votre adresse e-mail et votre mot de passe.</p><form id="login"><label>Adresse e-mail<input name="email" type="email" required autocomplete="username" placeholder="vous@exemple.fr"></label><label>Mot de passe<input name="password" type="password" required autocomplete="current-password"></label><button class="button button-red">Se connecter</button><p class="admin-message">' + esc(message) + '</p></form><button type="button" id="first-password" class="text-button">Première connexion ? Définir mon mot de passe</button><br><button type="button" id="forgot-password" class="text-button">Mot de passe oublié ?</button><p><button type="button" id="verify-email-link" class="text-button">Vérifier mon adresse e-mail</button></p></section>');
  root.querySelector('#login').addEventListener('submit', async e => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    try {
      const result = await auth.signIn.email({ email: data.get('email'), password: data.get('password') });
      if (result?.error) throw new Error(result.error.message);
      await dashboard();
    } catch (err) { login(err.message || 'Connexion impossible.'); }
  });
  root.querySelector('#first-password').addEventListener('click', () => initialPasswordSetup(root.querySelector('#login [name="email"]').value));
  root.querySelector('#forgot-password').addEventListener('click', () => passwordRequest(root.querySelector('#login [name="email"]').value));
  root.querySelector('#verify-email-link').addEventListener('click', () => emailVerification('', root.querySelector('#login [name="email"]').value));
}
function emailVerification(message = '', initialEmail = '') {
  frame('<section class="admin-panel admin-login"><span class="eyebrow">Vérification du compte</span><h1>Confirmer votre adresse e-mail</h1><p>Saisissez l’adresse e-mail du compte à vérifier. Un code à 6 chiffres sera envoyé à cette adresse.</p><form id="send-verification"><label>Adresse e-mail<input name="email" type="email" value="' + esc(initialEmail) + '" required autocomplete="email" placeholder="vous@exemple.fr"></label><button class="button button-outline-dark">Envoyer un code</button></form><form id="verify-email" style="margin-top:1rem"><label>Code reçu par e-mail<input name="otp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" required></label><button class="button button-red">Vérifier mon adresse</button><p class="admin-message" role="status">' + esc(message) + '</p></form><button type="button" id="back-login" class="text-button">← Retour à la connexion</button></section>');
  root.querySelector('#back-login').onclick = () => login();
  root.querySelector('#send-verification').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.currentTarget;
    const email = new FormData(form).get('email');
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const result = await auth.emailOtp.sendVerificationOtp({ email, type: 'email-verification' });
      if (result?.error) throw new Error(result.error.message || 'Envoi impossible.');
      emailVerification('Un code vient d’être envoyé à ' + email + '. Consultez cette boîte de réception.', email);
    } catch (err) {
      emailVerification(err.message || 'Impossible d’envoyer le code.', email);
    }
  });
  root.querySelector('#verify-email').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.currentTarget;
    const otp = new FormData(form).get('otp');
    const email = root.querySelector('#send-verification [name="email"]').value.trim();
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const result = await auth.emailOtp.verifyEmail({ email, otp });
      if (result?.error) throw new Error(result.error.message || 'Code invalide ou expiré.');
      login('Adresse e-mail vérifiée pour ' + email + '. Vous pouvez maintenant vous connecter.');
    } catch (err) {
      form.querySelector('.admin-message').textContent = err.message || 'Code invalide ou expiré. Demandez un nouveau code.';
      button.disabled = false;
    }
  });
}
function passwordMeetsPolicy(password) {
  return password.length >= 12 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password);
}
function generateSecurePassword(length = 20) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_+=?';
  const limit = 256 - (256 % chars.length);
  let result = '';
  while (result.length < length) {
    const bytes = new Uint8Array(length * 2);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte < limit) result += chars[byte % chars.length];
      if (result.length === length) break;
    }
  }
  return result;
}
function attachPasswordTools(form, passwordInput, confirmInput) {
  const generator = form.querySelector('[data-generate-password]');
  const strength = form.querySelector('[data-password-strength]');
  const update = () => {
    const value = passwordInput.value;
    if (!strength) return;
    const checks = [
      value.length >= 12,
      /[a-z]/.test(value),
      /[A-Z]/.test(value),
      /[0-9]/.test(value),
      /[^A-Za-z0-9]/.test(value)
    ];
    const score = checks.filter(Boolean).length;
    strength.textContent = !value ? '12 caractères minimum, avec majuscule, minuscule, chiffre et caractère spécial.' :
      (score === 5 ? 'Mot de passe robuste' : 'Robustesse : ' + score + '/5 critères');
  };
  passwordInput.addEventListener('input', update);
  if (generator) generator.addEventListener('click', () => {
    const generated = generateSecurePassword();
    passwordInput.value = generated;
    if (confirmInput) confirmInput.value = generated;
    passwordInput.type = 'text';
    update();
    passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
    generator.textContent = 'Mot de passe généré';
  });
  update();
}
function initialPasswordSetup(initialEmail = '', message = '') {
  frame('<section class="admin-panel admin-login"><span class="eyebrow">Première connexion</span><h1>Définir mon mot de passe</h1><p>Saisissez l’adresse e-mail utilisée par l’administrateur pour créer votre compte. Un code de vérification à usage unique vous sera envoyé.</p><form id="initial-password-request"><label>Adresse e-mail<input name="email" type="email" value="' + esc(initialEmail) + '" required autocomplete="email"></label><button class="button button-red">Recevoir un code</button><p class="admin-message" role="status">' + esc(message) + '</p></form><button type="button" id="back-login" class="text-button">← Retour à la connexion</button></section>');
  root.querySelector('#back-login').onclick = () => login();
  root.querySelector('#initial-password-request').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.currentTarget, button = form.querySelector('button');
    const email = new FormData(form).get('email').trim().toLowerCase();
    button.disabled = true;
    try {
      const result = await auth.forgetPassword.emailOtp({ email });
      if (result?.error) throw new Error(result.error.message || 'Envoi du code impossible.');
      initialPasswordVerify(email, 'Si cette adresse correspond à un compte, un code a été envoyé. Vérifiez votre boîte de réception et vos courriers indésirables.');
    } catch (err) {
      initialPasswordSetup(email, err.message || 'Impossible d’envoyer le code. Réessayez plus tard.');
    }
  });
}
function initialPasswordVerify(email, message = '') {
  frame('<section class="admin-panel admin-login"><span class="eyebrow">Vérification sécurisée</span><h1>Choisir mon mot de passe</h1><p>Un code à usage unique a été envoyé à <strong>' + esc(email) + '</strong>. Saisissez-le puis choisissez votre mot de passe personnel.</p><form id="initial-password-verify"><label>Code reçu<input name="otp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" required></label><label>Nouveau mot de passe<input name="password" type="password" minlength="12" required autocomplete="new-password"></label><button type="button" class="button button-outline-dark" data-generate-password>Générer un mot de passe</button><p class="admin-hint" data-password-strength>12 caractères minimum, avec majuscule, minuscule, chiffre et caractère spécial.</p><label>Confirmer le mot de passe<input name="confirm" type="password" minlength="12" required autocomplete="new-password"></label><button class="button button-red">Valider et définir mon mot de passe</button><p class="admin-message" role="status">' + esc(message) + '</p></form><button type="button" id="resend-code" class="text-button">Renvoyer un code</button></section>');
  const initialForm = root.querySelector('#initial-password-verify');
  attachPasswordTools(initialForm, initialForm.elements.password, initialForm.elements.confirm);
  root.querySelector('#resend-code').onclick = () => initialPasswordSetup(email);
  root.querySelector('#initial-password-verify').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.currentTarget, values = new FormData(form);
    const otp = String(values.get('otp') || '').trim();
    const password = String(values.get('password') || '');
    const messageNode = form.querySelector('.admin-message');
    if (!passwordMeetsPolicy(password)) { messageNode.textContent = 'Utilisez au moins 12 caractères avec une majuscule, une minuscule, un chiffre et un caractère spécial.'; return; }
    if (password !== values.get('confirm')) { messageNode.textContent = 'Les deux mots de passe ne correspondent pas.'; return; }
    const button = form.querySelector('button'); button.disabled = true;
    try {
      const checked = await auth.emailOtp.checkVerificationOtp({ email, otp, type: 'forget-password' });
      if (checked?.error || !checked?.data?.success) throw new Error(checked?.error?.message || 'Code invalide ou expiré. Demandez-en un nouveau.');
      const reset = await auth.emailOtp.resetPassword({ email, otp, password });
      if (reset?.error) throw new Error(reset.error.message || 'Impossible d’enregistrer le mot de passe.');
      history.replaceState({}, '', '/admin');
      login('Votre mot de passe est défini. Vous pouvez maintenant vous connecter.');
    } catch (err) {
      messageNode.textContent = err.message || 'Vérification impossible. Réessayez.';
      button.disabled = false;
    }
  });
}

function passwordRequest(initialEmail = '', message = '') {
  frame('<section class="admin-panel admin-login"><span class="eyebrow">Récupération du compte</span><h1>Réinitialiser le mot de passe</h1><p>Saisissez l’adresse e-mail du compte concerné. Vous recevrez un code de vérification à usage unique pour choisir un nouveau mot de passe.</p><form id="password-request"><label>Adresse e-mail<input name="email" type="email" value="' + esc(initialEmail) + '" required autocomplete="email" placeholder="vous@exemple.fr"></label><button class="button button-red">Recevoir un code</button><p class="admin-message" role="status">' + esc(message) + '</p></form><button type="button" id="back-login" class="text-button">← Retour à la connexion</button></section>');
  root.querySelector('#back-login').onclick = () => login();
  root.querySelector('#password-request').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.currentTarget, button = form.querySelector('button');
    const email = new FormData(form).get('email').trim().toLowerCase();
    button.disabled = true;
    try {
      const result = await auth.forgetPassword.emailOtp({ email });
      if (result?.error) throw new Error(result.error.message || 'Envoi du code impossible.');
      passwordReset(email, 'Si cette adresse correspond à un compte, un code a été envoyé. Vérifiez votre boîte de réception et vos courriers indésirables.');
    } catch (err) {
      passwordRequest(email, err.message || 'Impossible d’envoyer le code. Réessayez plus tard.');
    }
  });
}
function passwordReset(email = '', message = '') {
  if (!email) {
    passwordRequest('', message || 'Saisissez votre adresse e-mail pour recevoir un code de réinitialisation.');
    return;
  }
  frame('<section class="admin-panel admin-login"><span class="eyebrow">Récupération du compte</span><h1>Choisir un nouveau mot de passe</h1><p>Un code à usage unique a été envoyé à <strong>' + esc(email) + '</strong>. Saisissez-le puis choisissez votre nouveau mot de passe.</p><form id="password-reset"><label>Code reçu<input name="otp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" required></label><label>Nouveau mot de passe<input name="password" type="password" minlength="12" required autocomplete="new-password"></label><button type="button" class="button button-outline-dark" data-generate-password>Générer un mot de passe</button><p class="admin-hint" data-password-strength>12 caractères minimum, avec majuscule, minuscule, chiffre et caractère spécial.</p><label>Confirmer le mot de passe<input name="confirm" type="password" minlength="12" required autocomplete="new-password"></label><button class="button button-red">Enregistrer le nouveau mot de passe</button><p class="admin-message" role="status">' + esc(message) + '</p></form><button type="button" id="resend-reset-code" class="text-button">Renvoyer un code</button></section>');
  const resetForm = root.querySelector('#password-reset');
  attachPasswordTools(resetForm, resetForm.elements.password, resetForm.elements.confirm);
  root.querySelector('#resend-reset-code').onclick = () => passwordRequest(email);
  resetForm.addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.currentTarget, values = new FormData(form);
    const otp = String(values.get('otp') || '').trim();
    const password = String(values.get('password') || '');
    const messageNode = form.querySelector('.admin-message');
    if (!passwordMeetsPolicy(password)) { messageNode.textContent = 'Utilisez au moins 12 caractères avec une majuscule, une minuscule, un chiffre et un caractère spécial.'; return; }
    if (password !== values.get('confirm')) { messageNode.textContent = 'Les deux mots de passe ne correspondent pas.'; return; }
    const button = form.querySelector('button[type="submit"], button:not([type])'); button.disabled = true;
    try {
      const checked = await auth.emailOtp.checkVerificationOtp({ email, otp, type: 'forget-password' });
      if (checked?.error || !checked?.data?.success) throw new Error(checked?.error?.message || 'Code invalide ou expiré. Demandez-en un nouveau.');
      const reset = await auth.emailOtp.resetPassword({ email, otp, password });
      if (reset?.error) throw new Error(reset.error.message || 'Impossible d’enregistrer le mot de passe.');
      history.replaceState({}, '', '/admin');
      login('Mot de passe modifié. Vous pouvez maintenant vous connecter.');
    } catch (err) {
      messageNode.textContent = err.message || 'Réinitialisation impossible. Réessayez.';
      button.disabled = false;
    }
  });
}
async function accountEmailsPage() {
  frame('<div class="admin-title-row"><div><span class="eyebrow">Messages transactionnels</span><h1>Aperçu des e-mails de compte</h1><p>Prévisualisation uniquement : aucun message ne sera envoyé.</p></div><button id="back-dashboard" class="button button-outline-dark">← Tableau de bord</button></div><div id="account-email-previews"><p>Chargement des modèles…</p></div>');
  root.querySelector('#back-dashboard').onclick = () => dashboard();
  const target = root.querySelector('#account-email-previews');
  try {
    const templates = [
      { type: 'welcome', label: 'Bienvenue' },
      { type: 'activation', label: 'Activation du compte' },
    ];
    const results = await Promise.all(templates.map(async item => ({
      ...item,
      data: await call('/api/admin/account-email-preview?type=' + encodeURIComponent(item.type) + '&name=' + encodeURIComponent('Utilisateur de démonstration')),
    })));
    target.innerHTML = results.map(({ label, data }) =>
      '<section class="admin-panel"><h2>' + esc(label) + '</h2>' +
      '<p><strong>Expéditeur :</strong> ' + esc(data.sender?.name) + ' &lt;' + esc(data.sender?.email) + '&gt;</p>' +
      '<p><strong>Objet :</strong> ' + esc(data.subject) + '</p>' +
      '<h3>Aperçu HTML</h3><iframe title="' + esc(label) + '" sandbox="" style="width:100%;min-height:420px;border:1px solid #ddd;border-radius:8px;background:#fff" srcdoc="' + esc(data.html) + '"></iframe>' +
      '<details style="margin-top:1rem"><summary>Version texte</summary><pre style="white-space:pre-wrap">' + esc(data.text) + '</pre></details></section>'
    ).join('');
  } catch (err) {
    target.innerHTML = '<section class="admin-panel"><p class="admin-message">Impossible de charger les aperçus : ' + esc(err.message || 'Erreur inconnue') + '</p><p>Vérifiez que votre session administrateur est toujours active, puis réessayez.</p></section>';
  }
}
async function dashboard() {
  try {
    const { overview = {}, user = {} } = await call('/api/admin/overview');
    const messagingSummary = await call('/api/admin/private-messages?summary=1');
    const unreadCount = Number(messagingSummary.unreadCount || 0);
    currentAdmin = user;
    const canManage = ['admin','admin_delegate'].includes(user.role);
    const canWrite = ['admin','admin_delegate','editor'].includes(user.role);
    const tile = (id, icon, title, description, extra = '') =>
      '<button type="button" class="admin-module-card" id="' + id + '"><span class="admin-module-icon" aria-hidden="true">' + icon + '</span><span class="admin-module-copy"><strong>' + title + '</strong><small>' + description + '</small></span>' + extra + '<span class="admin-module-arrow" aria-hidden="true">→</span></button>';
    frame('<div class="admin-title-row admin-dashboard-heading"><div><span class="eyebrow">Espace sécurisé FO</span><h1>Tableau de bord</h1><p>Retrouvez les outils du site, classés par activité.</p><span class="admin-role-chip">' + esc(roleLabels[user.role] || 'Compte') + '</span></div><button id="logout" class="button button-outline-dark">Déconnexion</button></div>' +
      '<section class="admin-panel admin-overview-panel"><div class="admin-toolbar"><div><span class="eyebrow">En un coup d’œil</span><h2>Activité du site</h2></div><button id="refresh-overview" class="button button-quiet">Actualiser ↻</button></div><div class="admin-stats-grid"><article class="admin-stat"><span>Articles</span><strong>' + Number(overview.articles_total || 0) + '</strong><small>' + Number(overview.articles_published || 0) + ' publiés · ' + Number(overview.articles_draft || 0) + ' brouillons</small></article>' +
      (canManage ? '<article class="admin-stat"><span>Messages reçus</span><strong>' + Number(overview.messages_total || 0) + '</strong><small>' + Number(overview.messages_new || 0) + ' nouveaux · ' + Number(overview.messages_in_progress || 0) + ' en cours</small></article><article class="admin-stat"><span>Messages traités</span><strong>' + Number(overview.messages_resolved || 0) + '</strong><small>Demandes marquées comme traitées</small></article>' : '') + '</div></section>' +
      '<section class="admin-module-section"><div class="admin-section-heading"><span class="admin-section-number">01</span><div><h2>Gestion du site</h2><p>Organisez les contenus et les rubriques visibles par les salariés.</p></div></div><div class="admin-module-grid">' +
      (canWrite ? tile('open-articles','Aa','Actualités','Créer, classer et publier les articles') : '') +
      (canManage ? tile('open-homepage','⌂','Page d’accueil','Textes, visuels et aperçu de la page') + tile('open-survey','▤','Questionnaire','Consulter les réponses et les statistiques') + tile('open-maintenance','◷','Maintenance du site','Programmer ou activer une page de maintenance') + tile('open-site-password','🔐','Mot de passe du site','Modifier le mot de passe commun d’accès') : '') + (canWrite ? tile('open-content','§','Revendications et droits','Modifier les contenus, organiser les rubriques et prévisualiser') : '') +
      '</div></section>' +
      (canManage ? '<section class="admin-module-section"><div class="admin-section-heading"><span class="admin-section-number">02</span><div><h2>Communication</h2><p>Suivez les échanges avec les salariés et les campagnes d’information.</p></div></div><div class="admin-module-grid">' +
      tile('open-messages','✉','Messages reçus','Demandes envoyées depuis le formulaire') +
      tile('open-private-messages','◌','Messagerie interne','Échanges privés entre les comptes actifs', unreadCount > 0 ? '<span class="private-unread-badge">' + unreadCount + '</span>' : '') +
      tile('open-mailbox','✉','Boîte e-mail FO','Ouvrir le Webmail Amen · free-distri@focom-iliad.fr') +
      tile('open-newsletter','↗','Newsletter','Abonnés, campagnes et suivi des envois') +
      '</div></section>' +
      '<section class="admin-module-section"><div class="admin-section-heading"><span class="admin-section-number">03</span><div><h2>Ressources</h2><p>Centralisez les visuels utilisés dans les contenus du site.</p></div></div><div class="admin-module-grid">' +
      tile('open-media','▧','Médiathèque','Importer et gérer les images') +
      '</div></section>' +
      '<section class="admin-module-section"><div class="admin-section-heading"><span class="admin-section-number">04</span><div><h2>Administration</h2><p>Gérez les accès et les outils techniques réservés aux administrateurs.</p></div></div><div class="admin-module-grid">' +
      tile('open-users','♙','Utilisateurs et rôles','Comptes, autorisations et statuts') +
      (user.role === 'admin' ? tile('open-account-emails','✉','E-mails de compte','Prévisualiser les messages transactionnels') : '') +
      '</div></section>' : '') +
      '<section class="admin-panel admin-help-panel"><strong>Un espace adapté à votre rôle</strong><p>Les rubriques et les actions disponibles dépendent de vos autorisations. Les fonctions sensibles restent réservées aux administrateurs habilités.</p></section>');
    root.querySelector('#logout').onclick = async () => { await auth.signOut(); currentAdmin = null; login('Vous êtes déconnecté.'); };
    root.querySelector('#refresh-overview').onclick = () => dashboard();
    const routes = {
      'open-articles': articlesPage, 'open-messages': messages, 'open-survey': surveyPage,
      'open-media': mediaPage, 'open-homepage': homepagePage, 'open-newsletter': () => newsletterPage({ call, frame, root, dashboard }),
      'open-maintenance': maintenancePageAdmin, 'open-site-password': siteAccessPasswordPage,
      'open-users': usersPage, 'open-account-emails': accountEmailsPage, 'open-private-messages': () => privateMessagesPage(), 'open-mailbox': () => window.open('https://webmail.amen.fr/', '_blank', 'noopener,noreferrer'), 'open-content': siteContentPage
    };
    for (const [id, handler] of Object.entries(routes)) root.querySelector('#' + id)?.addEventListener('click', handler);
  } catch (err) { login('Impossible de charger le tableau de bord : ' + (err.message || 'ERREUR_INCONNUE') + '.'); }
}

async function siteAccessPasswordPage(){
  try{
    const state=await call('/api/admin/site-access-password');
    frame('<div class="admin-title-row"><div><span class="eyebrow">Sécurité du site</span><h1>Mot de passe d’accès</h1><p>Modifiez le mot de passe commun demandé aux visiteurs avant d’accéder au site complet.</p></div><button id="back-dashboard" class="button button-outline-dark">← Tableau de bord</button></div><section class="admin-panel"><p class="admin-hint">'+(state.managedInDashboard?'Le mot de passe est actuellement géré depuis le tableau de bord.':'Le mot de passe actuel est encore défini dans les secrets Cloudflare. Le premier enregistrement ici prendra le relais.')+'</p><form id="site-password-form"><label>Nouveau mot de passe<div style="display:flex;gap:.5rem"><input name="password" type="password" minlength="12" maxlength="128" autocomplete="new-password" required style="flex:1"><button type="button" id="toggle-site-password" class="button button-outline-dark" style="width:auto;margin:0">Afficher</button></div></label><ul id="site-password-checks" class="admin-help" aria-live="polite" style="list-style:none;padding-left:0;margin-top:.75rem"><li data-check="length">○ Au moins 12 caractères</li><li data-check="lower">○ Au moins une minuscule (a-z)</li><li data-check="upper">○ Au moins une majuscule (A-Z)</li><li data-check="digit">○ Au moins un chiffre (0-9)</li><li data-check="special">○ Au moins un caractère spécial</li></ul><label>Confirmer le nouveau mot de passe<input name="confirmation" type="password" minlength="12" maxlength="128" autocomplete="new-password" required></label><p id="site-password-match" class="admin-help" aria-live="polite">○ Les deux mots de passe doivent être identiques.</p><p class="admin-hint">Le mot de passe est enregistré sous forme de hash PBKDF2 salé. Il n’est jamais affiché après enregistrement. Les sessions d’accès existantes seront invalidées.</p><button class="button button-red" type="submit" disabled>Enregistrer le nouveau mot de passe</button><p id="site-password-status" class="admin-message" role="status"></p></form></section>');
    root.querySelector('#back-dashboard').onclick=()=>dashboard();
    const form=root.querySelector('#site-password-form'),password=form.elements.password,confirmation=form.elements.confirmation,status=root.querySelector('#site-password-status'),submit=form.querySelector('button[type="submit"]'),match=root.querySelector('#site-password-match');
    const checks=[
      ['length',v=>v.length>=12],
      ['lower',v=>/[a-z]/.test(v)],
      ['upper',v=>/[A-Z]/.test(v)],
      ['digit',v=>/[0-9]/.test(v)],
      ['special',v=>/[^A-Za-z0-9]/.test(v)]
    ];
    const refresh=()=>{
      const valid=checks.every(([key,test])=>{const ok=test(password.value),item=root.querySelector('[data-check="'+key+'"]');item.textContent=(ok?'✓ ':'○ ')+({length:'Au moins 12 caractères',lower:'Au moins une minuscule (a-z)',upper:'Au moins une majuscule (A-Z)',digit:'Au moins un chiffre (0-9)',special:'Au moins un caractère spécial'}[key]);item.style.color=ok?'#16803c':'';return ok;});
      const same=confirmation.value.length>0&&password.value===confirmation.value;
      match.textContent=(same?'✓ ':'○ ')+(same?'Les deux mots de passe correspondent.':'Les deux mots de passe doivent être identiques.');
      match.style.color=same?'#16803c':'';
      submit.disabled=!(valid&&same);
    };
    password.addEventListener('input',refresh);confirmation.addEventListener('input',refresh);
    root.querySelector('#toggle-site-password').onclick=()=>{const show=password.type==='password';password.type=confirmation.type=show?'text':'password';root.querySelector('#toggle-site-password').textContent=show?'Masquer':'Afficher';};
    form.onsubmit=async e=>{e.preventDefault();refresh();if(submit.disabled){status.textContent='Vérifiez les critères et la confirmation du mot de passe.';return;}submit.disabled=true;status.textContent='Enregistrement sécurisé…';try{await call('/api/admin/site-access-password',{method:'PUT',body:JSON.stringify({password:password.value})});form.reset();refresh();status.textContent='Mot de passe modifié. Les anciennes sessions sont invalidées.';}catch(err){status.textContent=err.message||'Modification impossible.';refresh();}};
  }catch(err){frame('<section class="admin-panel"><h1>Mot de passe du site</h1><p>'+esc(err.message||'Impossible de charger les paramètres.')+'</p><button id="back-dashboard" class="button button-outline-dark">← Retour</button></section>');root.querySelector('#back-dashboard').onclick=()=>dashboard();}
}

async function maintenancePageAdmin(){
  try{
    const {maintenance:m}=await call('/api/admin/maintenance');
    const local=value=>{if(!value)return '';const d=new Date(value);return Number.isNaN(d.getTime())?'':new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
    frame('<div class="admin-title-row"><div><span class="eyebrow">Gestion du site</span><h1>Maintenance programmée</h1><p>La page publique remplace le site pendant la période définie. Le tableau de bord reste accessible aux administrateurs.</p></div><button id="back-dashboard" class="button button-outline-dark">← Tableau de bord</button></div><section class="admin-panel"><form id="maintenance-form"><label style="display:flex;gap:.7rem;align-items:center"><input name="enabled" type="checkbox" '+(m.enabled?'checked':'')+' style="width:auto"> Activer la maintenance (ou la programmer)</label><label>Date et heure de début<input name="startsAt" type="datetime-local" value="'+esc(local(m.startsAt))+'"><small>Laisser vide pour une activation immédiate.</small></label><label>Date et heure de fin<input name="endsAt" type="datetime-local" value="'+esc(local(m.endsAt))+'"><small>Laisser vide pour désactiver manuellement.</small></label><label>Message affiché aux visiteurs<textarea name="message" rows="4" maxlength="500">'+esc(m.message)+'</textarea></label><p class="admin-hint">Les dates sont interprétées dans le fuseau horaire de votre navigateur. La maintenance se déclenche automatiquement à l’heure prévue.</p><button class="button button-red">Enregistrer les paramètres</button><p id="maintenance-status" class="admin-message" role="status"></p></form></section>');
    root.querySelector('#back-dashboard').onclick=()=>dashboard();
    root.querySelector('#maintenance-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button'),status=root.querySelector('#maintenance-status');b.disabled=true;status.textContent='Enregistrement…';const iso=name=>f.elements[name].value?new Date(f.elements[name].value).toISOString():'';try{await call('/api/admin/maintenance',{method:'PUT',body:JSON.stringify({enabled:f.elements.enabled.checked,startsAt:iso('startsAt'),endsAt:iso('endsAt'),message:f.elements.message.value})});status.textContent='Paramètres enregistrés. La programmation est prise en compte.';b.disabled=false;}catch(err){status.textContent=err.message||'Enregistrement impossible.';b.disabled=false;}};
  }catch(err){frame('<section class="admin-panel"><h1>Maintenance du site</h1><p>'+esc(err.message||'Impossible de charger les paramètres.')+'</p><button id="back-dashboard" class="button button-outline-dark">← Tableau de bord</button></section>');root.querySelector('#back-dashboard').onclick=()=>dashboard();}
}

async function siteContentPage(){
 const defaults={
 claims:{eyebrow:"Élections professionnelles · FO Free Distribution",title:"Nos revendications",lead:"Notre ambition : obtenir des avancées concrètes sur les salaires, les commissions, les conditions de travail et la reconnaissance des équipes en boutique. Voici les engagements que FO souhaite porter avec vous.",items:[
 {icon:"€",number:"01 · POUVOIR D'ACHAT",title:"Rémunération juste",bullets:["Augmentations générales et revalorisation des salaires fixes.","Reconnaissance de l'ancienneté et de l'expérience.","Primes et commissions transparentes, compréhensibles et vérifiables.","Une rémunération qui ne repose pas uniquement sur des objectifs commerciaux."]},
 {icon:"↗",number:"02 · COMMISSIONS",title:"Des objectifs atteignables",bullets:["Des objectifs adaptés à la fréquentation et à la réalité de chaque boutique.","Des règles de calcul des commissions claires et stables.","La prise en compte du travail collectif et des missions réellement effectuées.","La fin des changements imprévisibles en cours de période."]},
 {icon:"＋",number:"03 · EFFECTIFS",title:"De meilleures conditions de travail",bullets:["Des effectifs suffisants pour accueillir les clients dans de bonnes conditions.","Une meilleure anticipation et un remplacement des absences.","Des pauses respectées et des moyens matériels adaptés.","La prévention de la surcharge de travail et des risques psychosociaux."]},
 {icon:"◷",number:"04 · ORGANISATION",title:"Des horaires plus prévisibles",bullets:["Des plannings communiqués suffisamment à l'avance.","Une meilleure stabilité des horaires et des changements encadrés.","Une répartition équitable des ouvertures, fermetures et week-ends.","Une meilleure prise en compte de la vie personnelle et familiale."]},
 {icon:"↗",number:"05 · PARCOURS",title:"Formation et évolution",bullets:["Un accès équitable à la formation pour toutes et tous.","Des formations régulières sur les produits, services et outils.","Des parcours professionnels et critères d'évolution transparents.","La reconnaissance des compétences acquises sur le terrain."]},
 {icon:"◎",number:"06 · RESPECT",title:"Management et reconnaissance",bullets:["Un management fondé sur le respect, l'écoute et le dialogue.","La prévention des pratiques dévalorisantes et des pressions excessives.","Une reconnaissance du travail réellement accompli.","Des moyens accessibles pour signaler et traiter les difficultés."]},
 {icon:"♡",number:"07 · SANTÉ AU TRAVAIL",title:"Protéger la santé de chacun",bullets:["Une prévention effective des risques professionnels.","Une meilleure prise en compte de la santé physique et mentale.","Des espaces de travail adaptés et sécurisés.","Un suivi régulier des conditions de travail avec les représentants du personnel."]}
 ],commitmentTitle:"Des revendications, des actes et de la transparence.",commitmentText:"FO s'engage à vous écouter, porter vos demandes auprès de la direction, défendre vos intérêts et vous informer régulièrement des avancées comme des désaccords. Vos élus doivent rendre compte de leur action.",disclaimer:"Ces propositions constituent la base du programme revendicatif présenté aux salariés. Les mesures chiffrées et les priorités définitives seront précisées avec les équipes et les candidats FO."},
 rights:{eyebrow:"Mieux connaître vos droits",title:"Vos droits au travail",lead:"Des repères pratiques pour comprendre vos droits et savoir vers qui vous tourner. Les contenus détaillés seront publiés prochainement.",topics:[{icon:"€",number:"01 · RÉMUNÉRATION",title:"Salaire et rémunération"},{icon:"◷",number:"02 · TEMPS DE TRAVAIL",title:"Horaires et congés"},{icon:"◎",number:"03 · CONDITIONS DE TRAVAIL",title:"Santé et conditions de travail"},{icon:"§",number:"04 · ACCOMPAGNEMENT",title:"Information et recours"}],contactTitle:"Une question sur votre situation ?",contactText:"L’équipe FO est à votre écoute pour vous informer et vous accompagner."},
 section_order:{order:["intro","news","claims","rights","survey","contact"]}
 };
 try{
  const result=await call("/api/admin/site-content"),data={};Object.keys(defaults).forEach(k=>data[k]=result.content?.[k]?.draft||result.content?.[k]?.published||defaults[k]);
  const canPublish=!!result.permissions?.canPublish;let active="claims";
  const field=(label,name,value,area=false)=>'<label>'+esc(label)+(area?'<textarea name="'+name+'" rows="3">'+esc(value||"")+'</textarea>':'<input name="'+name+'" value="'+esc(value||"")+'">')+'</label>';
  const render=()=>{
   const value=data[active];let body="";
   if(active==="claims"){
    body=field("Petit titre","eyebrow",value.eyebrow)+field("Titre","title",value.title)+field("Introduction","lead",value.lead,true)+'<h2>Axes de revendication</h2>'+value.items.map((item,i)=>'<fieldset class="admin-panel" data-item="'+i+'"><div class="admin-form-grid">'+field("Icône","icon",item.icon)+field("Repère / numéro","number",item.number)+field("Titre de l’axe","itemTitle",item.title)+field("Arguments (une ligne par puce)","bullets",item.bullets.join("\n"),true)+'</div><button type="button" class="button button-quiet remove-item" data-index="'+i+'">Supprimer cet axe</button></fieldset>').join("")+'<button type="button" id="add-item" class="button button-outline-dark">＋ Ajouter un axe</button>'+field("Titre de l’engagement","commitmentTitle",value.commitmentTitle)+field("Texte de l’engagement","commitmentText",value.commitmentText,true)+field("Texte de précision","disclaimer",value.disclaimer,true);
   }else if(active==="rights"){
    body=field("Petit titre","eyebrow",value.eyebrow)+field("Titre","title",value.title)+field("Introduction","lead",value.lead,true)+'<h2>Thèmes des droits</h2>'+value.topics.map((item,i)=>'<fieldset class="admin-panel" data-item="'+i+'"><div class="admin-form-grid">'+field("Icône","icon",item.icon)+field("Repère / numéro","number",item.number)+field("Titre du thème","itemTitle",item.title)+'</div><button type="button" class="button button-quiet remove-item" data-index="'+i+'">Supprimer ce thème</button></fieldset>').join("")+'<button type="button" id="add-item" class="button button-outline-dark">＋ Ajouter un thème</button>'+field("Titre du bloc de contact","contactTitle",value.contactTitle)+field("Texte du bloc de contact","contactText",value.contactText,true);
   }else{body='<p class="admin-help">Déplacez les rubriques pour définir leur ordre d’affichage.</p><ol class="content-order-list">'+value.order.map((key,i)=>'<li><strong>'+({intro:"Notre engagement",news:"Actualités",claims:"Revendications",rights:"Vos droits",survey:"Questionnaire",contact:"Contact"}[key])+'</strong><span><button type="button" class="button button-quiet order-up" data-index="'+i+'" '+(i===0?"disabled":"")+'>↑</button> <button type="button" class="button button-quiet order-down" data-index="'+i+'" '+(i===5?"disabled":"")+'>↓</button></span></li>').join("")+'</ol>'}
   frame('<div class="admin-title-row"><div><span class="eyebrow">Édition des contenus</span><h1>Revendications, droits et rubriques</h1><p>Modifiez les contenus, vérifiez leur aperçu, puis enregistrez le brouillon ou publiez.</p></div><button id="logout" class="button button-outline-dark">Déconnexion</button></div><section class="admin-panel"><div class="admin-toolbar"><h2>Contenus du site</h2><button id="back-dashboard" class="button button-outline-dark">← Tableau de bord</button></div><div class="admin-form-actions"><button type="button" class="button '+(active==="claims"?"button-red":"button-outline-dark")+'" data-tab="claims">Revendications</button><button type="button" class="button '+(active==="rights"?"button-red":"button-outline-dark")+'" data-tab="rights">Droits</button>'+(canPublish?'<button type="button" class="button '+(active==="section_order"?"button-red":"button-outline-dark")+'" data-tab="section_order">Ordre des rubriques</button>':"")+'</div><form id="content-form" class="admin-form-grid">'+body+'<div class="admin-form-actions"><button class="button button-red" type="submit" value="draft">Enregistrer le brouillon</button>'+(canPublish?'<button class="button button-outline-dark" type="submit" value="publish">Publier ce contenu</button>':"")+'</div><p id="content-status" class="admin-message" role="status"></p></form></section><section class="admin-panel"><span class="eyebrow">Aperçu avant publication</span><h2>Rendu du contenu</h2><div id="content-preview"></div></section>');
   root.querySelector("#logout").onclick=async()=>{await auth.signOut();login("Vous êtes déconnecté.")};root.querySelector("#back-dashboard").onclick=()=>dashboard();
   root.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{active=b.dataset.tab;render()});
   const form=root.querySelector("#content-form");
   const read=()=>{if(active==="section_order")return;const v=Object.fromEntries(new FormData(form).entries());if(active==="claims"){data.claims={...data.claims,eyebrow:v.eyebrow,title:v.title,lead:v.lead,commitmentTitle:v.commitmentTitle,commitmentText:v.commitmentText,disclaimer:v.disclaimer};data.claims.items=[...form.querySelectorAll("[data-item]")].map(n=>({icon:n.querySelector('[name="icon"]').value,number:n.querySelector('[name="number"]').value,title:n.querySelector('[name="itemTitle"]').value,bullets:n.querySelector('[name="bullets"]').value.split("\n").map(x=>x.trim()).filter(Boolean)}))}else{data.rights={...data.rights,eyebrow:v.eyebrow,title:v.title,lead:v.lead,contactTitle:v.contactTitle,contactText:v.contactText};data.rights.topics=[...form.querySelectorAll("[data-item]")].map(n=>({icon:n.querySelector('[name="icon"]').value,number:n.querySelector('[name="number"]').value,title:n.querySelector('[name="itemTitle"]').value}))}};
   const preview=()=>{read();const p=root.querySelector("#content-preview");if(active==="claims")p.innerHTML='<article class="homepage-preview-section"><span class="eyebrow">'+esc(data.claims.eyebrow)+'</span><h3>'+esc(data.claims.title)+'</h3><p>'+esc(data.claims.lead)+'</p><div class="preview-claim-cards">'+data.claims.items.map(x=>'<div><b>'+esc(x.icon)+'</b><strong>'+esc(x.title)+'</strong><small>'+esc(x.bullets.join(" · "))+'</small></div>').join("")+'</div><div class="preview-commitment"><b>'+esc(data.claims.commitmentTitle)+'</b><span>'+esc(data.claims.commitmentText)+'</span></div><p>'+esc(data.claims.disclaimer)+'</p></article>';else if(active==="rights")p.innerHTML='<article class="homepage-preview-section"><span class="eyebrow">'+esc(data.rights.eyebrow)+'</span><h3>'+esc(data.rights.title)+'</h3><p>'+esc(data.rights.lead)+'</p><div class="preview-claim-cards">'+data.rights.topics.map(x=>'<div><b>'+esc(x.icon)+'</b><strong>'+esc(x.title)+'</strong><small>'+esc(x.number)+'</small></div>').join("")+'</div><div class="preview-commitment"><b>'+esc(data.rights.contactTitle)+'</b><span>'+esc(data.rights.contactText)+'</span></div></article>';else p.innerHTML='<h3>Ordre de la page</h3><ol>'+data.section_order.order.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ol>'};
   form.addEventListener("input",preview);preview();
   root.querySelectorAll(".remove-item").forEach(b=>b.onclick=()=>{read();const i=Number(b.dataset.index);if(active==="claims")data.claims.items.splice(i,1);else data.rights.topics.splice(i,1);render()});
   root.querySelector("#add-item")?.addEventListener("click",()=>{read();if(active==="claims")data.claims.items.push({icon:"•",number:String(data.claims.items.length+1).padStart(2,"0"),title:"Nouvel axe",bullets:[]});else data.rights.topics.push({icon:"§",number:String(data.rights.topics.length+1).padStart(2,"0"),title:"Nouveau thème"});render()});
   root.querySelectorAll(".order-up,.order-down").forEach(b=>b.onclick=()=>{const i=Number(b.dataset.index),j=i+(b.classList.contains("order-up")?-1:1);if(j<0||j>=6)return;[data.section_order.order[i],data.section_order.order[j]]=[data.section_order.order[j],data.section_order.order[i]];render()});
   form.onsubmit=async e=>{e.preventDefault();const action=e.submitter?.value||"draft";read();const button=e.submitter;button.disabled=true;try{await call("/api/admin/site-content",{method:"POST",body:JSON.stringify({key:active,content:data[active],action})});root.querySelector("#content-status").textContent=action==="publish"?"Contenu publié : la version publique est mise à jour.":"Brouillon enregistré. La version publique n’a pas changé.";if(action==="publish")await siteContentPage()}catch(err){root.querySelector("#content-status").textContent="Enregistrement impossible : "+err.message;button.disabled=false}};
  };
  render();
 }catch(error){login("Impossible de charger les contenus : "+error.message)}
}
async function surveyConfigPage(){
 try{
  const result=await call("/api/admin/survey-config"),config=JSON.parse(JSON.stringify(result.draft||result.published));
  const fields=[["conditions","Question 1 — conditions de travail"],["priorities","Question 2 — priorités"],["recognition","Question 3 — reconnaissance"],["comment","Question 4 — commentaire"]];
  const render=()=>{
   frame('<div class="admin-title-row"><div><span class="eyebrow">Configuration du questionnaire</span><h1>Modifier les questions</h1><p>Les codes internes des réponses restent inchangés afin de préserver les réponses déjà enregistrées et les exports.</p></div><button id="logout" class="button button-outline-dark">Déconnexion</button></div><section class="admin-panel"><div class="admin-toolbar"><h2>Libellés des questions</h2><button id="back-survey" class="button button-outline-dark">← Bilan du questionnaire</button></div><form id="survey-config-form" class="admin-form-grid">'+fields.map(([k,label])=>'<label>'+label+'<textarea name="'+k+'" rows="2" maxlength="300" required>'+esc(config[k])+'</textarea></label>').join("")+'<h2>Choix de priorités</h2><p class="admin-help">Les codes techniques sont fixes ; les libellés et l’ordre sont modifiables.</p>'+config.priorityOptions.map((o,i)=>'<label class="survey-config-option"><span>'+esc(o.value)+'</span><input name="priority-'+i+'" value="'+esc(o.label)+'" maxlength="180" required><span class="admin-form-actions"><button type="button" class="button button-quiet priority-up" data-index="'+i+'" '+(i===0?"disabled":"")+'>↑</button><button type="button" class="button button-quiet priority-down" data-index="'+i+'" '+(i===10?"disabled":"")+'>↓</button></span></label>').join("")+'<div class="admin-form-actions"><button class="button button-red" value="draft">Enregistrer le brouillon</button><button class="button button-outline-dark" value="publish">Publier le questionnaire</button></div><p id="survey-config-status" class="admin-message" role="status"></p></form></section><section class="admin-panel"><span class="eyebrow">Aperçu</span><h2>Libellés qui seront présentés aux salariés</h2><div id="survey-config-preview"></div></section>');
   root.querySelector("#logout").onclick=async()=>{await auth.signOut();login("Vous êtes déconnecté.")};root.querySelector("#back-survey").onclick=()=>surveyPage();
   const form=root.querySelector("#survey-config-form");
   const read=()=>{fields.forEach(([k])=>config[k]=form.elements.namedItem(k).value);config.priorityOptions.forEach((o,i)=>o.label=form.elements.namedItem("priority-"+i).value)};
   const preview=()=>{read();root.querySelector("#survey-config-preview").innerHTML=fields.map(([k],i)=>'<p><strong>'+String(i+1).padStart(2,"0")+'. '+esc(config[k])+'</strong></p>').join("")+'<ol>'+config.priorityOptions.map(o=>'<li>'+esc(o.label)+'</li>').join("")+'</ol>'};
   form.addEventListener("input",preview);preview();
   root.querySelectorAll(".priority-up,.priority-down").forEach(b=>b.onclick=()=>{read();const i=Number(b.dataset.index),j=i+(b.classList.contains("priority-up")?-1:1);if(j<0||j>=11)return;[config.priorityOptions[i],config.priorityOptions[j]]=[config.priorityOptions[j],config.priorityOptions[i]];render()});
   form.onsubmit=async e=>{e.preventDefault();read();const action=e.submitter?.value||"draft",button=e.submitter;button.disabled=true;try{await call("/api/admin/survey-config",{method:"POST",body:JSON.stringify({config,action})});root.querySelector("#survey-config-status").textContent=action==="publish"?"Questionnaire publié.":"Brouillon enregistré ; la version publique reste inchangée.";if(action==="publish")await surveyConfigPage()}catch(err){root.querySelector("#survey-config-status").textContent="Enregistrement impossible : "+err.message;button.disabled=false}};
  };render();
 }catch(error){login("Impossible de charger la configuration du questionnaire : "+error.message)}
}

async function surveyPage() {
  try {
    const { responses = [] } = await call('/api/admin/secure-survey-results');
    const configData = await call('/api/admin/survey-config');
    const labels = Object.fromEntries((configData.published?.priorityOptions || []).map(option => [option.value, option.label]));
    const conditions = {}, recognition = {}, priorities = {};
    for (let n=1;n<=5;n++) { conditions[n]=0; recognition[n]=0; }
    let sumConditions=0, sumRecognition=0;
    responses.forEach(row => {
      const a=row.answers||{};
      if (conditions[a.conditions] !== undefined) { conditions[a.conditions]++; sumConditions += Number(a.conditions); }
      if (recognition[a.recognition] !== undefined) { recognition[a.recognition]++; sumRecognition += Number(a.recognition); }
      (Array.isArray(a.priorities)?a.priorities:[]).forEach(key => { const label=labels[key]||key; priorities[label]=(priorities[label]||0)+1; });
    });
    const barRows = (obj,total) => Object.entries(obj).map(([label,count]) => '<div class="survey-admin-bar"><span class="survey-admin-label">'+esc(label)+'</span><div class="survey-admin-track"><i style="width:'+(total?count/total*100:0)+'%"></i></div><b class="survey-admin-value"><strong>'+count+'</strong><small>'+(total?Math.round(count/total*100):0)+' %</small></b></div>').join('');
    const comments=responses.filter(row=>row.answers?.comment).map(row=>'<article class="survey-admin-comment">'+esc(row.answers.comment)+'</article>').join('');
    frame('<div class="admin-title-row"><div><span class="eyebrow">Consultation des salariés</span><h1>Bilan du questionnaire</h1><p>Résultats anonymes et synthèse des réponses enregistrées.</p></div><button id="logout" class="button button-outline-dark">Déconnexion</button></div><section class="admin-panel"><div class="admin-toolbar"><h2>Résultats globaux</h2><div class="admin-form-actions"><button id="back-dashboard" class="button button-outline-dark">← Tableau de bord</button><button id="configure-survey" class="button button-outline-dark">Modifier les questions</button><button id="export-survey-csv" class="button button-outline-dark">Exporter CSV</button><button id="export-survey-pdf" class="button button-red">Exporter PDF</button></div></div><div class="admin-stats-grid"><article class="admin-stat"><span>Réponses reçues</span><strong>'+responses.length+'</strong><small>Participation totale enregistrée</small></article><article class="admin-stat"><span>Conditions de travail</span><strong>'+(responses.length?(sumConditions/responses.length).toFixed(1).replace('.',',')+'/5':'—')+'</strong><small>Note moyenne</small></article><article class="admin-stat"><span>Reconnaissance</span><strong>'+(responses.length?(sumRecognition/responses.length).toFixed(1).replace('.',',')+'/5':'—')+'</strong><small>Note moyenne</small></article></div></section><section class="admin-panel"><h2>Conditions de travail</h2>'+barRows(conditions,responses.length)+'</section><section class="admin-panel"><h2>Reconnaissance au travail</h2>'+barRows(recognition,responses.length)+'</section><section class="admin-panel"><h2>Priorités exprimées</h2>'+barRows(Object.fromEntries(Object.entries(priorities).sort((x,y)=>y[1]-x[1])),responses.length)+'</section><section class="admin-panel"><h2>Commentaires libres ('+responses.filter(row=>row.answers?.comment).length+')</h2><div class="survey-admin-comments">'+(comments||'<p>Aucun commentaire libre pour le moment.</p>')+'</div><p class="admin-help">Les réponses sont présentées de manière anonyme. Évitez de rechercher l’identité des participants à partir de leurs commentaires.</p></section>');
    root.querySelector('#logout').onclick = async () => { await auth.signOut(); login('Vous êtes déconnecté.'); };
    root.querySelector('#back-dashboard').onclick = () => dashboard();
    root.querySelector('#configure-survey').onclick = () => surveyConfigPage();
     root.querySelector('#export-survey-pdf').onclick = () => window.print();
    root.querySelector('#export-survey-csv').onclick = () => {
      const headers=['Date de réception','Conditions de travail','Reconnaissance','Priorités','Commentaire'];
      const rows=responses.map(row=>[row.created_at,row.answers?.conditions,row.answers?.recognition,(row.answers?.priorities||[]).map(k=>labels[k]||k).join(' | '),row.answers?.comment||'']);
      const quote=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
      const csv=[headers,...rows].map(row=>row.map(quote).join(';')).join('\r\n');
      const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download='fd-questionnaire-reponses-anonymes.csv';link.click();URL.revokeObjectURL(url);
    };
  } catch (err) { login('Impossible de charger les résultats : '+(err.message||'ERREUR_INCONNUE')+'.'); }
}

async function usersPage() {
  try {
    const { users = [], canAssignDelegate = false } = await call('/api/admin/users');
    const rows = users.map(user => {
      const role = ['admin','admin_delegate','editor','employee'].includes(user.role) ? user.role : 'employee';
      const status = ['pending','active','suspended'].includes(user.status) ? user.status : 'pending';
      const locked = ['contact@focom-iliad.fr','free-distri@focom-iliad.fr'].includes(user.email.toLowerCase()) || (!canAssignDelegate && ['admin','admin_delegate'].includes(role));
      return '<tr><td><input class="user-name" data-id="' + esc(user.id) + '" type="text" maxlength="120" aria-label="Nom du compte" value="' + esc(user.name || '') + '" placeholder="Nom et prénom"' + (locked ? ' disabled' : '') + '></td><td><span>' + esc(user.email) + '</span><small>' + (user.email_verified ? 'Adresse vérifiée' : 'Adresse non vérifiée') + '</small></td><td>' + (!canAssignDelegate && ['admin','admin_delegate'].includes(role) ? '<strong>' + (role === 'admin_delegate' ? 'Administrateur délégué' : 'Administrateur') + '</strong>' : '<select class="user-role" data-id="' + esc(user.id) + '"' + (locked ? ' disabled' : '') + '><option value="employee"' + (role === 'employee' ? ' selected' : '') + '>Salarié / adhérent</option><option value="editor"' + (role === 'editor' ? ' selected' : '') + '>Rédacteur</option>' + (canAssignDelegate ? '<option value="admin"' + (role === 'admin' ? ' selected' : '') + ' >Administrateur</option><option value="admin_delegate"' + (role === 'admin_delegate' ? ' selected' : '') + '>Administrateur délégué</option>' : '') + '</select>') + '</td><td><select class="user-status" data-id="' + esc(user.id) + '"' + (locked ? ' disabled' : '') + '><option value="pending"' + (status === 'pending' ? ' selected' : '') + '>En attente</option><option value="active"' + (status === 'active' ? ' selected' : '') + '>Actif</option><option value="suspended"' + (status === 'suspended' ? ' selected' : '') + '>Suspendu</option></select></td><td>' + (locked ? (['contact@focom-iliad.fr','free-distri@focom-iliad.fr'].includes(user.email.toLowerCase()) ? (user.email.toLowerCase() === 'contact@focom-iliad.fr' ? 'Compte principal protégé' : 'Compte administrateur historique protégé') : 'Compte privilégié protégé') : '<div class="admin-form-actions"><button class="button button-outline-dark user-save" data-id="' + esc(user.id) + '">Enregistrer</button><button class="button button-outline-dark user-reset" data-id="' + esc(user.id) + '" data-email="' + esc(user.email) + '">Envoyer un reset</button><button class="button button-outline-dark user-delete" data-id="' + esc(user.id) + '" data-email="' + esc(user.email) + '">Supprimer</button></div>') + '</td></tr>';
    }).join('');
    frame('<div class="admin-title-row"><div><span class="eyebrow">Gestion des accès</span><h1>Utilisateurs et rôles</h1><p>Consultez les comptes existants, attribuez un rôle et activez ou suspendez leur accès.</p></div><button id="logout" class="button button-outline-dark">Déconnexion</button></div><section class="admin-panel"><h2>Ajouter un utilisateur</h2><form id="user-create-form" class="admin-form-grid"><label>Nom et prénom<input name="name" maxlength="120" autocomplete="name" required></label><label>Adresse e-mail<input name="email" type="email" maxlength="254" autocomplete="email" required></label><label>Rôle<select name="role"><option value="employee">Salarié / adhérent</option><option value="editor">Rédacteur</option>' + (canAssignDelegate ? '<option value="admin">Administrateur</option><option value="admin_delegate">Administrateur délégué</option>' : '') + '</select></label><div class="admin-form-actions"><button class="button button-red" type="submit">Créer le compte</button></div></form><p class="admin-message" id="user-create-status" role="status">Le compte sera créé avec le statut « En attente ». Un e-mail de bienvenue précisera les prochaines étapes.</p></section><section class="admin-panel"><div class="admin-toolbar"><h2>' + users.length + ' compte(s)</h2><div class="admin-form-actions"><button id="back-dashboard" class="button button-outline-dark">← Tableau de bord</button><button id="refresh-users" class="button button-outline-dark">Actualiser</button></div></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Nom du compte</th><th>Adresse e-mail</th><th>Rôle</th><th>État</th><th>Action</th></tr></thead><tbody>' + (rows || '<tr><td colspan="5">Aucun compte.</td></tr>') + '</tbody></table></div><p class="admin-message" id="users-status" role="status"></p><p class="admin-help">Les nouveaux comptes sont classés en attente par défaut. L’inscription publique reste désactivée. Le compte administrateur principal ne peut pas être modifié ici.</p></section>');
    root.querySelector('#logout').onclick = async () => { await auth.signOut(); login('Vous êtes déconnecté.'); };
    root.querySelector('#back-dashboard').onclick = () => dashboard();
    root.querySelector('#refresh-users').onclick = () => usersPage();
    root.querySelector('#user-create-form').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget, button = form.querySelector('button[type="submit"]');
      const status = root.querySelector('#user-create-status');
      const values = Object.fromEntries(new FormData(form).entries());
      button.disabled = true; status.textContent = 'Création du compte…';
      try {
        const result = await call('/api/admin/users', { method: 'POST', body: JSON.stringify(values) });
        status.textContent = result.emailSent ? 'Compte créé et placé en attente. Un e-mail de bienvenue a été envoyé ; l’utilisateur devra définir son mot de passe et attendre l’approbation FO.' : 'Compte créé et placé en attente, mais l’e-mail de bienvenue n’a pas pu être envoyé. Vérifiez la configuration Brevo.';
        form.reset();
        await usersPage();
        const updatedStatus = root.querySelector('#user-create-status');
        if (updatedStatus) updatedStatus.textContent = status.textContent;
      } catch (err) {
        status.textContent = 'Création impossible : ' + err.message;
        button.disabled = false;
      }
    });
    root.querySelectorAll('.user-delete').forEach(button => button.onclick = async () => {
      const email = button.dataset.email || 'ce compte';
      if (!window.confirm('Supprimer définitivement le compte ' + email + ' ?\\n\\nCette action est irréversible. Les articles, questionnaires et autres données du site ne seront pas supprimés.')) return;
      button.disabled = true;
      const status = root.querySelector('#users-status');
      status.textContent = 'Suppression du compte…';
      try {
        const result = await call('/api/admin/users/' + encodeURIComponent(button.dataset.id), { method: 'DELETE' });
        await usersPage();
        const updatedStatus = root.querySelector('#users-status');
        if (updatedStatus) updatedStatus.textContent = result.accessCleanupPending
          ? 'Compte supprimé de Neon Auth ; le nettoyage de son autorisation doit être vérifié.'
          : 'Le compte ' + email + ' a été supprimé.';
      } catch (err) {
        status.textContent = 'Suppression impossible : ' + err.message;
        button.disabled = false;
      }
    });
    root.querySelectorAll('.user-reset').forEach(button => button.onclick = async () => {
      const email = button.dataset.email || '';
      if (!email || !window.confirm('Envoyer un code de réinitialisation du mot de passe à ' + email + ' ?\\n\\nL’utilisateur recevra un code à usage unique et choisira lui-même son nouveau mot de passe.')) return;
      button.disabled = true;
      const status = root.querySelector('#users-status');
      status.textContent = 'Envoi du code de réinitialisation…';
      try {
        const result = await auth.forgetPassword.emailOtp({ email });
        if (result?.error) throw new Error(result.error.message || 'Envoi du code impossible.');
        status.textContent = 'Demande de réinitialisation envoyée à ' + email + '. L’utilisateur doit consulter sa boîte de réception et suivre les instructions.';
      } catch (err) {
        status.textContent = 'Envoi du reset impossible : ' + (err.message || 'ERREUR_INCONNUE');
        button.disabled = false;
      }
    });
    root.querySelectorAll('.user-save').forEach(button => button.onclick = async () => {
      const id = button.dataset.id, name = root.querySelector('.user-name[data-id="' + id + '"]').value.trim(), role = root.querySelector('.user-role[data-id="' + id + '"]').value, status = root.querySelector('.user-status[data-id="' + id + '"]').value;
      button.disabled = true;
      try { const result = await call('/api/admin/users/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ name, role, status }) }); root.querySelector('#users-status').textContent = result.activationEmailSent === true ? 'Nom, rôle et état enregistrés. L’e-mail d’activation a été envoyé.' : result.activationEmailSent === false ? 'Nom, rôle et état enregistrés, mais l’e-mail d’activation n’a pas pu être envoyé. Vérifiez la configuration Brevo.' : 'Nom, rôle et état enregistrés.'; }
      catch (err) { root.querySelector('#users-status').textContent = 'Modification impossible : ' + err.message; button.disabled = false; }
    });
  } catch (err) { login('Impossible de charger les utilisateurs : ' + (err.message || 'ERREUR_INCONNUE') + '.'); }
}

async function homepagePage(overrides = null) {
  try {
    const { content: savedContent = {} } = await call('/api/admin/homepage');
    const content = { ...savedContent, ...(overrides || {}) };
    const fields = [
      ['hero_eyebrow','Petit titre d’accueil'],['hero_title','Grand titre d’accueil'],['hero_text','Texte d’introduction'],
      ['hero_primary_label','Bouton principal — texte'],['hero_primary_url','Bouton principal — lien'],
      ['hero_secondary_label','Bouton secondaire — texte'],['hero_secondary_url','Bouton secondaire — lien'],
      ['intro_eyebrow','Engagement — petit titre'],['intro_title','Engagement — titre'],['intro_text','Engagement — texte'],
      ['news_eyebrow','Actualités — petit titre'],['news_title','Actualités — titre'],['news_note','Actualités — texte complémentaire'],
      ['claims_eyebrow','Revendications — petit titre'],['claims_title','Revendications — titre'],['claims_note','Revendications — texte complémentaire'],['claims_lead','Revendications — introduction'],
      ['rights_eyebrow','Droits — petit titre'],['rights_title','Droits — titre'],['rights_lead','Droits — introduction'],
      ['survey_eyebrow','Questionnaire — petit titre'],['survey_title','Questionnaire — titre'],['survey_text','Questionnaire — introduction']
    ];
    const imageFields = [['hero_image','Bannière d’accueil'],['intro_image','Engagement'],['news_image','Actualités'],['claims_image','Revendications'],['rights_image','Droits'],['survey_image','Questionnaire']];
    frame('<div class="admin-title-row"><div><span class="eyebrow">Contenu du site</span><h1>Page d’accueil</h1><p>Modifiez les textes principaux affichés sur la page d’accueil. Les articles, revendications détaillées et questions du questionnaire restent gérés dans leurs espaces respectifs.</p></div><button id="logout" class="button button-outline-dark">Déconnexion</button></div><section class="admin-panel"><div class="admin-toolbar"><h2>Textes de la page d’accueil</h2><button id="back-dashboard" class="button button-outline-dark">← Tableau de bord</button></div><form id="homepage-form" class="admin-form-grid">' + fields.map(([key,label]) => '<label>' + esc(label) + (key.endsWith('_text') || key.endsWith('_lead') || key.endsWith('_title') ? '<textarea name="' + key + '" rows="' + (key.endsWith('_title') ? '2' : '4') + '">' + esc(content[key] || '') + '</textarea>' : '<input name="' + key + '" value="' + esc(content[key] || '') + '">') + '</label>').join('') + '<section class="homepage-image-manager"><h3>Visuels de la page d’accueil</h3><p>Choisissez une image déjà importée dans la médiathèque. Laissez le champ vide pour conserver le visuel graphique actuel.</p><div class="homepage-image-grid">' + imageFields.map(([key,label]) => '<div class="homepage-image-field"><strong>' + esc(label) + '</strong><input type="hidden" name="' + key + '" value="' + esc(content[key] || '') + '"><div class="homepage-image-preview" data-image-preview="' + key + '">' + (content[key] ? '<img src="' + esc(content[key]) + '" alt="Aperçu ' + esc(label) + '">' : '<span>Aucune image sélectionnée</span>') + '</div><button type="button" class="button button-outline-dark homepage-image-select" data-image-key="' + key + '">Choisir dans la médiathèque</button><button type="button" class="text-button homepage-image-clear" data-image-key="' + key + '">Retirer l’image</button></div>').join('') + '</div></section><div class="admin-form-actions"><button class="button button-red" type="submit">Enregistrer les modifications</button><button class="button button-outline-dark" type="button" id="reset-homepage">Recharger les textes actuels</button></div><p class="admin-message" id="homepage-status" role="status"></p></form></section><section class="admin-panel homepage-preview-panel"><div class="admin-toolbar"><div><span class="eyebrow">Aperçu instantané</span><h2>Rendu de l’accueil</h2></div><span class="preview-status">Non publié tant que vous n’enregistrez pas</span></div><div class="homepage-preview"><div class="homepage-preview-copy"><span class="preview-category" id="home-preview-eyebrow"></span><h2 id="home-preview-title"></h2><p id="home-preview-text"></p><div class="homepage-preview-buttons"><span class="button button-red" id="home-preview-primary"></span><span class="button button-outline-dark" id="home-preview-secondary"></span></div></div><div class="homepage-preview-art"><span>FO</span><small>FREE DISTRIBUTION</small></div></div><div class="homepage-preview-sections"> <article class="homepage-preview-section homepage-preview-intro"><span class="eyebrow" id="home-preview-intro-eyebrow"></span><h3 id="home-preview-intro-title"></h3><p id="home-preview-intro-text"></p><div class="preview-visual-strip"><span>ÉCOUTER</span><span>INFORMER</span><span>DÉFENDRE</span></div></article> <article class="homepage-preview-section homepage-preview-news"><span class="eyebrow" id="home-preview-news-eyebrow"></span><h3 id="home-preview-news-title"></h3><p id="home-preview-news-note"></p><div class="preview-news-cards"><div><i>ACTUALITÉ</i><b>Dernières informations</b><small>Les articles publiés apparaîtront ici.</small></div><div><i>FOCUS</i><b>Vie des boutiques</b><small>Les publications récentes seront affichées.</small></div></div></article> <article class="homepage-preview-section homepage-preview-claims"><span class="eyebrow" id="home-preview-claims-eyebrow"></span><h3 id="home-preview-claims-title"></h3><p class="homepage-preview-note" id="home-preview-claims-note"></p><p id="home-preview-claims-lead"></p><div class="preview-claim-cards"><div><b>€</b><strong>Rémunération juste</strong><small>Salaires et pouvoir d’achat</small></div><div><b>↗</b><strong>Commissions</strong><small>Des objectifs atteignables</small></div><div><b>＋</b><strong>Conditions de travail</strong><small>Effectifs et moyens adaptés</small></div><div><b>◷</b><strong>Organisation</strong><small>Des horaires prévisibles</small></div><div><b>◎</b><strong>Reconnaissance</strong><small>Respect et évolution</small></div><div><b>♡</b><strong>Santé au travail</strong><small>Prévention et sécurité</small></div></div><div class="preview-commitment"><b>Des revendications, des actes et de la transparence.</b><span>FO s’engage à vous écouter et à défendre vos intérêts.</span></div></article> <article class="homepage-preview-section homepage-preview-rights"><span class="eyebrow" id="home-preview-rights-eyebrow"></span><h3 id="home-preview-rights-title"></h3><p id="home-preview-rights-lead"></p><span class="preview-rights-link">Une question ? Contactez FO →</span></article> <article class="homepage-preview-section homepage-preview-survey"><span class="eyebrow" id="home-preview-survey-eyebrow"></span><h3 id="home-preview-survey-title"></h3><p id="home-preview-survey-text"></p><span class="homepage-preview-tag">Questionnaire anonyme</span><div class="preview-survey-question"><b>01</b><span>Comment évaluez-vous globalement vos conditions de travail ?</span><div>1　2　3　4　5</div></div><div class="preview-survey-question"><b>02</b><span>Quels sujets devraient être prioritaires ?</span><div>☐ Salaires　☐ Commissions　☐ Effectifs</div></div><div class="preview-survey-question"><b>03</b><span>Vous sentez-vous reconnu(e) dans votre travail ?</span><div>1　2　3　4　5</div></div><small>Extrait visuel du questionnaire — les réponses ne sont pas envoyées depuis cet aperçu.</small></article> </div><div class="homepage-preview-structure"><div><b>En-tête du site (header)</b><span>Logo, navigation et liens principaux — structure protégée</span></div><div><b>Pied de page (footer)</b><span>Logo, liens légaux et informations — structure protégée</span></div><small>Ces éléments ne sont pas modifiables dans cet éditeur. Leur modification est réservée au super-administrateur.</small></div></section>');
    root.querySelector('#logout').onclick = async () => { await auth.signOut(); login('Vous êtes déconnecté.'); };
    root.querySelector('#back-dashboard').onclick = () => dashboard();
    root.querySelector('#reset-homepage').onclick = () => homepagePage();
    const form = root.querySelector('#homepage-form');
    const preview = () => {
      const value = key => form.elements.namedItem(key)?.value || '';
      const updateImagePreview = key => { const target = root.querySelector('[data-image-preview="' + key + '"]'); if (!target) return; const url = value(key); target.innerHTML = url ? '<img src="' + esc(url) + '" alt="Aperçu">' : '<span>Aucune image sélectionnée</span>'; };
      root.querySelector('#home-preview-eyebrow').textContent = value('hero_eyebrow');
      root.querySelector('#home-preview-title').textContent = value('hero_title');
      root.querySelector('#home-preview-text').textContent = value('hero_text');
      root.querySelector('#home-preview-primary').textContent = value('hero_primary_label') || 'Bouton principal';
      const secondary = root.querySelector('#home-preview-secondary');
      secondary.textContent = value('hero_secondary_label');
      secondary.hidden = !value('hero_secondary_label').trim();
      for (const [key] of imageFields) updateImagePreview(key);
      const previewFields = {
        intro: ['intro_eyebrow','intro_title','intro_text'],
        news: ['news_eyebrow','news_title','news_note'],
        claims: ['claims_eyebrow','claims_title','claims_note','claims_lead'],
        rights: ['rights_eyebrow','rights_title','rights_lead'],
        survey: ['survey_eyebrow','survey_title','survey_text']
      };
      for (const [section, keys] of Object.entries(previewFields)) {
        keys.forEach(key => {
          const node = root.querySelector('#home-preview-' + key.replace('_','-'));
          if (node) node.textContent = value(key);
        });
      }
    };
    form.addEventListener('input', preview);
    root.querySelectorAll('.homepage-image-select').forEach(button => button.onclick = () => { const key = button.dataset.imageKey; const current = {}; for (const [field] of fields) current[field] = form.elements.namedItem(field).value; for (const [field] of imageFields) current[field] = form.elements.namedItem(field).value; mediaReturn = url => homepagePage({ ...current, [key]: url }); mediaPage(); });
    root.querySelectorAll('.homepage-image-clear').forEach(button => button.onclick = () => { const key = button.dataset.imageKey; form.elements.namedItem(key).value = ''; preview(); });
    preview();
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const updated = {};
      for (const [key] of fields) updated[key] = form.elements.namedItem(key).value;
      for (const [key] of imageFields) updated[key] = form.elements.namedItem(key).value;
      button.disabled = true;
      const status = root.querySelector('#homepage-status');
      status.textContent = 'Enregistrement…';
      try {
        await call('/api/admin/homepage', { method: 'PUT', body: JSON.stringify({ content: updated }) });
        status.textContent = 'Les textes de la page d’accueil ont été enregistrés.';
      } catch (error) {
        status.textContent = 'Enregistrement impossible : ' + error.message;
      } finally { button.disabled = false; }
    });
  } catch (error) {
    frame('<section class="admin-panel"><h1>Page d’accueil</h1><p class="admin-message">Chargement impossible : ' + esc(error.message) + '</p><button id="back-dashboard" class="button button-outline-dark">← Tableau de bord</button></section>');
    root.querySelector('#back-dashboard').onclick = () => dashboard();
  }
}
async function mediaPage() {
  try {
    const { media = [], truncated = false } = await call('/api/admin/media');
    frame('<div class="admin-title-row"><div><span class="eyebrow">Images du site</span><h1>Médiathèque</h1><p>Importez et réutilisez les images de vos articles. Formats JPG, PNG, WebP ou GIF · 8 Mo maximum.</p></div><button id="logout" class="button button-outline-dark">Déconnexion</button></div><section class="admin-panel"><div class="admin-toolbar"><h2>Importer une image</h2><button id="back-dashboard" class="button button-outline-dark">← Tableau de bord</button></div><form id="media-upload" class="admin-form-actions"><input type="file" name="file" accept="image/jpeg,image/png,image/webp,image/gif" required><button class="button button-red">Importer</button></form><p class="admin-message" id="media-status" role="status"></p></section><section class="admin-panel"><div class="admin-toolbar"><h2>Images disponibles ('+media.length+')</h2><button id="refresh-media" class="button button-outline-dark">Actualiser</button></div><div class="media-grid">'+(media.length?media.map(item=>'<article class="media-item"><img src="'+esc(item.url)+'" alt=""><div><small>'+esc(item.key.split('/').pop())+'</small><p>'+Math.round(item.size/1024)+' Ko</p><button class="button button-outline-dark media-select" data-url="'+esc(item.url)+'">Utiliser cette image</button> <button class="text-button media-delete" data-key="'+esc(item.key)+'">Supprimer</button></div></article>').join(''):'<p>Aucune image enregistrée pour le moment.</p>')+'</div>'+(truncated?'<p class="admin-help">Affichage limité aux 200 premières images.</p>':'')+'</section>');
    root.querySelector('#logout').onclick = async () => { await auth.signOut(); login('Vous êtes déconnecté.'); };
    root.querySelector('#back-dashboard').onclick = () => { mediaReturn=null; dashboard(); };
    root.querySelector('#refresh-media').onclick = () => mediaPage();
    root.querySelector('#media-upload').onsubmit = async e => {
      e.preventDefault();
      const uploadForm = e.currentTarget;
      const button=uploadForm.querySelector('button'); button.disabled=true;
      try {
        const jwt=await token();
        const form=new FormData(uploadForm);
        const response=await fetch('/api/admin/media',{method:'POST',headers:{Authorization:'Bearer '+jwt},body:form});
        const data=await response.json().catch(()=>({}));
        if(!response.ok) throw new Error(data.error||'Import impossible');
        mediaPage();
      } catch(err) { root.querySelector('#media-status').textContent='Erreur : '+err.message; button.disabled=false; }
    };
    root.querySelectorAll('.media-select').forEach(button=>button.onclick=()=>{
      const url=button.dataset.url;
      if(mediaReturn){const callback=mediaReturn;mediaReturn=null;callback(url);}
      else { navigator.clipboard?.writeText(new URL(url, location.origin).href); root.querySelector('#media-status').textContent='Adresse de l’image copiée.'; }
    });
    root.querySelectorAll('.media-delete').forEach(button=>button.onclick=async()=>{
      if(!confirm('Supprimer définitivement cette image ?')) return;
      try { await call('/api/admin/media/'+button.dataset.key.split('/').map(encodeURIComponent).join('/'),{method:'DELETE'}); mediaPage(); }
      catch(err){ root.querySelector('#media-status').textContent='Suppression impossible : '+err.message; }
    });
  } catch(err) { login('Impossible de charger la médiathèque : '+err.message+'.'); }
}

async function articlesPage() {
  try {
    const { articles = [] } = await call('/api/admin/articles');
    frame('<div class="admin-title-row"><div><span class="eyebrow">Gestion du contenu</span><h1>Actualités</h1><p>Créer, modifier et publier les communications FO.</p></div><button id="logout" class="button button-outline-dark">Déconnexion</button></div><section class="admin-panel"><div class="admin-toolbar"><h2>Articles (' + articles.length + ')</h2><div class="admin-form-actions"><button id="back-dashboard" class="button button-outline-dark">← Tableau de bord</button><button id="new" class="button button-red">＋ Nouvel article</button></div></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Titre</th><th>Catégorie</th><th>Statut</th><th></th></tr></thead><tbody>' + (articles.length ? articles.map(a => '<tr><td><b>' + esc(a.title) + '</b><small>' + esc(a.slug) + '</small></td><td>' + esc(a.category) + '</td><td>' + esc(a.status) + '</td><td><button class="text-button edit" data-id="' + a.id + '">Modifier</button></td></tr>').join('') : '<tr><td colspan="4">Aucun article pour le moment.</td></tr>') + '</tbody></table></div></section><section id="editor" class="admin-panel" hidden></section>');
    root.querySelector('#logout').onclick = async () => { await auth.signOut(); login('Vous êtes déconnecté.'); };
    root.querySelector('#new').onclick = () => editor();
    root.querySelector('#back-dashboard').onclick = () => dashboard();
    root.querySelectorAll('.edit').forEach(b => b.onclick = () => editor(articles.find(a => String(a.id) === b.dataset.id)));
  } catch (err) { login('Diagnostic de connexion : ' + (err.message || 'ERREUR_INCONNUE') + '.'); }
}
async function messages() {
  try {
    const { messages: items = [], permissions = {} } = await call('/api/admin/messages');
    const statusLabels = { new: 'Nouveau', in_progress: 'En cours', resolved: 'Traité', archived: 'Archivé' };
    frame('<div class="admin-title-row"><div><span class="eyebrow">Espace de contact</span><h1>Messages reçus</h1><p>Les messages envoyés depuis le formulaire de contact du site.</p></div><button id="logout" class="button button-outline-dark">Déconnexion</button></div><section class="admin-panel"><div class="admin-toolbar"><h2>' + items.length + ' message(s)</h2><div class="admin-form-actions"><button id="back-articles" class="button button-outline-dark">← Articles</button><button id="refresh-messages" class="button button-outline-dark">Actualiser</button></div></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Reçu le</th><th>Expéditeur</th><th>Objet et message</th><th>Suivi</th></tr></thead><tbody>' + (items.length ? items.map(m => '<tr><td>' + esc(new Date(m.received_at).toLocaleString('fr-FR')) + '</td><td><b>' + esc(m.name || 'Nom non renseigné') + '</b><small>' + esc(m.email) + '</small></td><td><details><summary>' + esc(m.subject) + '</summary><p style="white-space:pre-wrap;max-width:520px">' + esc(m.message) + '</p><a href="mailto:' + encodeURIComponent(m.email) + '?subject=' + encodeURIComponent('Re: ' + m.subject) + '">Répondre par e-mail</a></details></td><td><select class="message-status" data-id="' + esc(m.id) + '" aria-label="Statut du message"><option value="new"' + (m.status === 'new' ? ' selected' : '') + '>Nouveau</option><option value="in_progress"' + (m.status === 'in_progress' ? ' selected' : '') + '>En cours</option><option value="resolved"' + (m.status === 'resolved' ? ' selected' : '') + '>Traité</option><option value="archived"' + (m.status === 'archived' ? ' selected' : '') + '>Archivé</option></select>' + (permissions.canDelete ? ' <button type="button" class="text-button message-delete" data-id="' + esc(m.id) + '">Supprimer</button>' : '') + '</td></tr>').join('') : '<tr><td colspan="4">Aucun message reçu pour le moment.</td></tr>') + '</tbody></table></div><p class="admin-message" id="messages-status" role="status"></p></section>');
    root.querySelector('#logout').onclick = async () => { await auth.signOut(); login('Vous êtes déconnecté.'); };
    root.querySelector('#back-articles').onclick = () => dashboard();
    root.querySelector('#refresh-messages').onclick = () => messages();
    root.querySelectorAll('.message-delete').forEach(button => {
      button.addEventListener('click', async () => {
        if (!window.confirm('Supprimer définitivement ce message ? Cette action est irréversible.')) return;
        button.disabled = true;
        try {
          await call('/api/admin/messages/' + encodeURIComponent(button.dataset.id), { method: 'DELETE' });
          await messages();
        } catch (err) {
          root.querySelector('#messages-status').textContent = 'Suppression impossible : ' + err.message;
          button.disabled = false;
        }
      });
    });
    root.querySelectorAll('.message-status').forEach(select => {
      select.addEventListener('change', async () => {
        const previous = select.dataset.previous || select.value;
        select.disabled = true;
        try {
          await call('/api/admin/messages/' + encodeURIComponent(select.dataset.id), { method: 'PATCH', body: JSON.stringify({ status: select.value }) });
          select.dataset.previous = select.value;
          root.querySelector('#messages-status').textContent = 'Statut du message mis à jour.';
        } catch (err) {
          select.value = previous;
          root.querySelector('#messages-status').textContent = 'Modification impossible : ' + err.message;
        } finally { select.disabled = false; }
      });
      select.dataset.previous = select.value;
    });
  } catch (err) { login('Impossible de charger les messages : ' + (err.message || 'ERREUR_INCONNUE') + '.'); }
}
async function privateMessagesPage(selectedId = '') {
  try {
    const data = await call('/api/admin/private-messages' + (selectedId ? '?with=' + encodeURIComponent(selectedId) : ''));
    const contacts = data.contacts || [];
    const selected = contacts.find(contact => contact.id === selectedId) || contacts[0] || null;
    const messages = selected ? (selectedId ? data.messages : (await call('/api/admin/private-messages?with=' + encodeURIComponent(selected.id))).messages || []) : [];
    for (const message of messages) {
      if (message.recipient_id === currentAdmin?.id && !message.read_at) {
        await call('/api/admin/private-messages/' + encodeURIComponent(message.id) + '/read', { method: 'POST' });
      }
    }
    const unreadSummary = await call('/api/admin/private-messages?summary=1');
    const unreadCount = Number(unreadSummary.unreadCount || 0);
    const options = contacts.map(contact => '<option value="' + esc(contact.id) + '"' + (selected && contact.id === selected.id ? ' selected' : '') + '>' + esc(contact.name || contact.email) + ' — ' + esc(contact.email) + '</option>').join('');
    const thread = messages.map(message => {
      const mine = message.sender_id === currentAdmin?.id;
      const deleteAction = ['admin','admin_delegate'].includes(currentAdmin?.role)
        ? '<button type="button" class="private-message-delete" data-message-id="' + esc(message.id) + '" aria-label="Supprimer ce message">Supprimer</button>'
        : '';
      return '<article class="private-message ' + (mine ? 'is-mine' : 'is-theirs') + '"><p>' + esc(message.body) + '</p><small>' + (mine ? 'Vous' : esc(selected?.name || selected?.email || 'Correspondant')) + ' · ' + esc(new Date(message.created_at).toLocaleString('fr-FR')) + '</small>' + deleteAction + '</article>';
    }).join('') || '<p class="admin-help">Aucun message dans cette conversation. Vous pouvez commencer à écrire.</p>';
    frame('<div class="admin-title-row"><div><span class="eyebrow">Échanges internes</span><h1>Messagerie</h1><p>Échangez en privé avec les autres comptes actifs du site.</p><p class="private-unread-summary" role="status">' + (unreadCount > 0 ? '<span class="private-unread-badge">' + unreadCount + '</span> message(s) non lu(s)' : 'Aucun message non lu') + '</p></div><button id="logout" class="button button-outline-dark">Déconnexion</button></div><section class="admin-panel"><div class="admin-toolbar"><h2>Nouvelle conversation</h2><button id="back-dashboard" class="button button-outline-dark">← Tableau de bord</button></div><label>Destinataire<select id="private-recipient"><option value="">Choisir un destinataire</option>' + options + '</select></label><div id="private-thread" class="private-thread">' + thread + '</div>' + (selected ? '<form id="private-send" class="admin-form-grid"><label>Votre message<textarea name="body" rows="3" maxlength="5000" required placeholder="Écrivez votre message…"></textarea></label><div class="admin-form-actions"><button class="button button-red" type="submit">Envoyer</button></div></form>' : '<p class="admin-help">Aucun autre compte actif n’est disponible pour le moment.</p>') + '<p id="private-status" class="admin-message" role="status"></p></section>');
    root.querySelector('#logout').onclick = async () => { await auth.signOut(); currentAdmin = null; login('Vous êtes déconnecté.'); };
    root.querySelector('#back-dashboard').onclick = () => dashboard();
    root.querySelector('#private-recipient').onchange = event => privateMessagesPage(event.target.value);
    const form = root.querySelector('#private-send');
    if (form) form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const body = form.elements.body.value.trim();
      if (!body) return;
      button.disabled = true;
      try {
        await call('/api/admin/private-messages', { method: 'POST', body: JSON.stringify({ recipient_id: selected.id, body }) });
        await privateMessagesPage(selected.id);
      } catch (error) {
        root.querySelector('#private-status').textContent = 'Envoi impossible : ' + error.message;
        button.disabled = false;
      }
    });
    root.querySelectorAll('.private-message-delete').forEach(button => {
      button.addEventListener('click', async () => {
        if (!confirm('Supprimer définitivement ce message ? Cette action est irréversible.')) return;
        button.disabled = true;
        try {
          await call('/api/admin/private-messages/' + encodeURIComponent(button.dataset.messageId), { method: 'DELETE' });
          await privateMessagesPage(selected.id);
        } catch (error) {
          const status = root.querySelector('#private-status');
          if (status) status.textContent = 'Suppression impossible : ' + error.message;
          button.disabled = false;
        }
      });
    });
    const threadNode = root.querySelector('#private-thread');
    if (threadNode) threadNode.scrollTop = threadNode.scrollHeight;
  } catch (error) {
    frame('<section class="admin-panel"><h1>Messagerie indisponible</h1><p>' + esc(error.message) + '</p><button id="back-dashboard" class="button button-outline-dark">← Retour</button></section>');
    root.querySelector('#back-dashboard').onclick = () => dashboard();
  }
}

function editor(a = {}) {
  const el = root.querySelector('#editor'); el.hidden = false;
  el.innerHTML = '<div class="admin-toolbar"><h2>' + (a.id ? 'Modifier' : 'Nouvel') + ' article</h2><button id="close" class="text-button">Fermer</button></div><form id="article-form" class="article-form"><input type="hidden" name="id" value="' + esc(a.id || '') + '"><label>Titre<input name="title" maxlength="180" required value="' + esc(a.title || '') + '"></label><label>Slug<input name="slug" maxlength="180" value="' + esc(a.slug || '') + '"></label><label>Catégorie<input name="category" maxlength="80" value="' + esc(a.category || 'Actualités') + '"></label><label>Résumé<textarea name="excerpt" maxlength="320" rows="2">' + esc(a.excerpt || '') + '</textarea></label><label>Contenu<div class="article-format-toolbar" aria-label="Mise en forme du contenu"><button type="button" data-format="**|**" title="Gras"><strong>G</strong></button><button type="button" data-format="*|*" title="Italique"><em>I</em></button><button type="button" data-prefix="## " title="Titre">Titre</button><button type="button" data-prefix="- " title="Liste à puces">• Liste</button><button type="button" data-prefix="1. " title="Liste numérotée">1. Liste</button><button type="button" data-prefix="> " title="Citation">Citation</button><span>Raccourcis : **gras**, *italique*, ## titre, - liste, [lien](https://…)</span></div><textarea name="content" rows="14" required>' + esc(a.content || '') + '</textarea></label><label>Image (URL HTTPS)<input name="cover_image_url" type="url" value="' + esc(a.cover_image_url || '') + '"></label><button type="button" id="choose-media" class="button button-outline-dark">Choisir dans la médiathèque</button><div class="admin-form-actions"><button type="button" id="preview-toggle" class="button button-outline-dark">Aperçu de l’article</button><button class="button button-outline-dark" name="status" value="draft">Enregistrer le brouillon</button><button class="button button-red" name="status" value="published">Publier</button>' + (a.id ? '<button type="button" id="archive" class="text-button">Archiver</button>' : '') + '</div><p class="admin-message" role="status"></p></form><section id="article-preview" class="article-preview" hidden aria-live="polite"><div class="preview-heading"><span class="eyebrow">Prévisualisation · non publiée</span><span class="preview-status">Visible uniquement ici</span></div><article class="preview-article"><img class="preview-cover" alt="" hidden><span class="preview-category"></span><h1 class="preview-title"></h1><p class="preview-excerpt"></p><div class="preview-content"></div></article></section>';
  const form = el.querySelector('#article-form');
  const preview = el.querySelector('#article-preview');
  const fields = name => form.elements.namedItem(name);
  const contentField = fields('content');
  el.querySelectorAll('.article-format-toolbar button').forEach(button => {
    button.addEventListener('click', () => {
      const start = contentField.selectionStart;
      const end = contentField.selectionEnd;
      const selected = contentField.value.slice(start, end);
      if (button.dataset.format) {
        const [before, after] = button.dataset.format.split('|');
        contentField.setRangeText(before + (selected || 'texte') + after, start, end, 'select');
      } else if (button.dataset.prefix) {
        const lineStart = contentField.value.lastIndexOf('\\n', Math.max(0, start - 1)) + 1;
        contentField.setRangeText(button.dataset.prefix + selected, lineStart, end, 'select');
      }
      contentField.focus();
      contentField.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
  const renderPreview = () => {
    const title = fields('title').value.trim();
    const content = fields('content').value.trim();
    preview.querySelector('.preview-category').textContent = fields('category').value.trim() || 'Actualités';
    preview.querySelector('.preview-title').textContent = title || 'Titre de votre article';
    preview.querySelector('.preview-excerpt').textContent = fields('excerpt').value.trim();
    preview.querySelector('.preview-excerpt').hidden = !fields('excerpt').value.trim();
    const body = preview.querySelector('.preview-content');
    body.replaceChildren();
    body.innerHTML = renderArticleMarkup(content);
    const image = preview.querySelector('.preview-cover');
    const imageUrl = fields('cover_image_url').value.trim();
    if (/^https:\/\//i.test(imageUrl)) {
      image.src = imageUrl;
      image.hidden = false;
    } else {
      image.removeAttribute('src');
      image.hidden = true;
    }
  };
  el.querySelector('#close').onclick = () => { el.hidden = true; };
  el.querySelector('#choose-media').onclick = () => { const saved = Object.fromEntries(new FormData(form).entries()); mediaReturn = url => { saved.cover_image_url = new URL(url, location.origin).href; articlesPage().then(() => editor(saved)); }; mediaPage(); };
  el.querySelector('#preview-toggle').onclick = event => {
    preview.hidden = !preview.hidden;
    event.currentTarget.textContent = preview.hidden ? 'Aperçu de l’article' : 'Masquer l’aperçu';
    if (!preview.hidden) {
      renderPreview();
      preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  form.addEventListener('input', () => { if (!preview.hidden) renderPreview(); });
  form.onsubmit = async e => {
    e.preventDefault(); const submit = e.submitter;
    const values = Object.fromEntries(new FormData(form).entries()); values.id = values.id ? Number(values.id) : null; values.status = submit.value;
    submit.disabled = true;
    try { await call('/api/admin/articles', { method: 'POST', body: JSON.stringify(values) }); await dashboard(); }
    catch (err) { form.querySelector('.admin-message').textContent = err.message; submit.disabled = false; }
  };
  el.querySelector('#archive')?.addEventListener('click', async () => {
    if (!confirm('Archiver cet article ?')) return;
    try { await call('/api/admin/articles/' + a.id, { method: 'DELETE' }); await dashboard(); }
    catch (err) { el.querySelector('.admin-message').textContent = err.message; }
  });
}
if (location.pathname === '/admin' || location.pathname === '/admin/') {
  if (new URLSearchParams(location.search).has('reset-password')) passwordReset();
  else if (new URLSearchParams(location.search).has('set-password')) initialPasswordSetup();
  else dashboard();
}
