// frontend/js/dashboard.js
import { authService } from './authService.js';
import { ChartManager } from './chartManager.js';
import { CONFIG } from './config.js';

export const utils = {
    formatDate(date) {
        if (!date) return '-';
        const d = new Date(date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },
    formatNumber(num) {
        return num?.toLocaleString() ?? '0';
    },
    calculateAverage(data, key) {
        if (!data?.length) return 0;
        const sum = data.reduce((acc, item) => acc + (item[key] || 0), 0);
        return (sum / data.length).toFixed(1);
    },
    getStatusBadge(status) {
        const statusClass = CONFIG.STATUS_BADGES[status] || 'pending';
        return `<span class="status-badge ${statusClass}">${status || '미답변'}</span>`;
    }
};

function safeLog(message) {
    console.log(message);
    // 함수가 존재하는 경우에만 호출
    if (typeof window.showDebugMessage === 'function') {
      window.showDebugMessage(message);
    }
  }

function safeDebugMessage(message) {
    console.log(message); // 항상 콘솔에는 로그 출력
    
    // 함수가 존재하면 호출
    if (typeof window.showDebugMessage === 'function') {
      window.showDebugMessage(message);
    }
  }

class DashboardManager {
    constructor() {
        console.log('DashboardManager initialized');
        this.chartManager = new ChartManager();
        this.currentFilter = null;
        this.allReviews = [];
        this.reviewsPage = 1;
        this.reviewsPerPage = 20;
        this.hasMoreReviews = false;
        this.isLoadingMore = false;
        this.isUpdating = false;
        this.initAttempts = 0;
        this.maxAttempts = 3;
        this.selectedStoreData = null;
        this.selectedDateRange = null;
        window.dashboardManager = this;
        this.init();
    }

// 캘린더 스타일 개선을 위한 새로운 메서드
applyCalendarStyles() {
    // 캘린더의 CSS를 직접 수정하여 모든 요일 표시 보장 및 스타일 개선
    const style = document.createElement('style');
    style.textContent = `
        .flatpickr-calendar {
            width: 100% !important;
            max-width: 320px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
            border-radius: 12px !important;
            padding: 1rem !important;
            background: white;
        }
        .flatpickr-months {
            padding-bottom: 10px;
        }
        .flatpickr-weekdays {
            display: flex !important;
            justify-content: space-between !important;
            width: 100% !important;
        }
        .flatpickr-weekday {
            width: 14.28% !important;
            max-width: none !important;
            flex: 1 !important;
            font-weight: 600 !important;
            color: #4CAF50 !important;
        }
        .flatpickr-day {
            border-radius: 6px !important;
            max-width: none !important;
            margin: 2px;
            height: 38px;
            line-height: 38px;
        }
        .flatpickr-day.selected {
            background: #4CAF50 !important;
            border-color: #4CAF50 !important;
        }
        .flatpickr-day.inRange {
            background: #E8F5E9 !important;
            border-color: #E8F5E9 !important;
            box-shadow: none !important;
        }
        .flatpickr-day:hover {
            background: #E8F5E9 !important;
        }
        .flatpickr-day.today {
            border-color: #4CAF50 !important;
        }
        .flatpickr-months .flatpickr-month {
            height: 50px !important;
        }
        .flatpickr-current-month {
            padding-top: 10px !important;
            font-size: 1.2rem !important;
        }
        .flatpickr-months .flatpickr-prev-month, .flatpickr-months .flatpickr-next-month {
            top: 10px !important;
            padding: 5px !important;
        }
    `;
    document.head.appendChild(style);
}

    sanitizeHTML(text) {
        if (!text) return '';
        return String(text)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
    }

    async init() {
        try {
          console.log('대시보드 초기화 시작');
          
          // 세션 확인
          const sessionStr = localStorage.getItem('session') || sessionStorage.getItem('session');
          console.log('세션 데이터:', sessionStr ? '존재함' : '없음');
          
          if (!sessionStr) {
            console.log('세션 없음, 로그인 페이지로 이동');
            window.location.href = '/login.html';
            return;
          }
          
          // 세션 파싱 및 검증
          try {
            const session = JSON.parse(sessionStr);
            const expiresAt = new Date(session.expires_at).getTime();
            const now = new Date().getTime();
            
            console.log('토큰 만료 시각:', new Date(expiresAt).toLocaleString());
            console.log('현재 시각:', new Date(now).toLocaleString());
            console.log('만료까지 남은 시간:', Math.round((expiresAt - now) / 1000), '초');
            
            if (expiresAt <= now) {
              console.log('토큰 만료됨, 갱신 시도');
              try {
                const refreshed = await authService.refreshToken().catch(error => {
                  console.warn('토큰 갱신 중 오류 발생:', error);
                  return null;
                });
                
                if (!refreshed) {
                  console.warn('토큰 갱신 실패, 하지만 세션 유지 시도');
                  // 갱신 실패해도 즉시 리다이렉트하지 않고 사용자 경험 유지 시도
                  if (session.access_token) {
                    console.log('기존 토큰으로 계속 진행 시도');
                    // session을 재저장하여 유효기간 연장 시도
                    const extendedSession = {
                      ...session,
                      // 현재 시간으로부터 10분 연장
                      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
                    };
                    localStorage.setItem('session', JSON.stringify(extendedSession));
                    console.log('세션 만료 시간 임시 연장됨');
                  } else {
                    console.log('유효한 토큰 없음, 로그인 페이지로 이동');
                    window.location.href = '/login.html';
                    return;
                  }
                } else {
                  console.log('토큰 갱신 성공 또는 기존 세션 유지됨');
                }
              } catch (refreshError) {
                console.error('토큰 갱신 중 예외:', refreshError);
                // 심각한 오류가 아니면 계속 진행 시도
                if (session.access_token) {
                  console.log('갱신 중 예외 발생했지만 기존 토큰으로 계속 진행');
                } else {
                  console.error('갱신 실패 및 유효한 토큰 없음');
                  window.location.href = '/login.html';
                  return;
                }
              }
            }
          } catch (parseError) {
            console.error('세션 파싱 오류:', parseError);
            window.location.href = '/login.html';
            return;
          }
          
          // 인증 확인 (예외 처리 추가)
          let isAuthed = false;
          try {
            // 자체 인증 확인 로직 추가
            const currentSession = JSON.parse(localStorage.getItem('session') || sessionStorage.getItem('session') || '{}');
            const hasValidToken = !!currentSession.access_token;
            
            // isAuthenticated 호출 전에 간단히 토큰 존재 여부 확인
            if (hasValidToken) {
              console.log('액세스 토큰 존재하여 인증 추정');
              isAuthed = true;
            } else {
              // 기존 인증 확인 메서드 호출
              isAuthed = await authService.isAuthenticated();
            }
            
            console.log('인증 상태:', isAuthed ? '인증됨' : '인증 안됨');
          } catch (authError) {
            console.error('인증 확인 중 오류:', authError);
            // 오류 발생해도 세션 있으면 계속 진행 시도
            const session = JSON.parse(localStorage.getItem('session') || sessionStorage.getItem('session') || '{}');
            if (session.access_token) {
              console.log('인증 확인 중 오류 발생했지만 세션 존재하여 계속 진행');
              isAuthed = true;
            }
          }
          
          if (!isAuthed) {
            console.log('인증되지 않음, 로그인 페이지로 이동');
            window.location.href = '/login.html';
            return;
          }
          
          console.log('인증 확인 완료, 대시보드 초기화 계속');
          
          // 나머지 초기화 로직 실행
          await this.initializeStoreSelect();
          this.initializeDatePicker();
          this.initializeStatCards();
          this.setupScrollListener();
          
          console.log('대시보드 초기화 완료');
        } catch (error) {
          console.error('대시보드 초기화 오류:', error);
          
          // 재시도 로직
          if (this.initAttempts < this.maxAttempts) {
            this.initAttempts++;
            console.log(`초기화 재시도 (${this.initAttempts}/${this.maxAttempts})`);
            setTimeout(() => this.init(), 1000);
          } else {
            console.log('최대 시도 횟수 초과, 로그인 페이지로 이동');
            window.location.href = '/login.html';
          }
        }
      }
      
    setupScrollListener() {
        const reviewsContainer = document.querySelector('.reviews-container');
        if (!reviewsContainer) return;

        const loadMoreThreshold = 200; // 스크롤이 바닥에서 200px 위에 도달하면 로드
        
        // 스크롤 이벤트 리스너 추가
        reviewsContainer.addEventListener('scroll', () => {
            if (this.isLoadingMore || !this.hasMoreReviews) return;
            
            const scrollPosition = reviewsContainer.scrollTop + reviewsContainer.clientHeight;
            const scrollHeight = reviewsContainer.scrollHeight;
            
            if (scrollHeight - scrollPosition < loadMoreThreshold) {
                this.loadMoreReviews();
            }
        });
    }

// dashboard.js 파일 안의 initializeStoreSelect 함수 수정

    
async initializeStoreSelect() {
    try {
      console.log('매장 정보 초기화 시작...');
      
      const user = await authService.getCurrentUser();
      if (!user?.id) {
        console.error('사용자 정보를 가져올 수 없습니다');
        this.showAlert('사용자 정보를 가져올 수 없습니다. 다시 로그인해주세요.', 'error');
        setTimeout(() => window.location.href = '/login.html', 2000);
        return;
      }
      
      console.log('사용자 정보:', user);
      
      // 절대 경로 사용 (netlify 함수 직접 호출)
      const baseUrl = window.location.origin;
      console.log('기본 URL:', baseUrl);
      
      try {
        // 함수 직접 호출
        const functionUrl = `${baseUrl}/.netlify/functions/stores-user-platform`;
        console.log('API 요청 URL:', functionUrl);
        
        const response = await fetch(functionUrl, {
          method: 'GET',
          headers: {
            'Authorization': authService.getAuthHeader(),
            'Accept': 'application/json'
          },
          credentials: 'include'
        });
      
        console.log('API 응답 상태:', response.status);
        const contentType = response.headers.get('content-type');
        console.log('응답 콘텐츠 타입:', contentType);
        
        if (!response.ok) {
          console.log('API 요청 실패, 대체 메서드 시도');
          return await this.loadStoresByDirectMethod(user.id);
        }
        
        // 콘텐츠 타입 확인
        if (!contentType || !contentType.includes('application/json')) {
          console.warn('JSON이 아닌 응답:', contentType);
          const text = await response.text();
          console.log('비JSON 응답 내용(일부):', text.substring(0, 100));
          return await this.loadStoresByDirectMethod(user.id);
        }
        
        const stores = await response.json();
        console.log('매장 데이터:', stores);
      
        if (!Array.isArray(stores) || stores.length === 0) {
          console.warn('매장 정보가 없습니다');
          this.showAlert('표시할 매장 정보가 없습니다. 관리자에게 매장 할당을 요청하세요.', 'warning');
          return;
        }
      
        // 중복 제거 및 포맷팅 처리
        const uniqueStores = {};
        stores.forEach(store => {
          const key = `${store.store_code}-${store.platform_code || ''}`;
          if (!uniqueStores[key]) {
            uniqueStores[key] = store;
          }
        });
      
        const formattedStores = Object.values(uniqueStores).map(store => ({
          value: JSON.stringify({
            store_code: store.store_code,
            platform_code: store.platform_code || '',
            platform: store.platform || '배달의민족'
          }),
          label: store.platform_code ? 
                 `[${store.platform || '배달의민족'}] ${store.store_name} (${store.platform_code})` :
                 `[배달의민족] ${store.store_name}`,
          store_code: store.store_code
        }));
      
        console.log('포맷팅된 매장 목록:', formattedStores);
        this.populateStoreSelectWithAllOption(formattedStores);
      } catch (apiError) {
        console.error('API 호출 중 오류:', apiError);
        // 대체 매장 로드 방식 시도
        return await this.loadStoresByDirectMethod(user.id);
      }
    } catch (error) {
      console.error('매장 목록 초기화 중 오류 발생:', error);
      this.showAlert('매장 정보를 불러오는데 실패했습니다. 새로고침 후 다시 시도해주세요.', 'error');
    }
  }
        
    // 기존 initializeStoreSelectFallback 함수를 수정합니다
async initializeStoreSelectFallback(userId) {
    console.log('폴백 매장 로드 시도 중... 사용자 ID:', userId);
    
    try {
      // 다양한 대체 URL 시도 - Netlify 함수 경로로 수정
      const baseUrl = window.location.origin;
      
      // 테스트 환경에서 문제가 지속되면 직접 메서드로 대체
      if (window.location.hostname === 'wealthfm.co.kr' || window.location.hostname === 'www.wealthfm.co.kr') {
        return await this.loadStoresByDirectMethod(userId);
      }
      
      const possibleEndpoints = [
        `${baseUrl}/.netlify/functions/user-stores?userId=${userId}`,
        `${baseUrl}/.netlify/functions/stores-user-stores?userId=${userId}`,
        `${baseUrl}/.netlify/functions/users-stores?userId=${userId}`
      ];
      
      let stores = null;
      let successUrl = '';
      
      // 가능한 모든 엔드포인트 시도
      for (const endpoint of possibleEndpoints) {
        try {
          console.log(`API 엔드포인트 시도: ${endpoint}`);
          const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
              'Authorization': authService.getAuthHeader(),
              'Accept': 'application/json'
            },
            credentials: 'include'
          });
          
          if (response.ok) {
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
              console.warn('JSON이 아닌 응답:', contentType);
              continue;
            }
            
            stores = await response.json();
            successUrl = endpoint;
            console.log(`성공한 API 엔드포인트: ${endpoint}`);
            break;
          } else {
            console.log(`엔드포인트 ${endpoint} 응답 코드: ${response.status}`);
          }
        } catch (error) {
          console.log(`엔드포인트 ${endpoint} 오류:`, error);
        }
      }
      
      if (!stores || stores.length === 0) {
        console.warn('폴백: 모든 API 호출 실패, 테스트 데이터 사용');
        return await this.loadStoresByDirectMethod(userId);
      }
      
      console.log(`폴백 성공 (${successUrl}): 매장 데이터:`, stores);
      
      // 매장 데이터 형식에 따라 처리 로직 분기
      let formattedStores;
      
      // 데이터 형식 분석
      const isDetailedFormat = stores.some(store => 
        store.store_name !== undefined || store.platform !== undefined);
      
      if (isDetailedFormat) {
        // 이미 형식화된 데이터
        formattedStores = stores.map(store => ({
          value: JSON.stringify({
            store_code: store.store_code,
            platform_code: store.platform_code || '',
            platform: store.platform || '배달의민족'
          }),
          label: store.platform ? 
                `[${store.platform}] ${store.store_name || store.store_code}` :
                `[배달의민족] ${store.store_name || store.store_code}`,
          store_code: store.store_code
        }));
      } else {
        // 간단한 store_code만 있는 형식
        formattedStores = stores.map(store => ({
          value: JSON.stringify({
            store_code: typeof store === 'string' ? store : store.store_code,
            platform_code: '',
            platform: '배달의민족'
          }),
          label: `[배달의민족] ${typeof store === 'string' ? store : store.store_code}`,
          store_code: typeof store === 'string' ? store : store.store_code
        }));
      }
      
      console.log('폴백: 포맷팅된 매장 목록:', formattedStores);
      this.populateStoreSelectWithAllOption(formattedStores);
      return formattedStores;
    } catch (error) {
      console.error('폴백 매장 로드 실패:', error);
      this.showAlert('매장 정보를 불러오는데 실패했습니다.', 'error');
      // 최종 폴백: 테스트 데이터 사용
      return await this.loadStoresByDirectMethod(userId);
    }
  }

      // 대체 URL을 사용하는 폴백 메서드
