exports.handler = async function(event, context) {
    // CORS 헤더 설정
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Content-Type": "application/json"
    };
    
    // OPTIONS 요청 처리 (CORS preflight)
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers,
        body: ""
      };
    }
    
    try {
      // 간단한 더미 사용자 정보 응답
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          user: {
            id: "temp-user-id",
            name: "임시 사용자",
            email: "test@example.com",
            role: "운영자",
            created_at: "2023-01-01T00:00:00Z"
          }
        })
      };
    } catch (error) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "서버 오류가 발생했습니다." })
      };
    }
  };