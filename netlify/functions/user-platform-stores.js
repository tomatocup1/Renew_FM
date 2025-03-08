// netlify/functions/stores-user-platform.js
const { createClient } = require('@supabase/supabase-js');

// Supabase 클라이언트 초기화
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// CORS 헤더 설정
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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

  try {
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

    // 사용자 정보 확인 (JWT 토큰 검증)
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: '유효하지 않은 인증 정보입니다.' })
      };
    }

    // 사용자-매장 할당 데이터 조회
    const { data: assignments, error: assignmentError } = await supabase
      .from('store_assignments')
      .select('store_code, role_type')
      .eq('user_id', user.id);
    
    if (assignmentError) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: '매장 할당 정보를 불러오는데 실패했습니다.' })
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
    const { data: stores, error: storeError } = await supabase
      .from('store_info')
      .select('*')
      .in('store_code', storeCodes);
    
    if (storeError) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: '매장 정보를 불러오는데 실패했습니다.' })
      };
    }

    // 플랫폼 규칙에서 매장 이름 등 추가 정보 가져오기
    const { data: platformRules, error: rulesError } = await supabase
      .from('platform_reply_rules')
      .select('store_code, platform, platform_code, store_name')
      .in('store_code', storeCodes);
    
    if (rulesError) {
      console.error('Platform rules query error:', rulesError);
      // 오류가 있더라도 진행 (매장 이름은 필수가 아님)
    }

    // 최종 결과 구성
    const result = platformRules?.length ? platformRules.map(rule => ({
      store_code: rule.store_code,
      platform: rule.platform || '배달의민족',
      platform_code: rule.platform_code || '',
      store_name: rule.store_name || rule.store_code
    })) : stores.map(store => ({
      store_code: store.store_code,
      platform: '배달의민족',
      platform_code: '',
      store_name: store.store_code
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: '서버 오류가 발생했습니다.' })
    };
  }
};