async initializeStoreSelectFallback(userId) {
    console.log('폴백 매장 로드 시도 중... 사용자 ID:', userId);
    
    try {
      // 다양한 대체 URL 시도
      const possibleEndpoints = [
        `/api/user/${userId}/stores`,
        `/api/stores/user/${userId}/stores`,
        `/api/users/${userId}/stores`
      ];
      
      let stores = null;
      let successUrl = '';
      
      // 가능한 모든 엔드포인트 시도
      for (const endpoint of possibleEndpoints) {
        try {
          console.log(`API 엔드포인트 시도: ${endpoint}`);
          const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
              'Authorization': authService.getAuthHeader(),
              'Accept': 'application/json'
            },
            credentials: 'include'
          });
          
          if (response.ok) {
            stores = await response.json();
            successUrl = endpoint;
            console.log(`성공한 API 엔드포인트: ${endpoint}`);
            break;
          } else {
            console.log(`엔드포인트 ${endpoint} 응답 코드: ${response.status}`);
          }
        } catch (error) {
          console.log(`엔드포인트 ${endpoint} 오류:`, error);
        }
      }
      
      if (!stores || stores.length === 0) {
        console.warn('폴백: 매장 정보가 없습니다');
        this.showAlert('표시할 매장 정보가 없습니다.', 'warning');
        return;
      }
      
      console.log(`폴백 성공 (${successUrl}): 매장 데이터:`, stores);
      
      // 매장 데이터 형식에 따라 처리 로직 분기
      let formattedStores;
      
      // 데이터 형식 분석
      const isDetailedFormat = stores.some(store => 
        store.store_name !== undefined || store.platform !== undefined);
      
      if (isDetailedFormat) {
        // 이미 형식화된 데이터
        formattedStores = stores.map(store => ({
          value: JSON.stringify({
            store_code: store.store_code,
            platform_code: store.platform_code || '',
            platform: store.platform || '배달의민족'
          }),
          label: store.platform ? 
                `[${store.platform}] ${store.store_name || store.store_code}` :
                `[배달의민족] ${store.store_name || store.store_code}`,
          store_code: store.store_code
        }));
      } else {
        // 간단한 store_code만 있는 형식
        formattedStores = stores.map(store => ({
          value: JSON.stringify({
            store_code: typeof store === 'string' ? store : store.store_code,
            platform_code: '',
            platform: '배달의민족'
          }),
          label: `[배달의민족] ${typeof store === 'string' ? store : store.store_code}`,
          store_code: typeof store === 'string' ? store : store.store_code
        }));
      }
      
      console.log('폴백: 포맷팅된 매장 목록:', formattedStores);
      this.populateStoreSelectWithAllOption(formattedStores);
    } catch (error) {
      console.error('폴백 매장 로드 실패:', error);
      this.showAlert('매장 정보를 불러오는데 실패했습니다.', 'error');
      throw error;
    }
  }

    async initializeStoreSelectLegacy(userId) {
        try {
            console.log('기존 엔드포인트로 매장 정보 조회 시도...');
            const response = await fetch(`${CONFIG.API_BASE_URL}/user/${userId}/stores`, {
                method: 'GET',
                headers: {
                    'Authorization': authService.getAuthHeader(),
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });
    
            if (!response.ok) {
                throw new Error('매장 정보를 불러오는데 실패했습니다.');
            }
    
            const rules = await response.json();
            console.log('Legacy store rules data:', rules);
    
            const formattedStores = rules.map(rule => ({
                value: JSON.stringify({
                    store_code: rule.store_code,
                    platform_code: rule.platform_code || '',
                    platform: rule.platform || '배달의민족'
                }),
                label: rule.platform_code ? 
                       `[${rule.platform || '배달의민족'}] ${rule.store_name} (${rule.platform_code})` :
                       `[배달의민족] ${rule.store_name}`,
                store_code: rule.store_code
            }));
    
            console.log('Formatted legacy stores:', formattedStores);
            this.populateStoreSelectWithAllOption(formattedStores);
        } catch (error) {
            console.error('Legacy store initialization error:', error);
            this.populateStoreSelectWithAllOption([]);
            this.showErrorMessage('매장 목록을 불러오는데 실패했습니다. 새로고침 후 다시 시도해주세요.');
        }
    }
    
    populateStoreSelectWithAllOption(stores) {
        const storeSelect = document.getElementById('storeSelect');
        if (!storeSelect) return;
    
        storeSelect.innerHTML = '<option value="">매장 선택</option>';
        
        // store_code 기준으로 정렬
        const sortedStores = stores.sort((a, b) => {
            return a.store_code?.localeCompare(b.store_code || '');
        });
        
        // 전체 매장 목록이 2개 이상일 때만 '전체 모아보기' 옵션 추가
        if (sortedStores.length >= 2) {
            // 모든 매장의 store_code 목록 만들기
            const storeCodes = sortedStores.map(store => {
                const data = JSON.parse(store.value);
                return data.store_code;
            });
            
            // 중복 제거
            const uniqueStoreCodes = [...new Set(storeCodes)];
            
            const allOption = document.createElement('option');
            allOption.value = JSON.stringify({
                all_stores: true,
                store_codes: uniqueStoreCodes
            });
            allOption.textContent = '📊 전체 모아보기';
            storeSelect.appendChild(allOption);
        }
    
        // 개별 매장 옵션 추가
        sortedStores.forEach(store => {
            const option = document.createElement('option');
            option.value = store.value;
            option.textContent = store.label;
            storeSelect.appendChild(option);
        });
    
        if (!storeSelect.dataset.hasChangeListener) {
            storeSelect.addEventListener('change', () => this.handleStoreChange());
            storeSelect.dataset.hasChangeListener = 'true';
        }
    }

    initializeDatePicker() {
        const now = new Date();
        const startDate = this.getStartOfMonth(now);
    
        // 한국어 로케일 커스텀 설정
        const customLocale = {
            weekdays: {
                shorthand: ['일', '월', '화', '수', '목', '금', '토'],
                longhand: ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
            },
            months: {
                shorthand: ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'],
                longhand: ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']
            },
            ordinal: () => {
                return "일";
            },
            rangeSeparator: ' ~ ',
            firstDayOfWeek: 0
        };
    
        // flatpickr에 커스텀 로케일 등록
        flatpickr.localize(customLocale);
    
        // 캘린더 초기화
        const calendar = flatpickr('#calendar', {
            inline: true,
            mode: 'range',
            defaultDate: [startDate, now],
            showMonths: 1,
            static: true,
            monthSelectorType: 'static',
            locale: 'ko',
            prevArrow: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
            nextArrow: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
            onChange: (selectedDates) => {
                console.log('Calendar dates changed:', selectedDates);
                if (selectedDates.length === 2) {
                    this.selectedDateRange = {
                        startDate: selectedDates[0],
                        endDate: selectedDates[1]
                    };
                    this.resetAndLoadData();
                }
            },
            onReady: () => {
                // 모든 요일이 표시되는지 확인하기 위한 콘솔 로그
                console.log('Flatpickr calendar initialized');
                const weekdayElements = document.querySelectorAll('.flatpickr-weekday');
                console.log('Weekday elements count:', weekdayElements.length);
                
                // 캘린더에 커스텀 스타일 적용
                this.applyCalendarStyles();
            }
        });
    
        // 초기 날짜 범위 저장
        this.selectedDateRange = {
            startDate: startDate,
            endDate: now
        };
        
        // 초기 데이터 로드
        this.resetAndLoadData();
    }

    formatDateForAPI(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    getStartOfMonth(date) {
        return new Date(date.getFullYear(), date.getMonth(), 1);
    }
        
    initializeStatCards() {
        // 별점 필터링 카드
        const ratingCards = document.querySelectorAll('.stat-card[data-rating]');
        ratingCards.forEach(card => {
            card.addEventListener('click', () => {
                this.handleStatCardClick(card);
            });
        });

        // 확인 필요 필터링 카드
        const needsReplyCard = document.querySelector('.stat-card[data-filter="needs_reply"]');
        if (needsReplyCard) {
            needsReplyCard.addEventListener('click', () => {
                this.handleNeedsReplyClick(needsReplyCard);
            });
        }
    }

    handleNeedsReplyClick(card) {
        console.log('Clicked needs reply card');
        
        if (this.currentFilter === 'needs_reply') {
            card.classList.remove('active');
            this.currentFilter = null;
        } else {
            document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            this.currentFilter = 'needs_reply';
        }
        
        console.log('Current filter:', this.currentFilter);
        this.resetAndFilterReviews();
    }

    handleStatCardClick(card) {
        console.log('Clicked card with rating:', card.dataset.rating);
        const rating = card.dataset.rating;
        
        if (this.currentFilter === rating) {
            card.classList.remove('active');
            this.currentFilter = null;
        } else {
            document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            this.currentFilter = rating;
        }
        
        console.log('Current filter:', this.currentFilter);
        this.resetAndFilterReviews();
    }

    resetAndFilterReviews() {
        // 페이지 상태 초기화
        this.reviewsPage = 1;
        
        // 필터링된 리뷰 표시
        this.filterAndDisplayReviews(true);
    }

    filterAndDisplayReviews(reset = false) {
        if (!Array.isArray(this.allReviews)) {
            console.error('allReviews is not an array:', this.allReviews);
            return;
        }
    
        let filtered;
        if (this.currentFilter === 'needs_reply') {
            console.log('Filtering reviews needing boss reply');
            filtered = this.allReviews.filter(review => review.boss_reply_needed === true);
        } else if (this.currentFilter) {
            console.log('Filtering reviews with rating:', this.currentFilter);
            filtered = this.allReviews.filter(review => Number(review.rating) === Number(this.currentFilter));
        } else {
            filtered = this.allReviews;
        }
    
        console.log('Filtered reviews count:', filtered.length);
        
        const container = document.getElementById('reviewsBody');
        if (!container) {
            console.error('Reviews container not found');
            return;
        }
    
        // 리뷰가 없는 경우 메시지 표시
        if (filtered.length === 0) {
            container.innerHTML = '<div class="no-reviews" style="padding: 2rem; text-align: center; color: #666;">해당하는 리뷰가 없습니다.</div>';
            this.hasMoreReviews = false;
            return;
        }
    
        // 현재 페이지에 해당하는 리뷰만 표시
        const startIndex = 0;
        const endIndex = Math.min(this.reviewsPage * this.reviewsPerPage, filtered.length);
        const currentPageReviews = filtered.slice(startIndex, endIndex);
        
        // 더 보여줄 리뷰가 있는지 확인
        this.hasMoreReviews = endIndex < filtered.length;
        
        if (reset) {
            // 컨테이너 초기화
            container.innerHTML = '';
        }
        
        // 리뷰 HTML 추가
        const reviewsHTML = currentPageReviews.map(review => this.createReviewHTML(review)).join('');
        container.innerHTML += reviewsHTML;
        
        // 로딩 중 표시기가 있으면 제거
        const loadingIndicator = container.querySelector('.reviews-loading');
        if (loadingIndicator) {
            container.removeChild(loadingIndicator);
        }
        
        // 더 로드할 수 있다면 "더 보기" 버튼 추가
        if (this.hasMoreReviews && !container.querySelector('.load-more-btn')) {
            const loadMoreButton = document.createElement('div');
            loadMoreButton.className = 'load-more-btn';
            loadMoreButton.innerHTML = `
                <button class="btn btn-secondary" style="width: 100%; padding: 1rem; margin-top: 1rem; background-color: #f5f5f5; color: #333; border: 1px solid #ddd; font-weight: normal;">
                    더 보기 (${filtered.length - endIndex}개 더)
                </button>
            `;
            loadMoreButton.addEventListener('click', () => this.loadMoreReviews());
            container.appendChild(loadMoreButton);
        }
    }
    
    async loadMoreReviews() {
        if (this.isLoadingMore || !this.hasMoreReviews) return;
        
        this.isLoadingMore = true;
        
        // 로딩 중 표시기 추가
        const container = document.getElementById('reviewsBody');
        const loadingIndicator = document.createElement('div');
        loadingIndicator.className = 'reviews-loading';
        loadingIndicator.innerHTML = `
            <div style="text-align: center; padding: 1rem;">
                <div style="display: inline-block; width: 30px; height: 30px; border: 3px solid #f3f3f3; border-top: 3px solid #4CAF50; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
            </div>
        `;
        container.appendChild(loadingIndicator);
        
        // "더 보기" 버튼 제거
        const loadMoreButton = container.querySelector('.load-more-btn');
        if (loadMoreButton) {
            container.removeChild(loadMoreButton);
        }
        
        // 다음 페이지로 이동
        this.reviewsPage++;
        
        // 서버에서 더 많은 리뷰를 가져와야 하는지 확인
        if (this.reviewsPage * this.reviewsPerPage > this.allReviews.length && this.hasMoreServerData) {
            // 추가 서버 데이터 요청 (필요한 경우)
            await this.loadMoreReviewsFromServer();
        } else {
            // 이미 로드된 데이터에서 다음 페이지 표시
            setTimeout(() => {
                this.filterAndDisplayReviews();
                this.isLoadingMore = false;
            }, 300); // 로딩 효과를 보여주기 위한 짧은 지연
        }
    }
    
    async loadMoreReviewsFromServer() {
        // 이 메서드는 필요할 때 서버에서 추가 리뷰를 로드하기 위한 것입니다
        try {
            // 추가 리뷰 로드를 위한 파라미터 생성
            const params = this.buildReviewsRequestParams();
            params.append('page', this.reviewsPage.toString());
            params.append('limit', this.reviewsPerPage.toString());
            
            const url = `${CONFIG.API_BASE_URL}/reviews?${params.toString()}`;
            const response = await fetch(url, {
                headers: {
                    'Authorization': authService.getAuthHeader(),
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) throw new Error('추가 리뷰 데이터 로드 실패');
            
            const data = await response.json();
            
            // 새 리뷰 병합
            if (Array.isArray(data.reviews) && data.reviews.length > 0) {
                this.allReviews = [...this.allReviews, ...data.reviews];
                this.hasMoreServerData = data.reviews.length >= this.reviewsPerPage;
            } else {
                this.hasMoreServerData = false;
            }
            
            // 업데이트된 리뷰 표시
            this.filterAndDisplayReviews();
            
        } catch (error) {
            console.error('추가 리뷰 로드 오류:', error);
            this.showAlert('추가 리뷰를 로드하는 중 오류가 발생했습니다.');
        } finally {
            this.isLoadingMore = false;
        }
    }
    
    buildReviewsRequestParams() {
        // 공통 요청 파라미터 생성
        const params = new URLSearchParams();
        
        if (!this.selectedStoreData) return params;
        
        // 전체 모아보기인 경우
        if (this.selectedStoreData.all_stores) {
            if (Array.isArray(this.selectedStoreData.store_codes)) {
                this.selectedStoreData.store_codes.forEach(code => {
                    params.append('store_code', code);
                });
            }
        } else {
            // 개별 매장인 경우
            if (this.selectedStoreData.store_code) {
                params.append('store_code', this.selectedStoreData.store_code);
            }
            
            if (this.selectedStoreData.platform_code) {
                params.append('platform_code', this.selectedStoreData.platform_code);
            }
            
            if (this.selectedStoreData.platform) {
                params.append('platform', this.selectedStoreData.platform);
            }
        }
        
        // 날짜 추가
        if (this.selectedDateRange) {
            if (this.selectedDateRange.startDate) {
                params.append('start_date', this.formatDateForAPI(this.selectedDateRange.startDate));
            }
            
            if (this.selectedDateRange.endDate) {
                params.append('end_date', this.formatDateForAPI(this.selectedDateRange.endDate));
            }
        }
        
        return params;
    }
    
    clearDashboard() {
        const reviewsBody = document.getElementById('reviewsBody');
        if (reviewsBody) reviewsBody.innerHTML = '';
        
        // 요소 존재 여부 확인 후 설정
        const totalReviews = document.getElementById('totalReviews');
        if (totalReviews) totalReviews.textContent = '0';
        
        const needsReplyCount = document.getElementById('needsReplyCount');
        if (needsReplyCount) needsReplyCount.textContent = '0';
        
        // avgRating 요소 체크 (이전 버전 호환성)
        const avgRating = document.getElementById('avgRating');
        if (avgRating) avgRating.textContent = '0.0';
        
        for (let i = 1; i <= 5; i++) {
            const ratingCount = document.getElementById(`rating${i}Count`);
            if (ratingCount) ratingCount.textContent = '0';
        }
        
        this.chartManager.destroy();
        this.currentFilter = null;
        this.allReviews = [];
        this.reviewsPage = 1;
        this.hasMoreReviews = false;
    }

    async handleStoreChange() {
        try {
            const storeSelect = document.getElementById('storeSelect');
            const selectedValue = storeSelect.value;
    
            if (!selectedValue) {
                this.selectedStoreData = null;
                this.clearDashboard();
                return;
            }
    
            const storeData = JSON.parse(selectedValue);
            console.log('Selected store data:', storeData);
            
            // 선택된 스토어 데이터 저장
            this.selectedStoreData = storeData;
            
            // 데이터 리셋 및 새로 로드
            this.resetAndLoadData();
            
        } catch (error) {
            console.error('Store change error:', error);
            this.clearDashboard();
        }
    }

    resetAndLoadData() {
        // 페이지 상태 초기화
        this.reviewsPage = 1;
        this.allReviews = [];
        this.hasMoreReviews = false;
        
        // 로딩 표시기 표시
        this.showLoadingIndicator(true);
        
        // 데이터 로드
        if (this.selectedStoreData && this.selectedDateRange) {
            if (this.selectedStoreData.all_stores) {
                this.loadAllStoresStats(this.selectedDateRange, this.selectedStoreData.store_codes);
            } else {
                this.loadStatsAndReviews({
                    ...this.selectedDateRange,
                    store_code: this.selectedStoreData.store_code,
                    platform_code: this.selectedStoreData.platform_code,
                    platform: this.selectedStoreData.platform
                });
            }
        } else {
            this.showLoadingIndicator(false);
        }
    }
    
    showLoadingIndicator(show) {
        let loadingIndicator = document.getElementById('dashboardLoadingIndicator');
        
        if (show) {
            if (!loadingIndicator) {
                const indicator = document.createElement('div');
                indicator.id = 'dashboardLoadingIndicator';
                indicator.className = 'loading-indicator';
                indicator.innerHTML = `
                    <div class="loading-spinner-container">
                        <div class="spinner"></div>
                        <div class="loading-text">데이터를 불러오는 중...</div>
                    </div>
                `;
                document.body.appendChild(indicator);
                
                // 로딩 인디케이터 스타일 추가
                const style = document.createElement('style');
                style.textContent = `
                    .loading-indicator {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background: rgba(255, 255, 255, 0.8);
                        backdrop-filter: blur(3px);
                        z-index: 9999;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                    }
                    
                    .loading-spinner-container {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        background: white;
                        padding: 2rem;
                        border-radius: 15px;
                        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
                    }
                    
                    .spinner {
                        width: 50px;
                        height: 50px;
                        border: 5px solid #f3f3f3;
                        border-top: 5px solid #4CAF50;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                    }
                    
                    .loading-text {
                        margin-top: 1.5rem;
                        font-size: 1rem;
                        color: #333;
                        font-weight: 500;
                    }
                    
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `;
                document.head.appendChild(style);
            } else {
                loadingIndicator.style.display = 'flex';
            }
        } else if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
    }

    async loadAllStoresStats({ startDate, endDate }, storeCodes) {
        try {
            // 통계 데이터만 먼저 로드
            const statsPromises = storeCodes.map(storeCode => 
                fetch(`${CONFIG.API_BASE_URL}/stats/details?store_code=${storeCode}&start_date=${this.formatDateForAPI(startDate)}&end_date=${this.formatDateForAPI(endDate)}`, {
                    headers: {
                        'Authorization': authService.getAuthHeader(),
                        'Content-Type': 'application/json'
                    }
                }).then(response => {
                    if (!response.ok) {
                        console.warn(`매장 ${storeCode} 데이터 조회 실패`);
                        return null;
                    }
                    return response.json();
                }).catch(error => {
                    console.error(`매장 ${storeCode} 데이터 오류:`, error);
                    return null;
                })
            );
            
            const results = await Promise.all(statsPromises);
            
            // 성공한 결과만 필터링
            const successfulResults = results
                .filter(result => result !== null)
                .filter(result => result?.stats?.length > 0 || result?.reviews?.length > 0);
            
            if (successfulResults.length === 0) {
                this.showAlert('데이터가 없습니다', 'warning');
                this.clearDashboard();
                this.showLoadingIndicator(false);
                return;
            }
            
            // 통계 데이터 병합 및 업데이트
            const combinedStats = this.combineStatsData(successfulResults);
            
            // 통계 정보 업데이트
            this.updateStats(combinedStats.stats);
            this.updateChart(combinedStats.stats);
            
            // 리뷰 데이터 저장 (첫 페이지)
            this.allReviews = combinedStats.reviews || [];
            this.hasMoreServerData = true; // 필요시 서버에서 추가 로드 가능
            
            // 리뷰 표시
            this.filterAndDisplayReviews(true);
            
            // 로딩 인디케이터 숨김
            this.showLoadingIndicator(false);
            
        } catch (error) {
            console.error('전체 통계 로드 오류:', error);
            this.showAlert('전체 통계를 로드하는 중 오류가 발생했습니다', 'error');
            this.clearDashboard();
            this.showLoadingIndicator(false);
        }
    }

    combineStatsData(resultsArray) {
        // 빈 결과 객체 초기화
        const combined = {
            stats: [],
            reviews: [],
            meta: {
                total_stats: 0,
                total_reviews: 0,
                needs_boss_reply: 0
            }
        };
        
        // 날짜별 통계 데이터를 병합하기 위한 맵
        const statsMap = new Map();
        
        // 각 결과 처리
        resultsArray.forEach(result => {
            // 리뷰 데이터 추가 (첫 페이지만)
            if (Array.isArray(result.reviews)) {
                const newReviews = result.reviews.slice(0, this.reviewsPerPage);
                combined.reviews = [...combined.reviews, ...newReviews];
            }
            
            // 통계 데이터 날짜별로 병합
            if (Array.isArray(result.stats)) {
                result.stats.forEach(stat => {
                    const dateKey = stat.review_date;
                    if (statsMap.has(dateKey)) {
                        // 기존 날짜의 통계 업데이트
                        const existingStat = statsMap.get(dateKey);
                        existingStat.total_reviews += (stat.total_reviews || 0);
                        existingStat.rating_5_count += (stat.rating_5_count || 0);
                        existingStat.rating_4_count += (stat.rating_4_count || 0);
                        existingStat.rating_3_count += (stat.rating_3_count || 0);
                        existingStat.rating_2_count += (stat.rating_2_count || 0);
                        existingStat.rating_1_count += (stat.rating_1_count || 0);
                        existingStat.boss_reply_count += (stat.boss_reply_count || 0);
                        
                        // 평균 평점 재계산
                        const totalRatings = existingStat.rating_5_count + existingStat.rating_4_count +
                                            existingStat.rating_3_count + existingStat.rating_2_count +
                                            existingStat.rating_1_count;
                        
                        if (totalRatings > 0) {
                            existingStat.avg_rating = (
                                (5 * existingStat.rating_5_count +
                                4 * existingStat.rating_4_count +
                                3 * existingStat.rating_3_count +
                                2 * existingStat.rating_2_count +
                                1 * existingStat.rating_1_count) / totalRatings
                            ).toFixed(2);
                        }
                    } else {
                        // 새 날짜 통계 추가
                        statsMap.set(dateKey, {
                            ...stat,
                            review_date: dateKey
                        });
                    }
                });
            }
            
            // 메타 데이터 업데이트
            if (result.meta) {
                combined.meta.total_stats += (result.meta.total_stats || 0);
                combined.meta.total_reviews += (result.meta.total_reviews || 0);
                combined.meta.needs_boss_reply += (result.meta.needs_boss_reply || 0);
            }
        });
        
        // 통계 맵을 배열로 변환하고 날짜별로 정렬
        combined.stats = Array.from(statsMap.values())
            .sort((a, b) => new Date(b.review_date) - new Date(a.review_date));
            
        // 리뷰를 날짜 기준 내림차순 정렬
        combined.reviews.sort((a, b) => 
            new Date(b.review_date || b.created_at) - new Date(a.review_date || a.created_at)
        );
        
        return combined;
    }

    // dashboard.js 파일 안의 loadStatsAndReviews 함수 수정

// 직접 API 호출 메서드 추가
async loadStoresByDirectMethod(userId) {
    console.log('직접 API 호출 메서드 시도 - 사용자 ID:', userId);
    
    try {
      // 테스트 데이터 생성 (실제 API가 동작하지 않을 경우 대체)
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
      
      console.log('가상 매장 데이터 생성:', mockStores);
      
      const formattedStores = mockStores.map(store => ({
        value: JSON.stringify({
          store_code: store.store_code,
          platform_code: store.platform_code || '',
          platform: store.platform || '배달의민족'
        }),
        label: store.platform_code ? 
               `[${store.platform}] ${store.store_name} (${store.platform_code})` :
               `[${store.platform}] ${store.store_name}`,
        store_code: store.store_code
      }));
      
      console.log('포맷팅된 가상 매장 목록:', formattedStores);
      this.populateStoreSelectWithAllOption(formattedStores);
      
      // 사용자에게 알림
      this.showAlert('현재 API 서버와 연결이 원활하지 않아 테스트 데이터를 표시합니다.', 'warning');
      
      return formattedStores;
    } catch (error) {
      console.error('직접 API 호출 메서드 실패:', error);
      this.showAlert('매장 정보를 가져올 수 없습니다. 나중에 다시 시도해주세요.', 'error');
      return [];
    }
  }

async loadStatsAndReviews({ startDate, endDate, store_code, platform_code, platform } = {}) {
    try {
      // 로딩 표시기 표시
      this.showLoadingIndicator(true);
      
      if (!store_code) {
        this.clearDashboard();
        this.showLoadingIndicator(false);
        return;
      }
      
      console.log('Loading stats with filters:', { 
        store_code, 
        platform_code,
        platform,
        startDate, 
        endDate 
      });
      
      // URL 파라미터 구성
      const params = new URLSearchParams({
        store_code: store_code
      });
  
      // 플랫폼 코드가 있으면 추가
      if (platform_code) {
        params.append('platform_code', platform_code);
      }
      
      // 플랫폼 정보가 있으면 추가
      if (platform) {
        params.append('platform', platform);
      }
  
      // 날짜 파라미터 추가
      if (startDate && endDate) {
        const formattedStartDate = this.formatDateForAPI(startDate);
        const formattedEndDate = this.formatDateForAPI(endDate);
        console.log('Date range:', { formattedStartDate, formattedEndDate });
        params.append('start_date', formattedStartDate);
        params.append('end_date', formattedEndDate);
      }
      
      // 한 번에 가져올 리뷰 수를 제한
      params.append('limit', this.reviewsPerPage.toString());
      
      // 절대 경로로 URL 변경
      const baseUrl = window.location.origin;
      const url = `${baseUrl}/.netlify/functions/stats-details?${params.toString()}`;
      console.log('Requesting URL:', url);
  
      const response = await fetch(url, {
        headers: {
          'Authorization': authService.getAuthHeader(),
          'Content-Type': 'application/json'
        }
      });
  
      if (!response.ok) throw new Error('데이터 조회에 실패했습니다');
  
      const data = await response.json();
      console.log('Received data:', data);
      
      // 서버에서 더 많은 데이터를 가져올 수 있는지 확인
      this.hasMoreServerData = Array.isArray(data.reviews) && 
        data.reviews.length >= this.reviewsPerPage;
        
      // 대시보드 업데이트
      this.updateDashboard(data);
      this.showLoadingIndicator(false);
      
    } catch (error) {
      console.error('Stats loading error:', error);
      this.clearDashboard();
      this.showLoadingIndicator(false);
      this.showAlert('데이터를 불러오는 중 오류가 발생했습니다', 'error');
    }
  }

    showAlert(message, type = 'info') {
        const alertElement = document.createElement('div');
        alertElement.id = 'dashboard-alert';
        alertElement.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            padding: 1rem 1.5rem;
            border-radius: 10px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 1000;
            font-size: 1rem;
            max-width: 400px;
            animation: fadeInOut 5s ease-in-out;
            display: flex;
            align-items: center;
            gap: 0.75rem;
        `;
        
        // 알림 타입별 스타일과 아이콘
        const styles = {
            'info': { 
                bg: '#e3f2fd', 
                color: '#0d47a1', 
                border: '#90caf9',
                icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
            },
            'success': { 
                bg: '#e8f5e9', 
                color: '#1b5e20', 
                border: '#a5d6a7',
                icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>'
            },
            'warning': { 
                bg: '#fff3e0', 
                color: '#e65100', 
                border: '#ffcc80',
                icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>'
            },
            'error': { 
                bg: '#ffebee', 
                color: '#c62828', 
                border: '#ef9a9a',
                icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>'
            }
        };
        
        const style = styles[type] || styles.info;
        alertElement.style.backgroundColor = style.bg;
        alertElement.style.color = style.color;
        alertElement.style.borderLeft = `4px solid ${style.border}`;
        
        alertElement.innerHTML = `
            <div class="alert-icon">${style.icon}</div>
            <div class="alert-message">${message}</div>
        `;
        
        // 애니메이션 스타일 추가
        const styleSheet = document.createElement('style');
        styleSheet.textContent = `
            @keyframes fadeInOut {
                0% { opacity: 0; transform: translateX(20px); }
                10% { opacity: 1; transform: translateX(0); }
                90% { opacity: 1; transform: translateX(0); }
                100% { opacity: 0; transform: translateX(20px); }
            }
        `;
        document.head.appendChild(styleSheet);
        
        // 기존 알림 제거
        const existingAlert = document.getElementById('dashboard-alert');
        if (existingAlert) {
            document.body.removeChild(existingAlert);
        }
        
        document.body.appendChild(alertElement);
        
        // 5초 후 알림 제거
        setTimeout(() => {
            if (document.body.contains(alertElement)) {
                document.body.removeChild(alertElement);
            }
        }, 5000);
    }

updateDashboard(data) {
    if (!data) {
        console.warn('Dashboard data is empty');
        this.clearDashboard();
        return;
    }
    
    const { stats = [], reviews = [] } = data;
    
    // 리뷰 데이터 저장
    this.allReviews = reviews;
    
    try {
        // 통계 및 차트 업데이트 (최대한 빨리 표시)
        this.updateStats(stats);
        this.updateChart(stats);
        
        // 리뷰 목록 표시
        this.filterAndDisplayReviews(true);
        
    } catch (error) {
        console.error('Dashboard update error:', error);
        // 오류 발생 시에도 최대한 많은 정보를 보여주기 위해 부분적 복구 시도
        this.showAlert('일부 데이터를 표시하는데 문제가 발생했습니다', 'warning');
    }
}

updateStats(stats) {
    if (!Array.isArray(stats)) {
        console.warn('Stats data is not an array:', stats);
        return;
    }

    // 전체 리뷰 수
    const total = stats.reduce((acc, item) => acc + (item.total_reviews || 0), 0);

    // 확인 필요 리뷰 수 (boss_reply_count)
    const needsReply = stats.reduce((acc, item) => acc + (item.boss_reply_count || 0), 0);

    // 기본 통계 업데이트
    const totalReviewsElement = document.getElementById('totalReviews');
    if (totalReviewsElement) totalReviewsElement.textContent = total;
    
    const needsReplyElement = document.getElementById('needsReplyCount');
    if (needsReplyElement) needsReplyElement.textContent = needsReply;

    // 별점별 카운트 계산 및 업데이트
    const ratings = {
        5: stats.reduce((acc, cur) => acc + (cur.rating_5_count || 0), 0),
        4: stats.reduce((acc, cur) => acc + (cur.rating_4_count || 0), 0),
        3: stats.reduce((acc, cur) => acc + (cur.rating_3_count || 0), 0),
        2: stats.reduce((acc, cur) => acc + (cur.rating_2_count || 0), 0),
        1: stats.reduce((acc, cur) => acc + (cur.rating_1_count || 0), 0)
    };

    for (const [rating, count] of Object.entries(ratings)) {
        const element = document.getElementById(`rating${rating}Count`);
        if (element) element.textContent = count;
    }

    // 통계 테이블 업데이트
    this.updateStatsTable(stats);
}

updateStatsTable(stats) {
    const tbody = document.getElementById('statsBody');
    if (!tbody) return;

    tbody.innerHTML = stats.map(item => `
        <tr>
            <td>${utils.formatDate(item.review_date)}</td>
            <td>${item.total_reviews || 0}</td>
            <td>${item.boss_reply_count || 0}</td>
            <td>${item.rating_5_count || 0}</td>
            <td>${item.rating_4_count || 0}</td>
            <td>${item.rating_3_count || 0}</td>
            <td>${item.rating_2_count || 0}</td>
            <td>${item.rating_1_count || 0}</td>
        </tr>
    `).join('');
}

createReviewHTML(review) {
    const safeReviewContent = this.sanitizeHTML(review.review_content || '-');
    const safeAiResponse = this.sanitizeHTML(review.ai_response || '답변 없음');
    
    // 확인 필요 표시 추가
    const needsReplyBadge = review.boss_reply_needed ? 
        '<span class="badge-needs-reply">확인필요</span>' : '';
    
    // 확인 필요 행 스타일 클래스 추가
    const rowClass = review.boss_reply_needed ? 'needs-attention' : '';
    
    return `
        <div class="review-row ${rowClass}">
            <div class="review-main">
                <div class="review-date">${utils.formatDate(review.review_date)}</div>
                <div class="review-author">${this.sanitizeHTML(review.review_name || '-')} ${needsReplyBadge}</div>
                <div class="review-rating">
                    <span class="rating rating-${review.rating || 0}">${review.rating || '-'}</span>
                </div>
                <div class="review-content">${safeReviewContent}</div>
            </div>
            <div class="review-response">
                <div class="response-status">
                    ${utils.getStatusBadge(review.response_status)}
                </div>
                <div class="ai-response ${review.ai_response ? '' : 'no-response'}">
                    ${safeAiResponse}
                </div>
            </div>
        </div>
    `;
}

updateChart(stats) {
    const ctx = document.getElementById('ratingChart')?.getContext('2d');
    if (!ctx) {
        console.warn('Rating chart canvas not found');
        return;
    }
    
    try {
        this.chartManager.create(ctx, stats);
    } catch (error) {
        console.error('Chart creation error:', error);
    }
}

showErrorMessage(message) {
    // 에러 메시지를 표시하는 헬퍼 메서드
    console.error(message);
    this.showAlert(message, 'error');
}
} // DashboardManager 클래스 닫기

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
    new DashboardManager();
});

export default DashboardManager;