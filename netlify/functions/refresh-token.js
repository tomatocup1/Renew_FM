// netlify/functions/refresh-token.js
const { createClient } = require('@supabase/supabase-js');

// Supabase 클라이언트 초기화
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// CORS 헤더 설정
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event, context) => {
  // OPTIONS 요청 처리 (CORS preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers
    };
  }

  // POST 요청이 아닌 경우 오류 반환
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: '잘못된 요청 메서드입니다.' })
    };
  }

  try {
    // 요청 바디 파싱
    let body;
    try {
      body = JSON.parse(event.body);
    } catch (parseError) {
      console.error('Request body parse error:', parseError);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '잘못된 요청 형식입니다.' })
      };
    }

    const { refresh_token } = body;

    if (!refresh_token) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'refresh_token이 필요합니다.' })
      };
    }

    // 테스트 토큰 확인 (개발용)
    if (refresh_token.startsWith('test-refresh-')) {
      console.log('Test refresh token detected, returning test session');
      
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2시간 후 만료
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          session: {
            access_token: `test-token-${Date.now()}`,
            refresh_token: `test-refresh-${Date.now()}`,
            expires_at: expiresAt.toISOString()
          }
        })
      };
    }

    // Supabase를 사용한 토큰 새로고침
    try {
      const { data, error } = await supabase.auth.refreshSession({
        refresh_token
      });

      if (error) {
        console.error('Token refresh error:', error);
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: '토큰 갱신에 실패했습니다.' })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ session: data.session })
      };
    } catch (authError) {
      console.error('Auth operation error:', authError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: '토큰 갱신 중 오류가 발생했습니다.' })
      };
    }
  } catch (error) {
    console.error('Refresh token function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: '서버 오류가 발생했습니다.' })
    };
  }
};