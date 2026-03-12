import 'dotenv/config';
import {
    default as makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import { mkdirSync, existsSync, copyFileSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

const logger = pino({ level: 'silent' });
const SESSION_DIR = resolve(process.env.SESSION_DIR || './sessions');
const MAX_QR_ATTEMPTS = 5;

function copyToOpenClaw(phoneNumber) {
    const src = resolve(SESSION_DIR, 'creds.json');
    const destDir = resolve(homedir(), '.openclaw', 'credentials', 'whatsapp', phoneNumber);
    const dest = resolve(destDir, 'creds.json');
    try {
        mkdirSync(destDir, { recursive: true });
        copyFileSync(src, dest);
        return dest;
    } catch (err) {
        console.log(`⚠️  Auto-copy failed: ${err.message}`);
        return null;
    }
}

async function start() {
    console.log(`
╔══════════════════════════════════════════╗
║                                          ║
║   🔑 WhatsApp creds.json Generator      ║
║   Scan QR → Get your credentials         ║
║                                          ║
╚══════════════════════════════════════════╝
`);

    if (!existsSync(SESSION_DIR)) {
        mkdirSync(SESSION_DIR, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

    let version;
    try {
        ({ version } = await fetchLatestBaileysVersion());
    } catch {
        version = [2, 3000, 1015901307];
        console.log('⚠️  Could not fetch latest Baileys version, using fallback.\n');
    }

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        logger,
        browser: ['OpenClaw', 'Chrome', '120.0.0'],
        printQRInTerminal: false,
        syncFullHistory: false,
        markOnlineOnConnect: false,
    });

    sock.ev.on('creds.update', saveCreds);

    let qrAttempts = 0;

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrAttempts++;
            if (qrAttempts > MAX_QR_ATTEMPTS) {
                console.log('\n❌ QR scan timed out after ' + MAX_QR_ATTEMPTS + ' attempts. Please run again.');
                process.exit(0);
            }
            console.log('\n'.repeat(3));
            console.log(`📱 Scan this QR code with WhatsApp (attempt ${qrAttempts}/${MAX_QR_ATTEMPTS}):\n`);
            console.log('   WhatsApp → Settings → Linked Devices → Link a Device\n');
            const qrText = await QRCode.toString(qr, { type: 'terminal', small: true });
            console.log(qrText);
            console.log('\n⏳ Waiting for scan...\n');
        }

        if (connection === 'open') {
            // Wait briefly to ensure creds.update has flushed creds.json to disk
            await new Promise((res) => setTimeout(res, 1000));

            const phoneNumber = sock.user?.id?.split(':')[0] || 'unknown';
            const credsPath = resolve(SESSION_DIR, 'creds.json');
            const openClawDest = copyToOpenClaw(phoneNumber);

            console.log(`
✅ Connected successfully!

📱 Account: +${phoneNumber}
📁 creds.json saved to:
   ${credsPath}
`);
            if (openClawDest) {
                console.log(`✅ Auto-copied to OpenClaw:
   ${openClawDest}

🚀 Just restart OpenClaw — you're done!
`);
            } else {
                console.log(`📝 Manually copy creds.json to:
   ~/.openclaw/credentials/whatsapp/${phoneNumber}/creds.json
`);
            }

            console.log('⏳ Exiting in 3 seconds...');
            setTimeout(() => process.exit(0), 3000);
        }

        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            sock.ev.removeAllListeners();
            if (reason === DisconnectReason.loggedOut) {
                console.log('❌ Logged out. Run again to generate a new QR.');
                process.exit(0);
            } else {
                console.log('🔄 Disconnected. Reconnecting...');
                setTimeout(start, 3000);
            }
        }
    });
}

start().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
