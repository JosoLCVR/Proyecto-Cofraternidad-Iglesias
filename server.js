require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const net = require('net');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const pool = require('./config/db');

const app = express();
const DEFAULT_PORT = Number(process.env.PORT || 5000);

function resolveAvailablePort(startPort, maxAttempts = 20) {
	return new Promise((resolve, reject) => {
		const tryPort = (port, attempt) => {
			const tester = net.createServer();
			tester.once('error', (err) => {
				if (err.code === 'EADDRINUSE' && attempt < maxAttempts) {
					return tryPort(port + 1, attempt + 1);
				}
				reject(err);
			});
			tester.once('listening', () => {
				tester.close(() => resolve(port));
			});
			tester.listen(port, '0.0.0.0');
		};
		tryPort(startPort, 1);
	});
}

async function startServer() {
	let port = DEFAULT_PORT;
	try {
		await ensureLegalSchema();
		port = await resolveAvailablePort(port);
		if (port !== DEFAULT_PORT) {
			console.warn(`Puerto ${DEFAULT_PORT} ocupado. El servidor quedó en ${port} para evitar bloqueos.`);
		}
		process.env.PORT = String(port);
		app.listen(port, '0.0.0.0', () => {
			console.log(`Server activo, Cofraternidad disponible en http://localhost:${port}`);
		});
	} catch (error) {
		console.error('No se pudo iniciar el servidor:', error);
		process.exit(1);
	}
}

// Configuración de Sesiones en memoria con expiración (TTL de 7 días)
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const sessions = new Map();

function setSession(token, user) {
	sessions.set(token, { user, expiresAt: Date.now() + SESSION_TTL_MS });
}

function getSessionUser(token) {
	if (!token) return null;
	const sess = sessions.get(token);
	if (!sess) return null;
	if (Date.now() > sess.expiresAt) {
		sessions.delete(token);
		return null;
	}
	return sess.user;
}

// Middlewares de seguridad y parsing
app.use((req, res, next) => {
	res.setHeader('X-Content-Type-Options', 'nosniff');
	res.setHeader('X-Frame-Options', 'SAMEORIGIN');
	res.setHeader('X-XSS-Protection', '1; mode=block');
	next();
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '8mb' }));

function sessionUser(req) {
	const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.headers.cookie?.match(/session=([^;]+)/)?.[1];
	return getSessionUser(token);
}

function auth(req, res, next) {
	const user = sessionUser(req);
	if (!user) return res.status(401).json({ error: 'Sesión requerida o expirada.' });
	req.user = user;
	next();
}

function admin(req, res, next) {
	if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acceso exclusivo del administrador.' });
	next();
}

async function passwordMatches(password, storedPassword) {
	if (!storedPassword) return false;
	if (storedPassword.startsWith('$2')) return bcrypt.compare(password, storedPassword);
	return password === storedPassword;
}

// Mapeadores del esquema nuevo
function mapChurch(r) {
	return {
		...r,
		foundationYear: r.foundation_year,
		lastPaymentDate: r.last_payment_at ? new Date(r.last_payment_at).toLocaleString('es-VE') : 'Sin aportes registrados'
	};
}

function mapPayment(r) {
	return {
		...r,
		church: r.church_name,
		initials: r.initials,
		color: r.color,
		usdAmount: Number(r.usd_amount),
		bsAmount: Number(r.bs_amount),
		ref: r.reference,
		receiptUrl: r.receipt_data,
		receiptFileName: r.receipt_file_name,
		accountDestination: r.account_destination,
		date: new Date(r.created_at).toLocaleString('es-VE'),
		timestamp: new Date(r.created_at).getTime()
	};
}

function mapLegal(r) {
	return {
		...r,
		church: r.church_name,
		date: new Date(r.created_at).toLocaleDateString('es-VE'),
		timestamp: new Date(r.created_at).getTime()
	};
}

function mapConfig(row = {}) {
	return {
		bcvRate: Number(row.bcv_rate ?? row.bcvRate ?? 45.5),
		orgName: row.org_name ?? row.orgName ?? 'Cofraternidad de Iglesias',
		legalDepartment: row.legal_department ?? row.legalDepartment ?? 'Departamento Legal y Registro',
		contactPhone: row.contact_phone ?? row.contactPhone ?? '',
		contactEmail: row.contact_email ?? row.contactEmail ?? '',
		whatsappSupport: row.whatsapp_support ?? row.whatsappSupport ?? ''
	};
}

// Mapeadores del esquema original (clientes, pagos, suscripciones, etc.)
function mapLegacyStatus(status) {
	return { pendiente: 'Pendiente', aprobado: 'Aprobado', aprobado_parcial: 'Aprobado', rechazado: 'Rechazado' }[status] || 'Pendiente';
}

function mapLegacyLegalStatus(status) {
	return { recibido: 'Recibido', en_revision: 'En análisis', en_analisis: 'En análisis', en_proceso: 'En Notaría/Registro', en_tramite: 'En Notaría/Registro', completado: 'Concluido', concluido: 'Concluido', rechazado: 'Rechazado' }[status] || 'Recibido';
}

