// netlify/functions/auth-user.js
const { createClient } = require('@supabase/supabase-js');

// Supabase 클라이언트 초기화
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// CORS 헤더 설정
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

  // GET 요청이 아닌 경우 오류 반환
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: '잘못된 요청 메서드입니다.' })
    };
  }

  try {
    // 인증 토큰 추출
    const authHeader = event.headers.authorization || '';
    
    if (!authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: '인증이 필요합니다.' })
      };
    }
    
    const token = authHeader.replace('Bearer ', '');
    
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

    // Supabase를 사용한 사용자 정보 조회
    try {
      // JWT 토큰으로 사용자 정보 가져오기
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);

      if (userError || !user) {
        console.error('User info error:', userError);
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: '유효하지 않은 인증 정보입니다.' })
        };
      }

      // 추가 사용자 정보 조회 (role 등)
      const { data: userData, error: getUserError } = await supabase
        .from('users')
        .select('role, name')
        .eq('id', user.id)
        .single();

      if (getUserError) {
        console.error('User data fetch error:', getUserError);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: '사용자 정보 조회 실패', details: getUserError.message })
        };
      }

      // 응답 데이터 구성
      const responseData = {
        user: {
          id: user.id,
          email: user.email,
          role: userData?.role || 'user',
          name: userData?.name || user.email.split('@')[0]
        }
      };

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(responseData)
      };
    } catch (authError) {
      console.error('Auth operation error:', authError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: '사용자 정보 조회 중 오류가 발생했습니다.' })
      };
    }
  } catch (error) {
    console.error('Auth user function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: '서버 오류가 발생했습니다.' })
    };
  }
};