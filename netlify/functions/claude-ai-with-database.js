// netlify/functions/claude-ai-comprehensive-database.js
// Comprehensive Claude AI function with intelligent multi-table database search

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
        console.log('🧠 Comprehensive Claude AI with full database access called:', new Date().toISOString());
        
        const requestData = JSON.parse(event.body);
        const { prompt, maxTokens = 2000, userMessage } = requestData;

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
                    error: 'Supabase configuration missing', 
                    success: false, 
                    fallback: true 
                }),
            };
        }

        // Initialize Supabase client
        const supabase = createClient(supabaseUrl, supabaseKey);
        console.log('✅ Supabase client initialized');

        // Extract user message and analyze it intelligently
        const actualUserMessage = userMessage || extractUserMessage(prompt);
        
        console.log('🔍 Analyzing user query:', actualUserMessage);

        // Intelligent query analysis and database search across ALL relevant tables
        const searchResults = await performComprehensiveSearch(supabase, actualUserMessage);
        console.log('📊 Comprehensive search results:', searchResults);

        // Build enhanced prompt with ALL relevant database results
        const enhancedPrompt = buildComprehensivePrompt(actualUserMessage, searchResults);
        
        console.log('🧠 Calling Claude with comprehensive database-enhanced prompt...');

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
                comprehensiveSearch: true,
                tablesSearched: searchResults.tablesSearched || [],
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

// Comprehensive database search function that searches ALL relevant tables
async function performComprehensiveSearch(supabase, userMessage) {
    console.log(`🔍 Performing comprehensive search for: "${userMessage}"`);
    
    // Intelligent query analysis
    const queryAnalysis = analyzeUserQuery(userMessage);
    console.log('📊 Query analysis:', queryAnalysis);

    const results = {
        tablesSearched: [],
        totalResults: 0,
        searchQueries: []
    };

    try {
        // Search based on query type and keywords
        if (queryAnalysis.searchProjects) {
            console.log('🏗️ Searching classification_projects...');
            const projectResults = await searchProjects(supabase, queryAnalysis);
            if (projectResults.results.length > 0) {
                results.projects = projectResults;
                results.tablesSearched.push('classification_projects');
                results.totalResults += projectResults.results.length;
            }
        }

        if (queryAnalysis.searchItemCodes) {
            console.log('🔧 Searching item_code_workflow...');
            const itemCodeResults = await searchItemCodes(supabase, queryAnalysis);
            if (itemCodeResults.results.length > 0) {
                results.itemCodes = itemCodeResults;
                results.tablesSearched.push('item_code_workflow');
                results.totalResults += itemCodeResults.results.length;
            }
        }

        if (queryAnalysis.searchUsers) {
            console.log('👥 Searching users...');
            const userResults = await searchUsers(supabase, queryAnalysis);
            if (userResults.results.length > 0) {
                results.users = userResults;
                results.tablesSearched.push('users');
                results.totalResults += userResults.results.length;
            }
        }

        if (queryAnalysis.searchRequests) {
            console.log('📋 Searching requests...');
            const requestResults = await searchRequests(supabase, queryAnalysis);
            if (requestResults.results.length > 0) {
                results.requests = requestResults;
                results.tablesSearched.push('standard_value_requests');
                results.totalResults += requestResults.results.length;
            }
        }

        if (queryAnalysis.searchManufacturers) {
            console.log('🏭 Searching manufacturers...');
            const manufacturerResults = await searchManufacturers(supabase, queryAnalysis);
            if (manufacturerResults.results.length > 0) {
                results.manufacturers = manufacturerResults;
                results.tablesSearched.push('project_manufacturers');
                results.totalResults += manufacturerResults.results.length;
            }
        }

        if (queryAnalysis.searchAttributes) {
            console.log('🏷️ Searching attributes...');
            const attributeResults = await searchAttributes(supabase, queryAnalysis);
            if (attributeResults.results.length > 0) {
                results.attributes = attributeResults;
                results.tablesSearched.push('project_attributes');
                results.totalResults += attributeResults.results.length;
            }
        }

        if (queryAnalysis.searchReviews || queryAnalysis.searchStatus) {
            console.log('✅ Searching reviews and status...');
            const reviewResults = await searchReviews(supabase, queryAnalysis);
            if (reviewResults.results.length > 0) {
                results.reviews = reviewResults;
                results.tablesSearched.push('review_logs');
                results.totalResults += reviewResults.results.length;
            }
        }

        // If no specific search was triggered, do a broad search
        if (results.totalResults === 0) {
            console.log('🌐 No specific matches, performing broad search...');
            const broadResults = await performBroadSearch(supabase, queryAnalysis);
            Object.assign(results, broadResults);
        }

        results.searchQuery = userMessage;
        results.queryAnalysis = queryAnalysis;
        
        console.log(`✅ Comprehensive search completed: ${results.totalResults} total results across ${results.tablesSearched.length} tables`);
        
        return results;

    } catch (error) {
        console.error('Comprehensive search error:', error);
        return {
            error: error.message,
            searchQuery: userMessage,
            tablesSearched: [],
            totalResults: 0
        };
    }
}

