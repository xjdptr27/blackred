const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

const QWEN_API_KEY = process.env.QWEN_API_KEY;
const FREEIMAGE_KEY = process.env.FREEIMAGE_KEY;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

function apiRequest(url, method = 'GET', body = null, customHeaders = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const transport = u.protocol === 'https:' ? https : http;

        const options = {
            hostname: u.hostname,
            path: u.pathname + u.search,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...customHeaders
            }
        };

        if (QWEN_API_KEY && !customHeaders.Authorization) {
            options.headers.Authorization = `Bearer ${QWEN_API_KEY}`;
        }

        const req = transport.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.setTimeout(120000, () => { req.destroy(); reject(new Error('Timeout')); });

        if (body) req.write(body);
        req.end();
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
    throw new Error('Upload failed');
}

app.post('/api/generate', async (req, res) => {
    try {
        if (!QWEN_API_KEY) throw new Error('QWEN_API_KEY is not set');

        const { imageBase64, color, tint } = req.body;

        console.log(`🎨 ${color}, Тонировка: ${tint}`);

        const imageUrl = await uploadToFreeImage(imageBase64);
        console.log('✅ Загружено');

        const tintPrompt = tint === 'yes'
            ? 'Add dark window tint to all windows. '
            : 'Keep all windows without any tint. ';

        const prompt = `Change ONLY the car body paint color to ${color}. ${tintPrompt}Keep EXACTLY the same: body shape, lines, curves, proportions, wheels, headlights, mirrors, grille, background, road, sky, buildings, environment. Do NOT modify the background or surroundings at all. Photorealistic, professional automotive photography, high detail, factory quality.`;

        const negative = `modified body shape, changed proportions, distorted panels, warped lines, different wheels, modified headlights, changed background, different environment, different sky, different road, cartoon, painting, low quality, blurry, deformed car`;

        const result = await apiRequest(
            'https://api.gen-api.ru/api/v1/networks/qwen-image-edit-2511',
            'POST',
            JSON.stringify({
                prompt: prompt,
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

        const requestId = result.data.request_id;
        console.log('ID:', requestId);

        for (let i = 0; i < 60; i++) {
            await new Promise(r => setTimeout(r, 3000));

            const sr = await apiRequest(
                `https://api.gen-api.ru/api/v1/request/get/${requestId}`
            );

            if (sr.status === 200 && sr.data?.status === 'success') {
                const imgUrl = sr.data?.result?.[0]
                    || sr.data?.full_response?.[0]?.url;

                if (imgUrl) {
                    console.log('✅ Скачивание:', imgUrl);

                    const imgBuffer = await new Promise((resolve, reject) => {
                        const u = new URL(imgUrl);
                        const transport = u.protocol === 'https:' ? https : http;
                        transport.get({ hostname: u.hostname, path: u.pathname + u.search }, (res2) => {
                            const chunks = [];
                            res2.on('data', c => chunks.push(c));
                            res2.on('end', () => resolve(Buffer.concat(chunks)));
                        }).on('error', reject);
                    });

                    res.set('Content-Type', 'image/png');
                    res.send(imgBuffer);
                    console.log('✅ ГОТОВО!');
                    return;
                }
            }
        }

        throw new Error('Таймаут');

    } catch (error) {
        console.error('❌', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => console.log(`✅ Server started on port ${PORT}`));
