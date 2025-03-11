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

    // Supabase 연결 테스트
    try {
      const testResult = await supabase.from('users').select('count').limit(1);
      if (testResult.error) {
        console.error('Supabase 연결 테스트 실패:', testResult.error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ 
            error: 'Supabase 연결에 실패했습니다.',
            details: testResult.error.message
          })
        };
      }
    } catch (testError) {
      console.error('Supabase 연결 테스트 예외:', testError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Supabase 연결 테스트 중 오류가 발생했습니다.',
          details: testError.message
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
          body: JSON.stringify({ error: '토큰 갱신에 실패했습니다.', details: error.message })
        };
      }

      if (!data.session) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: '세션 정보를 가져오는데 실패했습니다.' })
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
        body: JSON.stringify({ error: '토큰 갱신 중 오류가 발생했습니다.', details: authError.message })
      };
    }
  } catch (error) {
    console.error('Refresh token function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: '서버 오류가 발생했습니다.', details: error.message })
    };
  }
};