function mapLegalEntityStatus(status) {
	return { Solvente: 'al_dia', 'En proceso': 'por_constituir', 'En mora': 'constituida_sin_actualizar' }[status] || 'por_constituir';
}

function mapLegacyClient(row, index) {
	const id = index + 1;
	const initials = (row.nombre_organizacion || 'IG').split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase() || 'IG';
	return {
		id,
		legacyId: row.id,
		name: row.nombre_organizacion,
		pastor: row.representante_legal,
		rif: row.documento_identidad,
		phone: row.telefono || '',
		email: row.email,
		city: row.ciudad || 'Venezuela',
		address: row.direccion || '',
		members: Number(row.miembros || 0),
		status: row.estatus_juridico === 'activo' || row.estatus_juridico === 'al_dia' ? 'Solvente' : 'En proceso',
		initials: initials || 'IG',
		color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
		foundationYear: row.created_at ? new Date(row.created_at).getFullYear() : null,
		lastPaymentDate: 'Sin aportes registrados'
	};
}

function mapLegacyPayment(row) {
	return {
		id: row.id,
		churchId: Number(row.client_index || 1),
		church: row.church_name,
		representative: row.representante_legal || '',
		registrantEmail: row.email || '',
		registrantPhone: row.telefono || '',
		initials: row.initials || 'IG',
		color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
		usdAmount: Number(row.monto_pagado_divisas || 0),
		bsAmount: Number(row.monto_pagado_ves || 0),
		ref: row.referencia_bancaria,
		method: row.metodo_pago,
		concept: 'Aporte de suscripción',
		receiptUrl: row.url_comprobante,
		receiptFileName: null,
		status: mapLegacyStatus(row.estatus_validacion),
		notes: row.nota_rechazo || '',
		accountDestination: '',
		date: new Date(row.fecha_reporte).toLocaleString('es-VE'),
		timestamp: new Date(row.fecha_reporte).getTime()
	};
}

function mapLegacyLegal(row) {
	const labels = {
		titulo_supletorio_terreno: 'Títulos supletorios',
		constitucion_legal: 'Constitución Legal',
		asesoria_laboral: 'Asesoría Laboral',
		actualizacion_documentos: 'Actualización Documentos',
		deberes_formales: 'Deberes Formales'
	};
	const label = labels[row.tipo_tramite] || row.tipo_tramite;
	return {
		id: row.id,
		churchId: Number(row.client_index || 1),
		church: row.church_name,
		title: label,
		category: label,
		description: row.descripcion_solicitud || '',
		lawyer: row.abogado_nombre || 'Pendiente de asignación',
		status: mapLegacyLegalStatus(row.estatus_tramite),
		priority: 'Normal',
		notes: row.notas_internas_abogados || '',
		date: new Date(row.created_at).toLocaleDateString('es-VE'),
		timestamp: new Date(row.created_at).getTime()
	};
}

async function hasTable(tableName) {
	try {
		const result = await pool.query('select to_regclass($1) as table_name', [`public.${tableName}`]);
		return Boolean(result.rows[0]?.table_name);
	} catch {
		return false;
	}
}

async function ensureLegalSchema() {
	try {
		await pool.query(`
			create table if not exists app_config (
				id boolean primary key default true check (id),
				bcv_rate numeric(12,4) not null default 45.50,
				org_name text not null default 'Cofraternidad de Iglesias',
				legal_department text not null default 'Departamento Legal y Registro',
				contact_phone text default '',
				contact_email text default '',
				whatsapp_support text default '',
				updated_at timestamptz not null default now()
			)
		`);
		await pool.query('insert into app_config (id) values (true) on conflict (id) do nothing');
		await pool.query(`
			create table if not exists lawyers (
				id bigint generated always as identity primary key,
				name text not null unique,
				email text not null default '',
				phone text not null default '',
				specialty text not null default '',
				active boolean not null default true,
				created_at timestamptz not null default now()
			)
		`);
		if (await hasTable('expedientes_legales')) {
			await pool.query('alter table expedientes_legales add column if not exists abogado_nombre text');
		}
	} catch (error) {
		console.error('No se pudo preparar el catálogo legal:', error);
	}
}

function mapLawyer(row) {
	return {
		id: row.id,
		name: row.name,
		email: row.email || '',
		phone: row.phone || '',
		specialty: row.specialty || '',
		active: row.active !== false
	};
}

async function resolveLegacyClientId(churchId, user) {
	if (user?.legacyClientId) return user.legacyClientId;
	if (user?.churchId && !churchId) return user.churchId;

	const normalizedChurchId = Number(churchId ?? user?.churchId ?? 0);
	if (!normalizedChurchId) {
		return null;
	}

	try {
		const result = await pool.query(
			'select id from clientes order by created_at desc offset $1 limit 1',
			[Math.max(0, normalizedChurchId - 1)]
		);
		return result.rows[0]?.id || null;
	} catch (error) {
		console.error('Error al resolver cliente legado para el trámite:', error);
		return null;
	}
}

