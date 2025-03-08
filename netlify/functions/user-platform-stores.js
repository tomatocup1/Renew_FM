// netlify/functions/stores-user-platform.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  // CORS 헤더 설정
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  // OPTIONS 요청 처리 (CORS preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers
    };
  }

  try {
    // 환경 변수 로깅 (디버깅용)
    console.log('SUPABASE_URL exists:', !!process.env.SUPABASE_URL);
    console.log('SUPABASE_SERVICE_KEY exists:', !!process.env.SUPABASE_SERVICE_KEY);
    
    // Supabase URL과 키가 없으면 오류 반환
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      console.error('Missing Supabase environment variables');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: '서버 설정 오류: Supabase 환경 변수가 없습니다',
          envVars: {
            url_exists: !!process.env.SUPABASE_URL,
            key_exists: !!process.env.SUPABASE_SERVICE_KEY 
          }
        })
      };
    }

    // Supabase 클라이언트 초기화
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 인증 토큰 추출
    const authHeader = event.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: '인증이 필요합니다.' })
      };
    }

    // 사용자 정보 확인
    let userId = null;
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      
      if (userError) {
        console.error('User auth error:', userError);
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: '인증 확인 실패: ' + userError.message })
        };
      }
      
      if (!user) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: '유효하지 않은 사용자 인증 정보' })
        };
      }
      
      userId = user.id;
    } catch (authError) {
      console.error('Auth process error:', authError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: '인증 처리 오류: ' + authError.message })
      };
    }

    // 사용자-매장 할당 데이터 조회
    try {
      const { data: assignments, error: assignmentError } = await supabase
        .from('store_assignments')
        .select('store_code, role_type')
        .eq('user_id', userId);
      
      if (assignmentError) {
        console.error('Assignment query error:', assignmentError);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: '매장 할당 조회 실패: ' + assignmentError.message })
        };
      }

      // 할당된 매장이 없는 경우
      if (!assignments || assignments.length === 0) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify([])
        };
      }

      // 매장 코드 목록 추출
      const storeCodes = assignments.map(a => a.store_code);

      // 플랫폼 규칙에서 매장 이름 등 추가 정보 가져오기
      const { data: platformRules, error: rulesError } = await supabase
        .from('platform_reply_rules')
        .select('store_code, platform, platform_code, store_name')
        .in('store_code', storeCodes);
      
      if (rulesError) {
        console.error('Platform rules query error:', rulesError);
        // 오류가 있더라도 진행
      }

      // 매장 정보 조회
      const { data: stores, error: storeError } = await supabase
        .from('store_info')
        .select('*')
        .in('store_code', storeCodes);
      
      if (storeError) {
        console.error('Store info query error:', storeError);
        // 매장 정보가 없어도 계속 진행
      }

      // 결과 데이터 구성
      let result = [];
      if (platformRules?.length) {
        result = platformRules.map(rule => ({
          store_code: rule.store_code,
          platform: rule.platform || '배달의민족',
          platform_code: rule.platform_code || '',
          store_name: rule.store_name || rule.store_code
        }));
      } else if (stores?.length) {
        result = stores.map(store => ({
          store_code: store.store_code,
          platform: '배달의민족',
          platform_code: '',
          store_name: store.store_code
        }));
      } else {
        result = assignments.map(assignment => ({
          store_code: assignment.store_code,
          platform: '배달의민족',
          platform_code: '',
          store_name: assignment.store_code
        }));
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(result)
      };
    } catch (queryError) {
      console.error('Database query error:', queryError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: '데이터베이스 쿼리 오류: ' + queryError.message })
      };
    }
  } catch (error) {
    console.error('General function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: '서버 오류가 발생했습니다', 
        details: error.message,
        stack: error.stack
      })
    };
  }
};