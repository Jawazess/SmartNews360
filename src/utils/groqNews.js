
/**
 * Helpers to call Groq API safely from the browser using the Vite dev‑proxy (/api/groq).
 * Production build still needs a backend (or serverless function) that forwards the
 * request to https://api.groq.com/openai/v1/chat/completions and injects the secret key.
 *
 * All helpers below return clean JS structures (array / object) ready for UI consumption.
 *
 *  ▸ Requires VITE_GROQ_KEY in your .env  (only used in dev thanks to vite.config.js proxy)
 */

const ENDPOINT = '/api/groq'; // Vite proxy rewrites this in dev

const LANG_NAME = {
  fr: 'French',
  en: 'English',
  ar: 'Arabic',
  sw: 'Swahili',
  pt: 'Portuguese',
};
const tr = (map, lang) => map[lang] || map.fr;
const name = (lang) => LANG_NAME[lang] || LANG_NAME.fr;

async function groqRequest({ messages, temperature = 0.8, max_tokens = 512 }) {
  const apiKey = import.meta.env.VITE_GROQ_KEY;
  /* In production on Vercel, the API key is injected by the /api/groq
   serverless function, so it's optional on the client side. */

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'llama3-8b-8192',
      messages,
      temperature,
      max_tokens,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq error ${res.status}: ${errText.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Return N ≤10 short Moroccan news headlines (≤80 chars each)
 * @param {number} count
 * @returns {Promise<string[]>}
 */
export async function fetchHeadlines(count = 10, lang = 'fr') {
  const prompts = {
    user: {
      fr: 'Donne-moi les toutes dernières actualités au Maroc.',
      en: 'Give me the latest news in Morocco.',
      ar: 'زوّدني بآخر الأخبار في المغرب.'
    }
  };
  const json = await groqRequest({
    messages: [
      {
        role: 'system',
        content: `You are a Moroccan news bot. Reply in ${name(lang)} with exactly ${count} concise headlines (≤80 char each), one per line, no numbering.`,
      },
      {
        role: 'user',
        content: tr(prompts.user, lang),
      },
    ],
    max_tokens: 300,
  });

  const raw = json.choices?.[0]?.message?.content ?? '';
  return raw
    .split('\n')
    .map((h) => h.replace(/^[-*\d\.\)\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, count);
}

/**
 * Returns an array of objects: [{title, summary}]
 * @param {number} count
 * @returns {Promise<Array<{title:string, summary:string}>>}
 */

export async function fetchNewsCards(count = 10, lang = 'fr') {
  const prompts = {
    user: {
      fr: 'Donne-moi les dernières nouvelles au Maroc avec un résumé.',
      en: 'Give me the latest news in Morocco with a summary.',
      ar: 'زوّدني بآخر الأخبار في المغرب مع ملخص.'
    }
  };
  const json = await groqRequest({
    messages: [
      {
        role: 'system',
        content: `You are a Moroccan news bot. Provide a JSON array of ${count} objects with keys 'title' (≤80 char), 'summary' (≤180 char) and 'date' (ISO 8601) in ${name(lang)}.`,
      },
      { role: 'user', content: tr(prompts.user, lang) },
    ],
    max_tokens: 1200,
  });

  const raw = json.choices?.[0]?.message?.content ?? '[]';
  let arr = [];
  try {
    // Extract the JSON block even if preceded by text
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start !== -1 && end !== -1) {
      arr = JSON.parse(raw.slice(start, end + 1));
    } else {
      arr = JSON.parse(raw);
    }
  } catch (e) {
    console.error('parse news cards', e);
  }
  if (!Array.isArray(arr) || arr.length === 0) {
    // fallback to headlines
    return (await fetchHeadlines(count, lang)).map((title) => ({ title, summary: '', date: new Date().toISOString() }));
  }
  return arr.slice(0, count);
}


export const fetchRandomMoroccoNews = async (lang = 'fr') => (await fetchHeadlines(1, lang))[0];

/**
 * Fetch trending topics
 * @param {number} count
 * @returns {Promise<Array<{category:string,title:string,timeAgo:string,change:string}>>}
 */
export async function fetchTrendingTopics(count = 6, lang = 'fr') {
  const json = await groqRequest({
    messages: [
      {
        role: 'system',
        content: `You are an expert Moroccan news curator summarizing real trending topics from trusted media sources. Reply in ${name(lang)} with a JSON array of exactly ${count} objects using the keys 'category', 'title', 'timeAgo' and 'change'. Categories should be in ${name(lang)} (e.g. Sport, Politique, Technologie). Ensure topics reflect what is currently popular and avoid invented stories. The 'change' value must contain a +/- percentage.`,
      },
      { role: 'user', content: tr({ fr: 'Donne-moi les tendances actuelles.', en: 'Give me the current trends.', ar: 'ما هي المواضيع الرائجة حالياً؟' }, lang) },
    ],
    max_tokens: 800,
  });
  const raw = json.choices?.[0]?.message?.content ?? '[]';
  try {
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start !== -1 && end !== -1) {
      return JSON.parse(raw.slice(start, end + 1)).slice(0, count);
    }
    return JSON.parse(raw).slice(0, count);
  } catch (e) {
    console.error('parse trending topics', e);
    return [];
  }
}

/**
 * Fetch AI article recommendations
 * @param {number} count
 * @returns {Promise<string[]>}
 */
export async function fetchAIRecommendations(count = 3, lang = 'fr') {
  const prompts = {
    user: {
      fr: "Génère des recommandations d'articles.",
      en: 'Generate article recommendations.',
      ar: 'اقترح علي عناوين مقالات.'
    }
  };
  const json = await groqRequest({
    messages: [
      {
        role: 'system',
        content: `Return exactly ${count} catchy ${name(lang)} article headlines, one per line.`,
      },
      { role: 'user', content: tr(prompts.user, lang) },
    ],
    max_tokens: 400,
  });
  const raw = json.choices?.[0]?.message?.content ?? '';
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, count);
}

