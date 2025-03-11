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
    
    // 먼저 Supabase 연결 테스트 추가
    try {
      console.log('Supabase 연결 테스트 시작');
      console.log('Supabase URL:', process.env.SUPABASE_URL ? '설정됨' : '없음');
      console.log('Supabase Key:', process.env.SUPABASE_SERVICE_KEY ? '설정됨' : '없음');
      
      // 간단한 쿼리로 연결 테스트
      const testResult = await supabase.from('users').select('count').limit(1);
      console.log('Supabase 연결 테스트 결과:', testResult.error ? '실패' : '성공');
      if (testResult.error) {
        console.error('Supabase 연결 오류:', testResult.error.message);
      }
    } catch (connectionError) {
      console.error('Supabase 연결 테스트 예외:', connectionError.message);
    }
    
    // 임시 세션인 경우에도 DB 데이터 조회 시도
    let userId = null;
    
    // 템유저 ID 생성 (테스트용)
    const tempUserId = process.env.DEFAULT_USER_ID || 'test-user';
    
    if (!authHeader || authHeader.includes('temporary-') || authHeader.includes('temp-acces')) {
      console.log('임시 인증으로 처리, 기본 사용자 사용');
      userId = tempUserId;
    } else {
      // 실제 토큰에서 사용자 정보 가져오기
      const token = authHeader.replace('Bearer ', '');
      
      if (!token) {
        console.log('토큰 없음, 기본 사용자 사용');
        userId = tempUserId;
      } else {
        try {
          const { data, error } = await supabase.auth.getUser(token);
          
          if (error || !data.user) {
            console.log('토큰 검증 실패, 기본 사용자 사용');
            userId = tempUserId;
          } else {
            userId = data.user.id;
            console.log('인증된 사용자:', userId);
          }
        } catch (authError) {
          console.log('인증 프로세스 실패, 기본 사용자 사용:', authError.message);
          userId = tempUserId;
        }
      }
    }
    
    // Supabase에서 사용자 역할 조회 시도
    let userRole = '일반사용자';
    try {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();
      
      if (!userError && userData) {
        userRole = userData.role;
        console.log('사용자 역할:', userRole);
      } else {
        console.log('사용자 역할 조회 실패, 기본 역할 사용');
      }
    } catch (roleError) {
      console.log('역할 조회 중 오류:', roleError.message);
    }
    
    // 실제 매장 데이터 조회
    let stores = [];
    
    try {
      if (userRole === '운영자' || userRole === '관리자') {
        console.log('관리자 권한으로 전체 매장 조회');
        const { data, error } = await supabase
          .from('platform_reply_rules')
          .select('store_code, store_name, platform, platform_code')
          .order('store_code')
          .order('platform');
        
        if (!error && data) {
          stores = data;
          console.log(`${stores.length}개 매장 조회됨`);
        } else {
          console.log('매장 조회 실패:', error?.message);
        }
      } else {
        console.log('일반 사용자 권한으로 할당된 매장만 조회');
        const { data: assignments, error: assignError } = await supabase
          .from('store_assignments')
          .select('store_code')
          .eq('user_id', userId);
        
        if (!assignError && assignments && assignments.length > 0) {
          const storeCodes = assignments.map(a => a.store_code);
          console.log('할당된 매장 코드:', storeCodes);
          
          const { data, error } = await supabase
            .from('platform_reply_rules')
            .select('store_code, store_name, platform, platform_code')
            .in('store_code', storeCodes)
            .order('store_code')
            .order('platform');
          
          if (!error && data) {
            stores = data;
            console.log(`${stores.length}개 매장 조회됨`);
          } else {
            console.log('매장 상세 조회 실패:', error?.message);
          }
        } else {
          console.log('할당된 매장 없음 또는 조회 실패');
        }
      }
    } catch (storeError) {
      console.log('매장 조회 중 오류:', storeError.message);
    }
    
    // 매장 데이터가 없으면 테스트 데이터로 대체
    if (stores.length === 0) {
      console.log('매장 데이터 없음, 테스트 데이터 사용');
      stores = [
        {
          store_code: 'STORE001',
          store_name: '테스트 매장 1',
          platform: '배달의민족',
          platform_code: ''
        },
        {
          store_code: 'STORE002',
          store_name: '테스트 매장 2',
          platform: '요기요',
          platform_code: 'YOG001'
        },
        {
          store_code: 'STORE003',
          store_name: '테스트 매장 3',
          platform: '쿠팡이츠',
          platform_code: 'CPE001'
        }
      ];
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
      body: JSON.stringify({ error: '서버 오류가 발생했습니다.' })
    };
  }
};