// netlify/functions/env-check.js
exports.handler = async (event, context) => {
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    };
  
    try {
      const envVars = {
        supabase_url: process.env.SUPABASE_URL ? '설정됨' : '없음',
        supabase_key: process.env.SUPABASE_SERVICE_KEY ? '설정됨' : '없음',
        supabase_anon_key: process.env.SUPABASE_KEY ? '설정됨' : '없음'
      };
  
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: 'Environment variables check',
          env_vars: envVars,
          node_env: process.env.NODE_ENV
        })
      };
    } catch (error) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Error checking environment variables',
          message: error.message
        })
      };
    }
  };