/**
 * Generate AI powered technology news with summary and date.
 * @param {number} count
 * @returns {Promise<Array<{title:string, summary:string, date:string}>>}
 */
export async function fetchAITechNews(count = 10, lang = 'fr') {
  const prompts = {
    user: {
      fr: 'Donne-moi les dernières nouvelles technologiques dans le monde avec un résumé.',
      en: 'Give me the latest technology news around the world with a summary.',
      ar: 'زوّدني بآخر أخبار التكنولوجيا في العالم مع ملخص.'
    }
  };
  const json = await groqRequest({
    messages: [
      {
        role: 'system',
        content: `You are a global technology news bot. Provide a JSON array of exactly ${count} objects with keys 'title', 'summary' and 'date' (ISO 8601) in ${name(lang)}.`,
      },
      { role: 'user', content: tr(prompts.user, lang) },
    ],
    max_tokens: 1500,
  });

  const raw = json.choices?.[0]?.message?.content ?? '[]';
  try {
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start !== -1 && end !== -1) {
      return JSON.parse(raw.slice(start, end + 1)).slice(0, count);
    }
    return JSON.parse(raw).slice(0, count);
  } catch (e) {
    console.error('parse AI tech news', e);
    return [];
  }
}

/**
 * Generate catchy French article titles about a given topic.
 * @param {string} topic  Sujet demandé par l'utilisateur
 * @param {number} count  Nombre de titres souhaités (<=10)
 * @returns {Promise<string[]>}
 */
export async function generateArticleTitles(topic, count = 6, lang = 'fr') {
  if (!topic || topic.trim().length === 0) return [];
  const q = topic.trim();
  const json = await groqRequest({
    messages: [
      {
        role: 'system',
        content: `You are a seasoned ${name(lang)} copywriter specialized in punchy news headlines. Return exactly ${count} catchy ${name(lang)} article titles (≤80 char), one per line, no numbering, about the topic below.`,
      },
      { role: 'user', content: q },
    ],
    max_tokens: 400,
  });
  const raw = json.choices?.[0]?.message?.content ?? '';
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, count);
}

/**
 * Génère un article complet (paragraphes en français) à partir d’un sujet.
 * @param {string} topic    Sujet de l’article
 * @param {number} sections Nombre de paragraphes (3–8 max pour limiter le coût)
 * @returns {Promise<string[]>}  Tableau de paragraphes, ordre conservé
 */
export async function generateArticleContent(topic, sections = 4, lang = 'fr') {
  if (!topic?.trim()) return [];

  const json = await groqRequest({
    messages: [
      {
        role: 'system',
        content: `You are an experienced Moroccan journalist acting as a senior content writer. Write exactly ${sections} coherent paragraphs (100–140 words each) in ${name(lang)}, rich in facts and magazine style, no headings or bullet points.`,
      },
      { role: 'user', content: topic.trim() },
    ],
    temperature: 0.85,
    max_tokens: sections * 160,
  });

  const raw = json.choices?.[0]?.message?.content ?? '';
  return raw
    .split(/\n{2,}/)         // coupe sur les doubles retours
    .map(p => p.trim())
    .filter(Boolean)
    .slice(0, sections);
}

