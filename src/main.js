import './style.css';
import './public-session.js';

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

// Floating return-to-top control, shared by public pages.
function installBackToTop() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'back-to-top';
  button.setAttribute('aria-label', 'Revenir en haut de page');
  button.title = 'Retour en haut';
  button.innerHTML = '<span aria-hidden="true">↑</span><small>TOP</small>';
  document.body.append(button);
  const updateVisibility = () => button.classList.toggle('is-visible', window.scrollY > 320);
  window.addEventListener('scroll', updateVisibility, { passive: true });
  updateVisibility();
  button.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

if (/^\/admin\/?$/.test(location.pathname)) {
  import('./admin.js');
} else if (/^\/contact\/?$/.test(location.pathname)) {
  document.querySelector('#app').innerHTML = `
    <header class="site-header">
      <a class="brand" href="/" aria-label="FO Free Distribution, accueil">
        <img class="brand-logo" src="/logo-focom-fond-rouge.png" alt="FOCOM">
        <span class="brand-copy"><strong>FOCOM</strong><b><em>Free</em> Distribution</b><small>Le syndicat des salariés de Free Distribution</small></span>
      </a>
      <a class="button button-outline" href="/">← Retour à l'accueil</a>
    </header>
    <main class="contact-page">
      <section class="contact-page-hero">
        <span class="eyebrow">FO Free Distribution</span>
        <h1>Contactez <span>FO.</span></h1>
        <p>Une question, une difficulté au travail, une suggestion ou besoin d'un échange ? L'équipe FO Free Distribution est à votre écoute.</p>
      </section>
      <section class="contact-page-card contact-form-card">
        <div class="contact-icon" aria-hidden="true">✉</div>
        <div>
          <span class="eyebrow">Écrivez-nous</span>
          <h2>Envoyer un message à l'équipe FO</h2>
          <p>Votre message sera transmis à l'équipe FO Free Distribution. Les champs marqués d'un astérisque sont obligatoires.</p>
          <form id="fd-contact-form" class="contact-form">
            <label>Nom et prénom <span>(facultatif)</span><input name="name" type="text" maxlength="120" autocomplete="name" placeholder="Votre nom"></label>
            <label>Adresse e-mail <b>*</b><input name="email" type="email" maxlength="254" required autocomplete="email" placeholder="vous@exemple.fr"></label>
            <label>Objet <b>*</b><input name="subject" type="text" maxlength="160" required placeholder="Objet de votre demande"></label>
            <label>Votre message <b>*</b><textarea name="message" rows="7" minlength="10" maxlength="5000" required placeholder="Décrivez votre demande (5 000 caractères maximum)."></textarea></label>
            <div class="contact-honeypot" aria-hidden="true"><label>Ne pas remplir<input name="website" type="text" tabindex="-1" autocomplete="off"></label></div>
            <p class="contact-form-privacy">Les informations saisies sont utilisées uniquement pour répondre à votre demande. Votre adresse e-mail sera utilisée pour vous répondre et ne sera pas affichée sur le site.</p>
            <button class="button button-red" type="submit">Envoyer le message <span>→</span></button>
            <p id="contact-message" class="contact-message" role="status" aria-live="polite"></p>
          </form>
        </div>
      </section>
      <section class="contact-page-note">
        <h2>Vous souhaitez partager une préoccupation ?</h2>
        <p>Vous pouvez également consulter le <a href="/#questionnaires">questionnaire destiné aux salariés</a> pour faire connaître vos attentes et vos priorités de manière anonyme.</p>
      </section>
    </main>
    <footer class="site-footer"><a class="footer-brand" href="/"><img class="footer-logo" src="/logo-focom-fond-rouge.png" alt="FOCOM"><span data-homepage="hero_eyebrow">FOCOM · Free Distribution</span></a><span>À l'écoute des salariés</span><a href="/">Retour à l'accueil ↑</a></footer>
  `;

installBackToTop();

// Contact form handler must be registered on the dedicated /contact route.
const contactForm = document.querySelector('#fd-contact-form');
if (contactForm) {
  const contactStatus = document.querySelector('#contact-message');
  contactForm.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = contactForm.querySelector('button[type="submit"]');
    const data = new FormData(contactForm);
    submit.disabled = true;
    submit.textContent = 'Envoi en cours…';
    contactStatus.textContent = '';
    contactStatus.className = 'contact-message';
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          name: String(data.get('name') || ''),
          email: String(data.get('email') || ''),
          subject: String(data.get('subject') || ''),
          message: String(data.get('message') || ''),
          website: String(data.get('website') || ''),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.message || 'Impossible d’envoyer votre message.');
      contactForm.reset();
      contactStatus.textContent = result.message || 'Votre message a bien été envoyé.';
      contactStatus.className = 'contact-message is-success';
    } catch (error) {
      contactStatus.textContent = error.message || 'Une erreur est survenue. Merci de réessayer.';
      contactStatus.className = 'contact-message is-error';
    } finally {
      submit.disabled = false;
      submit.innerHTML = 'Envoyer le message <span>→</span>';
    }
  });
}
} else if (/^\/actualites\/[a-z0-9-]+\/?$/i.test(location.pathname)) {
  const slug = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || '');
  const escapeArticle = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
  document.querySelector('#app').innerHTML = `
    <header class="site-header article-detail-header">
      <a class="brand" href="/" aria-label="FO Free Distribution, accueil">
        <img class="brand-logo" src="/logo-focom-fond-rouge.png" alt="FOCOM">
        <span class="brand-copy"><strong>FOCOM</strong><b><em>Free</em> Distribution</b><small>Le syndicat des salariés de Free Distribution</small></span>
      </a>
      <a class="button button-outline" href="/#actualites">← Toutes les actualités</a>
    </header>
    <main class="article-detail-page" id="article-detail"><p class="article-detail-loading">Chargement de l’article…</p></main>
    <footer class="site-footer"><a class="footer-brand" href="/"><img class="footer-logo" src="/logo-focom-fond-rouge.png" alt="FOCOM"><span>FOCOM · Free Distribution</span></a><span>À l'écoute des salariés</span><a href="/#actualites">Toutes les actualités ↑</a></footer>
  `;
  installBackToTop();
  (async () => {
    const target = document.querySelector('#article-detail');
    try {
      const response = await fetch('/api/articles/' + encodeURIComponent(slug), { headers: { Accept: 'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.article) throw new Error(response.status === 404 ? 'Cet article est introuvable ou n’est plus publié.' : 'Impossible de charger cet article pour le moment.');
      const article = data.article;
      const date = article.published_at ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(article.published_at)) : '';
      const paragraphs = renderArticleMarkup(article.content);
      target.innerHTML = `
        <article class="article-detail">
          <span class="eyebrow" data-homepage="news_title">${escapeArticle(article.category || 'Actualités')}</span>
          <h1>${escapeArticle(article.title)}</h1>
          ${date ? `<time datetime="${escapeArticle(article.published_at)}">${escapeArticle(date)}</time>` : ''}
          ${article.cover_image_url ? `<img class="article-detail-cover" src="${escapeArticle(article.cover_image_url)}" alt="">` : ''}
          ${article.excerpt ? `<p class="article-detail-excerpt">${escapeArticle(article.excerpt)}</p>` : ''}
          <div class="article-detail-content">${paragraphs}</div>
          <section class="article-share" aria-label="Partager cet article">
            <strong>Partager cet article</strong>
            <div class="article-share-links">
              <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(location.href)}" target="_blank" rel="noopener noreferrer" aria-label="Partager sur Facebook">Facebook</a>
              <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(location.href)}" target="_blank" rel="noopener noreferrer" aria-label="Partager sur LinkedIn">LinkedIn</a>
              <a href="https://api.whatsapp.com/send?text=${encodeURIComponent(article.title + ' ' + location.href)}" target="_blank" rel="noopener noreferrer" aria-label="Partager sur WhatsApp">WhatsApp</a>
              <button class="article-copy-link" type="button">Copier le lien</button>
            </div>
            <p class="article-copy-status" role="status" aria-live="polite"></p>
          </section>
          <nav class="article-pagination" aria-label="Navigation entre les actualités"></nav>
          <a class="button button-outline" href="/#actualites">← Retour aux actualités</a>
        </article>`;
      const copyButton = target.querySelector('.article-copy-link');
      const copyStatus = target.querySelector('.article-copy-status');
      copyButton.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(location.href);
          copyStatus.textContent = 'Lien copié !';
        } catch {
          copyStatus.textContent = 'Copiez l’adresse de cette page depuis la barre du navigateur.';
        }
      });
      try {
        const listResponse = await fetch('/api/articles', { headers: { Accept: 'application/json' } });
        const listData = await listResponse.json();
        const published = Array.isArray(listData.articles) ? listData.articles : [];
        const index = published.findIndex(item => item.slug === article.slug);
        const previous = index > 0 ? published[index - 1] : null;
        const next = index >= 0 && index < published.length - 1 ? published[index + 1] : null;
        const pagination = target.querySelector('.article-pagination');
        pagination.innerHTML = `
          ${previous ? `<a class="article-page-link article-page-previous" href="/actualites/${encodeURIComponent(previous.slug)}"><small>Actualité plus récente</small><strong>← ${escapeArticle(previous.title)}</strong></a>` : '<span></span>'}
          ${next ? `<a class="article-page-link article-page-next" href="/actualites/${encodeURIComponent(next.slug)}"><small>Actualité précédente</small><strong>${escapeArticle(next.title)} →</strong></a>` : ''}
        `;
      } catch (navigationError) {
        console.warn('Navigation entre les articles indisponible:', navigationError);
      }
      document.title = article.title + ' – FO Free Distribution';
    } catch (error) {
      target.innerHTML = `<div class="article-detail-error"><h1>Article indisponible</h1><p>${escapeArticle(error.message)}</p><a class="button button-outline" href="/#actualites">← Retour aux actualités</a></div data-homepage="claims_title">`;
    }
  })();
} else if (/^\/(mentions-legales|confidentialite|cookies)\/?$/.test(location.pathname)) {
  import('./legal.js');
} else {
const nav = [
  ['Accueil', '#accueil'],
  ['Actualités', '#actualites'],
  ['Nos revendications', '#revendications'],
  ['Vos droits', '#droits'],
  ['Questionnaires', '#questionnaires'],
  ['Contact', '/contact'],
];

document.querySelector('#app').innerHTML = `
  <header class="site-header">
    <a class="brand" href="#accueil" aria-label="FO Free Distribution, accueil">
      <img class="brand-logo" src="/logo-focom-fond-rouge.png" alt="FOCOM">
      <span class="brand-copy"><strong>FOCOM</strong><b><em>Free</em> Distribution</b><small>Le syndicat des salariés de Free Distribution</small></span>
    </a>
    <button class="menu-toggle" aria-label="Ouvrir le menu" aria-expanded="false">☰</button>
    <nav class="main-nav" aria-label="Navigation principale" aria-hidden="true">
      <button class="menu-backdrop" type="button" aria-label="Fermer le menu"></button>
      <div class="mobile-menu-panel">
        <div class="mobile-menu-heading">
          <span>Navigation</span>
          <button class="menu-close" type="button" aria-label="Fermer le menu">×</button>
        </div>
        ${nav.map(([label, href]) => `<a href="${href}">${label}<span aria-hidden="true">→</span></a>`).join('')}
        <p class="mobile-menu-footer">FO COM · Free Distribution</p>
      </div>
    </nav>
  </header>

  <main>
    <section class="hero" id="accueil">
      <div class="hero-content">
        <span class="eyebrow" data-homepage="hero_eyebrow">FOCOM · Free Distribution</span>
        <h1 data-homepage="hero_title">La voix des salariés<br><span>des boutiques Free.</span></h1>
        <p data-homepage="hero_text">Un espace d’information, de dialogue et d’action syndicale dédié aux équipes de Free Distribution.</p>
        <div class="hero-actions">
          <a class="button button-red" data-homepage-link="hero_primary" href="#revendications">Nos revendications</a>
          <a class="button button-outline" data-homepage-link="hero_secondary" href="/contact">Nous contacter</a>
        </div>
      </div>
      <div class="hero-visual" aria-hidden="true">
        <div class="store">
          <div class="store-awning"><i></i><i></i><i></i><i></i><i></i></div>
          <div class="store-sign">free</div>
          <div class="store-window">
            <span class="device phone"></span><span class="device box"></span>
            <span class="wifi">⌁</span><span class="people">● ●</span>
          </div>
          <div class="store-base"></div>
        </div>
        <div class="visual-caption">Écouter · Informer · Défendre</div>
      </div>
    </section>


    <section class="section light-section" id="actualites">
      <div class="section-heading"><div><span class="eyebrow" data-homepage="news_eyebrow">Restez informés</span><h2 data-homepage="news_title">Actualités</h2></div><span class="section-note" data-homepage="news_note">Les informations dédiées à Free Distribution</span></div>
      <div id="articles-list" aria-live="polite">
        <div class="empty-state"><span class="empty-icon">✦</span><h3>Chargement des actualités…</h3><p>Nous récupérons les dernières publications.</p></div>
      </div>
    </section>

    <section class="section newsletter-signup-section" id="newsletter">
      <div class="newsletter-signup-card">
        <div class="newsletter-signup-copy">
          <span class="eyebrow">Restez informés</span>
          <h2>Recevez les actualités de <span>FO Free Distribution.</span></h2>
          <p>Inscrivez-vous pour recevoir par e-mail nos informations syndicales, actualités, revendications et prochaines actions.</p>
          <p class="newsletter-signup-note">Inscription gratuite. Vous pourrez vous désinscrire à tout moment depuis chaque newsletter.</p>
        </div>
        <form id="fd-newsletter-form" class="newsletter-signup-form">
          <label for="newsletter-email">Votre adresse e-mail</label>
          <input id="newsletter-email" name="email" type="email" maxlength="254" autocomplete="email" required placeholder="vous@exemple.fr">
          <label class="newsletter-consent"><input name="consent_confirmed" type="checkbox" value="yes" required><span>J’accepte de recevoir la newsletter FO Free Distribution et confirme mon inscription.</span></label>
          <div class="newsletter-honeypot" aria-hidden="true"><label>Ne pas remplir<input name="website" type="text" tabindex="-1" autocomplete="off"></label></div>
          <button class="button button-red" type="submit">Je m’inscris à la newsletter <span>→</span></button>
          <p class="newsletter-signup-privacy">Votre adresse sera utilisée uniquement pour l’envoi de la newsletter FO. Elle ne sera pas publiée ni communiquée à des tiers à des fins commerciales.</p>
          <p id="newsletter-signup-message" class="newsletter-signup-message" role="status" aria-live="polite"></p>
        </form>
      </div>
    </section>

    <div class="newsletter-popup" id="newsletter-popup" aria-hidden="true">
      <div class="newsletter-popup-backdrop" data-newsletter-close></div>
      <section class="newsletter-popup-dialog" role="dialog" aria-modal="true" aria-labelledby="newsletter-popup-title">
        <button class="newsletter-popup-close" type="button" aria-label="Fermer" data-newsletter-close>×</button>
        <div class="newsletter-popup-header"><span class="newsletter-popup-brand">FO FREE DISTRIBUTION</span><h2 id="newsletter-popup-title">Restez informés&nbsp;!</h2><p>Informer · Défendre · Agir</p></div>
        <div class="newsletter-popup-body">
          <h3>L’actualité sociale directement dans votre boîte mail.</h3>
          <p>Recevez nos informations syndicales, revendications, actions et actualités concernant les salariés de Free Distribution.</p>
          <button class="button button-red newsletter-popup-cta" type="button" data-newsletter-scroll>Découvrir la newsletter et m’inscrire <span>→</span></button>
          <p class="newsletter-popup-footnote">Inscription gratuite · Désinscription possible à tout moment.</p>
          <button class="newsletter-popup-later" type="button" data-newsletter-close>Plus tard</button>
        </div>
      </section>
    </div>
    <section class="section claims-section" id="revendications">
      <div class="section-heading">
        <div><span class="eyebrow" data-homepage="claims_eyebrow">Élections professionnelles · FO Free Distribution</span><h2 data-homepage="claims_title">Nos revendications</h2></div>
        <span class="section-note" data-homepage="claims_note">Un programme construit autour de vos attentes</span>
      </div>
      <p class="section-lead" data-homepage="claims_lead">Notre ambition : obtenir des avancées concrètes sur les salaires, les commissions, les conditions de travail et la reconnaissance des équipes en boutique. Voici les engagements que FO souhaite porter avec vous.</p>
      <details class="compact-disclosure">
        <summary><span>Consulter les 7 axes de nos revendications</span><span class="disclosure-action">Voir le détail <b aria-hidden="true">＋</b></span></summary>
      <div class="claims-grid">
        <article class="claim-card"><span class="claim-icon" aria-hidden="true">€</span><span class="card-number">01 · POUVOIR D'ACHAT</span><h3>Rémunération juste</h3><ul><li>Augmentations générales et revalorisation des salaires fixes.</li><li>Reconnaissance de l'ancienneté et de l'expérience.</li><li>Primes et commissions transparentes, compréhensibles et vérifiables.</li><li>Une rémunération qui ne repose pas uniquement sur des objectifs commerciaux.</li></ul></article>
        <article class="claim-card"><span class="claim-icon" aria-hidden="true">↗</span><span class="card-number">02 · COMMISSIONS</span><h3>Des objectifs atteignables</h3><ul><li>Des objectifs adaptés à la fréquentation et à la réalité de chaque boutique.</li><li>Des règles de calcul des commissions claires et stables.</li><li>La prise en compte du travail collectif et des missions réellement effectuées.</li><li>La fin des changements imprévisibles en cours de période.</li></ul></article>
        <article class="claim-card"><span class="claim-icon" aria-hidden="true">＋</span><span class="card-number">03 · EFFECTIFS</span><h3>De meilleures conditions de travail</h3><ul><li>Des effectifs suffisants pour accueillir les clients dans de bonnes conditions.</li><li>Une meilleure anticipation et un remplacement des absences.</li><li>Des pauses respectées et des moyens matériels adaptés.</li><li>La prévention de la surcharge de travail et des risques psychosociaux.</li></ul></article>
        <article class="claim-card"><span class="claim-icon" aria-hidden="true">◷</span><span class="card-number">04 · ORGANISATION</span><h3>Des horaires plus prévisibles</h3><ul><li>Des plannings communiqués suffisamment à l'avance.</li><li>Une meilleure stabilité des horaires et des changements encadrés.</li><li>Une répartition équitable des ouvertures, fermetures et week-ends.</li><li>Une meilleure prise en compte de la vie personnelle et familiale.</li></ul></article>
        <article class="claim-card"><span class="claim-icon" aria-hidden="true">↗</span><span class="card-number">05 · PARCOURS</span><h3>Formation et évolution</h3><ul><li>Un accès équitable à la formation pour toutes et tous.</li><li>Des formations régulières sur les produits, services et outils.</li><li>Des parcours professionnels et critères d'évolution transparents.</li><li>La reconnaissance des compétences acquises sur le terrain.</li></ul></article>
        <article class="claim-card"><span class="claim-icon" aria-hidden="true">◎</span><span class="card-number">06 · RESPECT</span><h3>Management et reconnaissance</h3><ul><li>Un management fondé sur le respect, l'écoute et le dialogue.</li><li>La prévention des pratiques dévalorisantes et des pressions excessives.</li><li>Une reconnaissance du travail réellement accompli.</li><li>Des moyens accessibles pour signaler et traiter les difficultés.</li></ul></article>
        <article class="claim-card"><span class="claim-icon" aria-hidden="true">♡</span><span class="card-number">07 · SANTÉ AU TRAVAIL</span><h3>Protéger la santé de chacun</h3><ul><li>Une prévention effective des risques professionnels.</li><li>Une meilleure prise en compte de la santé physique et mentale.</li><li>Des espaces de travail adaptés et sécurisés.</li><li>Un suivi régulier des conditions de travail avec les représentants du personnel.</li></ul></article>
      </div>
      <div class="claims-commitment">
        <span class="eyebrow">Notre engagement</span><h3>Des revendications, des actes et de la transparence.</h3>
        <p>FO s'engage à vous écouter, porter vos demandes auprès de la direction, défendre vos intérêts et vous informer régulièrement des avancées comme des désaccords. Vos élus doivent rendre compte de leur action.</p>
        <a class="button button-red" href="/contact">Échanger avec l'équipe FO <span>→</span></a>
      </div>
      <p class="disclaimer">Ces propositions constituent la base du programme revendicatif présenté aux salariés. Les mesures chiffrées et les priorités définitives seront précisées avec les équipes et les candidats FO.</p>
      </details>
    </section>

    <section class="section rights-section" id="droits">
      <div class="rights-heading">
        <div class="rights-heading-copy"><span class="eyebrow" data-homepage="rights_eyebrow">Mieux connaître vos droits</span><h2 data-homepage="rights_title">Vos droits au travail</h2></div>
        <span class="rights-heading-mark" aria-hidden="true">§</span>
      </div>
      <p class="section-lead rights-lead" data-homepage="rights_lead">Des repères pratiques pour comprendre vos droits et savoir vers qui vous tourner. Les contenus détaillés seront publiés prochainement.</p>
      <div class="rights-topics" aria-label="Thèmes liés à vos droits">
        <article class="rights-topic"><span aria-hidden="true">€</span><div><small>01 · RÉMUNÉRATION</small><h3>Salaire et rémunération</h3></div></article>
        <article class="rights-topic"><span aria-hidden="true">◷</span><div><small>02 · TEMPS DE TRAVAIL</small><h3>Horaires et congés</h3></div></article>
        <article class="rights-topic"><span aria-hidden="true">◎</span><div><small>03 · CONDITIONS DE TRAVAIL</small><h3>Santé et conditions de travail</h3></div></article>
        <article class="rights-topic"><span aria-hidden="true">§</span><div><small>04 · ACCOMPAGNEMENT</small><h3>Information et recours</h3></div></article>
      </div>
      <div class="rights-contact"><div><strong>Une question sur votre situation ?</strong><p>L’équipe FO est à votre écoute pour vous informer et vous accompagner.</p></div><a class="button button-red" href="/contact">Contacter FO <span>→</span></a></div>
    </section>

    <section class="section light-section survey-section" id="questionnaires">
      <div class="survey-intro">
        <span class="eyebrow" data-homepage="survey_eyebrow">Votre avis compte</span>
        <h2 data-homepage="survey_title">Donnez votre avis <span>en toute confidentialité.</span></h2>
        <p data-homepage="survey_text">Cette consultation permet de faire remonter les attentes et les priorités des salariés de Free Distribution. Vos réponses sont enregistrées sans nom ni adresse e-mail.</p>
        <div class="survey-privacy"><strong>Questionnaire anonyme</strong><span>Aucun nom ni e-mail n'est demandé. Évitez toutefois de mentionner des personnes ou des informations permettant de vous identifier dans votre commentaire.</span></div>
      </div>
      <details class="compact-disclosure survey-disclosure">
        <summary><span>Accéder au questionnaire anonyme</span><span class="disclosure-action">Participer <b aria-hidden="true">＋</b></span></summary>
      <form id="fd-survey-form" class="survey-form">
        <fieldset class="survey-question">
          <legend><span>01</span> Comment évaluez-vous globalement vos conditions de travail ? <b>*</b></legend>
          <div class="rating-options">
            <label><input type="radio" name="conditions" value="1" required><span>1</span><small>Très mauvaises</small></label>
            <label><input type="radio" name="conditions" value="2"><span>2</span><small>Mauvaises</small></label>
            <label><input type="radio" name="conditions" value="3"><span>3</span><small>Moyennes</small></label>
            <label><input type="radio" name="conditions" value="4"><span>4</span><small>Bonnes</small></label>
            <label><input type="radio" name="conditions" value="5"><span>5</span><small>Très bonnes</small></label>
          </div>
        </fieldset>
        <fieldset class="survey-question">
          <legend><span>02</span> Quels sujets devraient être prioritaires ? <b>*</b></legend>
          <p class="survey-hint">Plusieurs choix possibles.</p>
          <div class="priority-options">
            <label><input type="checkbox" name="priorities" value="salary"><span>Salaires et pouvoir d'achat</span></label>
            <label><input type="checkbox" name="priorities" value="commissions"><span>Primes et commissions</span></label>
            <label><input type="checkbox" name="priorities" value="staffing"><span>Effectifs et moyens en boutique</span></label>
            <label><input type="checkbox" name="priorities" value="schedules"><span>Horaires et équilibre vie professionnelle / personnelle</span></label>
            <label><input type="checkbox" name="priorities" value="workload"><span>Charge et organisation du travail</span></label>
            <label><input type="checkbox" name="priorities" value="training"><span>Formation</span></label>
            <label><input type="checkbox" name="priorities" value="career"><span>Évolution professionnelle</span></label>
            <label><input type="checkbox" name="priorities" value="management"><span>Management et communication</span></label>
            <label><input type="checkbox" name="priorities" value="health"><span>Santé, sécurité et conditions de travail</span></label>
            <label><input type="checkbox" name="priorities" value="recognition"><span>Reconnaissance du travail</span></label>
            <label><input type="checkbox" name="priorities" value="other"><span>Autre sujet</span></label>
          </div>
        </fieldset>
        <fieldset class="survey-question">
          <legend><span>03</span> Vous sentez-vous reconnu(e) pour le travail que vous accomplissez ? <b>*</b></legend>
          <div class="rating-options">
            <label><input type="radio" name="recognition" value="1" required><span>1</span><small>Pas du tout</small></label>
            <label><input type="radio" name="recognition" value="2"><span>2</span><small>Peu</small></label>
            <label><input type="radio" name="recognition" value="3"><span>3</span><small>Moyennement</small></label>
            <label><input type="radio" name="recognition" value="4"><span>4</span><small>Bien</small></label>
            <label><input type="radio" name="recognition" value="5"><span>5</span><small>Tout à fait</small></label>
          </div>
        </fieldset>
        <fieldset class="survey-question">
          <legend><span>04</span> Quelle amélioration vous paraît la plus urgente ?</legend>
          <textarea name="comment" rows="5" maxlength="1500" placeholder="Exprimez librement vos attentes ou vos propositions (1 500 caractères maximum). Ne mentionnez pas de nom ni d'information permettant de vous identifier."></textarea>
          <p class="survey-hint"><span id="survey-char-count">0</span> / 1 500 caractères · réponse facultative</p>
        </fieldset>
        <div class="survey-honeypot" aria-hidden="true"><label>Ne pas remplir<input name="website" type="text" tabindex="-1" autocomplete="off"></label></div>
        <div class="survey-submit-row">
          <p>Les réponses sont utilisées pour établir une synthèse collective des attentes exprimées.</p>
          <button class="button button-red" type="submit">Envoyer mes réponses <span>→</span></button>
        </div>
        <p id="survey-message" class="survey-message" role="status" aria-live="polite"></p>
      </form>
      </details>
    </section>

    <section class="contact-section" id="contact">
      <div><span class="eyebrow">Restons en contact</span><h2>Votre voix compte.</h2><p>Une question, une difficulté ou une idée à partager ? L’équipe FO Free Distribution sera à votre écoute.</p></div>
      <a class="button button-white" href="/contact">Nous contacter <span>→</span></a>
    </section>
  </main>

  <footer class="site-footer"><a class="footer-brand" href="#accueil"><img class="footer-logo" src="/logo-focom-fond-rouge.png" alt="FOCOM"><span>FOCOM · Free Distribution</span></a><span>Un site dédié aux salariés de Free Distribution</span><nav class="footer-legal"><a href="/mentions-legales">Mentions légales</a><a href="/confidentialite">Confidentialité</a><a href="/cookies">Cookies</a></nav><a href="#accueil">Retour en haut ↑</a></footer>
`;

(async () => {
  try {
    const response = await fetch('/api/homepage', { headers: { Accept: 'application/json' } });
    if (!response.ok) return;
    const { content = {} } = await response.json();
    const homepageImages = [['hero_image','.hero-visual'],['intro_image','.intro'],['news_image','#actualites'],['claims_image','#revendications'],['rights_image','#droits'],['survey_image','#questionnaires']];
    for (const [key, selector] of homepageImages) {
      const section = document.querySelector(selector);
      if (!section || !content[key]) continue;
      const image = document.createElement('img');
      image.className = 'homepage-managed-image';
      image.src = content[key];
      image.alt = '';
      image.loading = 'lazy';
      if (key === 'intro_image') { image.classList.add('intro-custom-image'); section.querySelector('.intro-visual')?.appendChild(image); section.classList.add('has-custom-image'); } else { section.insertBefore(image, section.firstChild); }
      if (key === 'hero_image') { image.classList.add('homepage-managed-image-hero'); section.classList.add('has-custom-image'); }
    }
    document.querySelectorAll('[data-homepage]').forEach(node => {
      const key = node.dataset.homepage;
      if (typeof content[key] === 'string') node.textContent = content[key];
    });
    document.querySelectorAll('[data-homepage]').forEach(node => { node.style.whiteSpace = 'pre-line'; });
    for (const [name, prefix] of [['hero_primary','hero_primary'],['hero_secondary','hero_secondary']]) {
      const link = document.querySelector('[data-homepage-link="' + name + '"]');
      if (link) {
        if (content[prefix + '_label']) link.textContent = content[prefix + '_label'];
        if (content[prefix + '_url']) link.href = content[prefix + '_url'];
      }
    }
  } catch (error) { console.warn('Homepage content not loaded:', error); }
})();


installBackToTop();



// Newsletter launch popup: once per browser after 9 seconds; never shown in admin/contact/unsubscribe flows.
(() => {
  const popup = document.querySelector('#newsletter-popup');
  if (!popup) return;
  const excluded = location.pathname.startsWith('/admin') || location.pathname.startsWith('/contact') || location.pathname.startsWith('/newsletter/desinscription');
  if (excluded) return;
  const storageKey = 'fd-newsletter-popup-seen-v1';
  const close = () => {
    popup.classList.remove('is-visible');
    popup.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('newsletter-popup-open');
    try { localStorage.setItem(storageKey, '1'); } catch {}
  };
  popup.querySelectorAll('[data-newsletter-close]').forEach(button => button.addEventListener('click', close));
  popup.querySelector('[data-newsletter-scroll]').addEventListener('click', () => {
    close();
    document.querySelector('#newsletter')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => document.querySelector('#newsletter-email')?.focus({ preventScroll: true }), 500);
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && popup.classList.contains('is-visible')) close(); });
  let alreadySeen = false;
  try { alreadySeen = localStorage.getItem(storageKey) === '1'; } catch {}
  if (!alreadySeen) window.setTimeout(() => {
    popup.classList.add('is-visible');
    popup.setAttribute('aria-hidden', 'false');
    document.body.classList.add('newsletter-popup-open');
    popup.querySelector('[data-newsletter-close]')?.focus();
  }, 9000);
})();

