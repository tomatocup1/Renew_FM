// netlify/functions/signin.js
const { createClient } = require('@supabase/supabase-js');

// Supabase 클라이언트 초기화
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// CORS 헤더 설정
const headers = {
  'Access-Control-Allow-Origin': '*', // 모든 출처 허용
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
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

  // 디버깅 로그
  console.log('Received signin request');
  
  // GET 요청은 처리하지 않고 JSON 응답 반환
  if (event.httpMethod === 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ 
        error: 'Method not allowed', 
        message: 'This endpoint only accepts POST requests' 
      })
    };
  }

  try {
    // POST 요청이 아닌 경우 오류 반환
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: '잘못된 요청 메서드입니다.' })
      };
    }

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

    const { email, password } = body;

    if (!email || !password) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '이메일과 비밀번호를 모두 입력해주세요.' })
      };
    }

    // Supabase 로그인
    try {
      // 먼저 Supabase 연결 확인
      try {
        const connectionTest = await supabase.from('users').select('count').limit(1);
        if (connectionTest.error) {
          console.error('Supabase connection error:', connectionTest.error);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Supabase 연결에 실패했습니다. 잠시 후 다시 시도해주세요.' })
          };
        }
      } catch (connectionErr) {
        console.error('Supabase connection error:', connectionErr);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: '데이터베이스 연결에 실패했습니다. 잠시 후 다시 시도해주세요.' })
        };
      }
      
      // Supabase 로그인 시도
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        console.error('Login error:', error);
        // 로그인 실패 응답
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' })
        };
      }

      // 세션과 사용자 정보 추출
      const session = data.session;
      const user = data.user;

      // 추가 사용자 정보 조회 (role 등)
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('role, name')
        .eq('id', user.id)
        .single();

      if (userError) {
        console.error('User data fetch error:', userError);
        // 사용자 정보 조회 실패 시에도 로그인은 허용
      }

      // 응답 데이터 구성
      const responseData = {
        session,
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
        body: JSON.stringify({ 
          error: '로그인 처리 중 오류가 발생했습니다.',
          details: authError.message
        })
      };
    }
  } catch (error) {
    console.error('Signin function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: '서버 오류가 발생했습니다.', 
        detail: error.message
      })
    };
  }
};