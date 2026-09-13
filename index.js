const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

// اسم الجروب كما يظهر تماماً في واتساب
const TARGET_GROUP_NAME = process.env.TARGET_GROUP_NAME || 'اسم الجروب هنا';

// مسارات التخزين (تدعم مسار Volume خارجي إن وجد)
const DATA_DIR = process.env.DATA_PATH || __dirname;
const QUOTES_FILE = path.join(__dirname, 'quotes.json');
const PROGRESS_FILE = path.join(DATA_DIR, 'progress.json');
const SESSION_PATH = path.join(DATA_DIR, 'whatsapp-session');

// إعداد العميل مع دعم بيئة Linux السحابية
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: SESSION_PATH
    }),
    puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

// عرض رمز الـ QR في الـ Terminal/Logs
client.on('qr', (qr) => {
    console.log('يرجى مسح رمز QR من شاشة Logs داخل تطبيق واتساب:');
    qrcode.generate(qr, { small: true });
});

// عند نجاح الاتصال
client.on('ready', () => {
    console.log('✅ تم تسجيل الدخول بنجاح! البوت متصل الآن بواتساب.');
    setupScheduler();
});

// قراءة الحكمة التالية وحفظ الموضع
function getNextSequentialQuote() {
    if (!fs.existsSync(QUOTES_FILE)) {
        throw new Error('ملف quotes.json غير موجود!');
    }

    const quotes = JSON.parse(fs.readFileSync(QUOTES_FILE, 'utf-8'));
    if (!Array.isArray(quotes) || quotes.length === 0) {
        throw new Error('ملف quotes.json فارغ أو تنسيقه غير صحيح.');
    }

    let currentIndex = 0;
    if (fs.existsSync(PROGRESS_FILE)) {
        try {
            const progressData = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
            currentIndex = progressData.currentIndex || 0;
        } catch (e) {
            currentIndex = 0;
        }
    }

    if (currentIndex >= quotes.length) {
        console.log('🔁 اكتملت كل الحِكم، ستتم إعادة البدء من الحكمة الأولى.');
        currentIndex = 0;
    }

    const quoteToSend = quotes[currentIndex];
    const nextIndex = (currentIndex + 1) % quotes.length;

    fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ currentIndex: nextIndex }, null, 2), 'utf-8');
    console.log(`📌 تم تجهيز الحكمة رقم [${currentIndex + 1}/${quotes.length}]، المؤشر القادم: ${nextIndex}`);

    return quoteToSend;
}

// دالة العثور على الجروب والإرسال
async function sendDailyQuote() {
    try {
        const chats = await client.getChats();
        const group = chats.find(chat => chat.isGroup && chat.name === TARGET_GROUP_NAME);

        if (!group) {
            console.error(`❌ تعذر العثور على جروب باسم: "${TARGET_GROUP_NAME}"`);
            return;
        }

        const quote = getNextSequentialQuote();
        const message = `✨ *حكمة اليوم:* \n\n"${quote}"\n\n_أتمنى لكم يوماً طيباً ومباركاً!_`;

        await client.sendMessage(group.id._serialized, message);
        console.log(`[${new Date().toLocaleTimeString()}] تم إرسال الحكمة للجروب بنجاح.`);
    } catch (error) {
        console.error('خطأ أثناء إرسال الرسالة:', error.message);
    }
}

// جدولة التوقيت (الساعة 9:00 صباحاً يومياً بتوقيت السيرفر)
function setupScheduler() {
    cron.schedule('0 9 * * *', () => {
        console.log('⏰ حان الموعد المجدول لإرسال الحكمة...');
        sendDailyQuote();
    });

    console.log('⏰ الجدولة اليومية مفعلة (09:00 صباحاً). السكريبت يعمل في الخلفية.');
}

// بدء التشغيل
client.initialize();
