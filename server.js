const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;

const ADMIN_USER = process.env.ADMIN_USER || process.env.ADMIN_LOGIN || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_SESSION_HOURS = Number(process.env.ADMIN_SESSION_HOURS || 12);

const QWEN_API_KEY = process.env.QWEN_API_KEY;
const FREEIMAGE_KEY = process.env.FREEIMAGE_KEY;

function normalizeSupabaseUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    try {
        const parsed = new URL(raw);
        return `${parsed.protocol}//${parsed.host}`;
    } catch (error) {
        return raw.replace(/\/rest\/v1.*$/, '').replace(/\/$/, '');
    }
}

const SUPABASE_URL = normalizeSupabaseUrl(process.env.SUPABASE_URL);
const SUPABASE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY || '').trim();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const ADMIN_COOKIE_NAME = 'blackred_admin_session';

function base64UrlEncode(value) {
    return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
    return Buffer.from(value, 'base64url').toString('utf8');
}

function getCookie(req, name) {
    const cookieHeader = req.headers.cookie || '';
    const cookies = cookieHeader.split(';').map((item) => item.trim()).filter(Boolean);

    for (const cookie of cookies) {
        const separatorIndex = cookie.indexOf('=');
        const cookieName = separatorIndex >= 0 ? cookie.slice(0, separatorIndex) : cookie;
        const cookieValue = separatorIndex >= 0 ? cookie.slice(separatorIndex + 1) : '';

        if (cookieName === name) {
            return decodeURIComponent(cookieValue);
        }
    }

    return '';
}

function getCookieString(req, name, value, options = {}) {
    const parts = [`${name}=${encodeURIComponent(value)}`];

    if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
    if (options.httpOnly !== false) parts.push('HttpOnly');
    parts.push('Path=/');
    parts.push('SameSite=Lax');

    const forwardedProto = req.headers['x-forwarded-proto'];
    if (forwardedProto === 'https' || process.env.RENDER) {
        parts.push('Secure');
    }

    return parts.join('; ');
}

function getAdminSecret() {
    return String(ADMIN_PASSWORD || '');
}

function signPayload(payloadBase64) {
    return crypto
        .createHmac('sha256', getAdminSecret())
        .update(payloadBase64)
        .digest('base64url');
}

function safeCompare(a, b) {
    const left = Buffer.from(String(a));
    const right = Buffer.from(String(b));

    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
}

function createAdminToken() {
    const now = Date.now();
    const payload = {
        user: ADMIN_USER,
        iat: now,
        exp: now + ADMIN_SESSION_HOURS * 60 * 60 * 1000
    };

    const payloadBase64 = base64UrlEncode(JSON.stringify(payload));
    const signature = signPayload(payloadBase64);

    return `${payloadBase64}.${signature}`;
}

function verifyAdminToken(token) {
    if (!ADMIN_PASSWORD || !token || !token.includes('.')) return false;

    const [payloadBase64, signature] = token.split('.');
    const expectedSignature = signPayload(payloadBase64);

    if (!safeCompare(signature, expectedSignature)) return false;

    try {
        const payload = JSON.parse(base64UrlDecode(payloadBase64));
        if (payload.user !== ADMIN_USER) return false;
        if (!payload.exp || Date.now() > payload.exp) return false;
        return true;
    } catch (error) {
        return false;
    }
}

function isAdminLoggedIn(req) {
    const token = getCookie(req, ADMIN_COOKIE_NAME);
    return verifyAdminToken(token);
}

function requireAdminSession(req, res, next) {
    if (isAdminLoggedIn(req)) {
        return next();
    }

    const wantsHtml = req.accepts('html') && !req.path.startsWith('/api/');
    if (wantsHtml) {
        return res.redirect('/admin-login');
    }

    return res.status(401).json({ ok: false, error: 'Требуется вход в админ-панель' });
}

function sendJsonError(res, status, message, details = null) {
    return res.status(status).json({ ok: false, error: message, details });
}

