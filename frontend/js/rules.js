// js/rules.js
import { authService } from './authService.js';
import { CONFIG } from './config.js';

class RulesManager {
  constructor() {
    // API_URL을 Netlify 함수 경로로 설정
    this.API_URL = `${window.location.origin}/.netlify/functions`;
    this.currentStore = null;
    this.currentPlatform = null;
    this.currentPlatformCode = null;
    this.ruleData = null;
    this.init();
  }

  async init() {
    try {
      this.showLoading(true);

      // 인증 상태 확인
      if (!await authService.isAuthenticated()) {
        window.location.href = '/login.html';
        return;
      }

      // 요소 초기화
      this.initElements();
      
      // 이벤트 리스너 등록
      this.initEventListeners();
      
      // 매장 목록 로드
      await this.loadStores();
      
      this.showLoading(false);
    } catch (error) {
      console.error('Rules manager initialization failed:', error);
      this.showAlert('초기화 중 오류가 발생했습니다. 페이지를 새로고침 해주세요.', 'danger');
      this.showLoading(false);
    }
  }

  initElements() {
    // 폼 요소
    this.storeSelect = document.getElementById('storeSelect');
    this.greetingForm = document.getElementById('greetingForm');
    this.ratingReplyForm = document.getElementById('ratingReplyForm');
    
    // 입력 필드
    this.greetingStartInput = document.getElementById('greetingStart');
    this.greetingEndInput = document.getElementById('greetingEnd');
    
    // 체크박스
    this.ratingCheckboxes = {
        1: document.getElementById('rating1Reply'),
        2: document.getElementById('rating2Reply'),
        3: document.getElementById('rating3Reply'),
        4: document.getElementById('rating4Reply'),
        5: document.getElementById('rating5Reply')
    };
    
    // 기타 요소
    this.loadingIndicator = document.getElementById('loadingIndicator');
    this.alertContainer = document.getElementById('alertContainer');
  }

  initEventListeners() {
    // 매장 선택 변경 시
    if (this.storeSelect) {
      this.storeSelect.addEventListener('change', () => this.handleStoreChange());
    }
    
    // 인사말 폼 제출
    if (this.greetingForm) {
      this.greetingForm.addEventListener('submit', (e) => this.handleGreetingSubmit(e));
    }
    
    // 별점 답변 설정 폼 제출
    if (this.ratingReplyForm) {
      this.ratingReplyForm.addEventListener('submit', (e) => this.handleRatingReplySubmit(e));
    }
    
    // 추가 설정 폼 제출
    if (this.additionalSettingsForm) {
      this.additionalSettingsForm.addEventListener('submit', (e) => this.handleAdditionalSettingsSubmit(e));
    }
  }

  showLoading(show) {
    if (this.loadingIndicator) {
      this.loadingIndicator.classList.toggle('hidden', !show);
    }
  }

  showAlert(message, type = 'info') {
    if (!this.alertContainer) return;
    
    // 기존 알림 제거
    this.alertContainer.innerHTML = '';
    
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    
    this.alertContainer.appendChild(alert);
    
    // 3초 후 알림 자동 제거
    setTimeout(() => {
      alert.style.opacity = '0';
      alert.style.transition = 'opacity 0.5s';
      setTimeout(() => {
        if (this.alertContainer.contains(alert)) {
          this.alertContainer.removeChild(alert);
        }
      }, 500);
    }, 3000);
  }

