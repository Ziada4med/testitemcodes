// netlify/functions/claude-ai-with-database.js
// Enhanced Claude AI function with direct database integration

const { createClient } = require('@supabase/supabase-js');

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

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Method not allowed', success: false }),
        };
    }

    try {
        console.log('Claude AI with database access called:', new Date().toISOString());
        
        const requestData = JSON.parse(event.body);
        const { prompt, maxTokens = 1500, userMessage, detectedIntent, entities } = requestData;

        if (!prompt && !userMessage) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Prompt or userMessage required', success: false }),
            };
        }

        // Get API keys from environment
        const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;

        if (!anthropicApiKey) {
            return {
                statusCode: 200,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    error: 'ANTHROPIC_API_KEY not configured', 
                    success: false, 
                    fallback: true 
                }),
            };
        }

        if (!supabaseUrl || !supabaseKey) {
            return {
                statusCode: 200,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    error: 'Supabase configuration missing (SUPABASE_URL or SUPABASE_ANON_KEY)', 
                    success: false, 
                    fallback: true 
                }),
            };
        }

        // Initialize Supabase client
        const supabase = createClient(supabaseUrl, supabaseKey);
        console.log('✅ Supabase client initialized');

        // Extract user message and intent from prompt if not provided separately
        const actualUserMessage = userMessage || extractUserMessage(prompt);
        const actualIntent = detectedIntent || analyzeIntent(actualUserMessage);
        const actualEntities = entities || extractEntities(actualUserMessage);

        console.log('📊 Processing:', { 
            userMessage: actualUserMessage, 
            intent: actualIntent, 
            entities: actualEntities 
        });

        // Perform database search based on intent
        let searchResults = null;
        try {
            searchResults = await performDatabaseSearch(supabase, actualIntent, actualEntities, actualUserMessage);
            console.log('🔍 Database search results:', searchResults);
        } catch (dbError) {
            console.error('Database search error:', dbError);
            searchResults = { 
                error: `Database search failed: ${dbError.message}`,
                results: [],
                total: 0
            };
        }

        // Build enhanced prompt with real database results
        const enhancedPrompt = buildEnhancedPrompt(actualUserMessage, actualIntent, actualEntities, searchResults);
        
        console.log('🧠 Calling Claude with database-enhanced prompt...');

        // Try multiple Claude models
        const models = ['claude-3-5-sonnet-20241022', 'claude-3-5-sonnet-20240620', 'claude-3-haiku-20240307'];
        let claudeResponse = null;
        let usedModel = null;

        for (const model of models) {
            try {
                const response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': anthropicApiKey,
                        'anthropic-version': '2023-06-01',
                    },
                    body: JSON.stringify({
                        model: model,
                        max_tokens: maxTokens,
                        messages: [{ role: 'user', content: enhancedPrompt }],
                    }),
                });

                if (response.ok) {
                    const data = await response.json();
                    claudeResponse = data.content[0]?.text;
                    usedModel = model;
                    console.log(`✅ Success with model: ${model}`);
                    break;
                }
            } catch (modelError) {
                console.log(`❌ Model ${model} failed:`, modelError.message);
                continue;
            }
        }

        if (!claudeResponse) {
            return {
                statusCode: 200,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    error: 'No working Claude models found',
                    success: false,
                    searchResults: searchResults,
                    fallback: true
                }),
            };
        }

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                response: claudeResponse,
                model: usedModel,
                searchResults: searchResults,
                databaseAccess: true,
                timestamp: new Date().toISOString()
            }),
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
            }),
        };
    }
};

// Database search function
async function performDatabaseSearch(supabase, intent, entities, message) {
    console.log(`🔍 Performing database search - Intent: ${intent}, Message: "${message}"`);
    
    try {
        switch (intent) {
            case 'search_project':
            case 'search_codes':
                return await searchProjects(supabase, entities, message);
            case 'check_status':
                return await getUserStats(supabase);
            default:
                // Default to project search for any query
                return await searchProjects(supabase, entities, message);
        }
    } catch (error) {
        console.error('Database search error:', error);
        return {
            error: error.message,
            results: [],
            total: 0,
            searchQuery: message
        };
    }
}

// Search projects function
async function searchProjects(supabase, entities, message) {
    let searchQuery = '';
    
    // Extract search terms from entities or message
    if (entities && entities.materials && entities.materials.length > 0) {
        searchQuery = entities.materials[0];
    } else {
        // Extract keywords from message
        const keywords = message.toLowerCase().match(/\b(steel|electrical|mechanical|plumbing|hvac|concrete|upvc|aluminum|copper|pvc|pipe|valve|conduit|cable|fitting|pump|motor|switch|panel|duct)\b/g);
        if (keywords && keywords.length > 0) {
            searchQuery = keywords[0];
        } else {
            searchQuery = message.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, '').trim().split(' ')[0];
        }
    }

    console.log(`🔍 Searching projects for: "${searchQuery}"`);

    // Direct database query
    let query = supabase
        .from('classification_projects')
        .select(`
            id,
            project_name,
            division_code,
            division_description,
            section_code,
            section_description,
            detailed_section_code,
            detailed_section_description,
            item_code,
            item_description,
            status,
            created_at
        `)
        .eq('status', 'admin_approved')
        .limit(10)
        .order('created_at', { ascending: false });

    // Apply search filter if we have a query
    if (searchQuery && searchQuery.length > 2) {
        query = query.or(`project_name.ilike.%${searchQuery}%,division_description.ilike.%${searchQuery}%,section_description.ilike.%${searchQuery}%,detailed_section_description.ilike.%${searchQuery}%,item_description.ilike.%${searchQuery}%`);
    }

    const { data, error } = await query;

    if (error) {
        throw new Error(`Database query failed: ${error.message}`);
    }

    console.log(`✅ Found ${data ? data.length : 0} projects`);

    return {
        results: data || [],
        searchQuery: searchQuery,
        total: data ? data.length : 0,
        type: 'projects',
        source: 'direct_serverless_query'
    };
}