// Intelligent user query analysis
function analyzeUserQuery(userMessage) {
    const lower = userMessage.toLowerCase();
    
    // Keywords for different search types
    const materialKeywords = /\b(steel|electrical|mechanical|plumbing|hvac|concrete|upvc|aluminum|copper|pvc|pipe|valve|conduit|cable|fitting|pump|motor|switch|panel|duct|beam|wire|insulation)\b/gi;
    const projectKeywords = /\b(project|classification|division|section|csi|category)\b/gi;
    const itemCodeKeywords = /\b(item code|code|part|component|material|equipment|product)\b/gi;
    const userKeywords = /\b(user|reviewer|admin|created by|approved by|person|staff|team)\b/gi;
    const statusKeywords = /\b(pending|approved|rejected|status|review|workflow|submitted|draft)\b/gi;
    const manufacturerKeywords = /\b(manufacturer|supplier|vendor|brand|company|made by)\b/gi;
    const attributeKeywords = /\b(attribute|property|specification|feature|characteristic)\b/gi;
    const requestKeywords = /\b(request|submission|application)\b/gi;
    const priceKeywords = /\b(price|cost|expensive|cheap|budget|currency)\b/gi;
    const dateKeywords = /\b(today|yesterday|week|month|year|recent|latest|created|updated)\b/gi;

    // Extract materials mentioned
    const materials = [...new Set((lower.match(materialKeywords) || []).map(m => m.toLowerCase()))];
    
    // Extract CSI codes if mentioned
    const csiCodes = lower.match(/\b\d{2}(\s*\d{2}(\s*\d{2})?)?\b/g) || [];
    
    // Extract specific search terms
    const searchTerms = lower.split(/[^\w\s]/).filter(term => 
        term.length > 2 && 
        !['the', 'and', 'for', 'are', 'with', 'any', 'all', 'can', 'you', 'show', 'find', 'get', 'list'].includes(term)
    );

    return {
        originalQuery: userMessage,
        materials: materials,
        csiCodes: csiCodes,
        searchTerms: searchTerms,
        
        // Determine what to search based on query
        searchProjects: projectKeywords.test(lower) || csiCodes.length > 0 || materials.length > 0,
        searchItemCodes: itemCodeKeywords.test(lower) || materials.length > 0 || lower.includes('item') || lower.includes('code'),
        searchUsers: userKeywords.test(lower),
        searchRequests: requestKeywords.test(lower) || statusKeywords.test(lower),
        searchManufacturers: manufacturerKeywords.test(lower),
        searchAttributes: attributeKeywords.test(lower),
        searchReviews: statusKeywords.test(lower) || lower.includes('review'),
        searchStatus: statusKeywords.test(lower),
        
        // Query modifiers
        includePrice: priceKeywords.test(lower),
        includeDate: dateKeywords.test(lower),
        includeStatus: true, // Always include status for context
        
        // Intent analysis
        intent: determineIntent(lower),
        complexity: searchTerms.length > 3 ? 'complex' : 'simple'
    };
}