// Public newsletter signup: explicit consent is required; the Worker never sends a welcome email.
const newsletterForm = document.querySelector('#fd-newsletter-form');
if (newsletterForm) {
  const newsletterStatus = document.querySelector('#newsletter-signup-message');
  newsletterForm.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = newsletterForm.querySelector('button[type="submit"]');
    const data = new FormData(newsletterForm);
    submit.disabled = true;
    submit.textContent = 'Inscription en cours…';
    newsletterStatus.textContent = '';
    newsletterStatus.className = 'newsletter-signup-message';
    try {
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          email: String(data.get('email') || ''),
          consent_confirmed: data.get('consent_confirmed') === 'yes',
          website: String(data.get('website') || ''),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.message || 'Impossible de finaliser votre inscription.');
      try { localStorage.setItem('fd-newsletter-popup-seen-v1', '1'); } catch {}
      document.querySelector('#newsletter-popup')?.classList.remove('is-visible');
      document.querySelector('#newsletter-popup')?.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('newsletter-popup-open');
      newsletterForm.reset();
      newsletterStatus.textContent = result.message || 'Votre inscription à la newsletter FO est bien enregistrée.';
      newsletterStatus.className = 'newsletter-signup-message is-success';
    } catch (error) {
      newsletterStatus.textContent = error.message || 'Une erreur est survenue. Merci de réessayer.';
      newsletterStatus.className = 'newsletter-signup-message is-error';
    } finally {
      submit.disabled = false;
      submit.innerHTML = 'Je m’inscris à la newsletter <span>→</span>';
    }
  });
}