// Get user statistics
async function getUserStats(supabase) {
    try {
        const { data, error } = await supabase
            .from('classification_projects')
            .select('status')
            .limit(100);

        if (error) throw error;

        const stats = {
            total: data.length,
            approved: data.filter(p => p.status === 'admin_approved').length,
            pending: data.filter(p => p.status !== 'admin_approved').length
        };

        return {
            results: [stats],
            type: 'statistics',
            total: 1,
            searchQuery: 'user_statistics'
        };
    } catch (error) {
        throw new Error(`Statistics query failed: ${error.message}`);
    }
}

// Intent analysis
function analyzeIntent(message) {
    const lower = message.toLowerCase();
    
    if (lower.includes('project') || lower.includes('classification')) {
        return 'search_project';
    } else if (lower.includes('status') || lower.includes('statistics') || lower.includes('stats')) {
        return 'check_status';
    } else if (lower.match(/\b(find|search|show|list|get)\b/)) {
        return 'search_codes';
    } else {
        return 'search_project'; // Default to project search
    }
}

// Entity extraction
function extractEntities(message) {
    const materials = message.toLowerCase().match(/\b(steel|electrical|mechanical|plumbing|hvac|concrete|upvc|aluminum|copper|pvc|pipe|valve|conduit|cable|fitting|pump|motor|switch|panel|duct)\b/g);
    
    return {
        materials: materials ? [...new Set(materials)] : []
    };
}

// Extract user message from prompt
function extractUserMessage(prompt) {
    const match = prompt.match(/USER MESSAGE: "([^"]+)"/);
    return match ? match[1] : prompt;
}

// Build enhanced prompt with database results
function buildEnhancedPrompt(userMessage, intent, entities, searchResults) {
    let prompt = `You are an AI assistant for a Code Generation Portal with direct database access.

USER QUERY: "${userMessage}"
DETECTED INTENT: ${intent}
EXTRACTED ENTITIES: ${JSON.stringify(entities)}

DATABASE SEARCH RESULTS:`;

    if (searchResults && searchResults.results && searchResults.results.length > 0) {
        prompt += `\nSearch Query: "${searchResults.searchQuery}"`;
        prompt += `\nResults Found: ${searchResults.total}`;
        prompt += `\nDatabase Source: ${searchResults.source}`;
        prompt += `\n\nACTUAL DATABASE RESULTS:`;
        
        searchResults.results.forEach((result, index) => {
            prompt += `\n\n--- Result ${index + 1} ---`;
            if (result.project_name) {
                prompt += `\nProject ID: ${result.id}`;
                prompt += `\nProject Name: ${result.project_name}`;
                prompt += `\nDivision: ${result.division_code} - ${result.division_description || 'No description'}`;
                prompt += `\nSection: ${result.section_code} - ${result.section_description || 'No description'}`;
                prompt += `\nDetailed Section: ${result.detailed_section_code} - ${result.detailed_section_description || 'No description'}`;
                prompt += `\nItem Code: ${result.item_code || 'Not specified'}`;
                prompt += `\nItem Description: ${result.item_description || 'Not specified'}`;
                prompt += `\nStatus: ${result.status}`;
                prompt += `\nCreated: ${result.created_at}`;
            } else if (result.total !== undefined) {
                // Statistics result
                prompt += `\nTotal Projects: ${result.total}`;
                prompt += `\nApproved Projects: ${result.approved}`;
                prompt += `\nPending Projects: ${result.pending}`;
            } else {
                prompt += `\nData: ${JSON.stringify(result)}`;
            }
        });
        prompt += `\n--- End Database Results ---`;
    } else if (searchResults && searchResults.error) {
        prompt += `\nDATABASE ERROR: ${searchResults.error}`;
    } else {
        prompt += `\nNO RESULTS FOUND for query: "${searchResults?.searchQuery || userMessage}"`;
        prompt += `\nDatabase was searched but returned 0 results`;
    }

    prompt += `\n\nINSTRUCTIONS:
1. ONLY use the database results shown above
2. Never invent or make up project IDs, names, or any data
3. If no results were found, clearly state this and suggest alternatives
4. Reference the exact project IDs, names, and details from the database results
5. Format your response with clear structure and emojis
6. Be helpful and accurate

Respond based ONLY on the actual database information provided above!`;

    return prompt;
}
