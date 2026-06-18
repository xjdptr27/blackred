document.addEventListener('DOMContentLoaded', function() {
    // ========================
    // МАСКА ДЛЯ ТЕЛЕФОНА
    // ========================
    const phoneInput = document.getElementById('contactPhone');
    if (phoneInput) {
        phoneInput.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length > 11) value = value.slice(0, 11);
            
            let formatted = '';
            if (value.length > 0) formatted = '+7';
            if (value.length > 1) formatted += ' (' + value.slice(1, 4);
            if (value.length > 4) formatted += ') ' + value.slice(4, 7);
            if (value.length > 7) formatted += '-' + value.slice(7, 9);
            if (value.length > 9) formatted += '-' + value.slice(9, 11);
            
            e.target.value = formatted;
        });
    }

    // ========================
    // ДАТА И ВРЕМЯ ЗАЯВКИ
    // ========================
    const dateInput = document.getElementById('contactDate');
    const timeInput = document.getElementById('contactTime');

    function getLocalDateISO(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function setupAppointmentInputs() {
        const today = getLocalDateISO();

        if (dateInput) {
            dateInput.type = 'date';
            dateInput.setAttribute('min', today);

            const maxDate = new Date();
            maxDate.setMonth(maxDate.getMonth() + 2);
            dateInput.setAttribute('max', getLocalDateISO(maxDate));

            if (dateInput.value && dateInput.value < today) {
                dateInput.value = today;
            }

            dateInput.addEventListener('click', function() {
                if (typeof dateInput.showPicker === 'function') {
                    try { dateInput.showPicker(); } catch (error) {}
                }
            });

            dateInput.addEventListener('change', function() {
                if (dateInput.value && dateInput.value < today) {
                    dateInput.value = today;
                    showFormMessage('Нельзя выбрать прошедшую дату', false);
                }
            });
        }

        if (timeInput) {
            timeInput.type = 'time';
            timeInput.setAttribute('min', '10:00');
            timeInput.setAttribute('max', '21:00');
            timeInput.setAttribute('step', '900');
            if (!timeInput.value) timeInput.value = '10:00';

            const openTimePicker = function() {
                if (typeof timeInput.showPicker === 'function') {
                    try { timeInput.showPicker(); } catch (error) {}
                }
            };

            timeInput.addEventListener('click', openTimePicker);
            timeInput.addEventListener('focus', openTimePicker);

            timeInput.addEventListener('change', function() {
                if (timeInput.value && timeInput.value < '10:00') {
                    timeInput.value = '10:00';
                    showFormMessage('Время заявки доступно с 10:00', false);
                }
                if (timeInput.value && timeInput.value > '21:00') {
                    timeInput.value = '21:00';
                    showFormMessage('Время заявки доступно до 21:00', false);
                }
            });
        }
    }

    setupAppointmentInputs();

    function validateAppointment(date, time) {
        const today = getLocalDateISO();

        if (date && date < today) {
            return 'Нельзя выбрать дату, которая уже прошла';
        }

        if (time && (time < '10:00' || time > '21:00')) {
            return 'Время заявки должно быть с 10:00 до 21:00';
        }

        return '';
    }

    // ========================
    // ВАЛИДАЦИЯ EMAIL НА КЛИЕНТЕ
    // ========================
    function isValidEmail(email) {
        return /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/.test(email);
    }

    function isValidPhone(phone) {
        const digits = phone.replace(/\D/g, '');
        return digits.length === 11;
    }
    // ========================
    // ХЕДЕР СКРОЛЛ
    // ========================
    const header = document.getElementById('siteHeader');
    const headerNav = document.getElementById('headerNav');
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const scrollToTop = document.getElementById('scrollToTop');

    function setMobileMenu(open) {
        if (!header || !mobileMenuToggle) return;

        header.classList.toggle('menu-open', open);
        document.body.classList.toggle('menu-open', open);
        mobileMenuToggle.setAttribute('aria-expanded', String(open));
        mobileMenuToggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    }

    function closeMobileMenu() {
        setMobileMenu(false);
    }

    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', () => {
            const isOpen = header?.classList.contains('menu-open');
            setMobileMenu(!isOpen);
        });
    }

    document.addEventListener('click', (e) => {
        if (!header?.classList.contains('menu-open')) return;
        if (!header.contains(e.target)) closeMobileMenu();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMobileMenu();
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth > 1024) closeMobileMenu();
    });

    window.addEventListener('scroll', () => {
        if (header) {
            header.classList.toggle('scrolled', window.scrollY > 50);
        }
        if (scrollToTop) {
            scrollToTop.classList.toggle('visible', window.scrollY > 500);
        }
    });

    if (scrollToTop) {
        scrollToTop.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // ========================
    // ПЛАВНЫЙ СКРОЛЛ ДЛЯ ЯКОРЕЙ
    // ========================
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            if (headerNav && headerNav.contains(this)) {
                closeMobileMenu();
            }
        });
    });

    // ========================
    // НАВИГАЦИОННЫЕ ТОЧКИ
    // ========================
    const sections = document.querySelectorAll('.fullscreen-section');
    const navDotsContainer = document.getElementById('navDots');

    if (navDotsContainer && sections.length) {
        sections.forEach((section, index) => {
            const dot = document.createElement('div');
            dot.classList.add('nav-dot');
            dot.addEventListener('click', () => {
                section.scrollIntoView({ behavior: 'smooth' });
            });
            navDotsContainer.appendChild(dot);
        });

        const dots = document.querySelectorAll('.nav-dot');

        let ticking = false;
        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    const scrollPosition = window.scrollY + window.innerHeight / 2;
                    sections.forEach((section, index) => {
                        const top = section.offsetTop;
                        const bottom = top + section.offsetHeight;
                        if (scrollPosition >= top && scrollPosition < bottom) {
                            dots.forEach(d => d.classList.remove('active'));
                            if (dots[index]) dots[index].classList.add('active');
                        }
                    });
                    ticking = false;
                });
                ticking = true;
            }
        });
    }

    // ========================
    // FAQ АККОРДЕОН
    // ========================
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        if (question) {
            question.addEventListener('click', () => {
                const isActive = item.classList.contains('active');
                faqItems.forEach(i => i.classList.remove('active'));
                if (!isActive) {
                    item.classList.add('active');
                }
            });
        }
    });

    // ========================
    // СЛАЙДЕР ПОРТФОЛИО
    // ========================
    const portfolioGrid = document.getElementById('portfolioGrid');
    const prevBtn = document.getElementById('portfolioPrev');
    const nextBtn = document.getElementById('portfolioNext');
    const portfolioDotsContainer = document.getElementById('portfolioDots');

    if (portfolioGrid && prevBtn && nextBtn) {
        let currentPage = 0;
        let itemsPerPage = 4;
        let totalPages = 1;
        let resizeTimer = null;
        const items = Array.from(portfolioGrid.querySelectorAll('.portfolio-item'));

        function getItemsPerPage() {
            if (window.innerWidth <= 768) return 1;
            if (window.innerWidth <= 1024) return 2;
            return 4;
        }

        function renderDots() {
            if (!portfolioDotsContainer) return;

            portfolioDotsContainer.innerHTML = '';
            for (let i = 0; i < totalPages; i++) {
                const dot = document.createElement('div');
                dot.classList.add('portfolio-dot');
                if (i === currentPage) dot.classList.add('active');
                dot.addEventListener('click', () => goToPage(i));
                portfolioDotsContainer.appendChild(dot);
            }
        }

        function updateDots() {
            const dots = portfolioDotsContainer?.querySelectorAll('.portfolio-dot');
            dots?.forEach((d, i) => d.classList.toggle('active', i === currentPage));
        }

        function updateButtons() {
            if (prevBtn) prevBtn.disabled = currentPage === 0;
            if (nextBtn) nextBtn.disabled = currentPage >= totalPages - 1;
        }

        function goToPage(page) {
            currentPage = Math.max(0, Math.min(page, totalPages - 1));
            const targetItem = items[currentPage * itemsPerPage];
            const offset = targetItem ? targetItem.offsetLeft : 0;
            portfolioGrid.style.transform = 'translateX(-' + offset + 'px)';
            updateDots();
            updateButtons();
        }

        function syncPortfolioLayout() {
            itemsPerPage = getItemsPerPage();
            totalPages = Math.max(1, Math.ceil(items.length / itemsPerPage));
            currentPage = Math.min(currentPage, totalPages - 1);
            renderDots();
            goToPage(currentPage);
        }

        prevBtn.addEventListener('click', () => goToPage(currentPage - 1));
        nextBtn.addEventListener('click', () => goToPage(currentPage + 1));

        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(syncPortfolioLayout, 120);
        });

        syncPortfolioLayout();
    }

    // ========================
    // СЛАЙДЕР ПРОЦЕССА РАБОТЫ
    // ========================
    const studioGrid = document.getElementById('studioGrid');
    const studioPrev = document.getElementById('studioPrev');
    const studioNext = document.getElementById('studioNext');
    const studioDotsContainer = document.getElementById('studioDots');

    if (studioGrid && studioPrev && studioNext) {
        let currentStudioPage = 0;
        let studioItemsPerPage = 4;
        let studioTotalPages = 1;
        let studioResizeTimer = null;
        const studioItems = Array.from(studioGrid.querySelectorAll('.studio-item'));

        function getStudioItemsPerPage() {
            if (window.innerWidth <= 768) return 1;
            if (window.innerWidth <= 1024) return 2;
            return 4;
        }

        function renderStudioDots() {
            if (!studioDotsContainer) return;

            studioDotsContainer.innerHTML = '';
            for (let i = 0; i < studioTotalPages; i++) {
                const dot = document.createElement('div');
                dot.classList.add('studio-dot');
                if (i === currentStudioPage) dot.classList.add('active');
                dot.addEventListener('click', () => goToStudioPage(i));
                studioDotsContainer.appendChild(dot);
            }
        }

        function updateStudioDots() {
            const dots = studioDotsContainer?.querySelectorAll('.studio-dot');
            dots?.forEach((d, i) => d.classList.toggle('active', i === currentStudioPage));
        }

        function updateStudioButtons() {
            if (studioPrev) studioPrev.disabled = currentStudioPage === 0;
            if (studioNext) studioNext.disabled = currentStudioPage >= studioTotalPages - 1;
        }

        function goToStudioPage(page) {
            currentStudioPage = Math.max(0, Math.min(page, studioTotalPages - 1));
            const targetItem = studioItems[currentStudioPage * studioItemsPerPage];
            const offset = targetItem ? targetItem.offsetLeft : 0;
            studioGrid.style.transform = 'translateX(-' + offset + 'px)';
            updateStudioDots();
            updateStudioButtons();
        }

        function syncStudioLayout() {
            studioItemsPerPage = getStudioItemsPerPage();
            studioTotalPages = Math.max(1, Math.ceil(studioItems.length / studioItemsPerPage));
            currentStudioPage = Math.min(currentStudioPage, studioTotalPages - 1);
            renderStudioDots();
            goToStudioPage(currentStudioPage);
        }

        studioPrev.addEventListener('click', () => goToStudioPage(currentStudioPage - 1));
        studioNext.addEventListener('click', () => goToStudioPage(currentStudioPage + 1));

        window.addEventListener('resize', () => {
            clearTimeout(studioResizeTimer);
            studioResizeTimer = setTimeout(syncStudioLayout, 120);
        });

        syncStudioLayout();
    }

    // ========================
    // КОНСТРУКТОР
    // ========================
    const generateBtn = document.getElementById('generateBtn');
    const previewImage = document.getElementById('previewImage');
    const colorInput = document.getElementById('colorInput');
    const aiResponseDiv = document.getElementById('aiResponse');
    const uploadArea = document.getElementById('uploadArea');
    const carPhotoInput = document.getElementById('carPhoto');
    const uploadPlaceholder = document.getElementById('uploadPlaceholder');
    
    let currentImageBase64 = null;
    
    let aiImageContainer = document.getElementById('aiImageResult');
    if (!aiImageContainer && aiResponseDiv) {
        aiImageContainer = document.createElement('div');
        aiImageContainer.id = 'aiImageResult';
        aiImageContainer.style.cssText = 'margin-top: 16px; border-radius: 12px; overflow: hidden; display: none;';
        const aiImg = document.createElement('img');
        aiImg.id = 'aiResultImg';
        aiImg.style.cssText = 'width: 100%; border-radius: 12px;';
        aiImageContainer.appendChild(aiImg);
        aiResponseDiv.parentNode.insertBefore(aiImageContainer, aiResponseDiv.nextSibling);
    }
    
    if (uploadArea && carPhotoInput) {
        uploadArea.addEventListener('click', () => carPhotoInput.click());
        
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('drag-over');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('drag-over');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
        });
        
        carPhotoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleFile(file);
        });
    }

    function handleFile(file) {
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                currentImageBase64 = ev.target.result;
                previewImage.src = currentImageBase64;
                previewImage.style.display = 'block';
                if (uploadPlaceholder) uploadPlaceholder.style.display = 'none';
                if (generateBtn) generateBtn.disabled = false;
                if (aiResponseDiv) aiResponseDiv.innerHTML = 'Фото загружено! Нажми «Сгенерировать»';
            };
            reader.readAsDataURL(file);
        } else {
            alert('Загрузите изображение JPG или PNG');
        }
    }
    
    const swatches = document.querySelectorAll('.color-option');
    swatches.forEach(swatch => {
        swatch.addEventListener('click', () => {
            swatches.forEach(s => s.classList.remove('selected'));
            swatch.classList.add('selected');
            if (colorInput) colorInput.value = swatch.dataset.color;
        });
    });
    
    if (generateBtn) {
        generateBtn.addEventListener('click', async function() {
            if (!currentImageBase64) {
                if (aiResponseDiv) aiResponseDiv.innerHTML = 'Сначала загрузите фото!';
                return;
            }

            const tintRadio = document.querySelector('input[name="tint"]:checked');
            const tint = tintRadio ? tintRadio.value : 'no';
            const selectedColor = colorInput?.value || 'Black gloss';

            generateBtn.disabled = true;
            generateBtn.innerHTML = 'ГЕНЕРИРУЮ...';
            if (aiResponseDiv) aiResponseDiv.innerHTML = 'BLACKRED AI генерирует...';
            if (aiImageContainer) aiImageContainer.style.display = 'none';

            try {
                const response = await fetch('/api/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        imageBase64: currentImageBase64,
                        color: selectedColor,
                        tint: tint
                    })
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Ошибка');
                }

                const blob = await response.blob();
                const imageUrl = URL.createObjectURL(blob);

                const aiImg = document.getElementById('aiResultImg');
                if (aiImg) {
                    aiImg.src = imageUrl;
                    aiImageContainer.style.display = 'block';
                }

                if (aiResponseDiv) {
                    aiResponseDiv.innerHTML = 'Готово! Цвет: ' + selectedColor;
                }

            } catch (error) {
                console.error('Error:', error);
                if (aiResponseDiv) {
                    aiResponseDiv.innerHTML = 'Ошибка: ' + error.message;
                }
            } finally {
                generateBtn.disabled = false;
                generateBtn.innerHTML = 'СГЕНЕРИРОВАТЬ';
            }
        });
    }

    // ========================
