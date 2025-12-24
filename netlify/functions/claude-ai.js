// netlify/functions/claude-ai.js
// Diagnostic Claude AI function with detailed error reporting

exports.handler = async (event, context) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
            },
            body: '',
        };
    }

    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: {
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ 
                error: 'Method not allowed. Use POST.',
                success: false
            }),
        };
    }

    try {
        console.log('Claude AI function called at:', new Date().toISOString());
        
        // Parse request body
        const requestData = JSON.parse(event.body);
        const { prompt, maxTokens = 1500 } = requestData;

        if (!prompt) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    error: 'Prompt is required',
                    success: false,
                    diagnostic: 'Request missing prompt parameter'
                }),
            };
        }

        // Check for API key
        const apiKey = process.env.ANTHROPIC_API_KEY;
        
        console.log('Environment check:', {
            hasApiKey: !!apiKey,
            keyLength: apiKey ? apiKey.length : 0,
            keyPrefix: apiKey ? apiKey.substring(0, 10) + '...' : 'None'
        });
        
        if (!apiKey) {
            console.error('ANTHROPIC_API_KEY environment variable not set');
            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    error: 'API key not configured',
                    success: false,
                    diagnostic: 'ANTHROPIC_API_KEY environment variable not found',
                    setupInstructions: 'Set ANTHROPIC_API_KEY in Netlify environment variables',
                    fallback: true
                }),
            };
        }

        // Validate API key format
        if (!apiKey.startsWith('sk-ant-api03-')) {
            console.error('Invalid API key format');
            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    error: 'Invalid API key format',
                    success: false,
                    diagnostic: 'API key should start with sk-ant-api03-',
                    keyPrefix: apiKey.substring(0, 15) + '...',
                    fallback: true
                }),
            };
        }

        console.log('Calling Claude API...');

        // Call Claude API with current model
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: maxTokens,
                messages: [
                    {
                        role: 'user',
                        content: `You are an AI assistant for a Code Generation Portal. Please provide a helpful response to this user query:

${prompt}`,
                    },
                ],
            }),
        });

        console.log('Claude API response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Claude API error:', {
                status: response.status,
                statusText: response.statusText,
                body: errorText
            });
            
            let errorMessage = 'Claude API error';
            let diagnostic = '';
            
            if (response.status === 401) {
                errorMessage = 'Invalid or expired API key';
                diagnostic = 'API key authentication failed - check if key is correct and active';
            } else if (response.status === 402) {
                errorMessage = 'Insufficient API credits';
                diagnostic = 'Your Anthropic account has no credits remaining';
            } else if (response.status === 429) {
                errorMessage = 'Rate limit exceeded';
                diagnostic = 'Too many requests - please wait before trying again';
            } else if (response.status === 400) {
                errorMessage = 'Bad request to Claude API';
                diagnostic = 'Request format issue: ' + errorText.substring(0, 200);
            } else {
                errorMessage = `Claude API HTTP ${response.status}`;
                diagnostic = errorText.substring(0, 300);
            }
            
            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    error: errorMessage,
                    success: false,
                    diagnostic: diagnostic,
                    httpStatus: response.status,
                    details: errorText.substring(0, 500),
                    fallback: true
                }),
            };
        }

        const data = await response.json();
        const aiResponse = data.content[0]?.text;
        
        if (!aiResponse) {
            console.error('No response text from Claude');
            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    error: 'Empty response from Claude',
                    success: false,
                    diagnostic: 'Claude API returned empty content',
                    rawResponse: JSON.stringify(data),
                    fallback: true
                }),
            };
        }

        console.log('Claude AI response received successfully, length:', aiResponse.length);
        
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                success: true,
                response: aiResponse,
                usage: data.usage || {},
                model: 'claude-3-5-sonnet-20241022',
                timestamp: new Date().toISOString()
            }),
        };

    } catch (error) {
        console.error('Function error:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                error: 'Function execution error',
                success: false,
                diagnostic: error.message,
                stack: error.stack?.substring(0, 500),
                fallback: true
            }),
        };
    }
};