// Endpoint de clientes / afiliación
app.post('/api/clientes', async (req, res) => {
	const { nombre_organizacion, representante_legal, documento_identidad, telefono, email, ciudad, direccion, miembros, estatus_juridico } = req.body;
	if (!nombre_organizacion || !representante_legal || !documento_identidad || !email) {
		return res.status(400).json({ error: 'Organización, representante, documento y correo son obligatorios.' });
	}

	try {
		if (await hasTable('churches')) {
			const initials = nombre_organizacion.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase() || 'IG';
			const status = estatus_juridico === 'activo' || estatus_juridico === 'Solvente' ? 'Solvente' : 'En proceso';
			const result = await pool.query(
				`insert into churches (name, pastor, rif, phone, email, city, address, members, status, initials, color, foundation_year)
				 values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
				 on conflict (rif) do update set
					name = excluded.name,
					pastor = excluded.pastor,
					phone = excluded.phone,
					email = excluded.email,
					city = excluded.city,
					address = excluded.address,
					members = excluded.members,
					status = excluded.status,
					updated_at = now()
				 returning *`,
				[
					nombre_organizacion.trim(),
					representante_legal.trim(),
					documento_identidad.trim(),
					(telefono || '').trim(),
					email.trim().toLowerCase(),
					(ciudad || 'Venezuela').trim(),
					(direccion || '').trim(),
					Number(miembros) || 0,
					status,
					initials,
					'bg-emerald-100 text-emerald-800 border-emerald-200',
					new Date().getFullYear()
				]
			);
			return res.status(200).json({ cliente: result.rows[0], church: mapChurch(result.rows[0]) });
		}

		// Esquema de clientes
		const result = await pool.query(
			`insert into clientes (nombre_organizacion, representante_legal, documento_identidad, telefono, email, ciudad, direccion, miembros, estatus_juridico)
			 values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			 on conflict (documento_identidad) do update set
				nombre_organizacion = excluded.nombre_organizacion,
				representante_legal = excluded.representante_legal,
				telefono = excluded.telefono,
				email = excluded.email,
				ciudad = excluded.ciudad,
				direccion = excluded.direccion,
				miembros = excluded.miembros,
				estatus_juridico = excluded.estatus_juridico,
				updated_at = now()
			 returning *`,
			[
				nombre_organizacion.trim(),
				representante_legal.trim(),
				documento_identidad.trim(),
				(telefono || '').trim(),
				email.trim().toLowerCase(),
				(ciudad || 'Venezuela').trim(),
				(direccion || '').trim(),
				Number(miembros) || 0,
				mapLegalEntityStatus(estatus_juridico)
			]
		);
		res.status(200).json({ cliente: result.rows[0], church: mapLegacyClient(result.rows[0], 0) });
	} catch (error) {
		console.error('Error al registrar cliente/iglesia:', error);
		if (error.code === '23505') return res.status(409).json({ error: 'Ya existe una iglesia con ese RIF/documento o correo.' });
		res.status(500).json({ error: 'No se pudo registrar la iglesia.' });
	}
});

// Directorio protegido de clientes (solo admin)
app.get('/api/clientes', auth, admin, async (req, res) => {
	try {
		if (await hasTable('clientes')) {
			const result = await pool.query('select * from clientes order by created_at desc');
			return res.json(result.rows);
		}
		const result = await pool.query('select * from churches order by created_at desc');
		res.json(result.rows);
	} catch (error) {
		console.error('Error al consultar clientes:', error);
		res.status(500).json({ error: 'No se pudo consultar los clientes.' });
	}
});

// Registro de usuarios
app.post('/api/auth/register', async (req, res) => {
	const { name, email, password, churchId } = req.body;
	if (!name || !email || !password || password.length < 8) {
		return res.status(400).json({ error: 'Nombre, correo y contraseña de al menos 8 caracteres son obligatorios.' });
	}
	try {
		const hash = await bcrypt.hash(password, 12);
		if (await hasTable('app_users')) {
			const r = await pool.query(
				'insert into app_users (name, email, password_hash, role, church_id) values ($1, $2, $3, $4, $5) returning id, name, email, role, church_id',
				[name.trim(), email.trim().toLowerCase(), hash, 'church', churchId || null]
			);
			return res.status(201).json({ user: r.rows[0] });
		}
		res.status(201).json({ user: { name, email, role: 'church', churchId } });
	} catch (e) {
		res.status(e.code === '23505' ? 409 : 500).json({
			error: e.code === '23505' ? 'Ese correo ya está registrado.' : 'No se pudo registrar el usuario.'
		});
	}
});

