const CofraternidadStore = (() => {
  const state = { churches: [], payments: [], legal: [], config: {}, session: null };
  function emitChange(detail = {}) { window.dispatchEvent(new CustomEvent('cofraternidad_store_update', { detail })); }
  async function request(path, options = {}) {
    const localFrontend = window.location.protocol === 'file:' || (['localhost', '127.0.0.1'].includes(window.location.hostname) && window.location.port !== '5000');
    const apiBase = localFrontend ? 'http://localhost:5000/api' : '/api';
    const sessionToken = sessionStorage.getItem('cofraternidad_token');
    const response = await fetch(`${apiBase}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}), ...(options.headers || {}) }, ...options });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'No se pudo completar la operación.');
    return body;
  }
  function applyBootstrap(data) { state.churches = data.churches || []; state.payments = data.payments || []; state.legal = data.legal || []; state.config = data.config || {}; emitChange({ type: 'refresh' }); }
  async function refresh() { try { applyBootstrap(await request('/bootstrap')); } catch (error) { emitChange({ type: 'error', error }); } }
  function getChurches() { return state.churches; }
  function getChurch(id) { return state.churches.find(item => item.id === Number(id)); }
  function getPayments() { return state.payments; }
  function getPayment(id) { return state.payments.find(item => String(item.id) === String(id) || Number(item.id) === Number(id)); }
  function getLegalRequests() { return state.legal; }
  function getConfig() { return state.config; }
  async function addChurch(data) { const result = await request('/churches', { method: 'POST', body: JSON.stringify(data) }); await refresh(); return result.church; }
  async function addPayment(data) { const result = await request('/payments', { method: 'POST', body: JSON.stringify(data) }); await refresh(); return result.payment; }
  async function updatePaymentStatus(id, status, notes = '') { const result = await request(`/payments/${id}`, { method: 'PATCH', body: JSON.stringify({ status, notes }) }); await refresh(); return result.payment; }
  async function addLegalRequest(data) { const result = await request('/legal-requests', { method: 'POST', body: JSON.stringify(data) }); await refresh(); return result.request; }
  async function updateLegalRequestStatus(id, status, lawyer = '', notes = '') { const result = await request(`/legal-requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status, lawyer, notes }) }); await refresh(); return result.request; }
  async function setConfig(config) { const result = await request('/config', { method: 'PATCH', body: JSON.stringify(config) }); state.config = result.config; emitChange({ type: 'config', data: state.config }); return state.config; }
  async function login(email, password, role) { try { const result = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, role }) }); state.session = result.user; sessionStorage.setItem('cofraternidad_session', JSON.stringify(result.user)); sessionStorage.setItem('cofraternidad_token', result.token); await refresh(); return result; } catch (error) { return { ok: false, error: error.message }; } }
  async function register(data) { return request('/auth/register', { method: 'POST', body: JSON.stringify(data) }); }
  function getSession() { try { return JSON.parse(sessionStorage.getItem('cofraternidad_session')) || state.session; } catch (error) { return null; } }
  async function logout() { await request('/auth/logout', { method: 'POST' }).catch(() => {}); state.session = null; sessionStorage.removeItem('cofraternidad_session'); sessionStorage.removeItem('cofraternidad_token'); }
  function formatUSD(num) { return '$ ' + Number(num || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function formatBs(num) { return 'Bs. ' + Number(num || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function exportPaymentsCSV() { if (!state.payments.length) return false; const headers = ['ID', 'Iglesia', 'Monto USD', 'Monto Bs', 'Referencia', 'Metodo', 'Concepto', 'Fecha', 'Estado', 'Notas']; const rows = state.payments.map(p => [p.id, p.church, p.usdAmount, p.bsAmount, p.ref, p.method, p.concept, p.date, p.status, p.notes].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(';')); const link = document.createElement('a'); link.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent([headers.join(';'), ...rows].join('\n')); link.download = `Reporte_Pagos_${new Date().toISOString().slice(0, 10)}.csv`; link.click(); return true; }
  refresh();
  return { getChurches, getChurch, addChurch, addPayment, updatePaymentStatus, getPayments, getPayment, getLegalRequests, addLegalRequest, updateLegalRequestStatus, getConfig, setConfig, formatUSD, formatBs, exportPaymentsCSV, login, register, getSession, logout, refresh, onUpdate: callback => window.addEventListener('cofraternidad_store_update', callback) };
})();