function ensureSupabaseConfig() {
    const missing = [];
    if (!SUPABASE_URL) missing.push('SUPABASE_URL');
    if (!SUPABASE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');

    if (missing.length) {
        throw new Error(`Не настроен Supabase. Добавьте переменные окружения: ${missing.join(', ')}`);
    }
}

async function supabaseRequest(restPath, options = {}) {
    ensureSupabaseConfig();

    const url = `${SUPABASE_URL}/rest/v1/${restPath}`;
    console.log('Supabase request:', options.method || 'GET', url);

    const response = await fetch(url, {
        method: options.method || 'GET',
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            ...(options.prefer ? { Prefer: options.prefer } : {})
        },
        body: options.body ? JSON.stringify(options.body) : undefined
    });

    const text = await response.text();
    let data = null;

    if (text) {
        try {
            data = JSON.parse(text);
        } catch (error) {
            data = text;
        }
    }

    if (!response.ok) {
        const message = data?.message || data?.error || text || 'Ошибка Supabase';
        const error = new Error(message);
        error.status = response.status;
        error.details = data;
        throw error;
    }

    return data;
}

function cleanString(value) {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text || null;
}

function normalizeOrderBody(body, isAdminUpdate = false) {
    const payload = {};
    const fields = [
        'client_name',
        'car_model',
        'phone',
        'email',
        'service',
        'appointment_date',
        'appointment_time',
        'status',
        'price',
        'notes'
    ];

    fields.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(body, field)) {
            payload[field] = cleanString(body[field]);
        }
    });

    if (!isAdminUpdate) {
        payload.client_name = cleanString(body.client_name);
        payload.car_model = cleanString(body.car_model);
        payload.phone = cleanString(body.phone);
        payload.email = cleanString(body.email);
        payload.service = cleanString(body.service);
        payload.appointment_date = cleanString(body.appointment_date);
        payload.appointment_time = cleanString(body.appointment_time);
        payload.status = 'Новая';
    }

    return payload;
}

function getBusinessTodayISO() {
    const parts = new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Europe/Moscow',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());

    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
}

function isValidISODate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;

    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day;
}

function normalizeTimeValue(value) {
    const text = String(value || '').trim();
    const match = text.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);

    if (!match) return null;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);

    if (hours > 23 || minutes > 59) return null;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function isBusinessTime(value) {
    const normalized = normalizeTimeValue(value);
    if (!normalized) return false;

    const [hours, minutes] = normalized.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes;
    const minMinutes = 10 * 60;
    const maxMinutes = 21 * 60;

    return totalMinutes >= minMinutes && totalMinutes <= maxMinutes;
}

function validateAppointment(payload) {
    if (payload.appointment_date) {
        if (!isValidISODate(payload.appointment_date)) {
            return 'Выберите корректную дату в календаре';
        }

        const today = getBusinessTodayISO();
        if (payload.appointment_date < today) {
            return 'Нельзя выбрать дату, которая уже прошла';
        }
    }

    if (payload.appointment_time) {
        const normalized = normalizeTimeValue(payload.appointment_time);

        if (!normalized) {
            return 'Выберите корректное время';
        }

        payload.appointment_time = normalized;

        if (!isBusinessTime(payload.appointment_time)) {
            return 'Время заявки должно быть с 10:00 до 21:00';
        }
    }

    return null;
}

function validatePublicOrder(payload) {
    if (!payload.client_name || !payload.car_model || !payload.phone) {
        return 'Заполните имя, авто и телефон';
    }

    const digits = payload.phone.replace(/\D/g, '');
    if (digits.length !== 11) {
        return 'Введите корректный номер телефона';
    }

    if (payload.email && !/^[^\s@]+@([^\s@]+\.)+[^\s@]+$/.test(payload.email)) {
        return 'Введите корректный email';
    }

    return validateAppointment(payload);
}

function validateAdminOrder(payload) {
    const appointmentError = validateAppointment(payload);
    if (appointmentError) return appointmentError;

    if (payload.email && !/^[^\s@]+@([^\s@]+\.)+[^\s@]+$/.test(payload.email)) {
        return 'Введите корректный email';
    }

    if (payload.phone) {
        const digits = payload.phone.replace(/\D/g, '');
        if (digits.length !== 11) return 'Телефон должен содержать 11 цифр';
    }

    if (payload.price && !/^\d+$/.test(String(payload.price))) {
        return 'Цена должна содержать только цифры';
    }

    return null;
}

function idFilter(id) {
    return encodeURIComponent(String(id).trim());
}

app.get('/health', (req, res) => {
    res.json({ ok: true });
});

app.get('/admin-login', (req, res) => {
    if (isAdminLoggedIn(req)) {
        return res.redirect('/admin');
    }

    return res.sendFile(path.join(__dirname, 'admin-login.html'));
});