// Inicio de Sesión
app.post('/api/auth/login', async (req, res) => {
	try {
		const email = (req.body.email || '').trim().toLowerCase();
		const password = req.body.password || '';
		const role = req.body.role || 'admin';

		if (!email || !password) {
			return res.status(400).json({ error: 'Correo y contraseña son obligatorios.' });
		}

		let user = null;

		if (role === 'admin') {
			let adminUser = null;
			if (await hasTable('app_users')) {
				const resUser = await pool.query(
					'select id, name, email, role, password_hash from app_users where lower(email)=$1 and role=$2',
					[email, 'admin']
				);
				if (resUser.rows[0]) adminUser = resUser.rows[0];
			}
			if (!adminUser && await hasTable('usuarios_admin')) {
				const resAdmin = await pool.query(
					'select id, nombre, email, password_hash, activo from usuarios_admin where lower(email)=$1 and rol=$2',
					[email, 'admin_general']
				);
				if (resAdmin.rows[0] && resAdmin.rows[0].activo) {
					adminUser = {
						id: resAdmin.rows[0].id,
						name: resAdmin.rows[0].nombre,
						email: resAdmin.rows[0].email,
						role: 'admin',
						password_hash: resAdmin.rows[0].password_hash
					};
				}
			}

			if (!adminUser || !(await passwordMatches(password, adminUser.password_hash))) {
				return res.status(401).json({ error: 'Correo o contraseña de administrador incorrectos.' });
			}

			user = {
				id: adminUser.id,
				name: adminUser.name,
				email: adminUser.email,
				role: 'admin',
				churchId: null
			};
		} else {
			// Usuario Iglesia
			let churchUser = null;
			if (await hasTable('app_users')) {
				const resUser = await pool.query(
					'select id, name, email, role, church_id, password_hash from app_users where lower(email)=$1 and role=$2',
					[email, 'church']
				);
				if (resUser.rows[0] && (await passwordMatches(password, resUser.rows[0].password_hash))) {
					churchUser = {
						id: resUser.rows[0].id,
						name: resUser.rows[0].name,
						email: resUser.rows[0].email,
						role: 'church',
						churchId: resUser.rows[0].church_id ? Number(resUser.rows[0].church_id) : null
					};
				}
			}

			if (!churchUser && await hasTable('churches')) {
				const resChurch = await pool.query(
					'select id, name, email, rif from churches where lower(email)=$1 or lower(rif)=$1',
					[email]
				);
				const church = resChurch.rows[0];
				if (church && password.trim().toLowerCase() === (church.rif || '').trim().toLowerCase()) {
					churchUser = {
						id: church.id,
						name: church.name,
						email: church.email,
						role: 'church',
						churchId: Number(church.id)
					};
				}
			}

			if (!churchUser && await hasTable('clientes')) {
				const resClient = await pool.query(
					'select id, nombre_organizacion, email, documento_identidad from clientes where lower(email)=$1',
					[email]
				);
				const client = resClient.rows[0];
				if (client && password.trim().toLowerCase() === (client.documento_identidad || '').trim().toLowerCase()) {
					churchUser = {
						id: client.id,
						name: client.nombre_organizacion,
						email: client.email,
						role: 'church',
						churchId: 1,
						legacyClientId: client.id
					};
				}
			}

			if (!churchUser) {
				return res.status(401).json({ error: 'Para el acceso de iglesia usa tu correo y RIF/documento registrado.' });
			}

			user = churchUser;
		}

		const token = crypto.randomBytes(32).toString('hex');
		setSession(token, user);
		res.setHeader('Set-Cookie', `session=${token}; HttpOnly; SameSite=Lax; Path=/`);
		res.json({ ok: true, user, token });
	} catch (e) {
		console.error('Error al iniciar sesión:', e);
		res.status(500).json({ error: 'No se pudo iniciar sesión.' });
	}
});

// Cierre de Sesión
app.post('/api/auth/logout', (req, res) => {
	const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.headers.cookie?.match(/session=([^;]+)/)?.[1];
	if (token) sessions.delete(token);
	res.setHeader('Set-Cookie', 'session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax');
	res.json({ ok: true });
});

// Catálogo de abogados
app.get('/api/lawyers', auth, admin, async (req, res) => {
	try {
		const result = await pool.query('select * from lawyers order by active desc, name');
		res.json({ lawyers: result.rows.map(mapLawyer) });
	} catch (error) {
		console.error('Error al consultar abogados:', error);
		res.status(500).json({ error: 'No se pudo cargar el catálogo de abogados.' });
	}
});

app.post('/api/lawyers', auth, admin, async (req, res) => {
	const name = String(req.body.name || '').trim();
	if (!name) return res.status(400).json({ error: 'El nombre del abogado es obligatorio.' });

	try {
		const result = await pool.query(
			'insert into lawyers (name, email, phone, specialty) values ($1, $2, $3, $4) returning *',
			[name, String(req.body.email || '').trim().toLowerCase(), String(req.body.phone || '').trim(), String(req.body.specialty || '').trim()]
		);
		res.status(201).json({ lawyer: mapLawyer(result.rows[0]) });
	} catch (error) {
		console.error('Error al registrar abogado:', error);
		if (error.code === '23505') return res.status(409).json({ error: 'Ya existe un abogado con ese nombre.' });
		res.status(500).json({ error: 'No se pudo registrar el abogado.' });
	}
});

