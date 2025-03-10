// netlify/functions/stores-user-platform.js
exports.handler = async function(event, context) {
  console.log('stores-user-platform 함수 호출됨');
  console.log('요청 메서드:', event.httpMethod);
  
  // CORS 헤더 설정
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };
  
  // OPTIONS 요청 처리
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers
    };
  }
  
  try {
    // 간단한 테스트 데이터
    const stores = [
      {
        store_code: 'STORE001',
        platform: '배달의민족',
        platform_code: '',
        store_name: '테스트 매장 1'
      },
      {
        store_code: 'STORE002',
        platform: '요기요',
        platform_code: 'YOG001',
        store_name: '테스트 매장 2'
      },
      {
        store_code: 'STORE003',
        platform: '쿠팡이츠',
        platform_code: 'CPE001',
        store_name: '테스트 매장 3'
      }
    ];
    
    // 응답 반환
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(stores)
    };
  } catch (error) {
    console.error('함수 오류:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: '서버 오류가 발생했습니다.' })
    };
  }
};