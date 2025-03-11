// netlify/functions/stores_user_platform.js
const { createClient } = require('@supabase/supabase-js');

// CORS 헤더 설정
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event, context) => {
  // OPTIONS 요청 처리 (CORS preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders
    };
  }

  // GET 요청이 아닌 경우 거부
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({
        error: '지원하지 않는 HTTP 메소드입니다.',
        message: 'GET 요청만 허용됩니다.'
      })
    };
  }

  try {
    // 환경 변수 유효성 확인 및 로깅
    console.log('환경 변수 확인:');
    console.log('- SUPABASE_URL:', process.env.SUPABASE_URL ? '설정됨' : '없음');
    console.log('- SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? '설정됨' : '없음');

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      console.error('환경 변수 누락: SUPABASE_URL 또는 SUPABASE_SERVICE_KEY가 설정되지 않았습니다');
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: '서버 구성 오류', 
          message: '데이터베이스 연결 정보가 올바르게 설정되지 않았습니다.'
        })
      };
    }

    // Supabase 클라이언트 생성 (연결 옵션 최적화)
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      global: {
        headers: { 'x-application-name': 'netlify-function' },
      },
      db: {
        schema: 'public'
      },
      realtime: {
        enabled: false
      }
    });

    // Supabase 연결 테스트
    try {
      console.log('Supabase 연결 테스트 시작');
      const testResult = await supabase.from('users').select('count').limit(1);
      
      if (testResult.error) {
        console.error('Supabase 연결 오류:', testResult.error);
        return {
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({ 
            error: 'Supabase 연결에 실패했습니다.', 
            message: '데이터베이스 연결 오류가 발생했습니다.',
            details: testResult.error.message 
          })
        };
      }
      
      console.log('Supabase 연결 성공');
    } catch (connectionError) {
      console.error('Supabase 연결 예외:', connectionError);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Supabase 연결 중 예외가 발생했습니다.',
          message: '서버 연결에 문제가 있습니다.',
          details: connectionError.message 
        })
      };
    }

    // 인증 헤더 확인 (선택적)
    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    let userId = null;
    let userRole = '일반사용자';

    // 토큰이 있으면 사용자 정보 검증
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.replace('Bearer ', '');
        
        // JWT 토큰 검증
        const { data, error } = await supabase.auth.getUser(token);
        
        if (!error && data.user) {
          userId = data.user.id;
          console.log('인증된 사용자:', userId);
          
          // 사용자 역할 조회
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('role')
            .eq('id', userId)
            .single();
            
          if (!userError && userData) {
            userRole = userData.role || '일반사용자';
            console.log('사용자 역할:', userRole);
          }
        }
      } catch (authError) {
        console.log('인증 처리 중 오류 (무시 계속 진행):', authError.message);
        // 인증 오류는 무시하고 계속 진행 (기본 권한으로)
      }
    }

    // 매장 데이터 조회
    let query = supabase
      .from('platform_reply_rules')
      .select('store_code, store_name, platform, platform_code')
      .order('store_code');

    // 권한에 따른 쿼리 제한 (옵션)
    if (userRole !== '운영자' && userRole !== '관리자' && userId) {
      try {
        // 사용자에게 할당된 매장만 조회
        const { data: assignments } = await supabase
          .from('store_assignments')
          .select('store_code')
          .eq('user_id', userId);
          
        if (assignments && assignments.length > 0) {
          const storeCodes = assignments.map(a => a.store_code);
          query = query.in('store_code', storeCodes);
        } else {
          // 할당된 매장이 없는 경우 빈 배열 반환
          return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify([])
          };
        }
      } catch (assignmentError) {
        console.error('매장 할당 조회 오류:', assignmentError);
        // 할당 오류 시 계속 진행 (모든 매장 조회)
      }
    }

    // 최종 쿼리 실행
    console.log('매장 정보 쿼리 실행');
    const { data, error } = await query;

    if (error) {
      console.error('매장 정보 쿼리 오류:', error);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: '매장 정보 조회 실패',
          message: '데이터베이스 쿼리 중 오류가 발생했습니다.',
          details: error.message
        })
      };
    }

    // 매장 데이터 중복 제거 및 정리
    const uniqueStores = {};
    (data || []).forEach(store => {
      const key = `${store.store_code}-${store.platform || ''}-${store.platform_code || ''}`;
      if (!uniqueStores[key]) {
        uniqueStores[key] = {
          store_code: store.store_code,
          store_name: store.store_name || store.store_code,
          platform: store.platform || '배달의민족',
          platform_code: store.platform_code || ''
        };
      }
    });
    
    const stores = Object.values(uniqueStores);
    console.log(`${stores.length}개 매장 조회됨`);

    // 응답 반환
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(stores)
    };
  } catch (error) {
    // 모든 예외 처리
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: '서버 오류',
        message: '요청을 처리하는 중 예기치 않은 오류가 발생했습니다.',
        details: error.message
      })
    };
  }
};