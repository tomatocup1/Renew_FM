exports.handler = async function(event, context) {
    // CORS 헤더 설정
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
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
      // 토큰 갱신을 위한 더미 응답
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1); // 1시간 후 만료
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          session: {
            access_token: "temp-access-token-" + Date.now(),
            refresh_token: "temp-refresh-token-" + Date.now(),
            expires_at: expiresAt.toISOString()
          }
        })
      };
    } catch (error) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "토큰 갱신 중 오류가 발생했습니다." })
      };
    }
  };