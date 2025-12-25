// Simple version for immediate deployment
// Save as: netlify/functions/claude-ai-comprehensive-database.js

exports.handler = async (event, context) => {
    // Handle CORS
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Method not allowed', success: false })
        };
    }

    try {
        const { prompt, maxTokens = 2000 } = JSON.parse(event.body);
        
        if (!prompt) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Prompt required', success: false })
            };
        }

        // Check for API key
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            return {
                statusCode: 200,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    error: 'ANTHROPIC_API_KEY not configured',
                    success: false,
                    fallback: true 
                })
            };
        }

        console.log('🧠 Simple comprehensive function called');

        // Try multiple models
        const models = ['claude-3-5-sonnet-20241022', 'claude-3-5-sonnet-20240620', 'claude-3-haiku-20240307'];
        
        for (const model of models) {
            try {
                const response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01'
                    },
                    body: JSON.stringify({
                        model: model,
                        max_tokens: maxTokens,
                        messages: [{
                            role: 'user',
                            content: `You are an intelligent AI assistant for a Code Generation Portal. 

USER QUERY: "${prompt}"

IMPORTANT: You are currently running in a basic mode without direct database access. When users ask about specific database content (like "projects containing upvc" or "steel item codes"), acknowledge this limitation and provide helpful guidance.

Response format:
1. Acknowledge what they're asking for
2. Explain that full database integration is being set up
3. Suggest they use the portal's search features in the meantime
4. Provide general guidance about their query topic

Be helpful, professional, and clear about current limitations while providing useful information.`
                        }]
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    const aiResponse = data.content[0]?.text;
                    
                    if (aiResponse) {
                        console.log(`✅ Success with model: ${model}`);
                        return {
                            statusCode: 200,
                            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                success: true,
                                response: aiResponse,
                                model: model,
                                mode: 'basic',
                                message: 'Basic AI mode - database integration being configured',
                                timestamp: new Date().toISOString()
                            })
                        };
                    }
                }
            } catch (modelError) {
                console.log(`❌ Model ${model} failed:`, modelError.message);
                continue;
            }
        }

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: 'No working Claude models found',
                success: false,
                fallback: true
            })
        };

    } catch (error) {
        console.error('Function error:', error);
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                error: 'Internal function error',
                details: error.message,
                success: false,
                fallback: true 
            })
        };
    }
};
