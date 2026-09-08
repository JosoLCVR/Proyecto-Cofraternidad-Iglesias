/**
 * Cofraternidad de Iglesias - Sistema de Datos y Sincronización Compartida
 * Funciona sin backend externo mediante LocalStorage reactivo y eventos cruzados entre ventanas.
 */

const CofraternidadStore = (() => {
  const KEYS = {
    CHURCHES: 'cofraternidad_churches',
    PAYMENTS: 'cofraternidad_payments',
    LEGAL: 'cofraternidad_legal_requests',
    CONFIG: 'cofraternidad_config'
  };

  const DEFAULT_CONFIG = {
    bcvRate: 45.50,
    orgName: 'Cofraternidad de Iglesias',
    legalDept: 'Departamento Legal y Registro',
    adminUser: 'Dra. Mariela Ramos (Dpto. Legal)',
    contactPhone: '+58 212 555-0199',
    contactEmail: 'legal@cofraternidadiglesias.org',
    whatsappSupport: '+58 414 123-4567'
  };

  const DEMO_USERS = [
    {
      id: 'admin-001',
      name: 'Dra. Mariela Ramos',
      email: 'admin@cofraternidad.test',
      password: 'Admin123!',
      role: 'admin',
      roleLabel: 'Administrador legal'
    },
    {
      id: 'church-001',
      name: 'Pastor Carlos Mendoza',
      email: 'iglesia@cofraternidad.test',
      password: 'Iglesia123!',
      role: 'church',
      roleLabel: 'Representante de iglesia',
      churchId: 1
    }
  ];

  const DEFAULT_CHURCHES = [
    {
      id: 1,
      name: 'Iglesia El Buen Pastor',
      pastor: 'Pastor Carlos Mendoza',
      rif: 'J-30491823-1',
      phone: '+58 414 123-4567',
      email: 'elbuenpastor@gmail.com',
      city: 'Caracas, Dto. Capital',
      address: 'Av. Principal de Los Ruices, Edif. Esperanza Central',
      members: 180,
      status: 'Solvente',
      initials: 'EB',
      color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      foundationYear: 2012,
      lastPaymentDate: 'Hoy, 09:42 am'
    },
    {
      id: 2,
      name: 'Comunidad Vida Nueva',
      pastor: 'Pastora Elena Gómez',
      rif: 'J-40192834-2',
      phone: '+58 424 987-6543',
      email: 'vidanueva.val@gmail.com',
      city: 'Valencia, Carabobo',
      address: 'Urb. El Viñedo, Calle 139, Local 4',
      members: 95,
      status: 'Solvente',
      initials: 'VN',
      color: 'bg-blue-100 text-blue-800 border-blue-200',
      foundationYear: 2018,
      lastPaymentDate: 'Hoy, 08:17 am'
    },
    {
      id: 3,
      name: 'Centro Cristiano La Roca',
      pastor: 'Pastor David Rivas',
      rif: 'J-50123984-0',
      phone: '+58 412 555-7890',
      email: 'laroca.lara@gmail.com',
      city: 'Barquisimeto, Lara',
      address: 'Carrera 19 con Calle 30, Galpón Alianza',
      members: 320,
      status: 'En mora',
      initials: 'LR',
      color: 'bg-amber-100 text-amber-800 border-amber-200',
      foundationYear: 2008,
      lastPaymentDate: 'Ayer, 04:28 pm'
    },
    {
      id: 4,
      name: 'Iglesia Familiar de Gracia',
      pastor: 'Pastor Miguel Ángel Torres',
      rif: 'J-31849201-5',
      phone: '+58 416 333-2211',
      email: 'familiardegracia@gmail.com',
      city: 'Maracaibo, Zulia',
      address: 'Sector 5 de Julio con Av. Bella Vista',
      members: 140,
      status: 'Solvente',
      initials: 'IF',
      color: 'bg-purple-100 text-purple-800 border-purple-200',
      foundationYear: 2015,
      lastPaymentDate: 'Ayer, 11:03 am'
    },
    {
      id: 5,
      name: 'Tabernáculo de Avivamiento',
      pastor: 'Pastor José Luis Vargas',
      rif: 'J-41029384-7',
      phone: '+58 414 777-8899',
      email: 'avivamientotachira@gmail.com',
      city: 'San Cristóbal, Táchira',
      address: 'Barrio Obrero, Carrera 21 entre Calles 11 y 12',
      members: 210,
      status: 'En proceso',
      initials: 'TA',
      color: 'bg-rose-100 text-rose-800 border-rose-200',
      foundationYear: 2020,
      lastPaymentDate: '28 Feb, 02:15 pm'
    }
  ];

  const DEFAULT_PAYMENTS = [
    {
      id: 1,
      churchId: 1,
      church: 'Iglesia El Buen Pastor',
      initials: 'EB',
      usdAmount: 1250.00,
      bsAmount: 56875.00,
      ref: 'PAGO-839204',
      method: 'Pago Móvil (Banesco)',
      concept: 'Aporte Mensual Sedes (Enero - Marzo)',
      date: 'Hoy, 09:42 am',
      timestamp: Date.now() - 3600000 * 2,
      status: 'Pendiente',
      color: 'bg-orange-100 text-orange-700',
      receiptUrl: null,
      notes: 'Requiere verificación de la cuenta recaudadora',
      accountDestination: 'Banesco · Cta. Corriente *9102'
    },
    {
      id: 2,
      churchId: 2,
      church: 'Comunidad Vida Nueva',
      initials: 'VN',
      usdAmount: 250.00,
      bsAmount: 11375.00,
      ref: 'PAGO-839188',
      method: 'Transferencia (Mercantil)',
      concept: 'Aporte Mensual Febrero',
      date: 'Hoy, 08:17 am',
      timestamp: Date.now() - 3600000 * 4,
      status: 'Pendiente',
      color: 'bg-emerald-100 text-emerald-700',
      receiptUrl: null,
      notes: 'Transferencia del mismo banco confirmada por tesorería',
      accountDestination: 'Mercantil · Cta. Corriente *4581'
    },
    {
      id: 3,
      churchId: 3,
      church: 'Centro Cristiano La Roca',
      initials: 'LR',
      usdAmount: 750.00,
      bsAmount: 34125.00,
      ref: 'PAGO-838901',
      method: 'Zelle',
      concept: 'Arancel Trámite Título Supletorio',
      date: 'Ayer, 04:28 pm',
      timestamp: Date.now() - 3600000 * 20,
      status: 'Pendiente',
      color: 'bg-yellow-100 text-yellow-700',
      receiptUrl: null,
      notes: 'Referencia Zelle: David Rivas (Tesorería)',
      accountDestination: 'Zelle · finanzas@cofraternidad.org'
    },
    {
      id: 4,
      churchId: 4,
      church: 'Iglesia Familiar de Gracia',
      initials: 'IF',
      usdAmount: 180.00,
      bsAmount: 8190.00,
      ref: 'PAGO-838774',
      method: 'Pago Móvil (Bancamiga)',
      concept: 'Aporte Mensual Febrero',
      date: 'Ayer, 11:03 am',
      timestamp: Date.now() - 3600000 * 25,
      status: 'Aprobado',
      color: 'bg-purple-100 text-purple-700',
      receiptUrl: null,
      notes: 'Validado conforme en cuenta bancaria y emitido recibo digital',
      accountDestination: 'Bancamiga · Pago Móvil'
    },
    {
      id: 5,
      churchId: 5,
      church: 'Tabernáculo de Avivamiento',
      initials: 'TA',
      usdAmount: 420.00,
      bsAmount: 19110.00,
      ref: 'PAGO-837650',
      method: 'Transferencia (BNC)',
      concept: 'Gastos de Registro Inmobiliario',
      date: '28 Feb, 02:15 pm',
      timestamp: Date.now() - 3600000 * 90,
      status: 'Aprobado',
      color: 'bg-rose-100 text-rose-700',
      receiptUrl: null,
      notes: 'Verificado por Dpto. Legal para tramitación ante SAREN',
      accountDestination: 'BNC · Cta. Corriente *3301'
    }
  ];

  const DEFAULT_LEGAL = [
    {
      id: 1,
      churchId: 3,
      church: 'Centro Cristiano La Roca',
      title: 'Título Supletorio de Templo Central',
      category: 'Inmuebles y Terrenos',
      description: 'Solicitud de acreditación posesoria y título supletorio para el terreno y edificación del templo principal de 450 m2.',
      lawyer: 'Dra. Mariela Ramos',
      date: '01 Mar 2026',
      timestamp: Date.now() - 3600000 * 48,
      status: 'En Notaría/Registro',
      priority: 'Alta',
      notes: 'Inspección ocular realizada con 3 testigos calificados. Documento en despacho de Notaría Primera.'
    },
    {
      id: 2,
      churchId: 5,
      church: 'Tabernáculo de Avivamiento',
      title: 'Actualización de Junta Directiva y Estatutos',
      category: 'Constitución Legal',
      description: 'Inscripción del acta de asamblea extraordinaria para actualización de directivos y personería jurídica ante el Registro Principal.',
      lawyer: 'Dr. Alejandro Peña',
      date: '25 Feb 2026',
      timestamp: Date.now() - 3600000 * 120,
      status: 'En análisis',
      priority: 'Media',
      notes: 'Revisión del libro de actas y quórum estatutario de miembros activos.'
    },
    {
      id: 3,
      churchId: 1,
      church: 'Iglesia El Buen Pastor',
      title: 'Solvencia Eclesiástica Anual',
      category: 'Solvencia',
      description: 'Constancia oficial de afiliación activa y solvencia institucional para presentación ante la Dirección General de Justicia y Cultos.',
      lawyer: 'Dra. Mariela Ramos',
      date: '28 Feb 2026',
      timestamp: Date.now() - 3600000 * 80,
      status: 'Concluido',
      priority: 'Normal',
      notes: 'Documento sellado, visado por asesor jurídico y entregado al Pastor Carlos Mendoza.'
    },
    {
      id: 4,
      churchId: 2,
      church: 'Comunidad Vida Nueva',
      title: 'Asesoría y Convenio de Dedicación Pastoral',
      category: 'Asesoría Laboral',
      description: 'Modelo de convenio ministerial de dedicación a tiempo completo conforme a la ley y seguridad social ministerial.',
      lawyer: 'Dr. Alejandro Peña',
      date: '02 Mar 2026',
      timestamp: Date.now() - 3600000 * 18,
      status: 'Recibido',
      priority: 'Media',
      notes: 'Solicitud ingresada desde la app móvil. Pendiente primera sesión de asesoría virtual.'
    }
  ];

  function init() {
    if (!localStorage.getItem(KEYS.CONFIG)) {
      localStorage.setItem(KEYS.CONFIG, JSON.stringify(DEFAULT_CONFIG));
    }
    if (!localStorage.getItem(KEYS.CHURCHES)) {
      localStorage.setItem(KEYS.CHURCHES, JSON.stringify(DEFAULT_CHURCHES));
    }
    if (!localStorage.getItem(KEYS.PAYMENTS)) {
      localStorage.setItem(KEYS.PAYMENTS, JSON.stringify(DEFAULT_PAYMENTS));
    }
    if (!localStorage.getItem(KEYS.LEGAL)) {
      localStorage.setItem(KEYS.LEGAL, JSON.stringify(DEFAULT_LEGAL));
    }
  }

  function emitChange(detail = {}) {
    window.dispatchEvent(new CustomEvent('cofraternidad_store_update', { detail }));
  }

  function getConfig() {
    init();
    try {
      return JSON.parse(localStorage.getItem(KEYS.CONFIG)) || DEFAULT_CONFIG;
    } catch (e) {
      return DEFAULT_CONFIG;
    }
  }

  function setConfig(newConfig) {
    const current = getConfig();
    const updated = { ...current, ...newConfig };
    localStorage.setItem(KEYS.CONFIG, JSON.stringify(updated));
    emitChange({ type: 'config', data: updated });
    return updated;
  }

  function getChurches() {
    init();
    try {
      return JSON.parse(localStorage.getItem(KEYS.CHURCHES)) || [];
    } catch (e) {
      return [];
    }
  }

  function getChurch(id) {
    return getChurches().find(c => c.id === Number(id));
  }

  function addChurch(churchData) {
    const churches = getChurches();
    const initials = (churchData.name || 'IG')
      .split(' ')
      .filter(w => w.length > 2)
      .slice(0, 2)
      .map(w => w[0].toUpperCase())
      .join('') || 'IG';

    const colors = [
      'bg-emerald-100 text-emerald-800 border-emerald-200',
      'bg-blue-100 text-blue-800 border-blue-200',
      'bg-amber-100 text-amber-800 border-amber-200',
      'bg-purple-100 text-purple-800 border-purple-200',
      'bg-rose-100 text-rose-800 border-rose-200',
      'bg-teal-100 text-teal-800 border-teal-200'
    ];
    const color = colors[churches.length % colors.length];

    const newChurch = {
      id: Date.now(),
      name: churchData.name.trim(),
      pastor: churchData.pastor.trim(),
      rif: churchData.rif ? churchData.rif.trim() : 'S/R',
      phone: churchData.phone ? churchData.phone.trim() : '',
      email: churchData.email ? churchData.email.trim() : '',
      city: churchData.city ? churchData.city.trim() : 'Venezuela',
      address: churchData.address ? churchData.address.trim() : '',
      members: Number(churchData.members) || 50,
      status: churchData.status || 'Solvente',
      initials,
      color,
      foundationYear: Number(churchData.foundationYear) || new Date().getFullYear(),
      lastPaymentDate: 'Sin aportes registrados'
    };

    churches.unshift(newChurch);
    localStorage.setItem(KEYS.CHURCHES, JSON.stringify(churches));
    emitChange({ type: 'church_added', data: newChurch });
    return newChurch;
  }

  function updateChurch(id, updates) {
    const churches = getChurches();
    const index = churches.findIndex(c => c.id === Number(id));
    if (index !== -1) {
      churches[index] = { ...churches[index], ...updates };
      localStorage.setItem(KEYS.CHURCHES, JSON.stringify(churches));
      emitChange({ type: 'church_updated', data: churches[index] });
      return churches[index];
    }
    return null;
  }

  function getPayments() {
    init();
    try {
      return JSON.parse(localStorage.getItem(KEYS.PAYMENTS)) || [];
    } catch (e) {
      return [];
    }
  }

  function getPayment(id) {
    return getPayments().find(p => p.id === Number(id));
  }

  function addPayment(data) {
    const payments = getPayments();
    const config = getConfig();
    const church = getChurch(data.churchId) || { name: data.churchName || 'Iglesia Afiliada', initials: 'IG', color: 'bg-emerald-100 text-emerald-800' };

    let usd = Number(data.usdAmount) || 0;
    let bs = Number(data.bsAmount) || 0;

    if (usd > 0 && (!bs || bs === 0)) {
      bs = Math.round(usd * config.bcvRate * 100) / 100;
    } else if (bs > 0 && (!usd || usd === 0)) {
      usd = Math.round((bs / config.bcvRate) * 100) / 100;
    }

    const newPayment = {
      id: Date.now(),
      churchId: Number(data.churchId) || 1,
      church: church.name,
      initials: church.initials,
      usdAmount: usd,
      bsAmount: bs,
      ref: data.ref ? String(data.ref).trim().toUpperCase() : `PAGO-${Math.floor(100000 + Math.random() * 900000)}`,
      method: data.method || 'Pago Móvil',
      concept: data.concept || 'Aporte Mensual',
      date: 'Hoy, ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now(),
      status: 'Pendiente',
      color: church.color,
      receiptUrl: data.receiptUrl || null,
      receiptFileName: data.receiptFileName || null,
      notes: data.notes || '',
      accountDestination: data.accountDestination || 'Banesco · Cta. Corriente *9102'
    };

    payments.unshift(newPayment);
    localStorage.setItem(KEYS.PAYMENTS, JSON.stringify(payments));

    updateChurch(newPayment.churchId, { lastPaymentDate: 'Hoy, ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });

    emitChange({ type: 'payment_added', data: newPayment });
    return newPayment;
  }

  function updatePaymentStatus(id, status, notes = '') {
    const payments = getPayments();
    const p = payments.find(item => item.id === Number(id));
    if (p) {
      p.status = status;
      if (notes) p.notes = notes;
      localStorage.setItem(KEYS.PAYMENTS, JSON.stringify(payments));
      emitChange({ type: 'payment_status_changed', data: p });
      return p;
    }
    return null;
  }

  function getLegalRequests() {
    init();
    try {
      return JSON.parse(localStorage.getItem(KEYS.LEGAL)) || [];
    } catch (e) {
      return [];
    }
  }

  function addLegalRequest(data) {
    const requests = getLegalRequests();
    const church = getChurch(data.churchId) || { name: data.churchName || 'Iglesia Afiliada' };

    const newRequest = {
      id: Date.now(),
      churchId: Number(data.churchId) || 1,
      church: church.name,
      title: data.title ? data.title.trim() : 'Trámite Legal',
      category: data.category || 'General',
      description: data.description ? data.description.trim() : '',
      lawyer: data.lawyer || 'Dra. Mariela Ramos (Asignada)',
      date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
      timestamp: Date.now(),
      status: 'Recibido',
      priority: data.priority || 'Media',
      notes: data.notes || 'Solicitud recibida desde la plataforma digital.'
    };

    requests.unshift(newRequest);
    localStorage.setItem(KEYS.LEGAL, JSON.stringify(requests));
    emitChange({ type: 'legal_added', data: newRequest });
    return newRequest;
  }

  function updateLegalRequestStatus(id, status, lawyer = '', notes = '') {
    const requests = getLegalRequests();
    const req = requests.find(item => item.id === Number(id));
    if (req) {
      req.status = status;
      if (lawyer) req.lawyer = lawyer;
      if (notes) req.notes = notes;
      localStorage.setItem(KEYS.LEGAL, JSON.stringify(requests));
      emitChange({ type: 'legal_status_changed', data: req });
      return req;
    }
    return null;
  }

  function formatUSD(num) {
    return '$ ' + Number(num || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatBs(num) {
    return 'Bs. ' + Number(num || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function exportPaymentsCSV() {
    const list = getPayments();
    if (!list.length) return false;

    const headers = ['ID', 'Iglesia', 'Monto USD', 'Monto Bs', 'Referencia', 'Metodo', 'Concepto', 'Fecha', 'Estado', 'Notas'];
    const csvRows = [headers.join(';')];

    list.forEach(p => {
      const row = [
        p.id,
        `"${(p.church || '').replace(/"/g, '""')}"`,
        (p.usdAmount || 0).toFixed(2),
        (p.bsAmount || 0).toFixed(2),
        `"${(p.ref || '').replace(/"/g, '""')}"`,
        `"${(p.method || '').replace(/"/g, '""')}"`,
        `"${(p.concept || '').replace(/"/g, '""')}"`,
        `"${(p.date || '').replace(/"/g, '""')}"`,
        p.status,
        `"${(p.notes || '').replace(/"/g, '""')}"`
      ];
      csvRows.push(row.join(';'));
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csvRows.join('\n'));
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `Reporte_Pagos_Cofraternidad_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  }

  function resetToDefaults() {
    localStorage.setItem(KEYS.CONFIG, JSON.stringify(DEFAULT_CONFIG));
    localStorage.setItem(KEYS.CHURCHES, JSON.stringify(DEFAULT_CHURCHES));
    localStorage.setItem(KEYS.PAYMENTS, JSON.stringify(DEFAULT_PAYMENTS));
    localStorage.setItem(KEYS.LEGAL, JSON.stringify(DEFAULT_LEGAL));
    emitChange({ type: 'reset' });
  }

  function login(email, password, role) {
    const user = DEMO_USERS.find(item => item.email.toLowerCase() === String(email).trim().toLowerCase()
      && item.password === password
      && item.role === role);

    if (!user) return { ok: false, error: 'Correo, contraseña o tipo de usuario incorrecto.' };

    const session = { ...user };
    delete session.password;
    sessionStorage.setItem('cofraternidad_session', JSON.stringify(session));
    return { ok: true, user: session };
  }

  function getSession() {
    try {
      return JSON.parse(sessionStorage.getItem('cofraternidad_session')) || null;
    } catch (e) {
      return null;
    }
  }

  function logout() {
    sessionStorage.removeItem('cofraternidad_session');
  }

  init();

  return {
    getChurches,
    getChurch,
    addChurch,
    updateChurch,
    getPayments,
    getPayment,
    addPayment,
    updatePaymentStatus,
    getLegalRequests,
    addLegalRequest,
    updateLegalRequestStatus,
    getConfig,
    setConfig,
    formatUSD,
    formatBs,
    exportPaymentsCSV,
    resetToDefaults,
    login,
    getSession,
    logout,
    onUpdate: (callback) => {
      window.addEventListener('cofraternidad_store_update', callback);
      window.addEventListener('storage', callback);
    }
  };
})();

