// netlify/functions/claude-ai.js
// Enhanced Claude AI serverless function for complex query handling and database integration

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
                error: 'Method not allowed. Use POST for AI requests.',
                success: false
            }),
        };
    }

    try {
        // Parse request body
        const requestData = JSON.parse(event.body);
        const { prompt, maxTokens = 1500 } = requestData;

        if (!prompt) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({ 
                    error: 'Prompt is required for AI processing',
                    success: false
                }),
            };
        }

        // Get API key from environment variables
        const apiKey = process.env.ANTHROPIC_API_KEY;
        
        if (!apiKey) {
            return {
                statusCode: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({ 
                    error: 'AI service not configured on server',
                    fallback: true,
                    success: false,
                    message: 'ANTHROPIC_API_KEY environment variable not set. Please configure API key in Netlify environment variables.',
                    setupRequired: true
                }),
            };
        }

        // Enhanced system prompt for database-integrated AI assistant
        const enhancedPrompt = `You are an intelligent AI assistant for a Code Generation Portal with access to live database information. You have been provided with actual database search results and user context.

IMPORTANT CAPABILITIES:
- You receive REAL database search results with item codes, prices, manufacturers, and ERP status
- You can analyze trends, provide recommendations, and offer insights based on actual data
- You should handle complex queries that require reasoning and analysis
- You provide specific, actionable advice based on the real data you've been given

RESPONSE GUIDELINES:
1. Reference specific item codes, prices, and data points from the database results
2. Provide intelligent analysis and insights, not just data regurgitation  
3. Offer practical recommendations based on patterns you observe
4. Handle complex queries that require multi-step reasoning
5. Be conversational but professional and helpful
6. Use appropriate emojis and formatting for readability
7. Suggest logical next steps based on the context

USER QUERY AND DATABASE CONTEXT:
${prompt}

Please provide an intelligent, helpful response based on the database information provided above. Focus on being genuinely useful rather than just summarizing the data.`;

        console.log('Calling Claude API with enhanced prompt for complex query handling...');

        // Call Claude API with enhanced prompt
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-3-sonnet-20240229',
                max_tokens: maxTokens,
                messages: [
                    {
                        role: 'user',
                        content: enhancedPrompt,
                    },
                ],
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Claude API error:', response.status, errorText);
            
            let errorMessage = 'Claude AI service error';
            if (response.status === 401) {
                errorMessage = 'Invalid API key. Check ANTHROPIC_API_KEY environment variable.';
            } else if (response.status === 429) {
                errorMessage = 'Rate limit exceeded. Please try again in a moment.';
            } else if (response.status === 402) {
                errorMessage = 'Insufficient API credits. Please check your Anthropic account.';
            }
            
            return {
                statusCode: 200, // Return 200 to avoid breaking the frontend
                headers: {
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({ 
                    error: errorMessage,
                    fallback: true,
                    success: false,
                    message: 'Claude AI temporarily unavailable. Please check API configuration.',
                    details: `HTTP ${response.status}: ${errorText.substring(0, 200)}`
                }),
            };
        }

        const data = await response.json();
        const aiResponse = data.content[0]?.text;
        
        if (!aiResponse) {
            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({ 
                    error: 'No response generated by Claude AI',
                    fallback: true,
                    success: false,
                    message: 'Claude AI did not generate a response. Please try rephrasing your query.'
                }),
            };
        }

        console.log('Claude AI response generated successfully');
        
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
                model: 'claude-3-sonnet-20240229',
                timestamp: new Date().toISOString()
            }),
        };

    } catch (error) {
        console.error('Claude AI function error:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ 
                error: 'Internal server error in Claude AI function',
                fallback: true,
                success: false,
                message: 'AI processing failed due to server error. Please try again.',
                details: error.message
            }),
        };
    }
};
