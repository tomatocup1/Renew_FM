// netlify/functions/signin.js
exports.handler = async function(event, context) {
    // CORS 헤더 설정
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json"
    };
    
    // OPTIONS 요청 처리
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers,
        body: ""
      };
    }
    
    try {
      // 요청 본문 파싱
      const data = JSON.parse(event.body || '{}');
      const { email, password } = data;
      
      // 간단한 검증
      if (!email || !password) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "이메일과 비밀번호를 입력해주세요." })
        };
      }
      
      // 테스트 계정 확인 (실제로는 데이터베이스 확인 필요)
      if (email === "tomatocup1@gmail.com") {
        // 로그인 성공 - 세션 및 사용자 정보 생성
        const now = new Date();
        const expiresAt = new Date(now);
        expiresAt.setHours(expiresAt.getHours() + 1); // 1시간 후 만료
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            message: "로그인 성공",
            session: {
              access_token: "temp-access-" + Date.now(),
              refresh_token: "temp-refresh-" + Date.now(),
              expires_at: expiresAt.toISOString()
            },
            user: {
              id: "temp-user-id",
              email: email,
              name: "테스트 사용자",
              role: "운영자",
              created_at: now.toISOString()
            }
          })
        };
      } else {
        // 로그인 실패
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({
            error: "로그인 실패",
            details: "이메일 또는 비밀번호가 올바르지 않습니다."
          })
        };
      }
    } catch (error) {
      console.error('로그인 처리 중 오류:', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: "서버 오류가 발생했습니다.",
          details: error.message
        })
      };
    }
  };