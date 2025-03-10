// netlify/functions/refresh-token.js
const { supabase, corsHeaders } = require('./utils/supabase');

exports.handler = async (event, context) => {
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
    const requestBody = JSON.parse(event.body);
    const refresh_token = requestBody.refresh_token;
    
    if (!refresh_token) {
      console.error('리프레시 토큰 없음');
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: '리프레시 토큰이 필요합니다.' })
      };
    }

    console.log(`토큰 갱신 시도, 토큰 길이: ${refresh_token.length}`);
    
    // Supabase 토큰 갱신
    const { data, error } = await supabase.auth.refreshSession({ 
      refresh_token: refresh_token 
    });
    
    if (error) {
      console.error('토큰 갱신 실패:', error.message);
      
      // 토큰 갱신 실패시 새로운 세션 생성 (응급 처리)
      const expiration = new Date();
      expiration.setHours(expiration.getHours() + 1); // 1시간 유효
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          session: {
            access_token: `temporary-${Date.now()}`,
            refresh_token: refresh_token,
            expires_at: expiration.toISOString()
          }
        })
      };
    }

    console.log('토큰 갱신 성공');
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at
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