app.patch('/api/lawyers/:id', auth, admin, async (req, res) => {
	const name = String(req.body.name || '').trim();
	if (!name) return res.status(400).json({ error: 'El nombre del abogado es obligatorio.' });

	try {
		const result = await pool.query(
			`update lawyers
			 set name = $1, email = $2, phone = $3, specialty = $4
			 where id = $5
			 returning *`,
			[name, String(req.body.email || '').trim().toLowerCase(), String(req.body.phone || '').trim(), String(req.body.specialty || '').trim(), req.params.id]
		);
		if (!result.rows[0]) return res.status(404).json({ error: 'Abogado no encontrado.' });
		res.json({ lawyer: mapLawyer(result.rows[0]) });
	} catch (error) {
		console.error('Error al actualizar abogado:', error);
		if (error.code === '23505') return res.status(409).json({ error: 'Ya existe un abogado con ese nombre.' });
		res.status(500).json({ error: 'No se pudo actualizar el abogado.' });
	}
});

// Carga inicial de datos (Bootstrap)
app.get('/api/bootstrap', auth, async (req, res) => {
	try {
		if (!await hasTable('churches')) {
			const isAdmin = req.user.role === 'admin';
			const clientParams = isAdmin ? [] : [req.user.legacyClientId];
			const clientWhere = isAdmin ? '' : ' where id = $1';
			const clients = await pool.query(`select * from clientes${clientWhere} order by created_at desc`, clientParams);
			const payments = await pool.query(
				`select p.*, c.nombre_organizacion church_name, c.representante_legal, c.email, c.telefono,
				 row_number() over (order by c.created_at desc) as client_index
				 from pagos p
				 join suscripciones s on s.id = p.suscripcion_id
				 join clientes c on c.id = s.cliente_id
				${isAdmin ? '' : 'where c.id = $1'}
				 order by p.fecha_reporte desc`,
				clientParams
			);
			const legal = await pool.query(
				`select l.*, c.nombre_organizacion church_name,
				 row_number() over (order by c.created_at desc) as client_index,
					l.abogado_nombre
				 from expedientes_legales l
				 join clientes c on c.id = l.cliente_id
					${isAdmin ? '' : 'where c.id = $1'}
					order by l.created_at desc`,
				clientParams
			);
			const churches = clients.rows.map((client, index) => mapLegacyClient(client, index));
			const configQuery = await pool.query('select bcv_rate, org_name, legal_department, contact_phone, contact_email, whatsapp_support from app_config where id=true');
			return res.json({
				churches,
				payments: payments.rows.map(mapLegacyPayment),
				legal: legal.rows.map(mapLegacyLegal),
				lawyers: (await pool.query('select * from lawyers where active = true order by name')).rows.map(mapLawyer),
				config: mapConfig(configQuery.rows[0])
			});
		}

		const isAdmin = req.user.role === 'admin';
		const params = isAdmin ? [] : [req.user.churchId];
		const where = isAdmin ? '' : ' where c.id = $1';
		const paymentWhere = isAdmin ? '' : ' where p.church_id = $1';
		const legalWhere = isAdmin ? '' : ' where l.church_id = $1';

		const [churches, payments, legal, lawyers] = await Promise.all([
			pool.query(`select c.* from churches c${where} order by c.created_at desc`, params),
			pool.query(`select p.*, c.name church_name, c.initials, c.color from payments p join churches c on c.id = p.church_id${paymentWhere} order by p.created_at desc`, params),
			pool.query(`select l.*, c.name church_name from legal_requests l join churches c on c.id = l.church_id${legalWhere} order by l.created_at desc`, params),
			pool.query('select * from lawyers where active = true order by name')
		]);

		const configQuery = await hasTable('app_config')
			? await pool.query('select bcv_rate, org_name, legal_department, contact_phone, contact_email, whatsapp_support from app_config where id=true')
			: { rows: [] };

		const config = mapConfig(configQuery.rows[0]);

		res.json({
			churches: churches.rows.map(mapChurch),
			payments: payments.rows.map(mapPayment),
			legal: legal.rows.map(mapLegal),
			lawyers: lawyers.rows.map(mapLawyer),
			config
		});
	} catch (e) {
		console.error('Error al cargar bootstrap:', e);
		res.status(500).json({ error: 'No se pudo cargar la información del sistema.' });
	}
});

