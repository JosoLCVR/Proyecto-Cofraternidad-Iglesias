require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const pool = require('./config/db');
const app = express();
const sessions = new Map();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '8mb' }));
function sessionUser(req) { const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.headers.cookie?.match(/session=([^;]+)/)?.[1]; return token ? sessions.get(token) : null; }
function auth(req, res, next) { const user = sessionUser(req); if (!user) return res.status(401).json({ error: 'Sesión requerida.' }); req.user = user; next(); }
function admin(req, res, next) { if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acceso exclusivo del administrador.' }); next(); }
async function passwordMatches(password, storedPassword) {
	if (!storedPassword) return false;
	if (storedPassword.startsWith('$2')) return bcrypt.compare(password, storedPassword);
	return password === storedPassword;
}
function mapChurch(r) { return { ...r, foundationYear: r.foundation_year, lastPaymentDate: r.last_payment_at ? new Date(r.last_payment_at).toLocaleString('es-VE') : 'Sin aportes registrados' }; }
function mapPayment(r) { return { ...r, church: r.church_name, initials: r.initials, color: r.color, usdAmount: Number(r.usd_amount), bsAmount: Number(r.bs_amount), ref: r.reference, receiptUrl: r.receipt_data, receiptFileName: r.receipt_file_name, accountDestination: r.account_destination, date: new Date(r.created_at).toLocaleString('es-VE'), timestamp: new Date(r.created_at).getTime() }; }
function mapLegal(r) { return { ...r, church: r.church_name, date: new Date(r.created_at).toLocaleDateString('es-VE'), timestamp: new Date(r.created_at).getTime() }; }
function mapLegacyStatus(status) {
	return { pendiente: 'Pendiente', aprobado: 'Aprobado', aprobado_parcial: 'Aprobado', rechazado: 'Rechazado' }[status] || 'Pendiente';
}
function mapLegacyLegalStatus(status) {
	return { recibido: 'Recibido', en_revision: 'En análisis', en_proceso: 'En Notaría/Registro', completado: 'Concluido', rechazado: 'Rechazado' }[status] || 'Recibido';
}
function mapLegalEntityStatus(status) {
	return { Solvente: 'al_dia', 'En proceso': 'por_constituir', 'En mora': 'constituida_sin_actualizar' }[status] || 'por_constituir';
}
function mapLegacyClient(row, index) {
	const id = index + 1;
	const initials = row.nombre_organizacion.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
	return { id, legacyId: row.id, name: row.nombre_organizacion, pastor: row.representante_legal, rif: row.documento_identidad, phone: row.telefono || '', email: row.email, city: row.ciudad || 'Venezuela', address: row.direccion || '', members: Number(row.miembros || 0), status: row.estatus_juridico === 'activo' ? 'Solvente' : 'En proceso', initials: initials || 'IG', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', foundationYear: row.created_at ? new Date(row.created_at).getFullYear() : null, lastPaymentDate: 'Sin aportes registrados' };
}
function mapLegacyPayment(row) {
	return { id: row.id, churchId: row.client_index, church: row.church_name, representative: row.representante_legal || '', registrantEmail: row.email || '', registrantPhone: row.telefono || '', initials: row.initials, color: 'bg-emerald-100 text-emerald-800 border-emerald-200', usdAmount: Number(row.monto_pagado_divisas || 0), bsAmount: Number(row.monto_pagado_ves || 0), ref: row.referencia_bancaria, method: row.metodo_pago, concept: 'Aporte de suscripción', receiptUrl: row.url_comprobante, receiptFileName: null, status: mapLegacyStatus(row.estatus_validacion), notes: row.nota_rechazo || '', accountDestination: '', date: new Date(row.fecha_reporte).toLocaleString('es-VE'), timestamp: new Date(row.fecha_reporte).getTime() };
}
async function hasTable(tableName) {
	const result = await pool.query('select to_regclass($1) as table_name', [`public.${tableName}`]);
	return Boolean(result.rows[0].table_name);
}
function mapLegacyLegal(row) {
	const labels = { titulo_supletorio_terreno: 'Títulos supletorios', constitucion_legal: 'Constitución Legal', asesoria_laboral: 'Asesoría Laboral', actualizacion_documentos: 'Actualización Documentos', deberes_formales: 'Deberes Formales' };
	const label = labels[row.tipo_tramite] || row.tipo_tramite;
	return { id: row.id, churchId: row.client_index, church: row.church_name, title: label, category: label, description: row.descripcion_solicitud || '', lawyer: row.abogado_nombre || 'Pendiente de asignación', status: mapLegacyLegalStatus(row.estatus_tramite), priority: 'Normal', notes: row.notas_internas_abogados || '', date: new Date(row.created_at).toLocaleDateString('es-VE'), timestamp: new Date(row.created_at).getTime() };
}
app.post('/api/clientes', async (req, res) => {
	const { nombre_organizacion, representante_legal, documento_identidad, telefono, email, ciudad, direccion, miembros, estatus_juridico } = req.body;
	if (!nombre_organizacion || !representante_legal || !documento_identidad || !email) return res.status(400).json({ error: 'Organización, representante, documento y correo son obligatorios.' });
	try {
		const result = await pool.query('insert into clientes (nombre_organizacion,representante_legal,documento_identidad,telefono,email,ciudad,direccion,miembros,estatus_juridico) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (documento_identidad) do update set nombre_organizacion=excluded.nombre_organizacion,representante_legal=excluded.representante_legal,telefono=excluded.telefono,email=excluded.email,ciudad=excluded.ciudad,direccion=excluded.direccion,miembros=excluded.miembros,estatus_juridico=excluded.estatus_juridico,updated_at=now() returning *', [nombre_organizacion.trim(), representante_legal.trim(), documento_identidad.trim(), (telefono || '').trim(), email.trim().toLowerCase(), (ciudad || '').trim(), (direccion || '').trim(), Number(miembros) || 0, mapLegalEntityStatus(estatus_juridico)]);
		res.status(200).json({ cliente: result.rows[0], church: mapLegacyClient(result.rows[0], 0) });
	} catch (error) {
		console.error('Error al registrar cliente:', error);
		if (error.code === '23505') return res.status(409).json({ error: 'Ya existe una iglesia con ese RIF/documento o correo.' });
		res.status(500).json({ error: 'No se pudo registrar el cliente.' });
	}
});
app.get('/api/clientes', async (req, res) => {
	try {
		const result = await pool.query('select * from clientes order by created_at desc');
		res.json(result.rows);
	} catch (error) {
		console.error('Error al consultar clientes:', error);
		res.status(500).json({ error: 'No se pudo consultar los clientes.' });
	}
});
app.post('/api/auth/register', async (req, res) => { const { name, email, password, churchId } = req.body; if (!name || !email || !password || password.length < 8) return res.status(400).json({ error: 'Nombre, correo y contraseña de 8 caracteres son obligatorios.' }); try { const hash = await bcrypt.hash(password, 12); const r = await pool.query('insert into app_users (name,email,password_hash,role,church_id) values ($1,$2,$3,$4,$5) returning id,name,email,role,church_id', [name.trim(), email.trim().toLowerCase(), hash, 'church', churchId || null]); res.status(201).json({ user: r.rows[0] }); } catch (e) { res.status(e.code === '23505' ? 409 : 500).json({ error: e.code === '23505' ? 'Ese correo ya está registrado.' : 'No se pudo registrar el usuario.' }); } });
app.post('/api/auth/login', async (req, res) => {
	try {
		let user;
		if (req.body.role === 'admin') {
			const result = await pool.query('select id,nombre,email,password_hash,activo from usuarios_admin where lower(email)=lower($1) and rol=$2', [req.body.email || '', 'admin_general']);
			const adminUser = result.rows[0];
			if (!adminUser || !adminUser.activo || !(await passwordMatches(req.body.password || '', adminUser.password_hash))) return res.status(401).json({ error: 'Correo, contraseña o tipo de usuario incorrecto.' });
			user = { id: adminUser.id, name: adminUser.nombre, email: adminUser.email, role: 'admin', churchId: null };
		} else {
			const schema = await pool.query("select to_regclass('public.app_users') as table_name");
			if (schema.rows[0].table_name) {
				const result = await pool.query('select id,name,email,role,church_id,password_hash from app_users where lower(email)=lower($1) and role=$2', [req.body.email || '', 'church']);
				const churchUser = result.rows[0];
				if (!churchUser || !(await passwordMatches(req.body.password || '', churchUser.password_hash))) return res.status(401).json({ error: 'Correo, contraseña o tipo de usuario incorrecto.' });
				user = { id: churchUser.id, name: churchUser.name, email: churchUser.email, role: churchUser.role, churchId: churchUser.church_id };
			} else {
				const result = await pool.query('select id,nombre_organizacion,email,documento_identidad,row_number() over (order by created_at desc) as church_id from clientes where lower(email)=lower($1)', [req.body.email || '']);
				const client = result.rows[0];
				if (!client || (req.body.password || '').trim().toLowerCase() !== client.documento_identidad.trim().toLowerCase()) return res.status(401).json({ error: 'Para el primer acceso usa tu correo y documento/RIF registrado.' });
				user = { id: client.id, name: client.nombre_organizacion, email: client.email, role: 'church', churchId: Number(client.church_id), legacyClientId: client.id };
			}
		}
		const token = crypto.randomBytes(32).toString('hex');
		sessions.set(token, user);
		res.setHeader('Set-Cookie', `session=${token}; HttpOnly; SameSite=Lax; Path=/`);
		res.json({ ok: true, user, token });
	} catch (e) {
		console.error('Error al iniciar sesión:', e);
		res.status(500).json({ error: 'No se pudo iniciar sesión.' });
	}
});
app.post('/api/auth/logout', (req, res) => { const token = req.headers.cookie?.match(/session=([^;]+)/)?.[1]; if (token) sessions.delete(token); res.setHeader('Set-Cookie', 'session=; Max-Age=0; Path=/'); res.json({ ok: true }); });
app.get('/api/bootstrap', auth, async (req, res) => {
	try {
		const schema = await pool.query("select to_regclass('public.churches') as table_name");
		if (!schema.rows[0].table_name) {
			const clients = await pool.query('select * from clientes order by created_at desc');
			const clientMap = new Map(clients.rows.map((client, index) => [client.id, { ...mapLegacyClient(client, index), clientIndex: index + 1 }]));
			const payments = await pool.query('select p.*, c.nombre_organizacion church_name, c.representante_legal, c.email, c.telefono, row_number() over (order by c.created_at desc) as client_index from pagos p join suscripciones s on s.id = p.suscripcion_id join clientes c on c.id = s.cliente_id order by p.fecha_reporte desc');
			const legal = await pool.query('select l.*, c.nombre_organizacion church_name, row_number() over (order by c.created_at desc) as client_index, null::text as abogado_nombre from expedientes_legales l join clientes c on c.id = l.cliente_id order by l.created_at desc');
			const churches = clients.rows.map((client, index) => mapLegacyClient(client, index));
			res.json({ churches, payments: payments.rows.map(mapLegacyPayment), legal: legal.rows.map(mapLegacyLegal), config: { bcvRate: 45.5, orgName: 'Cofraternidad de Iglesias', legalDepartment: 'Departamento Legal y Registro' } });
			return;
		}
		const params = req.user.role === 'admin' ? [] : [req.user.churchId];
		const where = req.user.role === 'admin' ? '' : ' where c.id = $1';
		const paymentWhere = req.user.role === 'admin' ? '' : ' where p.church_id = $1';
		const legalWhere = req.user.role === 'admin' ? '' : ' where l.church_id = $1';
		const [churches, payments, legal] = await Promise.all([pool.query(`select c.* from churches c${where} order by c.created_at desc`, params), pool.query(`select p.*,c.name church_name,c.initials,c.color from payments p join churches c on c.id=p.church_id${paymentWhere} order by p.created_at desc`, params), pool.query(`select l.*,c.name church_name from legal_requests l join churches c on c.id=l.church_id${legalWhere} order by l.created_at desc`, params)]);
		const config = await hasTable('app_config') ? (await pool.query('select bcv_rate,org_name,legal_department,contact_phone,contact_email,whatsapp_support from app_config where id=true')).rows[0] || {} : { bcvRate: 45.5, orgName: 'Cofraternidad de Iglesias', legalDepartment: 'Departamento Legal y Registro' };
		res.json({ churches: churches.rows.map(mapChurch), payments: payments.rows.map(mapPayment), legal: legal.rows.map(mapLegal), config });
	} catch (e) {
		console.error('Error al cargar bootstrap:', e);
		res.status(500).json({ error: 'No se pudo cargar la información.' });
	}
});
app.post('/api/churches', auth, admin, async (req,res) => { const d=req.body; const initials=(d.name||'IG').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase(); const r=await pool.query('insert into churches (name,pastor,rif,phone,email,city,address,members,status,initials,color,foundation_year) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *',[d.name,d.pastor,d.rif||null,d.phone||'',d.email||'',d.city||'Venezuela',d.address||'',Number(d.members)||0,d.status||'En proceso',initials,'bg-emerald-100 text-emerald-800 border-emerald-200',d.foundationYear||new Date().getFullYear()]); res.status(201).json({church:mapChurch(r.rows[0])}); });
app.patch('/api/config', auth, admin, async (req,res) => { if (!await hasTable('app_config')) return res.json({ config: { bcvRate: Number(req.body.bcvRate) || 45.5, orgName: 'Cofraternidad de Iglesias', legalDepartment: 'Departamento Legal y Registro' } }); const r=await pool.query('update app_config set bcv_rate=coalesce($1,bcv_rate),updated_at=now() where id=true returning bcv_rate,org_name,legal_department,contact_phone,contact_email,whatsapp_support',[req.body.bcvRate]); res.json({config:r.rows[0]}); });
app.post('/api/payments', auth, async (req, res) => {
	const d = req.body;
	try {
		if (!await hasTable('churches')) {
			const clientId = req.user.legacyClientId;
			if (!clientId) return res.status(400).json({ error: 'La iglesia no tiene un cliente asociado.' });
			let subscription = (await pool.query("select id from suscripciones where cliente_id=$1 and estatus_suscripcion='activo' order by created_at desc limit 1", [clientId])).rows[0];
			if (!subscription) {
				const plan = (await pool.query("select id from planes where activo=true order by created_at limit 1")).rows[0];
				if (!plan) return res.status(400).json({ error: 'No hay un plan activo para registrar el pago.' });
				subscription = (await pool.query("insert into suscripciones (cliente_id,plan_id,fecha_inicio,fecha_corte,estatus_suscripcion) values ($1,$2,current_date,current_date + interval '1 month','activo') returning id", [clientId, plan.id])).rows[0];
			}
			const rate = Number(d.bcvRate) || 45.5;
			const methodKey = String(d.method || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
			const method = { 'pago movil': 'pago_movil', transferencia: 'transferencia_ves', zelle: 'zelle', 'efectivo divisas': 'efectivo_divisas' }[methodKey] || 'otro';
			const result = await pool.query('insert into pagos (suscripcion_id,monto_pagado_divisas,monto_pagado_ves,tasa_bcv_aplicada,metodo_pago,referencia_bancaria,url_comprobante,estatus_validacion) values ($1,$2,$3,$4,$5,$6,$7,$8) returning *', [subscription.id, Number(d.usdAmount) || 0, Number(d.bsAmount) || 0, rate, method, String(d.ref || '').trim().toUpperCase(), d.receiptUrl || '', 'pendiente']);
			return res.status(201).json({ payment: mapLegacyPayment({ ...result.rows[0], church_name: req.user.name, client_index: Number(req.user.churchId) }) });
		}
		if (req.user.role === 'church' && Number(d.churchId) !== Number(req.user.churchId)) return res.status(403).json({ error: 'Iglesia no autorizada.' });
		const rate = (await pool.query('select bcv_rate from app_config where id=true')).rows[0]?.bcv_rate || 45.5;
		const usd = Number(d.usdAmount) || 0;
		const bs = Number(d.bsAmount) || Math.round(usd * Number(rate) * 100) / 100;
		const result = await pool.query('insert into payments (church_id,submitted_by,usd_amount,bs_amount,reference,method,concept,receipt_data,receipt_file_name,notes,account_destination) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id', [d.churchId, req.user.id, usd, bs, String(d.ref).trim().toUpperCase(), d.method || 'Pago Móvil', d.concept || 'Aporte Mensual', d.receiptUrl || null, d.receiptFileName || null, d.notes || '', d.accountDestination || '']);
		const row = (await pool.query('select p.*,c.name church_name,c.initials,c.color from payments p join churches c on c.id=p.church_id where p.id=$1', [result.rows[0].id])).rows[0];
		res.status(201).json({ payment: mapPayment(row) });
	} catch (error) {
		console.error('Error al registrar pago:', error);
		res.status(error.code === '23505' ? 409 : 500).json({ error: error.code === '23505' ? 'La referencia bancaria ya fue registrada.' : 'No se pudo registrar el pago.' });
	}
});
app.patch('/api/payments/:id', auth, admin, async (req, res) => {
	try {
		if (!await hasTable('churches')) {
			const status = { Pendiente: 'pendiente', Aprobado: 'aprobado', Rechazado: 'rechazado' }[req.body.status] || 'pendiente';
			const result = await pool.query('update pagos set estatus_validacion=$1,nota_rechazo=$2,validado_por=$3,fecha_validacion=now() where id=$4 returning *', [status, req.body.notes || null, req.user.id, req.params.id]);
			if (!result.rows[0]) return res.status(404).json({ error: 'Pago no encontrado.' });
			const row = (await pool.query('select p.*,c.nombre_organizacion church_name,c.representante_legal,c.email,c.telefono,row_number() over (order by c.created_at desc) as client_index from pagos p join suscripciones s on s.id=p.suscripcion_id join clientes c on c.id=s.cliente_id where p.id=$1', [req.params.id])).rows[0];
			return res.json({ payment: mapLegacyPayment(row) });
		}
		const result = await pool.query("update payments set status=$1,notes=coalesce(nullif($2,''),notes),reviewed_by=$3,reviewed_at=now() where id=$4 returning id", [req.body.status, req.body.notes || '', req.user.id, req.params.id]);
		if (!result.rows[0]) return res.status(404).json({ error: 'Pago no encontrado.' });
		const row = (await pool.query('select p.*,c.name church_name,c.initials,c.color from payments p join churches c on c.id=p.church_id where p.id=$1', [req.params.id])).rows[0];
		res.json({ payment: mapPayment(row) });
	} catch (error) {
		console.error('Error al actualizar pago:', error);
		res.status(500).json({ error: 'No se pudo actualizar el pago.' });
	}
});
app.post('/api/legal-requests', auth, async (req, res) => {
	const d = req.body;
	try {
		if (!await hasTable('churches')) {
			const type = { 'Títulos supletorios': 'titulo_supletorio_terreno', 'Constitución Legal': 'constitucion_legal', 'Asesoría Laboral': 'asesoria_laboral', 'Actualización Documentos': 'actualizacion_documentos', 'Deberes Formales': 'deberes_formales' }[d.category] || 'constitucion_legal';
			const result = await pool.query('insert into expedientes_legales (cliente_id,tipo_tramite,descripcion_solicitud,estatus_tramite,notas_internas_abogados) values ($1,$2,$3,$4,$5) returning *', [req.user.legacyClientId, type, `${d.title}: ${d.description || ''}`, 'en_analisis', d.notes || '']);
			return res.status(201).json({ request: mapLegacyLegal({ ...result.rows[0], church_name: req.user.name, client_index: Number(req.user.churchId), abogado_nombre: null }) });
		}
		if (req.user.role === 'church' && Number(d.churchId) !== Number(req.user.churchId)) return res.status(403).json({ error: 'Iglesia no autorizada.' });
		const result = await pool.query('insert into legal_requests (church_id,submitted_by,title,category,description,lawyer,priority,notes) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id', [d.churchId, req.user.id, d.title, d.category || 'General', d.description || '', d.lawyer || 'Pendiente de asignación', d.priority || 'Normal', d.notes || '']);
		const row = (await pool.query('select l.*,c.name church_name from legal_requests l join churches c on c.id=l.church_id where l.id=$1', [result.rows[0].id])).rows[0];
		res.status(201).json({ request: mapLegal(row) });
	} catch (error) {
		console.error('Error al registrar trámite:', error);
		res.status(500).json({ error: 'No se pudo registrar el trámite legal.' });
	}
});
app.patch('/api/legal-requests/:id', auth, admin, async (req, res) => {
	try {
		if (!await hasTable('churches')) {
			const status = { 'Recibido': 'en_analisis', 'En análisis': 'en_analisis', 'En Notaría/Registro': 'en_tramite', Concluido: 'concluido', Rechazado: 'en_analisis' }[req.body.status] || 'en_analisis';
			const result = await pool.query('update expedientes_legales set estatus_tramite=$1,notas_internas_abogados=coalesce(nullif($2,\'\'),notas_internas_abogados),updated_at=now() where id=$3 returning *', [status, req.body.notes || '', req.params.id]);
			if (!result.rows[0]) return res.status(404).json({ error: 'Trámite no encontrado.' });
			const row = (await pool.query('select l.*,c.nombre_organizacion church_name,row_number() over (order by c.created_at desc) as client_index,null::text as abogado_nombre from expedientes_legales l join clientes c on c.id=l.cliente_id where l.id=$1', [req.params.id])).rows[0];
			return res.json({ request: mapLegacyLegal(row) });
		}
		const result = await pool.query("update legal_requests set status=$1,lawyer=coalesce(nullif($2,''),lawyer),notes=coalesce(nullif($3,''),notes),updated_at=now() where id=$4 returning id", [req.body.status, req.body.lawyer || '', req.body.notes || '', req.params.id]);
		if (!result.rows[0]) return res.status(404).json({ error: 'Trámite no encontrado.' });
		const row = (await pool.query('select l.*,c.name church_name from legal_requests l join churches c on c.id=l.church_id where l.id=$1', [req.params.id])).rows[0];
		res.json({ request: mapLegal(row) });
	} catch (error) {
		console.error('Error al actualizar trámite:', error);
		res.status(500).json({ error: 'No se pudo actualizar el trámite.' });
	}
});
app.use(express.static(path.join(__dirname)));
app.listen(process.env.PORT || 3000, () => console.log(`Server activo, Cofraternidad disponible en http://localhost:${process.env.PORT || 3000}`));