// ОТПРАВКА ФОРМЫ ЧЕРЕЗ СЕРВЕР
// ========================
const contactBtn = document.querySelector('.contact-btn');

if (contactBtn) {
    contactBtn.addEventListener('click', async function(e) {
        e.preventDefault();

        const nameInput = document.getElementById('contactName');
        const carInput = document.getElementById('contactCar');
        const phoneInput = document.getElementById('contactPhone');
        const emailInput = document.getElementById('contactEmail');
        const serviceInput = document.getElementById('contactService');
        const dateInput = document.getElementById('contactDate');
        const timeInput = document.getElementById('contactTime');

        const name = nameInput?.value.trim() || '';
        const car = carInput?.value.trim() || '';
        const phone = phoneInput?.value.trim() || '';
        const email = emailInput?.value.trim() || '';
        const service = serviceInput?.value || '';
        const date = dateInput?.value || null;
        const time = timeInput?.value || null;

        if (!name || !car || !phone) {
            showFormMessage('Заполните имя, авто и телефон', false);
            return;
        }

        if (!isValidPhone(phone)) {
            showFormMessage('Введите корректный телефон', false);
            return;
        }

        if (email && !isValidEmail(email)) {
            showFormMessage('Введите корректный email', false);
            return;
        }

        const appointmentError = validateAppointment(date, time);
        if (appointmentError) {
            showFormMessage(appointmentError, false);
            return;
        }

        const oldText = contactBtn.innerHTML;
        contactBtn.disabled = true;
        contactBtn.innerHTML = 'ОТПРАВЛЯЕМ...';

        try {
            const response = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_name: name,
                    car_model: car,
                    phone,
                    email,
                    service,
                    appointment_date: date,
                    appointment_time: time
                })
            });

            let result = null;
            try {
                result = await response.json();
            } catch (jsonError) {}

            if (!response.ok || result?.ok === false) {
                throw new Error(result?.error || 'Ошибка отправки заявки');
            }

            showFormMessage('Заявка отправлена! Мы свяжемся с вами.', true);
            if (nameInput) nameInput.value = '';
            if (carInput) carInput.value = '';
            if (phoneInput) phoneInput.value = '';
            if (emailInput) emailInput.value = '';
            if (dateInput) dateInput.value = '';
            if (timeInput) timeInput.value = '';
        } catch (error) {
            console.error(error);
            showFormMessage(error.message || 'Ошибка. Позвоните нам.', false);
        } finally {
            contactBtn.disabled = false;
            contactBtn.innerHTML = oldText;
        }
    });
}

function showFormMessage(msg, success) {
    const msgDiv = document.getElementById('contactFormMessage');

    if (msgDiv) {
        msgDiv.style.display = 'block';
        msgDiv.style.color = success ? '#4ade80' : '#dc2626';
        msgDiv.textContent = msg;
        setTimeout(function() { msgDiv.style.display = 'none'; }, 5000);
    }
}

// АНИМАЦИИ ПРИ СКРОЛЛЕ
// ========================
const animatedElements = document.querySelectorAll(`
    .fullscreen-section,
    .feature-card,
    .portfolio-item,
    .review-card,
    .faq-item,
    .service-item,
    .studio-item,
    .hero-content,
    .hero-image-wrapper,
    .contact-wrapper,
    .constructor-panel
`);

const animationObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
        }
    });
}, {
    threshold: 0.15,
    rootMargin: '0px 0px -50px 0px'
});

animatedElements.forEach(el => animationObserver.observe(el));

    console.log('Все системы готовы');
});
