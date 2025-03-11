// netlify/functions/stores_user_platform.js
const { createClient } = require('@supabase/supabase-js');

// Supabase 클라이언트 초기화
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

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
    // 인증 헤더 추출 및 로깅
    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    console.log('Authorization header:', authHeader ? `${authHeader.substring(0, 15)}...` : '없음');
    
    // 환경 변수 로깅
    console.log('환경 변수 확인:');
    console.log('- SUPABASE_URL:', process.env.SUPABASE_URL ? '설정됨' : '없음');
    console.log('- SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? '설정됨' : '없음');
    
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
            message: '데이터베이스 연결 오류가 발생했습니다. 관리자에게 문의하세요.',
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
          message: '서버 연결에 문제가 있습니다. 관리자에게 문의하세요.',
          details: connectionError.message 
        })
      };
    }
    
    // 토큰 추출 및 검증
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('유효한 인증 토큰 없음');
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: '인증이 필요합니다.',
          message: '로그인이 필요합니다.'
        })
      };
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    // 사용자 인증 확인
    let userId = null;
    try {
      console.log('JWT 토큰 검증 시도');
      const { data, error } = await supabase.auth.getUser(token);
      
      if (error || !data.user) {
        console.log('토큰 검증 실패:', error?.message);
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ 
            error: '유효하지 않은 인증 정보입니다.',
            message: '세션이 만료되었거나 유효하지 않습니다. 다시 로그인해주세요.',
            details: error?.message
          })
        };
      }
      
      userId = data.user.id;
      console.log('인증된 사용자 ID:', userId);
    } catch (authError) {
      console.error('토큰 검증 예외:', authError);
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: '인증 처리 중 오류가 발생했습니다.',
          message: '로그인 세션 확인 중 문제가 발생했습니다. 다시 로그인해주세요.',
          details: authError.message
        })
      };
    }
    
    // 사용자 정보 및 권한 조회
    let userRole = '일반사용자';
    try {
      console.log('사용자 역할 조회 시작');
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();
      
      if (userError) {
        console.error('사용자 정보 조회 실패:', userError);
        return {
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({ 
            error: '사용자 정보를 조회할 수 없습니다.',
            message: '사용자 정보 조회 중 오류가 발생했습니다. 다시 시도해주세요.',
            details: userError.message
          })
        };
      }
      
      userRole = userData?.role || '일반사용자';
      console.log('사용자 역할:', userRole);
    } catch (roleError) {
      console.error('역할 조회 예외:', roleError);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: '사용자 역할 조회 중 오류가 발생했습니다.',
          message: '권한 정보를 확인하는 중 문제가 발생했습니다. 다시 시도해주세요.',
          details: roleError.message
        })
      };
    }
    
    // 매장 데이터 조회
    let stores = [];
    
    try {
      // 관리자/운영자는 모든 매장 조회
      if (userRole === '운영자' || userRole === '관리자') {
        console.log('관리자 권한으로 전체 매장 조회');
        const { data, error } = await supabase
          .from('platform_reply_rules')
          .select('store_code, store_name, platform, platform_code')
          .order('store_code')
          .order('platform');
        
        if (error) {
          console.error('매장 조회 실패:', error);
          return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ 
              error: '매장 데이터 조회 중 오류가 발생했습니다.',
              message: '매장 정보를 불러오는데 실패했습니다. 잠시 후 다시 시도해주세요.',
              details: error.message
            })
          };
        }
        
        stores = data || [];
        console.log(`${stores.length}개 매장 조회됨`);
      } else {
        // 일반 사용자는 할당된 매장만 조회
        console.log('일반 사용자 권한으로 할당된 매장만 조회');
        const { data: assignments, error: assignError } = await supabase
          .from('store_assignments')
          .select('store_code')
          .eq('user_id', userId);
        
        if (assignError) {
          console.error('매장 할당 조회 실패:', assignError);
          return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ 
              error: '매장 할당 정보 조회 중 오류가 발생했습니다.',
              message: '사용자 매장 정보를 불러오는데 실패했습니다. 다시 시도해주세요.',
              details: assignError.message
            })
          };
        }
        
        // 할당된 매장이 없는 경우
        if (!assignments || assignments.length === 0) {
          console.log('할당된 매장 없음');
          return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify([])
          };
        }
        
        // 할당된 매장 코드 추출
        const storeCodes = assignments.map(a => a.store_code);
        console.log('할당된 매장 코드:', storeCodes);
        
        // 매장 상세 정보 조회
        const { data, error } = await supabase
          .from('platform_reply_rules')
          .select('store_code, store_name, platform, platform_code')
          .in('store_code', storeCodes)
          .order('store_code')
          .order('platform');
        
        if (error) {
          console.error('매장 상세 조회 실패:', error);
          return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ 
              error: '매장 정보 조회 중 오류가 발생했습니다.',
              message: '매장 상세 정보를 불러오는데 실패했습니다. 다시 시도해주세요.',
              details: error.message
            })
          };
        }
        
        stores = data || [];
        console.log(`${stores.length}개 매장 조회됨`);
      }
      
      // 매장 데이터 중복 제거 및 정리
      const uniqueStores = {};
      stores.forEach(store => {
        const key = `${store.store_code}-${store.platform}-${store.platform_code}`;
        if (!uniqueStores[key]) {
          uniqueStores[key] = store;
        }
      });
      
      stores = Object.values(uniqueStores);
      
      // 매장 데이터가 없는 경우
      if (stores.length === 0) {
        console.log('매장 데이터 없음');
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify([])
        };
      }
      
      // 성공 응답
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(stores)
      };
      
    } catch (storeError) {
      console.error('매장 조회 중 예외:', storeError);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: '매장 데이터 조회 중 오류가 발생했습니다.',
          message: '매장 정보를 처리하는 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
          details: storeError.message
        })
      };
    }
    
  } catch (error) {
    // 전체 함수 오류 처리
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: '서버 오류가 발생했습니다.',
        message: '요청을 처리하는 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
        details: error.message
      })
    };
  }
};