const toggle = document.querySelector('.menu-toggle');
const menu = document.querySelector('.main-nav');
const closeMenu = () => {
  menu.classList.remove('is-open');
  menu.setAttribute('aria-hidden', 'true');
  toggle.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('mobile-menu-open');
};
const openMenu = () => {
  menu.classList.add('is-open');
  menu.setAttribute('aria-hidden', 'false');
  toggle.setAttribute('aria-expanded', 'true');
  document.body.classList.add('mobile-menu-open');
  menu.querySelector('.menu-close')?.focus();
};
toggle.addEventListener('click', () => menu.classList.contains('is-open') ? closeMenu() : openMenu());
menu.querySelectorAll('.menu-backdrop, .menu-close').forEach(button => button.addEventListener('click', closeMenu));
menu.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu.classList.contains('is-open')) { closeMenu(); toggle.focus(); } });

// Public articles are served by the Worker; draft and archived content never reaches this page.
const articlesList = document.querySelector('#articles-list');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

async function loadArticles() {
  try {
    const response = await fetch('/api/articles', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Articles indisponibles');
    const data = await response.json();
    const articles = Array.isArray(data.articles) ? data.articles : [];

    if (!articles.length) {
      articlesList.innerHTML = `<div class="empty-state"><span class="empty-icon">✦</span><h3>Les actualités arrivent bientôt</h3><p>Retrouvez ici les informations, prises de position et communications de FO Free Distribution.</p></div>`;
      return;
    }

    articlesList.innerHTML = `<div class="article-grid">${articles.map(article => {
      const date = article.published_at
        ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(article.published_at))
        : '';
      return `<a class="article-card" href="/actualites/${encodeURIComponent(article.slug)}">
        ${article.cover_image_url ? `<img class="article-card-image" src="${escapeHtml(article.cover_image_url)}" alt="" loading="lazy" decoding="async">` : ''}
        <span class="article-category">${escapeHtml(article.category)}</span>
        <h3>${escapeHtml(article.title)}</h3>
        ${article.excerpt ? `<p>${escapeHtml(article.excerpt)}</p>` : ''}
        ${date ? `<time datetime="${escapeHtml(article.published_at)}">${escapeHtml(date)}</time>` : ''}
        <span class="article-card-more">Lire l’article →</span>
      </a>`;
    }).join('')}</div>`;
    if (articles.length > 3) {
      const grid = articlesList.querySelector('.article-grid');
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'button button-outline article-show-more';
      more.textContent = 'Afficher toutes les actualités';
      more.setAttribute('aria-expanded', 'false');
      more.addEventListener('click', () => {
        grid.classList.add('is-expanded');
        more.remove();
      });
      articlesList.append(more);
    }
  } catch (error) {
    console.error('Chargement des actualités impossible:', error);
    if (articlesList) articlesList.innerHTML = `<div class="empty-state"><h3>Actualités momentanément indisponibles</h3><p>Merci de réessayer dans quelques instants.</p></div>`;
  }
}

if (articlesList) loadArticles();

// Contact form: sends messages through the Worker to the FO mailbox.
const contactForm = document.querySelector('#fd-contact-form');
if (contactForm) {
  const contactStatus = document.querySelector('#contact-message');
  contactForm.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = contactForm.querySelector('button[type="submit"]');
    const data = new FormData(contactForm);
    submit.disabled = true;
    submit.textContent = 'Envoi en cours…';
    contactStatus.textContent = '';
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          name: String(data.get('name') || ''),
          email: String(data.get('email') || ''),
          subject: String(data.get('subject') || ''),
          message: String(data.get('message') || ''),
          website: String(data.get('website') || ''),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.message || 'Impossible d’envoyer votre message.');
      contactForm.reset();
      contactStatus.textContent = result.message || 'Votre message a bien été envoyé.';
      contactStatus.className = 'contact-message is-success';
    } catch (error) {
      contactStatus.textContent = error.message || 'Une erreur est survenue. Merci de réessayer.';
      contactStatus.className = 'contact-message is-error';
    } finally {
      submit.disabled = false;
      submit.innerHTML = 'Envoyer le message <span>→</span>';
    }
  });
}