  async loadStores() {
    try {
      const user = await authService.getCurrentUser();
      if (!user?.id) {
        throw new Error('사용자 정보를 가져올 수 없습니다.');
      }
      
      // 사용자의 매장 및 플랫폼 정보 조회 - Netlify 함수 경로 사용
      const response = await fetch(`${this.API_URL}/stores-user-platform`, {
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
      
      const stores = await response.json();
      
      // 중복 제거를 위한 맵 사용
      const uniqueStores = {};
      stores.forEach(store => {
        const key = `${store.store_code}-${store.platform}-${store.platform_code}`;
        if (!uniqueStores[key]) {
          uniqueStores[key] = store;
        }
      });
      
      // select 옵션 구성
      this.storeSelect.innerHTML = '<option value="">매장 선택</option>';
      
      Object.values(uniqueStores)
        .sort((a, b) => a.platform?.localeCompare(b.platform) || a.store_name?.localeCompare(b.store_name))
        .forEach(store => {
          const option = document.createElement('option');
          option.value = JSON.stringify({
            store_code: store.store_code,
            platform: store.platform,
            platform_code: store.platform_code || ''
          });
          
          const platformName = store.platform || '일반';
          const platformCode = store.platform_code ? ` (${store.platform_code})` : '';
          option.textContent = `[${platformName}] ${store.store_name}${platformCode}`;
          
          this.storeSelect.appendChild(option);
        });
      
      if (this.storeSelect.options.length <= 1) {
        this.showAlert('설정 가능한 매장이 없습니다. 관리자에게 문의하세요.', 'warning');
      }
    } catch (error) {
      console.error('Failed to load stores:', error);
      this.showAlert('매장 목록을 불러오는데 실패했습니다.', 'danger');
    }
  }

  async handleStoreChange() {
    try {
      const selectedValue = this.storeSelect.value;
      
      if (!selectedValue) {
        this.resetForms();
        this.currentStore = null;
        this.currentPlatform = null;
        this.currentPlatformCode = null;
        this.ruleData = null;
        return;
      }
      
      this.showLoading(true);
      
      const storeData = JSON.parse(selectedValue);
      this.currentStore = storeData.store_code;
      this.currentPlatform = storeData.platform;
      this.currentPlatformCode = storeData.platform_code;
      
      await this.loadRuleData(storeData);
      
      this.showLoading(false);
    } catch (error) {
      console.error('Store change error:', error);
      this.showAlert('매장 정보를 불러오는데 실패했습니다.', 'danger');
      this.showLoading(false);
    }
  }

  async loadRuleData(storeData) {
    try {
      // 플랫폼 규칙 조회 API 호출 - Netlify 함수 경로 사용
      const params = new URLSearchParams({
        store_code: storeData.store_code,
        platform: storeData.platform || '',
        platform_code: storeData.platform_code || ''
      });
      
      const response = await fetch(`${this.API_URL}/rules?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Authorization': authService.getAuthHeader(),
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('규칙 정보를 불러오는데 실패했습니다.');
      }

      const rules = await response.json();
      
      // 해당 매장+플랫폼 규칙 찾기
      let rule = null;
      
      if (Array.isArray(rules) && rules.length > 0) {
        if (storeData.platform_code) {
          // 플랫폼 코드가 있는 경우 정확히 매칭
          rule = rules.find(r => 
            r.store_code === storeData.store_code && 
            r.platform === storeData.platform &&
            r.platform_code === storeData.platform_code
          );
        } else {
          // 플랫폼 코드가 없는 경우
          rule = rules.find(r => 
            r.store_code === storeData.store_code && 
            r.platform === storeData.platform
          );
        }
      }

      this.ruleData = rule;
      this.populateForms(rule);

    } catch (error) {
      console.error('Rule data load error:', error);
      this.showAlert('규칙 정보를 불러오는데 실패했습니다.', 'danger');
      this.resetForms();
    }
  }

  populateStoreSelectWithAllOption(stores) {
    const storeSelect = document.getElementById('storeSelect');
    if (!storeSelect) return;

    storeSelect.innerHTML = '<option value="">매장 선택</option>';
    
    // store_code 기준으로 정렬
    const sortedStores = stores.sort((a, b) => {
        const codeA = a.store_code || '';
        const codeB = b.store_code || '';
        return codeA.localeCompare(codeB);
    });
    
    // 전체 매장 목록이 2개 이상일 때만 '전체 모아보기' 옵션 추가
    if (sortedStores.length >= 2) {
        const storeCodes = sortedStores.map(store => {
            const data = JSON.parse(store.value);
            return data.store_code;
        });
        
        const uniqueStoreCodes = [...new Set(storeCodes)];
        
        const allOption = document.createElement('option');
        allOption.value = JSON.stringify({
            all_stores: true,
            store_codes: uniqueStoreCodes
        });
        allOption.textContent = '📊 전체 모아보기';
        storeSelect.appendChild(allOption);
    }

    // 개별 매장 옵션 추가 (store_code 순으로 정렬된 상태 유지)
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

  populateForms(rule) {
    if (!rule) {
      this.resetForms();
      this.showAlert('이 매장/플랫폼에 대한 규칙이 없습니다. 새로 설정해주세요.', 'warning');
      return;
    }

    // 인사말 폼 설정
    this.greetingStartInput.value = rule.greeting_start || '';
    this.greetingEndInput.value = rule.greeting_end || '';
    
    // 별점별 답변 설정
    if (this.ratingCheckboxes) {
      this.ratingCheckboxes[1].checked = rule.rating_1_reply || false;
      this.ratingCheckboxes[2].checked = rule.rating_2_reply || false;
      this.ratingCheckboxes[3].checked = rule.rating_3_reply || false;
      this.ratingCheckboxes[4].checked = rule.rating_4_reply || false;
      this.ratingCheckboxes[5].checked = rule.rating_5_reply || false;
    }
    
    // 추가 설정 폼
    if (this.toneSelect) {
      this.toneSelect.value = rule.tone || 'formal';
    }
    
    if (this.prohibitedWordsInput) {
      this.prohibitedWordsInput.value = rule.prohibited_words || '';
    }
    
    if (this.maxLengthInput) {
      this.maxLengthInput.value = rule.max_length || 300;
    }
  }

  resetForms() {
    // 인사말 폼 초기화
    if (this.greetingStartInput) this.greetingStartInput.value = '';
    if (this.greetingEndInput) this.greetingEndInput.value = '';
    
    // 별점별 답변 설정 초기화
    if (this.ratingCheckboxes) {
      Object.values(this.ratingCheckboxes).forEach(checkbox => {
        if (checkbox) checkbox.checked = false;
      });
    }
    
    // 추가 설정 폼 초기화
    if (this.toneSelect) this.toneSelect.value = 'formal';
    if (this.prohibitedWordsInput) this.prohibitedWordsInput.value = '';
    if (this.maxLengthInput) this.maxLengthInput.value = 300;
  }

  async handleGreetingSubmit(e) {
    e.preventDefault();
    
    if (!this.currentStore || !this.currentPlatform) {
      this.showAlert('먼저 매장을 선택해주세요.', 'warning');
      return;
    }
    
    try {
      this.showLoading(true);
      
      const ruleId = this.ruleData?.id;
      if (!ruleId) {
        this.showAlert('규칙 정보가 없습니다. 새로고침 후 다시 시도해주세요.', 'danger');
        this.showLoading(false);
        return;
      }
      
      const updateData = {
        greeting_start: this.greetingStartInput.value.trim(),
        greeting_end: this.greetingEndInput.value.trim()
      };
      
      // Netlify 함수 경로로 변경
      const response = await fetch(`${this.API_URL}/rules-detail/${ruleId}`, {
        method: 'PUT',
        headers: {
          'Authorization': authService.getAuthHeader(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });
      
      if (!response.ok) {
        throw new Error('인사말 설정 저장에 실패했습니다.');
      }
      
      const updatedRule = await response.json();
      this.ruleData = updatedRule;
      
      this.showAlert('인사말 설정이 저장되었습니다.', 'success');
      this.showLoading(false);
      
    } catch (error) {
      console.error('Greeting save error:', error);
      this.showAlert('인사말 설정 저장 중 오류가 발생했습니다.', 'danger');
      this.showLoading(false);
    }
  }

  async handleRatingReplySubmit(e) {
    e.preventDefault();
    
    if (!this.currentStore || !this.currentPlatform) {
      this.showAlert('먼저 매장을 선택해주세요.', 'warning');
      return;
    }
    
    try {
      this.showLoading(true);
      
      const ruleId = this.ruleData?.id;
      if (!ruleId) {
        this.showAlert('규칙 정보가 없습니다. 새로고침 후 다시 시도해주세요.', 'danger');
        this.showLoading(false);
        return;
      }
      
      const updateData = {
        rating_1_reply: this.ratingCheckboxes[1].checked,
        rating_2_reply: this.ratingCheckboxes[2].checked,
        rating_3_reply: this.ratingCheckboxes[3].checked,
        rating_4_reply: this.ratingCheckboxes[4].checked,
        rating_5_reply: this.ratingCheckboxes[5].checked
      };
      
      // Netlify 함수 경로로 변경
      const response = await fetch(`${this.API_URL}/rules-detail/${ruleId}`, {
        method: 'PUT',
        headers: {
          'Authorization': authService.getAuthHeader(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });
      
      if (!response.ok) {
        throw new Error('별점 자동 답변 설정 저장에 실패했습니다.');
      }
      
      const updatedRule = await response.json();
      this.ruleData = updatedRule;
      
      this.showAlert('별점 자동 답변 설정이 저장되었습니다.', 'success');
      this.showLoading(false);
      
    } catch (error) {
      console.error('Rating reply save error:', error);
      this.showAlert('별점 자동 답변 설정 저장 중 오류가 발생했습니다.', 'danger');
      this.showLoading(false);
    }
  }

  async handleAdditionalSettingsSubmit(e) {
    e.preventDefault();
    
    if (!this.currentStore || !this.currentPlatform) {
      this.showAlert('먼저 매장을 선택해주세요.', 'warning');
      return;
    }
    
    try {
      this.showLoading(true);
      
      const ruleId = this.ruleData?.id;
      if (!ruleId) {
        this.showAlert('규칙 정보가 없습니다. 새로고침 후 다시 시도해주세요.', 'danger');
        this.showLoading(false);
        return;
      }
      
      // 최대 길이 유효성 검사
      const maxLength = parseInt(this.maxLengthInput.value);
      if (isNaN(maxLength) || maxLength < 100 || maxLength > 1000) {
        this.showAlert('최대 답변 길이는 100~1000자 사이로 입력해주세요.', 'warning');
        this.showLoading(false);
        return;
      }
      
      const updateData = {
        tone: this.toneSelect.value,
        prohibited_words: this.prohibitedWordsInput.value.trim(),
        max_length: maxLength
      };
      
      // Netlify 함수 경로로 변경
      const response = await fetch(`${this.API_URL}/rules-detail/${ruleId}`, {
        method: 'PUT',
        headers: {
          'Authorization': authService.getAuthHeader(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });
      
      if (!response.ok) {
        throw new Error('추가 설정 저장에 실패했습니다.');
      }
      
      const updatedRule = await response.json();
      this.ruleData = updatedRule;
      
      this.showAlert('추가 설정이 저장되었습니다.', 'success');
      this.showLoading(false);
      
    } catch (error) {
      console.error('Additional settings save error:', error);
      this.showAlert('추가 설정 저장 중 오류가 발생했습니다.', 'danger');
      this.showLoading(false);
    }
  }
}

// 페이지 로드 시 모듈 초기화
document.addEventListener('DOMContentLoaded', () => {
  new RulesManager();
});

export default RulesManager;