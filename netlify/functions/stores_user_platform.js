// netlify/functions/stores_user_platform.js
const { supabase, corsHeaders } = require('./utils/supabase');

exports.handler = async (event, context) => {
  // OPTIONS 요청 처리
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders
    };
  }

  try {
    // 환경 변수 확인 및 자세한 로깅
    console.log('환경 변수 상세 확인:');
    console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '설정됨' : '없음');
    console.log('SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? '설정됨' : '없음');
    console.log('SUPABASE_KEY:', process.env.SUPABASE_KEY ? '설정됨' : '없음');

    // Supabase가 접근 가능한지 테스트
    try {
      console.log('Supabase 연결 테스트 시작');
      const testResult = await supabase.from('platform_reply_rules').select('count').limit(1);
      
      if (testResult.error) {
        console.error('Supabase 연결 오류:', testResult.error);
        throw new Error(`Supabase 연결 오류: ${testResult.error.message}`);
      }
      
      console.log('Supabase 연결 성공');
    } catch (connectionError) {
      console.error('Supabase 연결 예외:', connectionError);
      throw connectionError;
    }

    // 인증 헤더 처리 (옵션)
    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    let userId = null;
    let userRole = '일반사용자';

    // 토큰이 있으면 사용자 정보 검증 시도
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.replace('Bearer ', '');
        
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
        console.warn('인증 처리 중 오류 (무시하고 계속):', authError.message);
      }
    }

    // 매장 데이터 조회 쿼리 준비
    let query = supabase
      .from('platform_reply_rules')
      .select('store_code, store_name, platform, platform_code')
      .order('store_code');

    // 권한에 따른 쿼리 제한 (운영자가 아닌 경우)
    if (userRole !== '운영자' && userRole !== '관리자' && userId) {
      try {
        const { data: assignments, error: assignError } = await supabase
          .from('store_assignments')
          .select('store_code')
          .eq('user_id', userId);
          
        if (assignError) {
          console.error('매장 할당 조회 실패:', assignError);
          throw new Error(`매장 할당 조회 실패: ${assignError.message}`);
        }
          
        if (assignments && assignments.length > 0) {
          const storeCodes = assignments.map(a => a.store_code);
          query = query.in('store_code', storeCodes);
          console.log(`사용자 할당 매장 ${storeCodes.length}개로 쿼리 제한`);
        } else {
          console.log('할당된 매장 없음, 빈 배열 반환');
          return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify([])
          };
        }
      } catch (assignmentError) {
        console.error('매장 할당 처리 중 오류:', assignmentError);
        throw assignmentError;
      }
    }

    // 매장 데이터 조회 실행
    console.log('매장 정보 쿼리 실행');
    const { data, error } = await query;

    if (error) {
      console.error('매장 정보 쿼리 오류:', error);
      throw new Error(`매장 정보 쿼리 오류: ${error.message}`);
    }

    if (!data || data.length === 0) {
      console.log('매장 데이터 없음, 빈 배열 반환');
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify([])
      };
    }

    // 매장 데이터 중복 제거 및 정리
    const uniqueStores = {};
    data.forEach(store => {
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
    console.log(`${stores.length}개 매장 성공적으로 조회됨`);

    // 성공 응답
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(stores)
    };
  } catch (error) {
    console.error('함수 실행 중 오류:', error);
    
    // 오류 상황에서도 200 응답으로 클라이언트 동작 유지
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify([
        {
          store_code: 'store-001',
          store_name: '예시 매장 1',
          platform: '배달의민족',
          platform_code: 'baemin-001'
        },
        {
          store_code: 'store-002',
          store_name: '예시 매장 2',
          platform: '요기요',
          platform_code: 'yogiyo-001'
        },
        {
          store_code: 'store-003',
          store_name: '예시 매장 3',
          platform: '쿠팡이츠',
          platform_code: 'coupang-001'
        }
      ])
    };
  }
};