app.post('/api/admin/login', (req, res) => {
    try {
        if (!ADMIN_PASSWORD) {
            return sendJsonError(res, 500, 'ADMIN_PASSWORD не задан в Render → Environment');
        }

        const login = cleanString(req.body.login || req.body.username);
        const password = String(req.body.password || '');

        if (login === ADMIN_USER && password === ADMIN_PASSWORD) {
            const token = createAdminToken();
            res.setHeader('Set-Cookie', getCookieString(req, ADMIN_COOKIE_NAME, token, {
                maxAge: ADMIN_SESSION_HOURS * 60 * 60
            }));
            return res.json({ ok: true });
        }

        return sendJsonError(res, 401, 'Неверный логин или пароль');
    } catch (error) {
        console.error('Admin login error:', error);
        return sendJsonError(res, 500, 'Ошибка входа');
    }
});

app.get('/api/admin/me', (req, res) => {
    return res.json({ ok: true, authenticated: isAdminLoggedIn(req) });
});

app.post('/api/admin/logout', (req, res) => {
    res.setHeader('Set-Cookie', getCookieString(req, ADMIN_COOKIE_NAME, '', { maxAge: 0 }));
    return res.json({ ok: true });
});

app.get('/admin', requireAdminSession, (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/admin.html', requireAdminSession, (req, res) => {
    res.redirect('/admin');
});

app.post('/api/orders', async (req, res) => {
    try {
        const payload = normalizeOrderBody(req.body, false);
        const validationError = validatePublicOrder(payload);

        if (validationError) {
            return sendJsonError(res, 400, validationError);
        }

        const data = await supabaseRequest('orders', {
            method: 'POST',
            body: payload,
            prefer: 'return=representation'
        });

        return res.status(201).json({ ok: true, order: Array.isArray(data) ? data[0] : data });
    } catch (error) {
        console.error('Order create error:', error);
        return sendJsonError(res, error.status || 500, error.message, error.details || null);
    }
});

app.get('/api/orders', requireAdminSession, async (req, res) => {
    try {
        const status = cleanString(req.query.status);
        let restPath = 'orders?select=*&order=created_at.desc';

        if (status && status !== 'Все') {
            restPath += `&status=eq.${encodeURIComponent(status)}`;
        }

        const data = await supabaseRequest(restPath);
        return res.json({ ok: true, orders: data || [] });
    } catch (error) {
        console.error('Orders list error:', error);
        return sendJsonError(res, error.status || 500, error.message, error.details || null);
    }
});

app.put('/api/orders/:id', requireAdminSession, async (req, res) => {
    try {
        const payload = normalizeOrderBody(req.body, true);

        if (Object.keys(payload).length === 0) {
            return sendJsonError(res, 400, 'Нет данных для сохранения');
        }

        const validationError = validateAdminOrder(payload);
        if (validationError) {
            return sendJsonError(res, 400, validationError);
        }

        const data = await supabaseRequest(`orders?id=eq.${idFilter(req.params.id)}`, {
            method: 'PATCH',
            body: payload,
            prefer: 'return=representation'
        });

        if (!data || data.length === 0) {
            return sendJsonError(res, 404, 'Заявка не найдена');
        }

        return res.json({ ok: true, order: data[0] });
    } catch (error) {
        console.error('Order update error:', error);
        return sendJsonError(res, error.status || 500, error.message, error.details || null);
    }
});

app.delete('/api/orders/:id', requireAdminSession, async (req, res) => {
    try {
        const data = await supabaseRequest(`orders?id=eq.${idFilter(req.params.id)}`, {
            method: 'DELETE',
            prefer: 'return=representation'
        });

        return res.json({ ok: true, deleted: data || [] });
    } catch (error) {
        console.error('Order delete error:', error);
        return sendJsonError(res, error.status || 500, error.message, error.details || null);
    }
});

function apiRequest(url, method = 'GET', body = null, customHeaders = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const transport = u.protocol === 'https:' ? https : http;
        const options = {
            hostname: u.hostname,
            path: u.pathname + u.search,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...customHeaders
            }
        };

        if (QWEN_API_KEY && !options.headers.Authorization) {
            options.headers.Authorization = `Bearer ${QWEN_API_KEY}`;
        }

        const req = transport.request(options, (response) => {
            let data = '';
            response.on('data', (chunk) => { data += chunk; });
            response.on('end', () => {
                try {
                    resolve({ status: response.statusCode, data: JSON.parse(data) });
                } catch (error) {
                    resolve({ status: response.statusCode, data });
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(120000, () => {
            req.destroy();
            reject(new Error('Timeout'));
        });

        if (body) req.write(body);
        req.end();
    });
}

function downloadBinary(url) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const transport = u.protocol === 'https:' ? https : http;
        const req = transport.get({ hostname: u.hostname, path: u.pathname + u.search }, (response) => {
            if (response.statusCode < 200 || response.statusCode >= 300) {
                reject(new Error(`Не удалось скачать изображение. HTTP ${response.statusCode}`));
                return;
            }

            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => resolve(Buffer.concat(chunks)));
        });

        req.on('error', reject);
        req.setTimeout(120000, () => {
            req.destroy();
            reject(new Error('Timeout'));
        });
    });
}

