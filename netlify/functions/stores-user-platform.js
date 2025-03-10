// netlify/functions/stores-user-platform.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  // CORS 헤더 설정
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  // OPTIONS 요청 처리
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  try {
    // 환경 변수 확인 및 로깅
    console.log('SUPABASE_URL 환경 변수 존재:', !!process.env.SUPABASE_URL);
    console.log('SUPABASE_KEY 환경 변수 존재:', !!process.env.SUPABASE_KEY);
    
    // Supabase 클라이언트 초기화
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );
    
    // 인증 헤더 추출
    const authHeader = event.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    
    // 사용자 인증 확인
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError) {
      console.error('사용자 인증 오류:', userError);
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: '인증에 실패했습니다: ' + userError.message })
      };
    }
    
    if (!user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: '인증된 사용자를 찾을 수 없습니다' })
      };
    }
    
    // 사용자 ID로 할당된 매장 조회
    const { data: assignments, error: assignmentError } = await supabase
      .from('store_assignments')
      .select('store_code')
      .eq('user_id', user.id);
    
    if (assignmentError) {
      console.error('매장 할당 조회 오류:', assignmentError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: '매장 할당 정보를 가져올 수 없습니다: ' + assignmentError.message })
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
    
    // 매장 정보 조회
    const { data: stores, error: storesError } = await supabase
      .from('stores')
      .select('*')
      .in('store_code', storeCodes);
    
    if (storesError) {
      console.error('매장 정보 조회 오류:', storesError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: '매장 정보를 가져올 수 없습니다: ' + storesError.message })
      };
    }
    
    // 결과 데이터 구성
    const result = stores.map(store => ({
      store_code: store.store_code,
      platform: store.platform || '배달의민족',
      platform_code: store.platform_code || '',
      store_name: store.store_name || store.store_code
    }));
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };
    
  } catch (error) {
    console.error('함수 실행 오류:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: '서버 오류가 발생했습니다',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};