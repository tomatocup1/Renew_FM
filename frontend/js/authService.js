// frontend/js/authService.js
class AuthService {
    constructor() {
      this.API_URL = '/api';
        this.tokenRefreshTimeouts = new Set();
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
          console.log('로그인 API 호출 시작:', email);
          
          const response = await this.fetchWithRetry(`${this.API_URL}/auth/signin`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            credentials: 'include',
            mode: 'cors',
            body: JSON.stringify({ email, password })
          });
      
          console.log('API 응답 상태:', response.status);
          const data = await response.json();
      
          if (!response.ok) {
            console.error('로그인 실패 응답:', data);
            throw new Error(data.error || '로그인에 실패했습니다.');
          }
      
          console.log('로그인 응답 데이터:', data);
      
          if (!data.session || !data.user) {
            console.error('응답 데이터 형식 오류:', data);
            throw new Error('서버에서 올바른 세션 정보를 받지 못했습니다.');
          }
      
          console.log('세션 정보 저장 시작');
          
          // 세션 저장 - 첫 번째 방법 (setSession 메서드 사용)
          try {
            this.setSession(data.session);
            console.log('setSession 메서드로 세션 저장 완료');
          } catch (sessionError) {
            console.error('setSession 메서드 실패:', sessionError);
            
            // 두 번째 방법 - 직접 localStorage에 저장
            try {
              const sessionJson = JSON.stringify(data.session);
              localStorage.setItem('session', sessionJson);
              console.log('직접 localStorage에 세션 저장 완료');
            } catch (directError) {
              console.error('직접 localStorage 저장 실패:', directError);
              
              // 세 번째 방법 - 세션 스토리지에 시도
              try {
                sessionStorage.setItem('session', JSON.stringify(data.session));
                console.log('sessionStorage에 세션 저장 완료');
              } catch (sessionStorageError) {
                console.error('sessionStorage 저장도 실패:', sessionStorageError);
              }
            }
          }
          
          // 사용자 정보 저장
          try {
            this.setUser(data.user);
            console.log('사용자 정보 저장 완료');
          } catch (userError) {
            console.error('사용자 정보 저장 실패:', userError);
            
            // 직접 저장 시도
            try {
              localStorage.setItem('user', JSON.stringify(data.user));
              console.log('직접 localStorage에 사용자 정보 저장 완료');
            } catch (directUserError) {
              console.error('직접 사용자 정보 저장 실패:', directUserError);
            }
          }
          
          // 세션 저장 확인
          const savedSession = localStorage.getItem('session') || sessionStorage.getItem('session');
          console.log('세션 저장 결과:', savedSession ? '성공' : '실패');
          
          // 저장 실패 시 오류 발생
          if (!savedSession) {
            console.error('모든 세션 저장 방법 실패. 브라우저 스토리지 액세스 문제일 수 있습니다.');
          }
          
          return data;
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
      
          console.log('토큰 갱신 시도, refresh_token 존재함');
          
          // 요청 URL 로깅 추가
          const refreshUrl = `${this.API_URL}/auth/refresh-token`; // 수정된 부분: /api 경로 정확히 입력
          console.log('요청 URL:', refreshUrl);
          
          try {
            const response = await fetch(refreshUrl, {
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
            
            if (!response.ok) {
              console.error('토큰 갱신 실패:', response.status);
              
              // 404 오류일 경우 세션을 유지하고 null 반환 (세션 클리어 방지)
              if (response.status === 404) {
                console.warn('토큰 갱신 엔드포인트를 찾을 수 없습니다. 기존 세션을 유지합니다.');
                
                // 중요: 임시 만료 시간 설정 - 현재 시간에서 5분 추가
                const tempSession = {
                  ...session,
                  expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
                };
                
                // 임시 세션 저장
                this.setSession(tempSession);
                return tempSession;
              }
              
              return null;
            }
      
            const data = await response.json();
            if (!data.session) {
              console.error('토큰 갱신 응답에 세션 정보가 없습니다');
              return null;
            }
      
            console.log('토큰 갱신 성공');
            this.setSession(data.session);
            
            return data.session;
          } catch (fetchError) {
            console.error('토큰 갱신 요청 중 네트워크 오류:', fetchError);
            
            // 네트워크 오류일 경우 세션 유지를 위한 임시 만료 시간 설정
            const tempSession = {
              ...session,
              expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
            };
            
            // 임시 세션 저장
            this.setSession(tempSession);
            return tempSession;
          }
        } catch (error) {
          console.error('토큰 갱신 중 예외 발생:', error);
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
                console.log('No valid session found');
                return null;
            }
    
            const cachedUser = this.getUser();
            if (cachedUser) {
                return cachedUser;
            }
    
            const response = await this.fetchWithRetry(`${this.API_URL}/auth/user`, {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Accept': 'application/json'
                },
                credentials: 'include'
            });
    
            if (response.status === 401) {
                console.log('Token expired, attempting refresh');
                const newSession = await this.refreshToken();
                if (!newSession) {
                    return null;
                }
                return this.getCurrentUser();
            }
    
            if (!response.ok) {
                console.error('Failed to get user info:', response.status);
                return null;
            }
    
            const { user } = await response.json();
            if (!user) {
                console.error('Invalid user data received');
                return null;
            }
            
