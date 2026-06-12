exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { message, chatHistory, context: bizContext } = JSON.parse(event.body || '{}');

    if (!message || !bizContext) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing core message or context.' })
      };
    }

    const totalRev = Number(bizContext.metrics?.totalRevenue) || 0;
    const currency = bizContext.currency || 'KES';
    const totalProd = Number(bizContext.metrics?.totalProducts) || 0;
    const outOfStock = Number(bizContext.metrics?.outOfStockCount) || 0;
    const lowStock = Number(bizContext.metrics?.lowStockCount) || 0;
    const totalSales = Number(bizContext.metrics?.totalSalesCount) || 0;

    const systemPrompt = `You are the ShopMapp AI Business Advisor, a virtual CFO.
Analyze this store data strictly:
- Business: ${bizContext.businessName || 'Store'}
- Type: ${bizContext.businessType || 'Retail'}
- Main Currency: ${currency}
- Total Products: ${totalProd}
- Out of Stock: ${outOfStock}
- Low Stock (<5 left): ${lowStock}
- Total Sales Count: ${totalSales}
- Total Revenue: ${currency} ${totalRev.toFixed(2)}

Key Products:
${JSON.stringify(bizContext.products || [], null, 1)}

Recent Sales:
${JSON.stringify(bizContext.recentSales || [], null, 1)}

Instructions:
- Ground insights strictly on this metrics structure.
- Give compact, analytical, markdown-formatted advice.`;

    const contents = [];
    if (chatHistory && Array.isArray(chatHistory)) {
      chatHistory.forEach(msg => {
        contents.push({
          role: msg.role === 'bot' || msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        });
      });
    }
    contents.push({ role: 'user', parts: [{ text: message }] });

    const geminiApiKey = process.env.GEMINI_API_KEY;
    const openAiApiKey = process.env.OPENAI_API_KEY;
    const apiKey = geminiApiKey || openAiApiKey;

    if (!apiKey) {
      return {
        statusCode: 503,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing GEMINI_API_KEY or OPENAI_API_KEY. Set one in Netlify environment variables.' })
      };
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
        return {
          statusCode: geminiResponse.status,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'AI service error', details: errorText })
        };
      }

      const geminiData = await geminiResponse.json();
      const resultText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'Error fetching analysis response.';
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: resultText })
      };
    }

    const gatewayUrl = process.env.AI_GATEWAY_URL || 'https://gateway.ai.cloudflare.com/v1/85a4f356a53b7d253ca6e354e5a904ae/shopmapp-cfo/compat/chat/completions';
    const openAIApiUrl = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions';
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
      const errorText = await aiResponse.text().catch(() => 'Unable to read response body.');
      console.error('AI service error:', aiResponse.status, errorText);
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'AI service error', details: errorText })
      };
    }

    const aiData = await aiResponse.json();
    const resultText = aiData.choices?.[0]?.message?.content || 'Error fetching analysis response.';
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: resultText })
    };

  } catch (error) {
    console.error('Pipeline Crash:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server error', details: error.message })
    };
  }
};