// Anonymous employee questionnaire. No name, email or IP address is requested or stored by this endpoint.
const surveyForm = document.querySelector('#fd-survey-form');
if (surveyForm) {
  const surveyMessage = document.querySelector('#survey-message');
  const commentField = surveyForm.elements.namedItem('comment');
  const charCount = document.querySelector('#survey-char-count');
  // Session-only marker prevents accidental repeat submissions without identifying the respondent.
  const surveySessionKey = 'fd-survey-submitted-v1';
  let alreadySubmitted = false;
  try { alreadySubmitted = sessionStorage.getItem(surveySessionKey) === '1'; } catch {}
  if (alreadySubmitted) {
    const submitButton = surveyForm.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    surveyMessage.textContent = 'Une réponse a déjà été envoyée depuis cet onglet. Merci pour votre participation.';
    surveyMessage.className = 'survey-message is-success';
  }
  commentField.addEventListener('input', () => { charCount.textContent = String(commentField.value.length); });
  surveyForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (alreadySubmitted) {
      surveyMessage.textContent = 'Une réponse a déjà été envoyée depuis cet onglet. Merci pour votre participation.';
      surveyMessage.className = 'survey-message is-success';
      return;
    }
    const submit = surveyForm.querySelector('button[type="submit"]');
    const data = new FormData(surveyForm);
    const priorities = data.getAll('priorities');
    if (!priorities.length) {
      surveyMessage.textContent = 'Merci de sélectionner au moins un sujet prioritaire.';
      surveyMessage.className = 'survey-message is-error';
      surveyForm.querySelector('.priority-options').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    submit.disabled = true;
    submit.textContent = 'Envoi en cours…';
    surveyMessage.textContent = '';
    try {
      const response = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          conditions: Number(data.get('conditions')),
          recognition: Number(data.get('recognition')),
          priorities,
          comment: String(data.get('comment') || ''),
          website: String(data.get('website') || ''),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.message || 'Impossible d’enregistrer vos réponses.');
      alreadySubmitted = true;
      try { sessionStorage.setItem(surveySessionKey, '1'); } catch {}
      surveyForm.reset();
      charCount.textContent = '0';
      surveyMessage.textContent = result.message || 'Merci pour votre participation.';
      surveyMessage.className = 'survey-message is-success';
    } catch (error) {
      surveyMessage.textContent = error.message || 'Une erreur est survenue. Merci de réessayer.';
      surveyMessage.className = 'survey-message is-error';
    } finally {
      submit.disabled = false;
      submit.innerHTML = 'Envoyer mes réponses <span>→</span>';
    }
  });
}