/**
 * Generic chat helper returning the assistant's reply text.
 * @param {Array<{role:string, content:string}>} messages
 * @param {object} options Additional options like temperature.
 * @returns {Promise<string>} Assistant reply
 */
export async function chatCompletion(messages, options = {}) {
  const json = await groqRequest({ messages, ...options });
  return json.choices?.[0]?.message?.content ?? '';
}

/**
 * Generate a list of technology keywords.
 * @param {number} count
 * @returns {Promise<string[]>}
 */
export async function fetchTechKeywords(count = 5, lang = 'fr') {
  const prompts = {
    user: {
      fr: 'Donne-moi des mots-clés technologiques.',
      en: 'Give me technology keywords.',
      ar: 'أعطني كلمات مفتاحية في مجال التكنولوجيا.'
    }
  };
  const json = await groqRequest({
    messages: [
      {
        role: 'system',
        content: `Return exactly ${count} ${name(lang)} technology keywords separated by commas.`,
      },
      { role: 'user', content: tr(prompts.user, lang) },
    ],
    max_tokens: 60,
  });
  const raw = json.choices?.[0]?.message?.content ?? '';
  return raw
    .split(/[,,\n]/)
    .map(k => k.trim())
    .filter(Boolean)
    .slice(0, count);
}

export async function improveTitle(title, lang = 'fr') {
  if (!title) return '';
  const text = await chatCompletion([
    { role: 'system', content: `You are a skilled ${name(lang)} copywriter. Rewrite the headline below in less than 80 characters, making it more engaging.` },
    { role: 'user', content: title.trim() }
  ], { max_tokens: 60 });
  return text.trim();
}

export async function suggestHashtags(title, lang = 'fr') {
  if (!title) return [];
  const raw = await chatCompletion([
    { role: 'system', content: `Provide three relevant social media hashtags in ${name(lang)} for the headline below, separated by spaces.` },
    { role: 'user', content: title.trim() }
  ], { max_tokens: 40 });
  return raw.split(/\s+/).map(h => h.startsWith('#') ? h : '#' + h).slice(0, 3);
}

export async function translateTitle(title, target = 'en') {
  if (!title) return '';
  const text = await chatCompletion([
    { role: 'system', content: `Translate the following headline into ${name(target)}.` },
    { role: 'user', content: title.trim() }
  ], { max_tokens: 60 });
  return text.trim();
}

export async function analyzeTitle(title, lang = 'fr') {
  if (!title) return null;
  const jsonText = await chatCompletion([
    { role: 'system', content: `You are an expert editor. Analyze the headline below and respond in JSON with keys quality (0-100), keywords (array) and clickRate (0-100).` },
    { role: 'user', content: title.trim() }
  ], { max_tokens: 120, temperature: 0.6 });
  try {
    const start = jsonText.indexOf('{');
    const end = jsonText.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      return JSON.parse(jsonText.slice(start, end + 1));
    }
    return JSON.parse(jsonText);
  } catch (_) {
    return null;
  }
}

export async function extendParagraph(paragraph, lang = 'fr') {
  if (!paragraph) return '';
  const text = await chatCompletion(
    [
      {
        role: 'system',
        content: `You are a skilled ${name(lang)} writer. Extend the paragraph below with two additional sentences in the same style.`
      },
      { role: 'user', content: paragraph.trim() }
    ],
    { max_tokens: 120 }
  );
  return text.trim();
}

export async function summarizeParagraph(paragraph, lang = 'fr') {
  if (!paragraph) return '';
  const text = await chatCompletion(
    [
      {
        role: 'system',
        content: `Summarize the following paragraph in ${name(lang)} with one concise sentence.`
      },
      { role: 'user', content: paragraph.trim() }
    ],
    { max_tokens: 60, temperature: 0.6 }
  );
  return text.trim();
}

export async function translateParagraph(paragraph, target = 'en') {
  if (!paragraph) return '';
  const text = await chatCompletion(
    [
      {
        role: 'system',
        content: `Translate the following paragraph into ${name(target)}.`
      },
      { role: 'user', content: paragraph.trim() }
    ],
    { max_tokens: 200 }
  );
  return text.trim();
}

export async function analyzeParagraph(paragraph, lang = 'fr') {
  if (!paragraph) return null;
  const jsonText = await chatCompletion(
    [
      {
        role: 'system',
        content: `Provide a JSON with keys sentiment (positive|neutral|negative) and keywords (array) analyzing the paragraph below in ${name(lang)}.`
      },
      { role: 'user', content: paragraph.trim() }
    ],
    { max_tokens: 120, temperature: 0.6 }
  );
  try {
    const start = jsonText.indexOf('{');
    const end = jsonText.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      return JSON.parse(jsonText.slice(start, end + 1));
    }
    return JSON.parse(jsonText);
  } catch (_) {
    return null;
  }
}