// Crear iglesia
app.post('/api/churches', auth, admin, async (req, res) => {
	const d = req.body;
	if (!d.name) return res.status(400).json({ error: 'El nombre de la iglesia es obligatorio.' });

	try {
		if (!await hasTable('churches')) {
			// Redirigir creación a clientes en esquema legado
			const result = await pool.query(
				`insert into clientes (nombre_organizacion, representante_legal, documento_identidad, telefono, email, ciudad, direccion, miembros, estatus_juridico)
				 values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
				 on conflict (documento_identidad) do update set
					nombre_organizacion = excluded.nombre_organizacion,
					representante_legal = excluded.representante_legal,
					telefono = excluded.telefono,
					email = excluded.email,
					ciudad = excluded.ciudad,
					direccion = excluded.direccion,
					miembros = excluded.miembros,
					estatus_juridico = excluded.estatus_juridico,
					updated_at = now()
				 returning *`,
				[
					d.name.trim(),
					(d.pastor || '').trim(),
					(d.rif || '').trim(),
					(d.phone || '').trim(),
					(d.email || '').trim().toLowerCase(),
					(d.city || 'Venezuela').trim(),
					(d.address || '').trim(),
					Number(d.members) || 0,
					mapLegalEntityStatus(d.status)
				]
			);
			return res.status(201).json({ church: mapLegacyClient(result.rows[0], 0) });
		}

		const initials = (d.name || 'IG').split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase() || 'IG';
		const r = await pool.query(
			`insert into churches (name, pastor, rif, phone, email, city, address, members, status, initials, color, foundation_year)
			 values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
			 on conflict (rif) do update set
				name = excluded.name,
				pastor = excluded.pastor,
				phone = excluded.phone,
				email = excluded.email,
				city = excluded.city,
				address = excluded.address,
				members = excluded.members,
				status = excluded.status,
				updated_at = now()
			 returning *`,
			[
				d.name.trim(),
				(d.pastor || '').trim(),
				(d.rif || '').trim() || null,
				(d.phone || '').trim(),
				(d.email || '').trim().toLowerCase(),
				(d.city || 'Venezuela').trim(),
				(d.address || '').trim(),
				Number(d.members) || 0,
				d.status || 'En proceso',
				initials,
				d.color || 'bg-emerald-100 text-emerald-800 border-emerald-200',
				d.foundationYear || new Date().getFullYear()
			]
		);
		res.status(201).json({ church: mapChurch(r.rows[0]) });
	} catch (error) {
		console.error('Error al registrar iglesia:', error);
		if (error.code === '23505') return res.status(409).json({ error: 'Ya existe una iglesia con ese RIF registrado.' });
		res.status(500).json({ error: 'No se pudo guardar la iglesia.' });
	}
});

app.patch('/api/churches/:id/status', auth, admin, async (req, res) => {
	const allowedStatuses = ['Solvente', 'En mora', 'En proceso'];
	const status = String(req.body.status || '').trim();
	if (!allowedStatuses.includes(status)) {
		return res.status(400).json({ error: 'El estatus de la iglesia no es válido.' });
	}

	try {
		if (!await hasTable('churches')) {
			const clients = await pool.query('select id from clientes order by created_at desc');
			const client = clients.rows[Number(req.params.id) - 1];
			if (!client) return res.status(404).json({ error: 'Iglesia no encontrada.' });
			const result = await pool.query(
				'update clientes set estatus_juridico = $1, updated_at = now() where id = $2 returning *',
				[mapLegalEntityStatus(status), client.id]
			);
			return res.json({ church: mapLegacyClient(result.rows[0], Number(req.params.id) - 1) });
		}

		const result = await pool.query(
			'update churches set status = $1, updated_at = now() where id = $2 returning *',
			[status, req.params.id]
		);
		if (!result.rows[0]) return res.status(404).json({ error: 'Iglesia no encontrada.' });
		res.json({ church: mapChurch(result.rows[0]) });
	} catch (error) {
		console.error('Error al actualizar estatus de iglesia:', error);
		res.status(500).json({ error: 'No se pudo actualizar el estatus de la iglesia.' });
	}
});

// Actualizar configuración (Tasa BCV, etc.)
app.patch('/api/config', auth, admin, async (req, res) => {
	try {
		if (!await hasTable('app_config')) {
			return res.status(500).json({ error: 'La configuración de la tasa no está disponible.' });
		}
		const r = await pool.query(
			'update app_config set bcv_rate = coalesce($1, bcv_rate), updated_at = now() where id = true returning bcv_rate, org_name, legal_department, contact_phone, contact_email, whatsapp_support',
			[req.body.bcvRate]
		);
		res.json({ config: mapConfig(r.rows[0]) });
	} catch (error) {
		console.error('Error al actualizar configuración:', error);
		res.status(500).json({ error: 'No se pudo actualizar la configuración.' });
	}
});

