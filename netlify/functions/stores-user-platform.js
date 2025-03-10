// netlify/functions/stores-user-platform.js
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
    // 간단한 테스트 데이터 반환
    const mockStores = [
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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(mockStores)
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