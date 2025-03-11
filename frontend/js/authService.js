// frontend/js/authService.js
class AuthService {
  constructor() {
    this.API_URL = '/api';
    this.tokenRefreshInterval = null;
    this.rateLimitRetryDelay = 1000;
    this.maxRetries = 3;
    this.isRefreshing = false;
    this.retryQueue = [];
    this.initTokenRefresh();
  }
  
    // 소셜 로그인 URL 가져오기
    async getSocialLoginUrl(provider) {
        try {
            const response = await this.fetchWithRetry(`${this.API_URL}/auth/social-url/${provider}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error(`소셜 로그인 URL 요청 실패 (${response.status})`);
            }

            return await response.json();
        } catch (error) {
            console.error('Social login URL error:', error);
            throw error;
        }
    }

    // 소셜 로그인 처리
    async processSocialLogin(provider, token) {
        try {
            const response = await this.fetchWithRetry(`${this.API_URL}/auth/social-login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({ provider, access_token: token })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || '소셜 로그인에 실패했습니다.');
            }

            const data = await response.json();
            if (!data.session || !data.user) {
                throw new Error('Invalid response data');
            }

            this.setSession(data.session);
            this.setUser(data.user);
            
            await this.initTokenRefresh();
            return data;
        } catch (error) {
            console.error('Social login error:', error);
            throw error;
        }
    }

    // 기존 로그인 함수
    async login(email, password) {
      try {
        console.log('로그인 시도:', email);
        
        // 로그인 API 경로 - 주 경로로 단순화
        const loginPath = `${this.API_URL}/signin`;
        
        console.log(`로그인 API 호출: ${loginPath}`);
        
        const response = await fetch(loginPath, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({ email, password })
        });
        
        console.log(`로그인 응답 상태:`, response.status);
        
        // 응답 확인 및 처리
        if (!response.ok) {
          throw new Error('로그인에 실패했습니다. 이메일과 비밀번호를 확인하세요.');
        }
        
        // 응답 데이터 처리
        const responseData = await response.json();
        console.log('로그인 응답 데이터 수신');
        
        if (!responseData.session || !responseData.user) {
          throw new Error('서버에서 올바른 세션 정보를 받지 못했습니다.');
        }
        
        // 세션 및 사용자 정보 저장
        this.setSession(responseData.session);
        this.setUser(responseData.user);
        
        // 토큰 갱신 타이머 설정
        await this.initTokenRefresh();
        
        // 저장 확인
        const savedSession = localStorage.getItem('session');
        if (!savedSession) {
          console.warn('세션 저장 실패, 수동 저장 시도');
          try {
            localStorage.setItem('session', JSON.stringify(responseData.session));
          } catch (e) {
            console.error('수동 세션 저장 실패:', e);
          }
        }
        
        return responseData;
      } catch (error) {
        console.error('로그인 처리 중 예외 발생:', error);
        throw error;
      }
    }
    
    // frontend/js/authService.js
    async initTokenRefresh() {
        try {
          const session = this.getSession();
          if (!session) return;
      
          this.clearExistingRefreshTimer();
      
          // 만료 시간 확인
          let expiresAt;
          try {
            expiresAt = new Date(session.expires_at).getTime();
            
            // 잘못된 만료 시간 감지 (1970년대 날짜는 오류로 간주)
            if (expiresAt < Date.now() - 365 * 24 * 60 * 60 * 1000) {
              console.warn('잘못된 만료 시간 감지, 현재 시간 기준으로 임시 설정');
              expiresAt = Date.now() + 60 * 60 * 1000; // 현재 시간 + 1시간
              
              // 세션 업데이트
              session.expires_at = new Date(expiresAt).toISOString();
              this.setSession(session);
            }
          } catch (e) {
            console.error('만료 시간 파싱 오류:', e);
            expiresAt = Date.now() + 60 * 60 * 1000; // 현재 시간 + 1시간
            
            // 세션 업데이트
            session.expires_at = new Date(expiresAt).toISOString();
            this.setSession(session);
          }
      
          const now = Date.now();
          // 만료 1분 전에 갱신
          const timeUntilRefresh = Math.max(expiresAt - now - (60 * 1000), 0);
      
          console.log(`토큰 갱신 타이머 설정: ${Math.round(timeUntilRefresh/1000)}초 후`);
      
          if (timeUntilRefresh > 0) {
            this.tokenRefreshInterval = setTimeout(async () => {
              try {
                await this.refreshToken();
              } catch (error) {
                console.error('Token refresh failed:', error);
                // 토큰 갱신 실패 시 바로 리다이렉트하지 않고 세션 만료되었을 때만 처리
              }
            }, timeUntilRefresh);
          } else {
            // 이미 만료된 경우 즉시 갱신 시도
            console.log('토큰이 이미 만료됨, 즉시 갱신 시도');
            try {
              await this.refreshToken();
            } catch (error) {
              console.error('Immediate token refresh failed:', error);
            }
          }
        } catch (error) {
          console.error('Token refresh init error:', error);
        }
      }

    clearExistingRefreshTimer() {
        if (this.tokenRefreshInterval) {
            clearTimeout(this.tokenRefreshInterval);
            this.tokenRefreshInterval = null;
        }
    }

    clearAllRefreshTimeouts() {
        this.tokenRefreshTimeouts.forEach(timeout => clearTimeout(timeout));
        this.tokenRefreshTimeouts.clear();
        this.clearExistingRefreshTimer();
    }

    async signup(userData) {
        try {
            console.log('Attempting signup');
            
            const response = await this.fetchWithRetry(`${this.API_URL}/auth/signup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                credentials: 'include',
                mode: 'cors',
                body: JSON.stringify(userData)
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || data.details || '회원가입에 실패했습니다.');
            }

            console.log('Signup successful');
            return data;
        } catch (error) {
            console.error('Signup error:', error);
            throw error;
        }
    }

    async logout() {
        try {
            const session = this.getSession();
            if (!session) return;

            console.log('Attempting logout');
            
            await this.fetchWithRetry(`${this.API_URL}/auth/signout`, {
                method: 'POST',
                headers: {
                    'Authorization': this.getAuthHeader(),
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                mode: 'cors'
            });

            console.log('Logout successful');
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            this.clearSession();
            window.location.href = '/login.html';
        }
    }

    async refreshToken() {
      // 이미 갱신 중이면 대기
      if (this.isRefreshing) {
        return new Promise((resolve) => {
          this.retryQueue.push(resolve);
        });
      }
    
      this.isRefreshing = true;
    
      try {
        const session = this.getSession();
        if (!session?.refresh_token) {
          console.error('리프레시 토큰이 없습니다');
          return null;
        }
    
        console.log('토큰 갱신 시도');
        
        // API 요청
        const response = await fetch(`${this.API_URL}/refresh-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({
            refresh_token: session.refresh_token
          })
        });
        
        console.log('토큰 갱신 응답 상태:', response.status);
        
        // 응답 처리
        if (!response.ok) {
          console.warn('토큰 갱신 실패');
          return null;
        }
        
        // 성공 응답 처리
        try {
          const data = await response.json();
          
          if (!data.session) {
            console.warn('토큰 갱신 응답에 세션 정보 없음');
            return null;
          }
          
          console.log('토큰 갱신 성공');
          this.setSession(data.session);
          return data.session;
        } catch (jsonError) {
          console.error('토큰 갱신 응답 파싱 오류:', jsonError);
          return null;
        }
      } catch (error) {
        console.error('토큰 갱신 처리 중 예외 발생:', error);
        return null;
      } finally {
        this.isRefreshing = false;
        
        // 대기 중인 요청 처리
        this.retryQueue.forEach(resolve => resolve());
        this.retryQueue = [];
      }
    }
    
    handleTokenError() {
        // 토큰 에러 발생 시 세션 정보만 지우고, 현재 페이지 정보는 유지
        this.clearSession();
        
        // 리다이렉트 시 현재 URL 저장
        const currentPath = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/login.html?redirect=${currentPath}`;
    }
    async fetchAPI(endpoint, options = {}) {
        const url = endpoint.startsWith('http') 
          ? endpoint 
          : `${this.API_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
        
        try {
          const defaultOptions = {
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            credentials: 'include'
          };
          
          // 인증 토큰 추가
          const session = this.getSession();
          if (session?.access_token) {
            defaultOptions.headers.Authorization = `Bearer ${session.access_token}`;
          }
          
          // 옵션 병합
          const mergedOptions = {
            ...defaultOptions,
            ...options,
            headers: {
              ...defaultOptions.headers,
              ...options.headers
            }
          };
          
          console.log(`API 요청: ${url}`, {
            method: mergedOptions.method || 'GET'
          });
          
          const response = await fetch(url, mergedOptions);
          
          // 토큰 만료 시 자동 갱신 시도
          if (response.status === 401) {
            console.log('인증 오류 (401), 토큰 갱신 시도');
            const newSession = await this.refreshToken();
            
            if (newSession?.access_token) {
              // 헤더 업데이트
              mergedOptions.headers.Authorization = `Bearer ${newSession.access_token}`;
              
              // 요청 재시도
              return fetch(url, mergedOptions);
            }
          }
          
          return response;
        } catch (error) {
          console.error(`API 요청 오류 (${url}):`, error);
          throw error;
        }
      }
    async fetchWithRetry(url, options, maxRetries = 3, isRefreshAttempt = false) {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const response = await fetch(url, options);
                
                // 토큰 만료 오류 처리 (401 응답)
                if (response.status === 401 && !isRefreshAttempt) {
                    const newSession = await this.refreshToken();
                    if (newSession) {
                        // 헤더 업데이트
                        if (options.headers && options.headers.Authorization) {
                            options.headers.Authorization = `Bearer ${newSession.access_token}`;
                        } else if (options.headers) {
                            options.headers.Authorization = `Bearer ${newSession.access_token}`;
                        } else {
                            options.headers = {
                                Authorization: `Bearer ${newSession.access_token}`
                            };
                        }
                        // 재시도
                        return this.fetchWithRetry(url, options, maxRetries, true);
                    }
                }
                
                // 속도 제한 처리 (429 응답)
                if (response.status === 429) {
                    const retryAfter = response.headers.get('Retry-After') || this.rateLimitRetryDelay * Math.pow(2, attempt);
                    await new Promise(resolve => setTimeout(resolve, retryAfter));
                    continue;
                }

                return response;
            } catch (error) {
                // 네트워크 오류인 경우 재시도
                if (attempt === maxRetries - 1) throw error;
                await new Promise(resolve => setTimeout(resolve, this.rateLimitRetryDelay * Math.pow(2, attempt)));
            }
        }
        throw new Error('Max retry attempts reached');
    }

    async checkAuth() {
        try {
            const session = this.getSession();
            if (!session) {
                console.log('No session found during auth check');
                return false;
            }

            const expiresAt = new Date(session.expires_at).getTime();
            const now = new Date().getTime();

            console.log('Session expires in:', Math.round((expiresAt - now) / 1000), 'seconds');

            // 만료 5분 전에 갱신 시도
            if (expiresAt <= now + (5 * 60 * 1000)) {
                console.log('Session expires soon, attempting refresh');
                return !!(await this.refreshToken());
            }

            return true;
        } catch (error) {
            console.error('Auth check error:', error);
            return false;
        }
    }

    async getCurrentUser() {
      try {
        const session = this.getSession();
        if (!session?.access_token) {
          console.log('유효한 세션 없음');
          return null;
        }
    
        // 캐시된 사용자 정보 반환
        const cachedUser = this.getUser();
        if (cachedUser) {
          return cachedUser;
        }
    
        // 사용자 정보 API 호출 - 경로 수정: auth/user → auth-user
        try {
          const response = await fetch(`${this.API_URL}/auth-user`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Accept': 'application/json'
            },
            credentials: 'include'
          });
    
          // 토큰 만료 시 갱신 후 재시도
          if (response.status === 401) {
            console.log('토큰 만료, 갱신 시도');
            const newSession = await this.refreshToken();
            if (!newSession) {
              return null;
            }
            return this.getCurrentUser();
          }
    
          if (!response.ok) {
            console.error('사용자 정보 조회 실패:', response.status);
            return null;
          }
    
          const data = await response.json();
          if (!data.user) {
            console.error('유효하지 않은 사용자 데이터 응답');
            return null;
          }
          
          this.setUser(data.user);
          return data.user;
        } catch (apiError) {
          console.error('사용자 정보 API 호출 오류:', apiError);
          return null;
        }
      } catch (error) {
        console.error('사용자 정보 조회 중 예외 발생:', error);
        return null;
      }
    }

    setSession(session) {
      if (!session) {
        console.error('세션 데이터가 없습니다');
        return;
      }
      
      try {
        // 세션 데이터 검증
        if (typeof session !== 'string' && (!session.access_token && !session.expires_at)) {
          console.warn('세션 데이터 불완전함:', session);
          return;
        }
        
        // 문자열로 변환
        const sessionStr = typeof session === 'string' ? session : JSON.stringify(session);
        
        // 주 저장소에 저장
        try {
          localStorage.setItem('session', sessionStr);
          console.log('세션 저장 완료');
        } catch (mainError) {
          console.error('로컬 스토리지 저장 실패:', mainError);
          
          // 백업 저장소에 저장 시도
          try {
            sessionStorage.setItem('session', sessionStr);
            console.log('세션 백업 저장 완료 (sessionStorage)');
          } catch (backupError) {
            console.error('모든 저장소 저장 실패:', backupError);
          }
        }
        
        // 토큰 갱신 타이머 설정 (비동기로 처리)
        setTimeout(() => this.initTokenRefresh(), 0);
      } catch (error) {
        console.error('세션 저장 중 예외 발생:', error);
      }
    }

    getSession() {
      try {
        // 주 저장소에서 세션 조회
        let sessionStr = localStorage.getItem('session');
        
        // 주 저장소에 없으면 백업 저장소 확인
        if (!sessionStr) {
          sessionStr = sessionStorage.getItem('session');
          
          // 백업 저장소에서 발견되면 주 저장소에 복원
          if (sessionStr) {
            try {
              localStorage.setItem('session', sessionStr);
              console.log('백업 저장소에서 세션 복원됨');
            } catch (restoreError) {
              console.warn('세션 복원 실패:', restoreError);
            }
          } else {
            console.log('세션 정보 없음');
            return null;
          }
        }
        
        // 세션 파싱
        try {
          const session = JSON.parse(sessionStr);
          
          // 세션 유효성 간단 확인
          if (!session.access_token) {
            console.warn('유효하지 않은 세션 데이터 (토큰 없음)');
          }
          
          return session;
        } catch (parseError) {
          console.error('세션 파싱 오류:', parseError);
          return null;
        }
      } catch (error) {
        console.error('세션 조회 중 예외 발생:', error);
        return null;
      }
    }

    clearSession() {
        try {
            localStorage.removeItem('session');
            localStorage.removeItem('user');
            document.cookie = 'session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
            this.clearAllRefreshTimeouts();
            console.log('Session cleared successfully');
        } catch (error) {
            console.error('Error clearing session:', error);
        }
    }

    isAuthenticated() {
      try {
        // 세션 정보 확인 - 단순화된 방식으로 가져오기
        const sessionStr = localStorage.getItem('session') || sessionStorage.getItem('session');
        if (!sessionStr) {
          console.log('세션 정보 없음');
          return false;
        }
        
        // 세션 파싱
        let session;
        try {
          session = JSON.parse(sessionStr);
        } catch (e) {
          console.error('세션 데이터 파싱 오류:', e);
          return false;
        }
        
        // 토큰 만료 검사
        if (!session.access_token || !session.expires_at) {
          console.log('유효한 토큰 없음');
          return false;
        }
        
        // 만료 시간 확인
        const expiresAt = new Date(session.expires_at).getTime();
        const now = new Date().getTime();
        
        // 이미 만료된 경우
        if (expiresAt <= now) {
          console.log('토큰 만료됨');
          return false;
        }
        
        console.log('세션 유효함, 만료까지:', Math.round((expiresAt - now) / 1000), '초');
        return true;
      } catch (error) {
        console.error('인증 상태 확인 중 오류:', error);
        return false;
      }
    }

    getAuthHeader() {
      try {
        const session = this.getSession();
        
        // 세션 없음
        if (!session || !session.access_token) {
          console.log('인증 헤더 생성 불가: 토큰 없음');
          return '';
        }
        
        // 만료 시간 확인 및 필요시 갱신
        try {
          const expiresAt = new Date(session.expires_at).getTime();
          const now = new Date().getTime();
          
          // 만료 1분 이내인 경우 갱신 시도
          if (expiresAt - now < 60 * 1000) {
            console.log('토큰 만료 임박, 갱신 시도 (비동기)');
            // 갱신은 비동기로 진행하고 현재 토큰 반환
            setTimeout(() => this.refreshToken().catch(e => console.warn('백그라운드 토큰 갱신 실패:', e)), 0);
          }
        } catch (e) {
          console.warn('토큰 만료 시간 확인 오류:', e);
        }
        
        return `Bearer ${session.access_token}`;
      } catch (error) {
        console.error('인증 헤더 생성 중 오류:', error);
        return '';
      }
    }

    setUser(user) {
        if (!user) return;
        localStorage.setItem('user', JSON.stringify(user));
    }

    // frontend/js/authService.js
    getUser() {
        try {
            const userStr = localStorage.getItem('user');
            if (!userStr) {
                return null;
            }
            const user = JSON.parse(userStr);
            return user;
        } catch (error) {
            console.error('Error getting user:', error);
            localStorage.removeItem('user');
            return null;
        }
    }

    // OAuth 상태 처리
    parseAuthResult() {
        // URL 파라미터에서 OAuth 결과 추출
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const queryParams = new URLSearchParams(window.location.search);
        
        // OAuth 성공 파라미터
        const accessToken = hashParams.get('access_token') || queryParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token') || queryParams.get('refresh_token');
        const expiresIn = hashParams.get('expires_in') || queryParams.get('expires_in');
        const provider = hashParams.get('provider') || queryParams.get('provider');
        
        // OAuth 오류 파라미터
        const error = hashParams.get('error') || queryParams.get('error');
        const errorDescription = hashParams.get('error_description') || queryParams.get('error_description');
        
        if (error) {
            throw new Error(errorDescription || error);
        }
        
        if (accessToken && refreshToken && expiresIn && provider) {
            const expiresAt = new Date();
            expiresAt.setSeconds(expiresAt.getSeconds() + parseInt(expiresIn));
            
            return {
                access_token: accessToken,
                refresh_token: refreshToken,
                expires_at: expiresAt.toISOString(),
                provider
            };
        }
        
        return null;
    }
}

export const authService = new AuthService();