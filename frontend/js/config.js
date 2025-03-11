// config.js 수정
export const CONFIG = {
  // API 기본 URL을 Netlify Functions URL로 직접 설정
  API_BASE_URL: `${window.location.origin}/.netlify/functions`,
  
  DEFAULT_DATE_RANGE: 7,
  CHART_COLORS: {
      rating5: '#4CAF50',
      rating4: '#8BC34A',
      rating3: '#FFC107',
      rating2: '#FF9800',
      rating1: '#F44336'
  },
  STATUS_BADGES: {
      '미답변': 'pending',
      '답변완료': 'completed',
      '실패': 'failed'
  }
};