async function uploadToFreeImage(base64Image) {
    if (!FREEIMAGE_KEY) throw new Error('FREEIMAGE_KEY is not set');

    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');
    const formData = new URLSearchParams();
    formData.append('source', cleanBase64);
    formData.append('key', FREEIMAGE_KEY);
    formData.append('format', 'json');

    const result = await apiRequest(
        'https://freeimage.host/api/1/upload',
        'POST',
        formData.toString(),
        { 'Content-Type': 'application/x-www-form-urlencoded' }
    );

    if (result.data?.image?.url) return result.data.image.url;
    if (result.data?.url) return result.data.url;
    throw new Error(result.data?.error?.message || 'Upload failed');
}

app.post('/api/generate', async (req, res) => {
    try {
        if (!QWEN_API_KEY || !FREEIMAGE_KEY) {
            return sendJsonError(res, 500, 'API keys are not configured on server');
        }

        const { imageBase64, color, tint } = req.body;

        if (!imageBase64) {
            return sendJsonError(res, 400, 'Не загружено фото автомобиля');
        }

        const selectedColor = cleanString(color) || 'black gloss';
        const selectedTint = tint === 'yes' ? 'yes' : 'no';

        console.log(`AI generate request. Color: ${selectedColor}. Tint: ${selectedTint}`);

        const imageUrl = await uploadToFreeImage(imageBase64);
        console.log('Image uploaded to Freeimage');

        const tintPrompt = selectedTint === 'yes'
            ? 'Add dark window tint to all windows. '
            : 'Keep all windows without any tint. ';

        const prompt = `Change ONLY the car body paint color to ${selectedColor}. ${tintPrompt}`
            + 'Keep EXACTLY the same: body shape, lines, curves, proportions, wheels, headlights, mirrors, grille, background, road, sky, buildings, environment. '
            + 'Do NOT modify the background or surroundings at all. '
            + 'Photorealistic, professional automotive photography, high detail, factory quality.';

        const negative = 'modified body shape, changed proportions, distorted panels, warped lines, different wheels, modified headlights, changed background, different environment, different sky, different road, cartoon, painting, low quality, blurry, deformed car';

        const result = await apiRequest(
            'https://api.gen-api.ru/api/v1/networks/qwen-image-edit-2511',
            'POST',
            JSON.stringify({
                prompt,
                image_urls: [imageUrl],
                width: 1024,
                height: 1024,
                num_images: 1,
                output_format: 'png',
                guidance_scale: 7.5,
                num_inference_steps: 40,
                negative_prompt: negative
            })
        );

        if (result.status < 200 || result.status >= 300) {
            throw new Error(result.data?.message || result.data?.error || 'Ошибка GenAPI');
        }

        const requestId = result.data?.request_id;
        if (!requestId) throw new Error('GenAPI не вернул request_id');

        console.log('GenAPI request ID:', requestId);

        for (let i = 0; i < 60; i++) {
            await new Promise((resolve) => setTimeout(resolve, 3000));

            const statusResult = await apiRequest(`https://api.gen-api.ru/api/v1/request/get/${requestId}`);

            if (statusResult.status === 200 && statusResult.data?.status === 'success') {
                const imgUrl = statusResult.data?.result?.[0] || statusResult.data?.full_response?.[0]?.url;

                if (imgUrl) {
                    const imgBuffer = await downloadBinary(imgUrl);
                    res.set('Content-Type', 'image/png');
                    return res.send(imgBuffer);
                }
            }

            if (statusResult.data?.status === 'failed') {
                throw new Error(statusResult.data?.error || 'Генерация завершилась ошибкой');
            }
        }

        throw new Error('Таймаут генерации изображения');
    } catch (error) {
        console.error('AI generate error:', error);
        return sendJsonError(res, error.status || 500, error.message, error.details || null);
    }
});

app.use(express.static(__dirname));

app.use((req, res) => {
    res.status(404).send('Страница не найдена');
});

app.listen(PORT, () => {
    console.log(`BLACKRED server started on port ${PORT}`);
});
