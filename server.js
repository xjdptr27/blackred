const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

const ADMIN_USER = process.env.ADMIN_USER || process.env.ADMIN_LOGIN || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const QWEN_API_KEY = process.env.QWEN_API_KEY;
const FREEIMAGE_KEY = process.env.FREEIMAGE_KEY;

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

function requireAdminAuth(req, res, next) {
    if (!ADMIN_PASSWORD) {
        res.setHeader('WWW-Authenticate', 'Basic realm="BLACKRED Admin"');
        return res.status(500).send('ADMIN_PASSWORD is not set on Render');
    }

    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="BLACKRED Admin"');
        return res.status(401).send('Введите логин и пароль');
    }

    const credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
    const separatorIndex = credentials.indexOf(':');
    const login = separatorIndex >= 0 ? credentials.slice(0, separatorIndex) : '';
    const password = separatorIndex >= 0 ? credentials.slice(separatorIndex + 1) : '';

    if (login === ADMIN_USER && password === ADMIN_PASSWORD) {
        return next();
    }

    res.setHeader('WWW-Authenticate', 'Basic realm="BLACKRED Admin"');
    return res.status(401).send('Неверный логин или пароль');
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

    const response = await fetch(`${SUPABASE_URL}/rest/v1/${restPath}`, {
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

function validatePublicOrder(payload) {
    if (!payload.client_name || !payload.car_model || !payload.phone) {
        return 'Заполните имя, авто и телефон';
    }

    const digits = payload.phone.replace(/\D/g, '');
    if (digits.length < 10) {
        return 'Введите корректный номер телефона';
    }

    if (payload.email && !/^[^\s@]+@([^\s@]+\.)+[^\s@]+$/.test(payload.email)) {
        return 'Введите корректный email';
    }

    return null;
}

function idFilter(id) {
    return encodeURIComponent(String(id).trim());
}

app.get('/health', (req, res) => {
    res.json({ ok: true });
});

app.get('/admin', requireAdminAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/admin.html', requireAdminAuth, (req, res) => {
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

app.get('/api/orders', requireAdminAuth, async (req, res) => {
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

app.put('/api/orders/:id', requireAdminAuth, async (req, res) => {
    try {
        const payload = normalizeOrderBody(req.body, true);

        if (Object.keys(payload).length === 0) {
            return sendJsonError(res, 400, 'Нет данных для сохранения');
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

app.delete('/api/orders/:id', requireAdminAuth, async (req, res) => {
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
