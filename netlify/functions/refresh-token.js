// netlify/functions/refresh-token.js
const { supabase, corsHeaders } = require('./utils/supabase');

exports.handler = async (event, context) => {
  // OPTIONS 요청 처리
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }

  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: corsHeaders,
        body: JSON.stringify({ error: '지원하지 않는 HTTP 메소드입니다.' })
      };
    }

    // 요청 본문에서 리프레시 토큰 추출
    const { refresh_token } = JSON.parse(event.body);
    
    if (!refresh_token) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: '리프레시 토큰이 필요합니다.' })
      };
    }

    // Supabase 토큰 갱신
    const { data, error } = await supabase.auth.refreshSession({ refresh_token });
    
    if (error) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: '토큰 갱신 실패', details: error.message })
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: new Date(Date.now() + 3600 * 1000).toISOString() // 1시간 후 만료
        }
      })
    };
  } catch (error) {
    console.error('Token refresh error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: '서버 오류가 발생했습니다.', details: error.message })
    };
  }
};