// Determine user intent
function determineIntent(lower) {
    if (lower.match(/\b(show|list|find|get|search)\b/)) return 'search';
    if (lower.match(/\b(how many|count|total|number)\b/)) return 'count';
    if (lower.match(/\b(who|created|approved|reviewed)\b/)) return 'who';
    if (lower.match(/\b(when|date|time|recent)\b/)) return 'when';
    if (lower.match(/\b(why|reason|comment)\b/)) return 'why';
    if (lower.match(/\b(compare|versus|difference)\b/)) return 'compare';
    if (lower.match(/\b(status|pending|approved|rejected)\b/)) return 'status';
    return 'general';
}

// Search functions for each table

async function searchProjects(supabase, analysis) {
    let query = supabase
        .from('classification_projects')
        .select(`
            id, project_name, division_code, division_description,
            section_code, section_description, detailed_section_code,
            detailed_section_description, item_code, item_description,
            status, created_at, created_by,
            users!created_by(username)
        `)
        .limit(10)
        .order('created_at', { ascending: false });

    // Apply filters based on analysis
    if (analysis.materials.length > 0) {
        const materialFilter = analysis.materials.map(m => 
            `project_name.ilike.%${m}%,division_description.ilike.%${m}%,section_description.ilike.%${m}%,detailed_section_description.ilike.%${m}%,item_description.ilike.%${m}%`
        ).join(',');
        query = query.or(materialFilter);
    } else if (analysis.searchTerms.length > 0) {
        const termFilter = analysis.searchTerms.slice(0, 3).map(term =>
            `project_name.ilike.%${term}%,division_description.ilike.%${term}%,section_description.ilike.%${term}%,item_description.ilike.%${term}%`
        ).join(',');
        query = query.or(termFilter);
    }

    if (analysis.csiCodes.length > 0) {
        query = query.in('division_code', analysis.csiCodes);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Projects search failed: ${error.message}`);

    return {
        results: data || [],
        searchType: 'projects',
        searchTerms: analysis.materials.concat(analysis.searchTerms),
        total: data ? data.length : 0
    };
}

async function searchItemCodes(supabase, analysis) {
    let query = supabase
        .from('item_code_workflow')
        .select(`
            id, item_code, description1, description2, unit_price,
            currency_code, manufacturer, uom, country_of_origin,
            model_number, status, erp_integrated, created_at,
            project_id, classification_projects!project_id(project_name),
            users!created_by(username)
        `)
        .limit(15)
        .order('created_at', { ascending: false });

    // Apply filters
    if (analysis.materials.length > 0) {
        const materialFilter = analysis.materials.map(m =>
            `item_code.ilike.%${m}%,description1.ilike.%${m}%,description2.ilike.%${m}%,manufacturer.ilike.%${m}%`
        ).join(',');
        query = query.or(materialFilter);
    } else if (analysis.searchTerms.length > 0) {
        const termFilter = analysis.searchTerms.slice(0, 3).map(term =>
            `item_code.ilike.%${term}%,description1.ilike.%${term}%,description2.ilike.%${term}%,manufacturer.ilike.%${term}%`
        ).join(',');
        query = query.or(termFilter);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Item codes search failed: ${error.message}`);

    return {
        results: data || [],
        searchType: 'itemCodes',
        searchTerms: analysis.materials.concat(analysis.searchTerms),
        total: data ? data.length : 0
    };
}

async function searchUsers(supabase, analysis) {
    let query = supabase
        .from('users')
        .select(`
            id, username, email, role, status, created_at
        `)
        .limit(10);

    if (analysis.searchTerms.length > 0) {
        const termFilter = analysis.searchTerms.map(term =>
            `username.ilike.%${term}%,email.ilike.%${term}%,role.ilike.%${term}%`
        ).join(',');
        query = query.or(termFilter);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Users search failed: ${error.message}`);

    return {
        results: data || [],
        searchType: 'users',
        total: data ? data.length : 0
    };
}

async function searchRequests(supabase, analysis) {
    let query = supabase
        .from('standard_value_requests')
        .select(`
            id, attribute_name, new_value, reason, status,
            created_at, users!created_by(username),
            classification_projects!project_id(project_name)
        `)
        .limit(10)
        .order('created_at', { ascending: false });

    if (analysis.searchTerms.length > 0) {
        const termFilter = analysis.searchTerms.map(term =>
            `attribute_name.ilike.%${term}%,new_value.ilike.%${term}%,reason.ilike.%${term}%`
        ).join(',');
        query = query.or(termFilter);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Requests search failed: ${error.message}`);

    return {
        results: data || [],
        searchType: 'requests',
        total: data ? data.length : 0
    };
}

