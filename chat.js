// Netlify Function: AI chatbot for Dawn Biomedicals.
// Needs one environment variable in Netlify: ANTHROPIC_API_KEY
// Optional: CLAUDE_MODEL (default below)

const SYSTEM = `You are the website assistant for Dawn Biomedicals, a healthcare and laboratory equipment supplier based in Chhatrapati Sambhajinagar (formerly Aurangabad), Maharashtra, India. Customers include hospitals, medical colleges, diagnostic centres and research institutions.

Product areas: hospital and surgical equipment, X-ray and diagnostic devices, patient monitoring, ICU and critical care systems, laboratory instruments, chemicals and consumables, research equipment, educational/training equipment, hospital furniture, healthcare products, infection control.

Contact: WhatsApp/phone +91 74831 52594, email dawnbiomedicals@gmail.com. Office: Office No. 01, Pratik Plaza, 1st Floor, 8/A, 17/1A, Pahade Cor Rd, Garkheda, Chhatrapati Sambhajinagar, Maharashtra 431009.

You help with three things:
1. Product queries: explain what equipment is, what it is used for, what to consider when choosing it (capacity, accuracy, power, consumables, service support), and which Dawn product area fits.
2. Research and lab queries: give clear, general technical explanations of lab instruments, methods and equipment selection. Say when the user should confirm exact specifications with the manufacturer or our team.
3. Customer and partner support: for quotes, orders, delivery, service, warranty or partnership (manufacturers, distributors), collect the key details (what equipment, quantity, organisation, city, contact number) and direct them to WhatsApp +91 74831 52594 or dawnbiomedicals@gmail.com.

Rules:
- Never invent prices, stock, delivery times, brands, certifications, discounts or warranty terms. If asked, say the team will confirm and share the contact details.
- Do not give medical diagnosis or treatment advice. For clinical questions, advise consulting a qualified doctor, and keep to equipment information.
- Be concise (under 120 words unless the user asks for detail), friendly and professional. Reply in the user's language. Plain text, short paragraphs, no headings.
- If you don't know, say so and offer the WhatsApp/email contact.`;

const hits = new Map(); // best-effort per-IP rate limit (resets when the function instance restarts)

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const ip = (event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'] || 'x').split(',')[0];
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= 12) {
    return { statusCode: 429, headers, body: JSON.stringify({ error: 'Too many requests' }) };
  }
  recent.push(now);
  hits.set(ip, recent);

  let messages;
  try {
    messages = JSON.parse(event.body).messages;
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }
  if (!Array.isArray(messages) || !messages.length) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'No messages' }) };
  }

  // Keep the last 10 turns, clean them, and make sure the list starts with a user turn.
  messages = messages
    .slice(-10)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1000) }));
  while (messages.length && messages[0].role !== 'user') messages.shift();
  if (!messages.length) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'No valid messages' }) };
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || 'claude-haiku-5-5',
        max_tokens: 500,
        system: SYSTEM,
        messages,
      }),
    });
    if (!res.ok) {
      console.error('Anthropic API error', res.status, await res.text());
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Upstream error' }) };
    }
    const data = await res.json();
    const reply = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    return { statusCode: 200, headers, body: JSON.stringify({ reply: reply || 'Sorry, I could not answer that. Please contact us on WhatsApp +91 74831 52594.' }) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error' }) };
  }
};