// Reportar pago
app.post('/api/payments', auth, async (req, res) => {
	const d = req.body;
	try {
		if (!await hasTable('churches')) {
			const clientId = req.user.role === 'admin'
				? await resolveLegacyClientId(d.churchId, {})
				: req.user.legacyClientId;
			if (!clientId) return res.status(400).json({ error: 'La iglesia no tiene un cliente asociado.' });
			let subscription = (await pool.query("select id from suscripciones where cliente_id=$1 and estatus_suscripcion='activo' order by created_at desc limit 1", [clientId])).rows[0];
			if (!subscription) {
				const plan = (await pool.query("select id from planes where activo=true order by created_at limit 1")).rows[0];
				if (!plan) return res.status(400).json({ error: 'No hay un plan activo para registrar el pago.' });
				subscription = (await pool.query("insert into suscripciones (cliente_id, plan_id, fecha_inicio, fecha_corte, estatus_suscripcion) values ($1, $2, current_date, current_date + interval '1 month', 'activo') returning id", [clientId, plan.id])).rows[0];
			}
			const rate = Number(d.bcvRate) || 45.5;
			const methodKey = String(d.method || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
			const method = {
				'pago movil': 'pago_movil',
				transferencia: 'transferencia_ves',
				'transferencia bancaria': 'transferencia_ves',
				zelle: 'zelle',
				'efectivo divisas': 'efectivo_divisas',
				'efectivo / divisas en caja': 'efectivo_divisas'
			}[methodKey] || 'otro';
			const usdAmount = Number(d.usdAmount) || 0;
			const bsAmount = Number(d.bsAmount) || Math.round(usdAmount * rate * 100) / 100;
			const result = await pool.query(
				'insert into pagos (suscripcion_id, monto_pagado_divisas, monto_pagado_ves, tasa_bcv_aplicada, metodo_pago, referencia_bancaria, url_comprobante, estatus_validacion) values ($1, $2, $3, $4, $5, $6, $7, $8) returning *',
				[subscription.id, usdAmount, bsAmount, rate, method, String(d.ref || '').trim().toUpperCase(), d.receiptUrl || '', 'pendiente']
			);
			const paymentRow = (await pool.query(
				`select p.*, c.nombre_organizacion church_name, c.representante_legal, c.email, c.telefono,
				 row_number() over (order by c.created_at desc) as client_index
				 from pagos p
				 join suscripciones s on s.id = p.suscripcion_id
				 join clientes c on c.id = s.cliente_id
				 where p.id = $1`,
				[result.rows[0].id]
			)).rows[0];
			return res.status(201).json({ payment: mapLegacyPayment(paymentRow) });
		}

		if (req.user.role === 'church' && Number(d.churchId) !== Number(req.user.churchId)) {
			return res.status(403).json({ error: 'Iglesia no autorizada.' });
		}

		const rateRow = (await pool.query('select bcv_rate from app_config where id=true')).rows[0];
		const rate = rateRow ? Number(rateRow.bcv_rate) : 45.5;
		const usd = Number(d.usdAmount) || 0;
		const bs = Number(d.bsAmount) || Math.round(usd * rate * 100) / 100;

		const result = await pool.query(
			`insert into payments (church_id, submitted_by, usd_amount, bs_amount, reference, method, concept, receipt_data, receipt_file_name, notes, account_destination)
			 values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
			[
				d.churchId,
				req.user.id || null,
				usd,
				bs,
				String(d.ref).trim().toUpperCase(),
				d.method || 'Pago Móvil',
				d.concept || 'Aporte Mensual',
				d.receiptUrl || null,
				d.receiptFileName || null,
				d.notes || '',
				d.accountDestination || ''
			]
		);

		const row = (await pool.query(
			'select p.*, c.name church_name, c.initials, c.color from payments p join churches c on c.id = p.church_id where p.id = $1',
			[result.rows[0].id]
		)).rows[0];

		res.status(201).json({ payment: mapPayment(row) });
	} catch (error) {
		console.error('Error al registrar pago:', error);
		if (error.code === '23505') {
			return res.status(409).json({ error: 'La referencia bancaria ya fue registrada previamente para esta iglesia.' });
		}
		res.status(500).json({ error: 'No se pudo registrar el pago.' });
	}
});

// Actualizar estatus de pago (Aprobar / Rechazar)
app.patch('/api/payments/:id', auth, admin, async (req, res) => {
	try {
		if (!await hasTable('churches')) {
			const status = { Pendiente: 'pendiente', Aprobado: 'aprobado', Rechazado: 'rechazado' }[req.body.status] || 'pendiente';
			const result = await pool.query(
				'update pagos set estatus_validacion=$1, nota_rechazo=$2, validado_por=$3, fecha_validacion=now() where id=$4 returning *',
				[status, req.body.notes || null, req.user.id, req.params.id]
			);
			if (!result.rows[0]) return res.status(404).json({ error: 'Pago no encontrado.' });
			const row = (await pool.query(
				`select p.*, c.nombre_organizacion church_name, c.representante_legal, c.email, c.telefono,
				 row_number() over (order by c.created_at desc) as client_index
				 from pagos p
				 join suscripciones s on s.id = p.suscripcion_id
				 join clientes c on c.id = s.cliente_id
				 where p.id=$1`,
				[req.params.id]
			)).rows[0];
			return res.json({ payment: mapLegacyPayment(row) });
		}

		const { status, notes } = req.body;
		const result = await pool.query(
			"update payments set status = $1, notes = coalesce(nullif($2, ''), notes), reviewed_by = $3, reviewed_at = now() where id = $4 returning *",
			[status, notes || '', req.user.id, req.params.id]
		);

		if (!result.rows[0]) return res.status(404).json({ error: 'Pago no encontrado.' });

		const updatedPayment = result.rows[0];

		// Si el pago es aprobado, actualizar la iglesia a Solvente y registrar último pago
		if (status === 'Aprobado') {
			await pool.query(
				"update churches set status = 'Solvente', last_payment_at = now(), updated_at = now() where id = $1",
				[updatedPayment.church_id]
			);
		}

		const row = (await pool.query(
			'select p.*, c.name church_name, c.initials, c.color from payments p join churches c on c.id = p.church_id where p.id = $1',
			[req.params.id]
		)).rows[0];

		res.json({ payment: mapPayment(row) });
	} catch (error) {
		console.error('Error al actualizar pago:', error);
		res.status(500).json({ error: 'No se pudo actualizar el pago.' });
	}
});

// Aperturar trámite legal
app.post('/api/legal-requests', auth, async (req, res) => {
	const d = req.body;
	try {
		if (!await hasTable('churches')) {
			const legacyClientId = await resolveLegacyClientId(d.churchId, req.user);
			if (!legacyClientId) {
				return res.status(400).json({ error: 'No se pudo asociar el trámite con una iglesia válida.' });
			}

			const type = { 'Títulos supletorios': 'titulo_supletorio_terreno', 'Constitución Legal': 'constitucion_legal', 'Asesoría Laboral': 'asesoria_laboral', 'Actualización Documentos': 'actualizacion_documentos', 'Deberes Formales': 'deberes_formales' }[d.category] || 'constitucion_legal';
			const result = await pool.query(
				'insert into expedientes_legales (cliente_id, tipo_tramite, descripcion_solicitud, estatus_tramite, notas_internas_abogados, abogado_nombre) values ($1, $2, $3, $4, $5, $6) returning *',
				[legacyClientId, type, `${d.title}: ${d.description || ''}`, 'en_analisis', d.notes || '', d.lawyer || 'Pendiente de asignación']
			);
			return res.status(201).json({ request: mapLegacyLegal({ ...result.rows[0], church_name: req.user.name, client_index: Number(req.user.churchId || 1) }) });
		}

		if (req.user.role === 'church' && Number(d.churchId) !== Number(req.user.churchId)) {
			return res.status(403).json({ error: 'Iglesia no autorizada.' });
		}
		const result = await pool.query(
			`insert into legal_requests (church_id, submitted_by, title, category, description, lawyer, status, priority, notes)
			 values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
			[
				d.churchId,
				req.user.id || null,
				d.title,
				d.category || 'General',
				d.description || '',
				d.lawyer || 'Pendiente de asignación',
				d.status || 'En análisis',
				d.priority || 'Normal',
				d.notes || ''
			]
		);
		const row = (await pool.query(
			'select l.*, c.name church_name from legal_requests l join churches c on c.id = l.church_id where l.id = $1',
			[result.rows[0].id]
		)).rows[0];
		res.status(201).json({ request: mapLegal(row) });
	} catch (error) {
		console.error('Error al registrar trámite:', error);
		res.status(500).json({ error: 'No se pudo registrar el trámite legal.' });
	}
});

// Actualizar expediente legal
app.patch('/api/legal-requests/:id', auth, admin, async (req, res) => {
	try {
		if (!await hasTable('churches')) {
			const status = { 'Recibido': 'en_analisis', 'En análisis': 'en_analisis', 'En Notaría/Registro': 'en_tramite', Concluido: 'concluido', Rechazado: 'en_analisis' }[req.body.status] || 'en_analisis';
			const result = await pool.query(
				'update expedientes_legales set estatus_tramite=$1, abogado_nombre=coalesce(nullif($2,\'\'), abogado_nombre), notas_internas_abogados=coalesce(nullif($3,\'\'), notas_internas_abogados), updated_at=now() where id=$4 returning *',
				[status, req.body.lawyer || '', req.body.notes || '', req.params.id]
			);
			if (!result.rows[0]) return res.status(404).json({ error: 'Trámite no encontrado.' });
			const row = (await pool.query(
				`select l.*, c.nombre_organizacion church_name, row_number() over (order by c.created_at desc) as client_index
				 from expedientes_legales l
				 join clientes c on c.id = l.cliente_id
				 where l.id=$1`,
				[req.params.id]
			)).rows[0];
			return res.json({ request: mapLegacyLegal(row) });
		}

		const result = await pool.query(
			"update legal_requests set status = $1, lawyer = coalesce(nullif($2, ''), lawyer), notes = coalesce(nullif($3, ''), notes), updated_at = now() where id = $4 returning id",
			[req.body.status, req.body.lawyer || '', req.body.notes || '', req.params.id]
		);
		if (!result.rows[0]) return res.status(404).json({ error: 'Trámite no encontrado.' });
		const row = (await pool.query(
			'select l.*, c.name church_name from legal_requests l join churches c on c.id = l.church_id where l.id = $1',
			[req.params.id]
		)).rows[0];
		res.json({ request: mapLegal(row) });
	} catch (error) {
		console.error('Error al actualizar trámite:', error);
		res.status(500).json({ error: 'No se pudo actualizar el trámite.' });
	}
});

// Servir exclusivamente archivos estáticos de la carpeta public
app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'ignore' }));

// Redirección raíz a login
app.get('/', (req, res) => {
	res.redirect('/login.html');
});

app.get('/health', (req, res) => {
	res.json({ ok: true, status: 'healthy', port: Number(process.env.PORT || DEFAULT_PORT) });
});

// Manejador global de errores
app.use((err, req, res, next) => {
	console.error('Error no controlado:', err);
	res.status(err.status || 500).json({ error: err.message || 'Error interno en el servidor.' });
});

startServer();
