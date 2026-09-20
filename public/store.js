const CofraternidadStore = (() => {
  const state = { churches: [], payments: [], legal: [], lawyers: [], config: {}, session: null };
  function emitChange(detail = {}) { window.dispatchEvent(new CustomEvent('cofraternidad_store_update', { detail })); }
  function resolveApiBase() {
    const currentPort = Number(window.location.port || '');
    const appPorts = [5000, 5001, 5002, 5003, 5004, 5005, 3000, 8080];
    const host = window.location.hostname || 'localhost';
    const sameOriginApi = `${window.location.protocol}//${host}${window.location.port ? `:${window.location.port}` : ''}/api`;

    if (window.location.protocol === 'file:') {
      return 'http://localhost:5000/api';
    }

    if (window.location.port && !appPorts.includes(currentPort)) {
      return 'http://localhost:5000/api';
    }

    if (window.location.port && appPorts.includes(currentPort)) {
      return currentPort === 5000 ? sameOriginApi : 'http://localhost:5000/api';
    }

    return '/api';
  }

  async function request(path, options = {}) {
    const apiBase = resolveApiBase();
    const sessionToken = sessionStorage.getItem('cofraternidad_token');
    const isLoginPage = window.location.pathname.endsWith('login.html');
    const response = await fetch(`${apiBase}${path}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        ...(options.headers || {})
      },
      ...options
    });
    if (response.status === 401) {
      if (isLoginPage) {
        return { ok: false, error: 'No autenticado', silent: true };
      }
      sessionStorage.removeItem('cofraternidad_session');
      sessionStorage.removeItem('cofraternidad_token');
      window.location.replace('login.html');
      throw new Error('Sesión expirada.');
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'No se pudo completar la operación.');
    return body;
  }
  function applyBootstrap(data) { state.churches = data.churches || []; state.payments = data.payments || []; state.legal = data.legal || []; state.lawyers = data.lawyers || []; state.config = data.config || {}; emitChange({ type: 'refresh' }); }
  async function refresh() {
    try {
      const sessionToken = sessionStorage.getItem('cofraternidad_token');
      const isLoginPage = window.location.pathname.endsWith('login.html');
      if (!sessionToken && isLoginPage) {
        emitChange({ type: 'refresh', data: { churches: [], payments: [], legal: [], lawyers: [], config: {} } });
        return;
      }
      const result = await request('/bootstrap');
      if (result && result.silent) return;
      applyBootstrap(result);
    } catch (error) {
      emitChange({ type: 'error', error });
    }
  }
  function getChurches() { return state.churches; }
  function getChurch(id) { return state.churches.find(item => item.id === Number(id)); }
  function getPayments() { return state.payments; }
  function getPayment(id) { return state.payments.find(item => String(item.id) === String(id) || Number(item.id) === Number(id)); }
  function getLegalRequests() { return state.legal; }
  function getLawyers() { return state.lawyers; }
  function getConfig() { return state.config; }
  async function addChurch(data) { const result = await request('/churches', { method: 'POST', body: JSON.stringify(data) }); await refresh(); return result.church; }
  async function updateChurchStatus(id, status) { const result = await request(`/churches/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); await refresh(); return result.church; }
  async function addPayment(data) { const result = await request('/payments', { method: 'POST', body: JSON.stringify(data) }); await refresh(); return result.payment; }
  async function updatePaymentStatus(id, status, notes = '') { const result = await request(`/payments/${id}`, { method: 'PATCH', body: JSON.stringify({ status, notes }) }); await refresh(); return result.payment; }
  async function addLegalRequest(data) { const result = await request('/legal-requests', { method: 'POST', body: JSON.stringify(data) }); await refresh(); return result.request; }
  async function updateLegalRequestStatus(id, status, lawyer = '', notes = '') { const result = await request(`/legal-requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status, lawyer, notes }) }); await refresh(); return result.request; }
  async function addLawyer(data) { const result = await request('/lawyers', { method: 'POST', body: JSON.stringify(data) }); await refresh(); return result.lawyer; }
  async function updateLawyer(id, data) { const result = await request(`/lawyers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }); await refresh(); return result.lawyer; }
  async function setConfig(config) { const result = await request('/config', { method: 'PATCH', body: JSON.stringify(config) }); state.config = result.config; emitChange({ type: 'config', data: state.config }); return state.config; }
  async function login(email, password, role) { try { const result = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, role }) }); state.session = result.user; sessionStorage.setItem('cofraternidad_session', JSON.stringify(result.user)); sessionStorage.setItem('cofraternidad_token', result.token); await refresh(); return result; } catch (error) { return { ok: false, error: error.message }; } }
  async function register(data) { return request('/auth/register', { method: 'POST', body: JSON.stringify(data) }); }
  function getSession() { try { return JSON.parse(sessionStorage.getItem('cofraternidad_session')) || state.session; } catch (error) { return null; } }
  async function logout() {
    const sessionToken = sessionStorage.getItem('cofraternidad_token');
    await request('/auth/logout', {
      method: 'POST',
      headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}
    }).catch(() => {});
    state.session = null;
    sessionStorage.removeItem('cofraternidad_session');
    sessionStorage.removeItem('cofraternidad_token');
  }
  function formatUSD(num) { return '$ ' + Number(num || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function formatBs(num) { return 'Bs. ' + Number(num || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function exportPaymentsCSV() { if (!state.payments.length) return false; const headers = ['ID', 'Iglesia', 'Monto USD', 'Monto Bs', 'Referencia', 'Metodo', 'Concepto', 'Fecha', 'Estado', 'Notas']; const rows = state.payments.map(p => [p.id, p.church, p.usdAmount, p.bsAmount, p.ref, p.method, p.concept, p.date, p.status, p.notes].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(';')); const link = document.createElement('a'); link.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent([headers.join(';'), ...rows].join('\n')); link.download = `Reporte_Pagos_${new Date().toISOString().slice(0, 10)}.csv`; link.click(); return true; }
  refresh();
  return { getChurches, getChurch, addChurch, updateChurchStatus, addPayment, updatePaymentStatus, getPayments, getPayment, getLegalRequests, getLawyers, addLegalRequest, updateLegalRequestStatus, addLawyer, updateLawyer, getConfig, setConfig, formatUSD, formatBs, exportPaymentsCSV, login, register, getSession, logout, refresh, onUpdate: callback => window.addEventListener('cofraternidad_store_update', callback) };
})();