(async()=>{
 const setText=(node,value)=>{if(node&&typeof value==="string")node.textContent=value};
 const el=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=value;return n};
 try{
  const response=await fetch("/api/site-content",{headers:{Accept:"application/json"}});
  if(response.ok){
   const {content={}}=await response.json(),claims=content.claims,rights=content.rights;
   if(claims&&Array.isArray(claims.items)){
    setText(document.querySelector('#revendications [data-homepage="claims_eyebrow"]'),claims.eyebrow);setText(document.querySelector('#revendications [data-homepage="claims_title"]'),claims.title);setText(document.querySelector('#revendications .section-lead'),claims.lead);
    const grid=document.querySelector("#revendications .claims-grid");if(grid){grid.replaceChildren();claims.items.forEach(item=>{const card=el("article","claim-card");card.append(el("span","claim-icon",item.icon),el("span","card-number",item.number),el("h3","",item.title));const ul=el("ul");(item.bullets||[]).forEach(b=>ul.append(el("li","",b)));card.append(ul);grid.append(card)})}
    setText(document.querySelector("#revendications .claims-commitment h3"),claims.commitmentTitle);setText(document.querySelector("#revendications .claims-commitment p"),claims.commitmentText);setText(document.querySelector("#revendications .disclaimer"),claims.disclaimer);setText(document.querySelector("#revendications summary span:first-child"),"Consulter les "+claims.items.length+" axes de nos revendications");
   }
   if(rights&&Array.isArray(rights.topics)){
    setText(document.querySelector('#droits [data-homepage="rights_eyebrow"]'),rights.eyebrow);setText(document.querySelector('#droits [data-homepage="rights_title"]'),rights.title);setText(document.querySelector("#droits .rights-lead"),rights.lead);
    const grid=document.querySelector("#droits .rights-topics");if(grid){grid.replaceChildren();rights.topics.forEach(item=>{const card=el("article","rights-topic");card.append(el("span","",item.icon));const copy=el("div");copy.append(el("small","",item.number),el("h3","",item.title));card.append(copy);grid.append(card)})}
    setText(document.querySelector("#droits .rights-contact strong"),rights.contactTitle);setText(document.querySelector("#droits .rights-contact p"),rights.contactText);
   }
   const order=content.section_order?.order,mainNode=document.querySelector("main");
   if(mainNode&&Array.isArray(order)){const selectors={intro:".intro",news:"#actualites",claims:"#revendications",rights:"#droits",survey:"#questionnaires",contact:"#contact"};order.forEach(key=>{const node=mainNode.querySelector(":scope > "+selectors[key]);if(node)mainNode.append(node)})}
  }
 }catch(error){console.warn("Managed content not loaded:",error)}
})();
(async()=>{
 try{
  const response=await fetch("/api/survey/config",{headers:{Accept:"application/json"}});if(!response.ok)return;
  const {config}=await response.json(),form=document.querySelector("#fd-survey-form");if(!config||!form)return;
  const fields=[["conditions",0],["priorities",1],["recognition",2],["comment",3]];
  fields.forEach(([key,index])=>{const legend=form.querySelectorAll("fieldset")[index]?.querySelector("legend");if(!legend||typeof config[key]!=="string")return;const required=legend.querySelector("b");legend.textContent=String(index+1).padStart(2,"0")+" "+config[key]+" ";if(required)legend.append(required)});
  const box=form.querySelector(".priority-options");if(box&&Array.isArray(config.priorityOptions)){const labels=new Map([...box.querySelectorAll("label")].map(label=>[label.querySelector("input")?.value,label]));config.priorityOptions.forEach(option=>{const label=labels.get(option.value);if(!label)return;const span=label.querySelector("span");if(span)span.textContent=option.label;box.append(label)})}
 }catch(error){console.warn("Survey configuration not loaded:",error)}
})();

}
