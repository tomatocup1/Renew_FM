// netlify/functions/stores-user-platform.js
const { supabase, corsHeaders } = require('./utils/supabase');

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }

  try {
    // 인증 헤더 추출
    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    console.log('Authorization header:', authHeader.substring(0, 20) + '...');
    
    // Supabase 연결 테스트
    try {
      console.log('Supabase 연결 테스트 시작');
      console.log('Supabase URL:', process.env.SUPABASE_URL ? '설정됨' : '없음');
      console.log('Supabase Key:', process.env.SUPABASE_SERVICE_KEY ? '설정됨' : '없음');
      
      const testResult = await supabase.from('users').select('count').limit(1);
      console.log('Supabase 연결 테스트 결과:', testResult.error ? '실패' : '성공');
      if (testResult.error) {
        console.error('Supabase 연결 오류:', testResult.error.message);
        return {
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({ 
            error: 'Supabase 연결에 실패했습니다.', 
            details: testResult.error.message 
          })
        };
      }
    } catch (connectionError) {
      console.error('Supabase 연결 테스트 예외:', connectionError.message);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Supabase 연결 테스트 중 오류가 발생했습니다.', 
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
        body: JSON.stringify({ error: '인증이 필요합니다.' })
      };
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    // 사용자 인증 확인
    let userId = null;
    try {
      const { data, error } = await supabase.auth.getUser(token);
      
      if (error || !data.user) {
        console.log('토큰 검증 실패');
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ error: '유효하지 않은 인증 정보입니다.' })
        };
      }
      
      userId = data.user.id;
      console.log('인증된 사용자:', userId);
    } catch (authError) {
      console.log('인증 프로세스 실패:', authError.message);
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: '인증 처리 중 오류가 발생했습니다.' })
      };
    }
    
    // Supabase에서 사용자 역할 조회
    let userRole = '일반사용자';
    try {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();
      
      if (userError) {
        console.log('사용자 역할 조회 실패:', userError.message);
        return {
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({ error: '사용자 정보를 조회할 수 없습니다.' })
        };
      }
      
      userRole = userData.role;
      console.log('사용자 역할:', userRole);
    } catch (roleError) {
      console.log('역할 조회 중 오류:', roleError.message);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: '사용자 역할 조회 중 오류가 발생했습니다.' })
      };
    }
    
    // 매장 데이터 조회
    let stores = [];
    
    try {
      if (userRole === '운영자' || userRole === '관리자') {
        console.log('관리자 권한으로 전체 매장 조회');
        const { data, error } = await supabase
          .from('platform_reply_rules')
          .select('store_code, store_name, platform, platform_code')
          .order('store_code')
          .order('platform');
        
        if (error) {
          console.log('매장 조회 실패:', error.message);
          return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: '매장 데이터 조회 중 오류가 발생했습니다.' })
          };
        }
        
        stores = data || [];
        console.log(`${stores.length}개 매장 조회됨`);
      } else {
        console.log('일반 사용자 권한으로 할당된 매장만 조회');
        const { data: assignments, error: assignError } = await supabase
          .from('store_assignments')
          .select('store_code')
          .eq('user_id', userId);
        
        if (assignError) {
          console.log('매장 할당 조회 실패:', assignError.message);
          return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: '매장 할당 정보 조회 중 오류가 발생했습니다.' })
          };
        }
        
        if (!assignments || assignments.length === 0) {
          console.log('할당된 매장 없음');
          return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify([])
          };
        }
        
        const storeCodes = assignments.map(a => a.store_code);
        console.log('할당된 매장 코드:', storeCodes);
        
        const { data, error } = await supabase
          .from('platform_reply_rules')
          .select('store_code, store_name, platform, platform_code')
          .in('store_code', storeCodes)
          .order('store_code')
          .order('platform');
        
        if (error) {
          console.log('매장 상세 조회 실패:', error.message);
          return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: '매장 정보 조회 중 오류가 발생했습니다.' })
          };
        }
        
        stores = data || [];
        console.log(`${stores.length}개 매장 조회됨`);
      }
    } catch (storeError) {
      console.log('매장 조회 중 오류:', storeError.message);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: '매장 데이터 조회 중 오류가 발생했습니다.' })
      };
    }
    
    // 매장 데이터가 없는 경우
    if (stores.length === 0) {
      console.log('매장 데이터 없음');
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: '매장 데이터가 없습니다.', 
          message: '매장 데이터가 없습니다. 관리자에게 문의하세요.' 
        })
      };
    }
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(stores)
    };
    
  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: '서버 오류가 발생했습니다.', details: error.message })
    };
  }
};