// netlify/functions/stores-all.js
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

    // 관리자 권한 확인 (전체 매장 목록은 관리자만 접근 가능)
    const { data: userData, error: getUserError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (getUserError || !userData) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: '사용자 정보를 불러오는데 실패했습니다.' })
      };
    }

    if (userData.role !== '운영자') {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: '관리자 권한이 필요합니다.' })
      };
    }

    // 전체 매장 정보 조회
    const { data: storeInfos, error: storeInfoError } = await supabase
      .from('store_info')
      .select('*')
      .order('store_code', { ascending: true });
    
    if (storeInfoError) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: '매장 정보를 불러오는데 실패했습니다.' })
      };
    }

    // 매장 코드 목록 추출
    const storeCodes = storeInfos.map(store => store.store_code);

    // 플랫폼 규칙에서 매장 이름 등 추가 정보 가져오기
    const { data: platformRules, error: rulesError } = await supabase
      .from('platform_reply_rules')
      .select('store_code, platform, platform_code, store_name')
      .in('store_code', storeCodes);
    
    if (rulesError) {
      console.error('Platform rules query error:', rulesError);
    }

    // 매장 정보와 규칙 정보 매핑
    const result = storeInfos.map(store => {
      // 해당 매장의 규칙 찾기
      const storeRules = platformRules?.filter(rule => rule.store_code === store.store_code) || [];
      
      // 규칙이 있으면 첫 번째 규칙의 매장 이름 사용, 없으면 매장 코드 사용
      const storeName = storeRules.length > 0 ? storeRules[0].store_name : store.store_code;
      
      return {
        store_code: store.store_code,
        store_name: storeName || store.store_code,
        platform_info: store.platform_info,
        created_at: store.created_at
      };
    });

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