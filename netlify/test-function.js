// netlify/functions/test-function.js
exports.handler = async function(event, context) {
  console.log('테스트 함수 호출됨');
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      message: '테스트 함수가 정상 작동합니다!',
      timestamp: new Date().toISOString()
    })
  };
};