async function searchManufacturers(supabase, analysis) {
    let query = supabase
        .from('project_manufacturers')
        .select(`
            id, manufacturer_name, created_at,
            classification_projects!project_id(project_name),
            users!created_by(username)
        `)
        .limit(10);

    if (analysis.materials.length > 0 || analysis.searchTerms.length > 0) {
        const terms = analysis.materials.concat(analysis.searchTerms);
        const termFilter = terms.map(term =>
            `manufacturer_name.ilike.%${term}%`
        ).join(',');
        query = query.or(termFilter);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Manufacturers search failed: ${error.message}`);

    return {
        results: data || [],
        searchType: 'manufacturers',
        total: data ? data.length : 0
    };
}

async function searchAttributes(supabase, analysis) {
    let query = supabase
        .from('project_attributes')
        .select(`
            id, attribute_name, standard_values, is_mandatory,
            created_at, classification_projects!project_id(project_name)
        `)
        .limit(10);

    if (analysis.searchTerms.length > 0) {
        const termFilter = analysis.searchTerms.map(term =>
            `attribute_name.ilike.%${term}%`
        ).join(',');
        query = query.or(termFilter);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Attributes search failed: ${error.message}`);

    return {
        results: data || [],
        searchType: 'attributes',
        total: data ? data.length : 0
    };
}

async function searchReviews(supabase, analysis) {
    let query = supabase
        .from('review_logs')
        .select(`
            id, action, comments, created_at,
            classification_projects!project_id(project_name),
            users!reviewer_id(username)
        `)
        .limit(10)
        .order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) throw new Error(`Reviews search failed: ${error.message}`);

    return {
        results: data || [],
        searchType: 'reviews',
        total: data ? data.length : 0
    };
}

// Perform broad search when no specific matches
async function performBroadSearch(supabase, analysis) {
    const results = {
        tablesSearched: [],
        totalResults: 0
    };

    // Search top tables with basic queries
    try {
        const projectResults = await searchProjects(supabase, analysis);
        const itemResults = await searchItemCodes(supabase, analysis);
        
        if (projectResults.results.length > 0) {
            results.projects = projectResults;
            results.tablesSearched.push('classification_projects');
            results.totalResults += projectResults.results.length;
        }
        
        if (itemResults.results.length > 0) {
            results.itemCodes = itemResults;
            results.tablesSearched.push('item_code_workflow');
            results.totalResults += itemResults.results.length;
        }
    } catch (error) {
        console.error('Broad search error:', error);
    }

    return results;
}

