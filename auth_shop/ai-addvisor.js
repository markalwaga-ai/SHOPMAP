export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { message, chatHistory, context: bizContext } = await req.json();

    if (!message || !bizContext) {
      return new Response(JSON.stringify({ error: 'Missing core message payloads.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const totalRev = Number(bizContext.metrics?.totalRevenue) || 0;
    const currency = bizContext.currency || 'KES';
    const totalProd = Number(bizContext.metrics?.totalProducts) || 0;
    const outOfStock = Number(bizContext.metrics?.outOfStockCount) || 0;
    const lowStock = Number(bizContext.metrics?.lowStockCount) || 0;
    const totalSales = Number(bizContext.metrics?.totalSalesCount) || 0;

    // Build the dynamic data context block
    const systemPrompt = `You are the ShopMapp AI Business Advisor, a virtual Chief Financial Officer (CFO) and retail business consultant.
Ground your retail insights strictly on these real-time operational data blocks:
- Business: ${bizContext.businessName}
- Market Sector: ${bizContext.businessType}
- Location: ${bizContext.location}
- Main Currency: ${currency}
- Dynamic Inventory Total: ${totalProd} Unique Items
- Current Out of Stock: ${outOfStock}
- Low Stock (<5 left): ${lowStock}
- Cumulative Orders Handled: ${totalSales}
- All-time Recorded Volume: ${currency} ${totalRev.toFixed(2)}

Catalog Array Matrix (Trimmed sample):
${JSON.stringify(bizContext.products || [], null, 1)}

Recent Order Summary Matrix:
${JSON.stringify(bizContext.recentSales || [], null, 1)}

Rules:
- Give answers heavily structured around inventory safety lines and pricing models.
- Never invent metrics outside the given matrix.
- Use explicit markdown parameters when discussing retail math calculations.
- Politely redirect questions unrelated to store metrics or financial growth back to store management.`;

    const messages = [{ role: 'system', content: systemPrompt }];

    if (chatHistory && Array.isArray(chatHistory)) {
      chatHistory.forEach(msg => {
        messages.push({
          role: msg.role === 'bot' || msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content
        });
      });
    }

    messages.push({ role: 'user', content: message });

    // Using your exact Unified Cloudflare API endpoint string
    const gatewayUrl = context?.env?.AI_GATEWAY_URL || process.env.AI_GATEWAY_URL || "https://gateway.ai.cloudflare.com/v1/85a4f356a53b7d253ca6e354e5a904ae/shopmapp-cfo/compat/chat/completions";
    const openAIApiUrl = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions';
    const geminiApiKey = context?.env?.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    const openAiApiKey = context?.env?.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    const apiKey = geminiApiKey || openAiApiKey;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'System API key configuration error. Ensure GEMINI_API_KEY or OPENAI_API_KEY is set in environment variables or Cloudflare secrets.' }), { status: 503 });
    }

    if (geminiApiKey) {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;
      const geminiResponse = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: contents,
          generationConfig: { temperature: 0.5, maxOutputTokens: 1000 }
        })
      });
      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text().catch(() => 'Unable to read response body.');
        console.error('Gemini service error:', geminiResponse.status, errorText);
        return new Response(JSON.stringify({ error: 'AI service error', details: errorText, status: geminiResponse.status }), { status: geminiResponse.status, headers: { 'Content-Type': 'application/json' } });
      }
      const geminiData = await geminiResponse.json();
      const resultText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'Error fetching analysis response.';
      return new Response(JSON.stringify({ response: resultText }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const requestBody = {
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.5,
      max_tokens: 1000
    };

    let aiResponse = await fetch(gatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!aiResponse.ok && openAIApiUrl) {
      const gatewayError = await aiResponse.text().catch(() => '');
      const shouldFallback = [401, 403, 404, 429, 500, 502, 503].includes(aiResponse.status);
      console.warn(`Gateway response failed (${aiResponse.status}). shouldFallback=${shouldFallback}`, gatewayError);
      if (shouldFallback) {
        aiResponse = await fetch(openAIApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(requestBody)
        });
      }
    }

    if (!aiResponse.ok) {
      const errorMsg = await aiResponse.text().catch(() => 'Unable to read response body.');
      return new Response(JSON.stringify({ error: 'Gateway response exception', details: errorMsg, status: aiResponse.status }), { status: 502 });
    }

    const aiData = await aiResponse.json();
    const resultText = aiData.choices?.[0]?.message?.content || 'Unable to derive metrics analysis.';

    return new Response(JSON.stringify({ response: resultText }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal pipeline crash', details: error.message }), { status: 500 });
  }
};

export const config = {
  path: '/api/ai-advisor',
};