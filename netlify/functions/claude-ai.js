// netlify/functions/claude-ai.js
// Auto-detecting Claude AI function that finds working models

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
            headers: { 'Access-Control-Allow-Origin': '*' },
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
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
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
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
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
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    error: 'Invalid API key format',
                    success: false,
                    diagnostic: 'API key should start with sk-ant-api03-',
                    keyPrefix: apiKey.substring(0, 15) + '...',
                    fallback: true
                }),
            };
        }

        console.log('Testing Claude models to find working one...');

        // Try multiple model names in order of preference
        const modelsToTest = [
            'claude-3-5-sonnet-20241022',
            'claude-3-5-sonnet-20240620', 
            'claude-3-haiku-20240307',
            'claude-3-sonnet-20240229',
            'claude-3-opus-20240229'
        ];

        let workingModel = null;
        let testResults = [];

        for (const modelName of modelsToTest) {
            try {
                console.log(`Testing model: ${modelName}`);

                const response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01',
                    },
                    body: JSON.stringify({
                        model: modelName,
                        max_tokens: Math.min(maxTokens, 100), // Use less tokens for testing
                        messages: [{
                            role: 'user',
                            content: prompt.length > 500 ? prompt.substring(0, 500) + '...' : prompt
                        }],
                    }),
                });

                if (response.ok) {
                    const data = await response.json();
                    const aiResponse = data.content[0]?.text;
                    
                    if (aiResponse) {
                        console.log(`✅ Found working model: ${modelName}`);
                        
                        // Now make the full request with the working model
                        const fullResponse = await fetch('https://api.anthropic.com/v1/messages', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'x-api-key': apiKey,
                                'anthropic-version': '2023-06-01',
                            },
                            body: JSON.stringify({
                                model: modelName,
                                max_tokens: maxTokens,
                                messages: [{
                                    role: 'user',
                                    content: `You are an intelligent AI assistant for a Code Generation Portal with access to live database information. You have been provided with actual database search results and user context.

IMPORTANT CAPABILITIES:
- You receive REAL database search results with item codes, prices, manufacturers, and ERP status
- You can analyze trends, provide recommendations, and offer insights based on actual data
- You should handle complex queries that require reasoning and analysis
- You provide specific, actionable advice based on the real data you've been given

USER QUERY AND CONTEXT:
${prompt}

Please provide an intelligent, helpful response based on the database information provided above. Focus on being genuinely useful rather than just summarizing the data.`
                                }],
                            }),
                        });

                        if (fullResponse.ok) {
                            const fullData = await fullResponse.json();
                            const fullAiResponse = fullData.content[0]?.text;
                            
                            return {
                                statusCode: 200,
                                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    success: true,
                                    response: fullAiResponse,
                                    usage: fullData.usage || {},
                                    model: modelName,
                                    message: `Successfully connected using model: ${modelName}`,
                                    timestamp: new Date().toISOString()
                                }),
                            };
                        }
                    }
                } else {
                    const errorText = await response.text();
                    testResults.push({
                        model: modelName,
                        status: response.status,
                        error: errorText.substring(0, 200)
                    });
                    console.log(`❌ ${modelName} failed: ${response.status}`);
                }
            } catch (error) {
                testResults.push({
                    model: modelName,
                    error: error.message
                });
                console.log(`💥 ${modelName} error: ${error.message}`);
            }
        }

        // No working model found
        console.error('No working Claude models found');
        
        // Analyze the errors to provide specific guidance
        let specificError = 'Unknown error';
        let solution = 'Check your API key and account status';
        
        const lastResult = testResults[testResults.length - 1];
        if (lastResult) {
            if (lastResult.status === 401) {
                specificError = 'Authentication failed';
                solution = 'Check if your API key is correct and active';
            } else if (lastResult.status === 402) {
                specificError = 'Insufficient credits';
                solution = 'Add credits to your Anthropic account';
            } else if (lastResult.status === 429) {
                specificError = 'Rate limit exceeded';
                solution = 'Wait a moment and try again';
            } else if (lastResult.error && lastResult.error.includes('not_found_error')) {
                specificError = 'Model access issue';
                solution = 'Your API key may not have access to Claude 3 models. Contact Anthropic support.';
            }
        }
        
        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                error: `No working Claude models found: ${specificError}`,
                success: false,
                diagnostic: `Tested ${modelsToTest.length} models, all failed`,
                testResults: testResults,
                solution: solution,
                testedModels: modelsToTest,
                fallback: true
            }),
        };

    } catch (error) {
        console.error('Function error:', error);
        
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
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