// Build comprehensive prompt with all database results
function buildComprehensivePrompt(userMessage, searchResults) {
    let prompt = `You are an intelligent AI assistant for a comprehensive Code Generation Portal with access to a complete database.

USER QUERY: "${userMessage}"

COMPREHENSIVE DATABASE SEARCH RESULTS:
Tables Searched: ${searchResults.tablesSearched.join(', ')}
Total Results Found: ${searchResults.totalResults}
Query Analysis: ${JSON.stringify(searchResults.queryAnalysis, null, 2)}`;

    if (searchResults.totalResults === 0) {
        prompt += `

NO RESULTS FOUND in any database table.
The database was searched across multiple relevant tables but returned 0 results.`;
    } else {
        // Add results from each table
        if (searchResults.projects) {
            prompt += `

=== PROJECTS (classification_projects) ===
Found: ${searchResults.projects.total} projects
`;
            searchResults.projects.results.forEach((project, index) => {
                prompt += `
Project ${index + 1}:
- Project ID: ${project.id}
- Project Name: ${project.project_name}
- Division: ${project.division_code} - ${project.division_description}
- Section: ${project.section_code} - ${project.section_description}
- Detailed Section: ${project.detailed_section_code} - ${project.detailed_section_description}
- Item Code: ${project.item_code}
- Item Description: ${project.item_description}
- Status: ${project.status}
- Created: ${project.created_at}
- Created By: ${project.users?.username || 'Unknown'}`;
            });
        }

        if (searchResults.itemCodes) {
            prompt += `

=== ITEM CODES (item_code_workflow) ===
Found: ${searchResults.itemCodes.total} item codes
`;
            searchResults.itemCodes.results.forEach((item, index) => {
                prompt += `
Item Code ${index + 1}:
- Item Code: ${item.item_code}
- Description 1: ${item.description1}
- Description 2: ${item.description2 || 'N/A'}
- Price: ${item.unit_price ? item.unit_price + ' ' + item.currency_code : 'Not set'}
- Manufacturer: ${item.manufacturer || 'Not specified'}
- UOM: ${item.uom || 'Not specified'}
- Status: ${item.status}
- ERP Integrated: ${item.erp_integrated ? 'Yes' : 'No'}
- Project: ${item.classification_projects?.project_name || 'Unknown'}
- Created By: ${item.users?.username || 'Unknown'}
- Created: ${item.created_at}`;
            });
        }

        if (searchResults.users) {
            prompt += `

=== USERS ===
Found: ${searchResults.users.total} users
`;
            searchResults.users.results.forEach((user, index) => {
                prompt += `
User ${index + 1}:
- Username: ${user.username}
- Email: ${user.email}
- Role: ${user.role}
- Status: ${user.status}
- Created: ${user.created_at}`;
            });
        }

        if (searchResults.requests) {
            prompt += `

=== STANDARD VALUE REQUESTS ===
Found: ${searchResults.requests.total} requests
`;
            searchResults.requests.results.forEach((request, index) => {
                prompt += `
Request ${index + 1}:
- Attribute: ${request.attribute_name}
- New Value: ${request.new_value}
- Reason: ${request.reason || 'Not specified'}
- Status: ${request.status}
- Project: ${request.classification_projects?.project_name || 'Unknown'}
- Created By: ${request.users?.username || 'Unknown'}
- Created: ${request.created_at}`;
            });
        }

        if (searchResults.manufacturers) {
            prompt += `

=== MANUFACTURERS ===
Found: ${searchResults.manufacturers.total} manufacturers
`;
            searchResults.manufacturers.results.forEach((mfg, index) => {
                prompt += `
Manufacturer ${index + 1}:
- Name: ${mfg.manufacturer_name}
- Project: ${mfg.classification_projects?.project_name || 'Unknown'}
- Added By: ${mfg.users?.username || 'Unknown'}
- Added: ${mfg.created_at}`;
            });
        }

        if (searchResults.attributes) {
            prompt += `

=== PROJECT ATTRIBUTES ===
Found: ${searchResults.attributes.total} attributes
`;
            searchResults.attributes.results.forEach((attr, index) => {
                prompt += `
Attribute ${index + 1}:
- Name: ${attr.attribute_name}
- Mandatory: ${attr.is_mandatory ? 'Yes' : 'No'}
- Standard Values: ${JSON.stringify(attr.standard_values)}
- Project: ${attr.classification_projects?.project_name || 'Unknown'}
- Created: ${attr.created_at}`;
            });
        }

        if (searchResults.reviews) {
            prompt += `

=== REVIEW LOGS ===
Found: ${searchResults.reviews.total} review entries
`;
            searchResults.reviews.results.forEach((review, index) => {
                prompt += `
Review ${index + 1}:
- Action: ${review.action}
- Comments: ${review.comments || 'No comments'}
- Project: ${review.classification_projects?.project_name || 'Unknown'}
- Reviewer: ${review.users?.username || 'Unknown'}
- Date: ${review.created_at}`;
            });
        }
    }

    prompt += `

RESPONSE REQUIREMENTS:
1. ONLY use the database results shown above
2. Never invent or make up any data not present in the search results
3. Reference specific IDs, names, and details from the actual database results
4. If no results were found, clearly state this and suggest alternative searches
5. Provide comprehensive analysis across all relevant data found
6. Format response with clear structure using headers and organized sections
7. Be intelligent about connecting related information across different tables
8. Provide insights and recommendations based on the actual data patterns

Respond with a comprehensive, intelligent analysis based ONLY on the actual database information provided above!`;

    return prompt;
}

// Utility function to extract user message from prompt
function extractUserMessage(prompt) {
    const match = prompt.match(/USER MESSAGE: "([^"]+)"/);
    return match ? match[1] : prompt;
}