export async function summarizeArticle(text, lang = 'fr') {
  if (!text) return { summary: '', points: [] };
  const jsonText = await chatCompletion(
    [
      {
        role: 'system',
        content: `You are a seasoned journalist. Summarize the article below in ${name(lang)} with two concise sentences and provide three key points. Respond in JSON using the keys 'summary' and 'points' (array).`
      },
      { role: 'user', content: text.slice(0, 6000) }
    ],
    { max_tokens: 200, temperature: 0.6 }
  );
  try {
    const start = jsonText.indexOf('{');
    const end = jsonText.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      return JSON.parse(jsonText.slice(start, end + 1));
    }
    return JSON.parse(jsonText);
  } catch (_) {
    return { summary: jsonText.trim(), points: [] };
  }
}

/**
 * Enhance an article using AI to produce a polished result.
 * @param {string} html Article HTML content
 * @returns {Promise<string>} Improved HTML
 */
export async function enhanceArticle(html, lang = 'fr') {
  if (!html) return '';
  const text = await chatCompletion(
    [
      {
        role: 'system',
        content: `You are the world's best ${name(lang)} editor. Improve the article below while preserving its meaning. Return polished HTML in ${name(lang)}.`
      },
      { role: 'user', content: html.slice(0, 6000) }
    ],
    { max_tokens: 2000, temperature: 0.7 }
  );
  return text.trim();
}

/**
 * Translate a full article to a target language.
 * @param {string} text Article text (plain or HTML)
 * @param {string} target Language code like 'en' or 'ar'
 * @returns {Promise<string>} Translated article text
 */
export async function translateArticle(text, target = 'en') {
  if (!text) return '';
  const translated = await chatCompletion(
    [
      {
        role: 'system',
        content: `Translate the following article into ${name(target)}.`,
      },
      { role: 'user', content: text.slice(0, 6000) },
    ],
    { max_tokens: 2000 }
  );
  return translated.trim();
}

/**
 * Generate concise English keywords for image search based on a title.
 * @param {string} title
 * @param {number} count
 * @returns {Promise<string[]>}
 */
export async function generateImageKeywords(title, count = 3) {
  if (!title) return [];
  const raw = await chatCompletion(
    [
      {
        role: 'system',
        content: `Provide exactly ${count} short English keywords separated by commas to illustrate the headline below.`,
      },
      { role: 'user', content: title.trim() },
    ],
    { max_tokens: 40, temperature: 0.7 }
  );
  return raw
    .split(/[,,\n]/)
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, count);
}

export function extractMainKeyword(title = '') {
  if (!title) return '';
  const tokens = title.match(/[A-Za-zÀ-ÖØ-öø-ÿ0-9]+/g) || [];
  const stops = new Set([
    'the','a','an','and','or','for','with','to','of','in','on','secret','revealed',
    'photos','photo','rock','world','tech'
  ]);
  const filtered = tokens.filter(t => !stops.has(t.toLowerCase()));
  const arr = filtered.length > 0 ? filtered : tokens;
  return arr.slice(0,2).join(' ');
}

/**
 * Return a short axis (main idea) for each paragraph.
 * @param {string[]} paragraphs
 * @param {string} lang
 * @returns {Promise<string[]>}
 */
export async function generateParagraphAxes(paragraphs = [], lang = 'fr') {
  if (!Array.isArray(paragraphs) || paragraphs.length === 0) return [];
  const results = await Promise.all(
    paragraphs.map((p) =>
      chatCompletion(
        [
          {
            role: 'system',
            content: `Summarize the following paragraph in ${name(lang)} with a short axis (max 8 words).`,
          },
          { role: 'user', content: p.trim() },
        ],
        { max_tokens: 20, temperature: 0.6 }
      )
    )
  );
  return results.map((r) => r.trim());
}


export async function humanizeText(text, tone = 'conversation') {
  if (!text) return '';
  const toneMap = {
    soft: 'Rewrite the text in a gentle and friendly style.',
    professional: 'Rewrite the text in a professional journalistic tone.',
    conversation: 'Rewrite the text in a conversational and engaging tone.'
  };
  const instruction = toneMap[tone] || toneMap.conversation;
  const result = await chatCompletion(
    [
      { role: 'system', content: `${instruction} Keep the original meaning and improve flow. Reply in French.` },
      { role: 'user', content: text.slice(0, 6000) }
    ],
    { max_tokens: 2000, temperature: 0.7 }
  );
  return result.trim();
}
