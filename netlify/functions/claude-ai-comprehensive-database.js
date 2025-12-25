// Model Diagnostic Function - Tests all available models to find what works
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
        const { prompt, maxTokens = 1000 } = JSON.parse(event.body);
        
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
                    error: 'ANTHROPIC_API_KEY not configured - Set this in Netlify environment variables',
                    success: false,
                    fallback: true 
                })
            };
        }

        console.log('🔍 Testing Claude models to find working one...');

        // Comprehensive list of models to test (including legacy and current)
        const modelsToTest = [
            // Current Claude 3.5 models
            'claude-3-5-sonnet-20241022',
            'claude-3-5-sonnet-20240620', 
            'claude-3-5-haiku-20241022',
            
            // Claude 3 models
            'claude-3-sonnet-20240229',
            'claude-3-opus-20240229',
            'claude-3-haiku-20240307',
            
            // Generic model names (may work)
            'claude-3-5-sonnet',
            'claude-3-sonnet',
            'claude-3-haiku',
            'claude-3-opus',
            
            // Legacy models (if account is older)
            'claude-2.1',
            'claude-2.0',
            'claude-instant-1.2',
            'claude-instant-1.1',
            'claude-instant-1',
            'claude-2',
            
            // Alternative naming patterns
            'claude-3-5-sonnet-latest',
            'claude-3-sonnet-latest',
            'claude-3-haiku-latest'
        ];

        let workingModel = null;
        let testResults = [];
        let lastError = null;

        // Test each model
        for (const model of modelsToTest) {
            try {
                console.log(`Testing model: ${model}`);

                const response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01'
                    },
                    body: JSON.stringify({
                        model: model,
                        max_tokens: 100, // Small test
                        messages: [{
                            role: 'user',
                            content: 'Hello, are you working? Please respond with "Yes, I am working."'
                        }]
                    })
                });

                const responseData = await response.json();

                if (response.ok && responseData.content?.[0]?.text) {
                    console.log(`✅ SUCCESS: ${model} is working!`);
                    
                    // Now make the full request with this working model
                    const fullResponse = await fetch('https://api.anthropic.com/v1/messages', {
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

IMPORTANT: You are currently running in diagnostic mode. The comprehensive database integration is being set up. 

For now, provide helpful responses and acknowledge when users ask about specific database content. Suggest they use the portal's built-in search features while full AI database integration is being configured.

Provide professional, helpful guidance based on the user's query.`
                            }]
                        })
                    });

                    if (fullResponse.ok) {
                        const fullData = await fullResponse.json();
                        const aiResponse = fullData.content[0]?.text;
                        
                        return {
                            statusCode: 200,
                            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                success: true,
                                response: aiResponse,
                                model: model,
                                mode: 'diagnostic_success',
                                workingModel: model,
                                message: `Successfully connected using model: ${model}`,
                                testedModels: modelsToTest.slice(0, modelsToTest.indexOf(model) + 1),
                                timestamp: new Date().toISOString()
                            })
                        };
                    }
                } else {
                    // Log the specific error for this model
                    testResults.push({
                        model: model,
                        status: response.status,
                        error: responseData.error?.message || 'Unknown error',
                        errorType: responseData.error?.type || 'unknown'
                    });
                    lastError = responseData.error;
                    console.log(`❌ ${model} failed: ${response.status} - ${responseData.error?.message}`);
                }

            } catch (error) {
                testResults.push({
                    model: model,
                    error: error.message,
                    errorType: 'network_error'
                });
                console.log(`💥 ${model} error: ${error.message}`);
            }
        }

        // No working model found - provide detailed diagnostic
        console.error('🚨 No working Claude models found after testing all options');
        
        // Analyze the errors to provide specific guidance
        let diagnosis = 'Unknown issue';
        let solution = 'Contact Anthropic support';
        
        if (testResults.length > 0) {
            const errorTypes = testResults.map(r => r.errorType || 'unknown');
            const statusCodes = testResults.map(r => r.status).filter(Boolean);
            
            if (errorTypes.includes('permission_error') || statusCodes.includes(403)) {
                diagnosis = 'API key does not have access to Claude models';
                solution = 'Your API key may be from a different tier. Check console.anthropic.com for your model access.';
            } else if (statusCodes.includes(401)) {
                diagnosis = 'Invalid API key';
                solution = 'Generate a new API key from console.anthropic.com';
            } else if (statusCodes.includes(429)) {
                diagnosis = 'Rate limit exceeded';
                solution = 'Wait a few minutes and try again';
            } else if (errorTypes.includes('billing_error') || statusCodes.includes(402)) {
                diagnosis = 'Billing/credits issue';
                solution = 'Add credits to your Anthropic account';
            } else if (errorTypes.every(type => type === 'not_found_error')) {
                diagnosis = 'All model names are incorrect or unavailable';
                solution = 'Your account may have access to different model names. Check Anthropic documentation.';
            }
        }
        
        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: `No working Claude models found: ${diagnosis}`,
                success: false,
                diagnosis: diagnosis,
                solution: solution,
                detailedResults: testResults,
                testedModels: modelsToTest,
                lastError: lastError,
                apiKeyPrefix: apiKey.substring(0, 15) + '...',
                recommendations: [
                    'Check if your API key has Claude 3 access at console.anthropic.com',
                    'Verify your account has sufficient credits',
                    'Try generating a new API key',
                    'Contact Anthropic support if issue persists'
                ],
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
