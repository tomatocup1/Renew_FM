// netlify/functions/auth.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  };
  
  // OPTIONS 요청 처리
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }
  
  // 경로 분석
  const path = event.path.replace('/api/auth/', '');
  
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );
    
    // 로그인 처리
    if (path === 'signin' && event.httpMethod === 'POST') {
      const { email, password } = JSON.parse(event.body);
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) throw error;
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: '로그인 성공',
          session: data.session,
          user: data.user
        })
      };
    }
    
    // 소셜 로그인 URL 생성
    if (path === 'social-url' && event.httpMethod === 'GET') {
      const provider = event.queryStringParameters.provider;
      const redirectUrl = process.env.SITE_URL || 'http://localhost:8888';
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${redirectUrl}/auth-callback`
        }
      });
      
      if (error) throw error;
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ url: data.url })
      };
    }
    
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: '요청한 경로를 찾을 수 없습니다.' })
    };
    
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};