            this.setUser(user);
            return user;
        } catch (error) {
            console.error('Get current user error:', error);
            return null;
        }
    }

    setSession(session) {
        if (!session) {
          console.error('세션 데이터가 없습니다');
          return;
        }
        
        try {
          // 세션 객체 검증
          if (typeof session !== 'string' && (!session.access_token || !session.refresh_token)) {
            console.warn('불완전한 세션 데이터:', session);
            // 기존 세션이 있다면 유지
            const existingSession = localStorage.getItem('session');
            if (existingSession) {
              console.log('기존 세션 유지');
              return;
            }
          }
          
          // 객체인 경우 문자열로 변환
          const sessionStr = typeof session === 'string' ? session : JSON.stringify(session);
          
          // 세션 저장 - 여러 저장소에 중복 저장하여 안정성 확보
          try {
            // localStorage에 저장 - 주 저장소
            localStorage.setItem('session', sessionStr);
            console.log('세션 localStorage 저장 완료:', new Date().toISOString());
            
            // 백업용 저장소에도 저장
            sessionStorage.setItem('session', sessionStr);
            console.log('세션 sessionStorage 백업 저장 완료');
            
            // 쿠키에도 저장 (추가 안전장치)
            document.cookie = `session=${encodeURIComponent(sessionStr)}; path=/; max-age=86400; samesite=lax`;
            console.log('세션 쿠키 백업 저장 완료');
          } catch (e) {
            console.error('주 저장소 저장 오류:', e);
            
            // 대체 저장소 시도
            try {
              sessionStorage.setItem('session', sessionStr);
              console.log('세션 sessionStorage에 대체 저장됨');
            } catch (e2) {
              console.error('모든 저장소 저장 실패:', e2);
            }
          }
          
          // 토큰 갱신 타이머 설정
          this.initTokenRefresh();
        } catch (error) {
          console.error('세션 저장 중 오류:', error);
        }
      }

      getSession() {
        try {
          // 먼저 localStorage에서 확인
          let sessionStr = localStorage.getItem('session');
          
          // localStorage에 없으면 sessionStorage 확인
          if (!sessionStr) {
            console.log('localStorage에 세션 없음, sessionStorage 확인');
            sessionStr = sessionStorage.getItem('session');
          }
          
          // 쿠키에서도 확인 (마지막 수단)
          if (!sessionStr) {
            console.log('스토리지에 세션 없음, 쿠키 확인');
            const cookies = document.cookie.split(';');
            for (const cookie of cookies) {
              const [name, value] = cookie.trim().split('=');
              if (name === 'session') {
                sessionStr = decodeURIComponent(value);
                break;
              }
            }
          }
          
          if (!sessionStr) {
            console.log('어떤 저장소에도 세션이 없음');
            return null;
          }
          
          // 문자열을 객체로 파싱
          try {
            return JSON.parse(sessionStr);
          } catch (parseError) {
            console.error('세션 데이터 파싱 오류:', parseError);
            return null;
          }
        } catch (error) {
          console.error('getSession 오류:', error);
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
          // 모든 저장소에서 세션 검색
          let sessionStr = localStorage.getItem('session');
          
          // localStorage에 없으면 sessionStorage 확인
          if (!sessionStr) {
            console.log('localStorage에 세션 없음, sessionStorage 확인');
            sessionStr = sessionStorage.getItem('session');
          }
          
          // 쿠키에서도 확인
          if (!sessionStr) {
            console.log('스토리지에 세션 없음, 쿠키 확인');
            const cookies = document.cookie.split(';');
            for (const cookie of cookies) {
              const [name, value] = cookie.trim().split('=');
              if (name === 'session') {
                sessionStr = decodeURIComponent(value);
                // 쿠키에서 발견했으면 localStorage에 복원
                try {
                  localStorage.setItem('session', sessionStr);
                  console.log('쿠키에서 세션 복원됨');
                } catch (e) {
                  console.warn('쿠키에서 localStorage 복원 실패:', e);
                }
                break;
              }
            }
          }
          
          if (!sessionStr) {
            console.log('어떤 저장소에도 세션이 없음');
            return false;
          }
          
          // 세션 파싱 및 유효성 검사
          let session;
          try {
            session = JSON.parse(sessionStr);
          } catch (e) {
            console.error('세션 데이터 파싱 오류:', e);
            return false;
          }
          
          if (!session.access_token) {
            console.error('세션에 액세스 토큰 없음');
            return false;
          }
          
          // 만료 시간 검사
          let expiresAt;
          try {
            expiresAt = new Date(session.expires_at).getTime();
            
            // 잘못된 만료 시간 감지 (1970년대 날짜)
            if (expiresAt < Date.now() - 365 * 24 * 60 * 60 * 1000) {
              console.warn('잘못된 만료 시간 감지 (1970년대 날짜)');
              return this.refreshToken()
                .then(newSession => !!newSession)
                .catch(() => false);
            }
          } catch (e) {
            console.error('만료 시간 파싱 오류:', e);
            return this.refreshToken()
              .then(newSession => !!newSession)
              .catch(() => false);
          }
          
          const now = new Date().getTime();
          console.log('세션 만료까지 남은 시간:', Math.round((expiresAt - now) / 1000), '초');
          
          // 만료 10분 전에 갱신 시도
          if (expiresAt <= now + (10 * 60 * 1000)) {
            console.log('세션 만료 임박, 갱신 시도');
            return this.refreshToken()
              .then(newSession => !!newSession)
              .catch(err => {
                console.error('Token refresh failed:', err);
                // 만료되지 않았다면 true 반환
                return expiresAt > now;
              });
          }
          
          return true;
        } catch (error) {
          console.error('인증 상태 확인 오류:', error);
          return false;
        }
      }

    getAuthHeader() {
        try {
          const session = this.getSession();
          console.log('getAuthHeader 호출됨, 세션:', session ? '존재함' : '없음');
          
          if (!session?.access_token) {
            console.warn('토큰 없음 - 세션 데이터:', session);
            return '';
          }
          
          console.log('토큰 마스킹:', session.access_token.substring(0, 10) + '...');
          return `Bearer ${session.access_token}`;
        } catch (error) {
          console.error('Auth header 생성 중 오류:', error);
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